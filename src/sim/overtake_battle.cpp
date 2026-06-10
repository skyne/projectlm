#include "overtake_battle.hpp"
#include "car_entity.hpp"
#include "driver.hpp"
#include "track_corridor.hpp"
#include <algorithm>
#include <cmath>
#include <functional>
#include <sstream>

namespace {

constexpr double kDecisionIntervalSec = 0.22;
constexpr double kPassMarginM = 1.15;
constexpr double kBrakingKappaThreshold = 0.0065;
constexpr double kMinTrafficSpeedMs = 22.0;
constexpr double kOvertakeEventCooldownSec = 8.0;

double RaceDistance(const Car &car, double lapLength) {
  return car.state().currentDistance +
         static_cast<double>(car.state().currentLap) * lapLength;
}

double WrapRaceGap(double aheadDist, double behindDist, double lapLength) {
  double gap = aheadDist - behindDist;
  if (gap > lapLength * 0.5)
    gap -= lapLength;
  if (gap < -lapLength * 0.5)
    gap += lapLength;
  return gap;
}

PassSide OppositeSide(PassSide side) {
  if (side == PassSide::Inside)
    return PassSide::Outside;
  if (side == PassSide::Outside)
    return PassSide::Inside;
  return PassSide::None;
}

TrafficPathIntent AttackIntent(PassSide side) {
  return side == PassSide::Inside ? TrafficPathIntent::AttackInside
                                  : TrafficPathIntent::AttackOutside;
}

TrafficPathIntent DefendIntent(PassSide side) {
  return side == PassSide::Inside ? TrafficPathIntent::DefendInside
                                  : TrafficPathIntent::DefendOutside;
}

TrafficPathIntent YieldIntent(PassSide side) {
  return side == PassSide::Inside ? TrafficPathIntent::YieldInside
                                  : TrafficPathIntent::YieldOutside;
}

void MergePathIntent(TrafficModifiers &mod, TrafficPathIntent intent,
                     double urgency) {
  if (intent == TrafficPathIntent::None ||
      intent == TrafficPathIntent::RacingLine)
    return;
  const int priority = TrafficPathIntentPriority(intent);
  const int existing = TrafficPathIntentPriority(mod.pathIntent);
  if (priority > existing ||
      (priority == existing && urgency > mod.pathUrgency)) {
    mod.pathIntent = intent;
    mod.pathUrgency = urgency;
  }
}

bool CooldownReady(std::unordered_map<std::string, double> &cooldowns,
                   const std::string &key, double raceTime, double cooldownSec) {
  const auto it = cooldowns.find(key);
  if (it != cooldowns.end() && raceTime - it->second < cooldownSec)
    return false;
  cooldowns[key] = raceTime;
  return true;
}

size_t CarIndex(const std::vector<Car> &cars, const std::string &entryId) {
  for (size_t i = 0; i < cars.size(); ++i) {
    if (cars[i].entryId() == entryId)
      return i;
  }
  return cars.size();
}

PassSide PickAttackerSide(const Car &/*attacker*/, const TrackCorridor *corridor,
                          double s, double overtakeSkill) {
  if (corridor == nullptr || corridor->length() <= 0.0)
    return PassSide::Outside;

  const double racingN = corridor->racingLineN(s);
  const double kappa = corridor->effectiveCurvature(s, racingN);
  const bool brakingZone = std::abs(kappa) > kBrakingKappaThreshold;
  if (brakingZone && overtakeSkill > 0.90)
    return PassSide::Inside;
  if (brakingZone && overtakeSkill > 0.84)
    return PassSide::Inside;
  return PassSide::Outside;
}

bool ShouldCommitAttack(const Car &/*attacker*/, double overtakeSkill,
                        double gap, double combinedLength) {
  const double closeness = 1.0 - gap / (combinedLength * 2.2);
  const double commitThreshold = 0.42 - (overtakeSkill - 0.78) * 0.35;
  return closeness > commitThreshold;
}

bool IsAlongside(double gap, double combinedLength) {
  return gap < combinedLength * 0.55;
}

void PruneBattles(std::vector<OvertakeBattle> &battles,
                  const std::vector<Car> &cars, double lapLength,
                  double raceTime) {
  battles.erase(
      std::remove_if(battles.begin(), battles.end(),
                     [&](const OvertakeBattle &b) {
                       if (b.phase == BattlePhase::Abort ||
                           b.phase == BattlePhase::None)
                         return raceTime - b.lastDecisionAt > 2.5;
                       const size_t ai = CarIndex(cars, b.attackerId);
                       const size_t di = CarIndex(cars, b.defenderId);
                       if (ai >= cars.size() || di >= cars.size())
                         return true;
                       const Car &attacker = cars[ai];
                       const Car &defender = cars[di];
                       if (attacker.isRetired() || defender.isRetired() ||
                           attacker.inPitLane() || defender.inPitLane())
                         return true;
                       const double gap = WrapRaceGap(
                           RaceDistance(defender, lapLength),
                           RaceDistance(attacker, lapLength), lapLength);
                       const double combined =
                           (attacker.bodyDimensions().lengthM +
                            defender.bodyDimensions().lengthM) *
                               0.5 +
                           3.0;
                       if (gap <= 0.0 || gap > combined * 7.0)
                         return true;
                       if (attacker.state().currentSpeed <=
                           defender.state().currentSpeed + 0.8)
                         return true;
                       return false;
                     }),
      battles.end());
}

OvertakeBattle *FindBattle(std::vector<OvertakeBattle> &battles,
                           const std::string &attackerId,
                           const std::string &defenderId) {
  for (OvertakeBattle &b : battles) {
    if (b.attackerId == attackerId && b.defenderId == defenderId)
      return &b;
  }
  return nullptr;
}

} // namespace

int TrafficClassRank(const std::string &classId) {
  if (classId == "Hypercar")
    return 0;
  if (classId == "LMP2")
    return 1;
  return 2;
}

bool DefenderMustYield(const Car &attacker, const Car &defender, int lapDelta) {
  if (TrafficClassRank(attacker.raceClass().id) <
      TrafficClassRank(defender.raceClass().id))
    return true;
  if (lapDelta >= 1)
    return true;
  return false;
}

void UpdateOvertakeBattles(const std::vector<Car> &cars, double lapLength,
                           double raceTime, bool noOvertaking,
                           const std::vector<Car *> &leaderboard,
                           const TrafficLateralContext &lateral,
                           std::vector<OvertakeBattle> &battles,
                           std::vector<TrafficModifiers> &modifiers,
                           std::vector<TrafficEvent> &eventsOut,
                           std::unordered_map<std::string, double> &eventCooldowns) {
  if (noOvertaking || cars.size() < 2 || lapLength <= 0.0 ||
      modifiers.size() != cars.size()) {
    battles.clear();
    return;
  }

  PruneBattles(battles, cars, lapLength, raceTime);

  const TrackCorridor *corridor = lateral.corridor;
  const double safetyGap = 3.0;

  for (size_t i = 0; i < cars.size(); ++i) {
    const Car &attacker = cars[i];
    if (attacker.isRetired() || attacker.inPitLane())
      continue;
    if (attacker.rcState().trackStatus == TrackStatus::Cleared ||
        attacker.rcState().trackStatus == TrackStatus::ReturningToGarage)
      continue;

    const double overtakeSkill = attacker.driver().overtakingFactor();
    const double paceSkill = attacker.driver().paceFactor(0.0, false);
    const double attackerDist = RaceDistance(attacker, lapLength);
    const double attackerLen = attacker.bodyDimensions().lengthM;

    for (size_t j = 0; j < cars.size(); ++j) {
      if (i == j)
        continue;

      const Car &defender = cars[j];
      if (defender.isRetired() || defender.inPitLane())
        continue;
      if (defender.rcState().trackStatus == TrackStatus::Cleared ||
          defender.rcState().trackStatus == TrackStatus::ReturningToGarage)
        continue;

      const double gap =
          WrapRaceGap(RaceDistance(defender, lapLength), attackerDist, lapLength);
      const double combinedLength =
          (attackerLen + defender.bodyDimensions().lengthM) * 0.5 + safetyGap;
      if (gap <= 0.0 || gap > combinedLength * 6.0)
        continue;

      const double relativeSpeed =
          attacker.state().currentSpeed - defender.state().currentSpeed;
      if (relativeSpeed < 1.5)
        continue;

      const double passWindow =
          combinedLength * (2.1 - overtakeSkill * 0.16 - paceSkill * 0.04);
      if (gap > passWindow)
        continue;

      int lapDelta = attacker.state().currentLap - defender.state().currentLap;
      if (!leaderboard.empty()) {
        const Car *leader = leaderboard.front();
        if (leader != nullptr && defender.entryId() == leader->entryId() &&
            lapDelta < 1) {
          lapDelta = attacker.state().currentLap - defender.state().currentLap;
        }
      }

      const bool mustYield =
          DefenderMustYield(attacker, defender, lapDelta);
      YieldReason yieldReason = YieldReason::None;
      if (mustYield) {
        yieldReason = lapDelta >= 1 ? YieldReason::Lapped
                                    : YieldReason::FasterClass;
        if (TrafficClassRank(attacker.raceClass().id) ==
                TrafficClassRank(defender.raceClass().id) &&
            lapDelta >= 1)
          yieldReason = YieldReason::Lapped;
      }

      OvertakeBattle *battle =
          FindBattle(battles, attacker.entryId(), defender.entryId());
      if (battle == nullptr) {
        battles.push_back(OvertakeBattle{});
        battle = &battles.back();
        battle->attackerId = attacker.entryId();
        battle->defenderId = defender.entryId();
        battle->phase = BattlePhase::Approach;
        battle->startedAt = raceTime;
        battle->lastDecisionAt = raceTime - kDecisionIntervalSec;
        battle->yieldReason = yieldReason;
      } else {
        battle->yieldReason = yieldReason;
      }

      const double s = attacker.state().currentDistance;
      battle->inBrakingZone =
          corridor != nullptr && corridor->length() > 0.0 &&
          std::abs(corridor->effectiveCurvature(s, corridor->racingLineN(s))) >
              kBrakingKappaThreshold;
      battle->alongside = IsAlongside(gap, combinedLength);

      if (raceTime - battle->lastDecisionAt < kDecisionIntervalSec)
        continue;
      battle->lastDecisionAt = raceTime;

      switch (battle->phase) {
      case BattlePhase::Approach:
        if (ShouldCommitAttack(attacker, overtakeSkill, gap, combinedLength)) {
          battle->phase = BattlePhase::Committed;
          battle->attackerSide =
              PickAttackerSide(attacker, corridor, s, overtakeSkill);
        }
        break;

      case BattlePhase::Committed: {
        if (battle->attackerSide == PassSide::None)
          battle->attackerSide =
              PickAttackerSide(attacker, corridor, s, overtakeSkill);

        if (battle->alongside) {
          battle->phase = BattlePhase::Alongside;
          break;
        }

        TrafficModifiers &defMod = modifiers[j];
        if (mustYield) {
          defMod.blueFlag = true;
          defMod.yielding = true;
          defMod.speedCapMs = std::max(
              defMod.speedCapMs,
              std::max(kMinTrafficSpeedMs,
                       attacker.state().currentSpeed * 0.99));
          const PassSide yieldSide = OppositeSide(battle->attackerSide);
          battle->defenderSide = yieldSide;
          battle->phase = BattlePhase::DefendReact;
        } else {
          const double defendSkill = defender.driver().defendingFactor();
          const double reactThreshold = 0.86 - (defendSkill - 0.76) * 0.25;
          if (defendSkill > reactThreshold && !battle->alongside) {
            battle->defenderSide = battle->attackerSide;
            battle->defenderMoveCount++;
            battle->phase = BattlePhase::DefendReact;
            defMod.underAttack = true;
            defMod.defending = true;
          } else {
            battle->phase = BattlePhase::Alongside;
          }
        }
        break;
      }

      case BattlePhase::DefendReact:
        if (battle->alongside) {
          battle->phase = BattlePhase::Alongside;
          break;
        }
        if (!mustYield && battle->defenderSide == battle->attackerSide) {
          if (overtakeSkill > 0.91) {
            battle->attackerSide = OppositeSide(battle->attackerSide);
          } else if (overtakeSkill < 0.80) {
            battle->phase = BattlePhase::Abort;
            modifiers[i].blocked = true;
            modifiers[i].speedCapMs = std::max(
                modifiers[i].speedCapMs,
                std::max(kMinTrafficSpeedMs,
                         defender.state().currentSpeed * 0.97));
            modifiers[i].blockingEntryId = defender.entryId();
          }
        }
        if (!mustYield && battle->inBrakingZone &&
            battle->defenderMoveCount >= 2) {
          const std::string key =
              defender.entryId() + ":" + attacker.entryId() + ":w";
          if (CooldownReady(eventCooldowns, key, raceTime, 12.0)) {
            TrafficEvent ev;
            ev.type = TrafficEvent::Type::Weaving;
            ev.entryId = defender.entryId();
            ev.otherEntryId = attacker.entryId();
            std::ostringstream oss;
            oss << defender.teamName() << " weaving under braking — "
                << attacker.teamName();
            ev.message = oss.str();
            eventsOut.push_back(std::move(ev));
          }
        }
        break;

      case BattlePhase::Alongside:
        if (gap > combinedLength * 0.9 &&
            relativeSpeed < 2.0) {
          battle->phase = BattlePhase::Abort;
        }
        break;

      case BattlePhase::Abort:
      case BattlePhase::None:
      default:
        break;
      }
    }
  }

  PruneBattles(battles, cars, lapLength, raceTime);

  for (const OvertakeBattle &battle : battles) {
    if (battle.phase == BattlePhase::None ||
        battle.phase == BattlePhase::Approach ||
        battle.phase == BattlePhase::Abort)
      continue;

    const size_t ai = CarIndex(cars, battle.attackerId);
    const size_t di = CarIndex(cars, battle.defenderId);
    if (ai >= cars.size() || di >= cars.size())
      continue;

    TrafficModifiers &attMod = modifiers[ai];
    TrafficModifiers &defMod = modifiers[di];

    if (battle.attackerSide != PassSide::None) {
      attMod.overtaking = true;
      MergePathIntent(attMod, AttackIntent(battle.attackerSide), 1.0);
      attMod.draftThrottleBoost =
          std::max(attMod.draftThrottleBoost,
                   0.012 + cars[ai].driver().overtakingFactor() * 0.012);
    }

    if (battle.yieldReason != YieldReason::None) {
      defMod.blueFlag = true;
      defMod.yielding = true;
      const PassSide yieldSide = battle.defenderSide != PassSide::None
                                     ? battle.defenderSide
                                     : OppositeSide(battle.attackerSide);
      const double trafficSkill =
          cars[di].driver().active().trafficManagement / 100.0;
      MergePathIntent(defMod, YieldIntent(yieldSide),
                      0.75 + trafficSkill * 0.2);
    } else if (battle.defenderSide != PassSide::None &&
               (battle.phase == BattlePhase::DefendReact ||
                battle.phase == BattlePhase::Alongside)) {
      defMod.underAttack = true;
      defMod.defending = true;
      MergePathIntent(defMod, DefendIntent(battle.defenderSide),
                      0.7 + cars[di].driver().defendingFactor() * 0.25);
    }

    if (battle.alongside) {
      attMod.alongside = true;
      defMod.alongside = true;
    }

    if (battle.phase == BattlePhase::Alongside ||
        battle.phase == BattlePhase::Committed) {
      const std::string key = battle.attackerId + ":" + battle.defenderId + ":o";
      if (CooldownReady(eventCooldowns, key, raceTime, kOvertakeEventCooldownSec)) {
        TrafficEvent ev;
        ev.type = TrafficEvent::Type::Overtake;
        ev.entryId = battle.attackerId;
        ev.otherEntryId = battle.defenderId;
        ev.message = cars[ai].driver().active().name + " overtaking #" +
                     cars[di].carNumber();
        eventsOut.push_back(std::move(ev));
      }
    }
  }
}

void AbortBattleOnCollision(std::vector<OvertakeBattle> &battles,
                            const std::string &entryA, const std::string &entryB,
                            std::vector<TrafficModifiers> &modifiers,
                            const std::vector<Car> &cars) {
  for (OvertakeBattle &battle : battles) {
    const bool match =
        (battle.attackerId == entryA && battle.defenderId == entryB) ||
        (battle.attackerId == entryB && battle.defenderId == entryA);
    if (!match)
      continue;
    if (battle.phase == BattlePhase::Abort)
      continue;
    battle.phase = BattlePhase::Abort;
    const size_t ai = CarIndex(cars, battle.attackerId);
    const size_t di = CarIndex(cars, battle.defenderId);
    if (ai >= cars.size() || di >= cars.size())
      continue;
    if (ai < modifiers.size()) {
      modifiers[ai].overtaking = false;
      modifiers[ai].alongside = false;
      modifiers[ai].defending = false;
    }
    if (di < modifiers.size()) {
      modifiers[di].yielding = false;
      modifiers[di].alongside = false;
      modifiers[di].defending = false;
    }
  }
}
