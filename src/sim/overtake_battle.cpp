#include "overtake_battle.hpp"
#include "car_entity.hpp"
#include "driver.hpp"
#include "part_damage.hpp"
#include "track_corridor.hpp"
#include <algorithm>
#include <cmath>
#include <functional>
#include <sstream>

namespace {

constexpr double kDecisionIntervalSec = 0.22;
/** Abort committed attacks when cars are within this gap (car-lengths). */
constexpr double kOverlapAbortGapMul = 0.48;
/** Cap pass-line urgency when closer than this (car-lengths). */
constexpr double kTightGapUrgencyMul = 0.58;
constexpr double kPassMarginM = 1.15;
constexpr double kBrakingKappaThreshold = 0.0065;
constexpr double kMinTrafficSpeedMs = 22.0;
constexpr double kOvertakeEventCooldownSec = 8.0;
/** Time gap (s) before pass window to show blue flag (WEC-style). */
constexpr double kBlueFlagLookaheadMinSec = 6.0;
constexpr double kBlueFlagLookaheadMaxSec = 9.0;
constexpr double kBlueFlagLookaheadPerClassSec = 0.8;
/** Extra car-lengths of battle engagement when defender must yield. */
constexpr double kBlueFlagEngageLengthMul = 3.8;

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
                        double gap, double combinedLength, bool blueFlagPass,
                        bool upsetPass, double upsetLegitimacy) {
  if (upsetPass) {
    const double gapScale = 1.55 + upsetLegitimacy * 0.85;
    const double closeness = 1.0 - gap / (combinedLength * gapScale);
    const double commitThreshold =
        0.56 - upsetLegitimacy * 0.24 - (overtakeSkill - 0.78) * 0.14;
    return closeness > commitThreshold;
  }
  const double gapScale = blueFlagPass ? 3.0 : 2.2;
  const double closeness = 1.0 - gap / (combinedLength * gapScale);
  const double commitThreshold =
      blueFlagPass ? 0.25 - (overtakeSkill - 0.78) * 0.15
                   : 0.42 - (overtakeSkill - 0.78) * 0.35;
  return closeness > commitThreshold;
}

bool IsAlongside(double gap, double combinedLength) {
  return gap < combinedLength * 0.55;
}

bool ShouldAbortForImminentOverlap(double gap, double combinedLength,
                                   double relativeSpeed) {
  if (gap <= 0.0 || gap > combinedLength * kOverlapAbortGapMul)
    return false;
  if (gap < combinedLength * 0.36)
    return true;
  return relativeSpeed > 2.5;
}

void AbortBattleForOverlap(OvertakeBattle &battle, TrafficModifiers &attMod,
                           const Car &defender, double gap,
                           double combinedLength) {
  battle.phase = BattlePhase::Abort;
  attMod.overtaking = false;
  attMod.alongside = false;
  attMod.pathIntent = TrafficPathIntent::RacingLine;
  attMod.pathUrgency = 0.0;
  const double gapNorm =
      std::clamp(gap / std::max(combinedLength * kOverlapAbortGapMul, 1.0), 0.0,
                 1.0);
  attMod.throttleLift =
      std::max(attMod.throttleLift, 0.04 + (1.0 - gapNorm) * 0.05);
  attMod.speedCapMs = std::max(
      attMod.speedCapMs,
      std::max(kMinTrafficSpeedMs, defender.state().currentSpeed * 0.97));
  attMod.blockingEntryId = defender.entryId();
}

double AttackUrgencyForGap(double gap, double combinedLength) {
  if (gap >= combinedLength * kTightGapUrgencyMul)
    return 1.0;
  return 0.35 + 0.65 * (gap / std::max(combinedLength * kTightGapUrgencyMul, 1.0));
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

double BlueFlagLookaheadSec(const Car &attacker, const Car &defender,
                            YieldReason yieldReason, int lapDelta) {
  if (yieldReason == YieldReason::None)
    return 0.0;

  double seconds = kBlueFlagLookaheadMinSec;
  if (yieldReason == YieldReason::Lapped)
    seconds += 0.25;

  const int classGap =
      TrafficClassRank(defender.raceClass().id) -
      TrafficClassRank(attacker.raceClass().id);
  if (classGap > 0)
    seconds += static_cast<double>(classGap) * kBlueFlagLookaheadPerClassSec;

  if (lapDelta >= 1 && yieldReason == YieldReason::Lapped)
    seconds += 0.25;

  (void)attacker;
  return std::clamp(seconds, kBlueFlagLookaheadMinSec, kBlueFlagLookaheadMaxSec);
}

void ApplyEarlyBlueFlag(const Car & /*defender*/, TrafficModifiers &defMod) {
  defMod.blueFlag = true;
  defMod.yielding = true;
}

double ChaserTrafficRiskSkill(const Car &chaser) {
  const auto &d = chaser.driver().active();
  return std::clamp(
      (d.trafficManagement * 0.45 + d.composure * 0.35 + d.overtaking * 0.2) /
          100.0,
      0.0, 1.0);
}

double BlueFlagChaserModeExtra(const Car &chaser) {
  switch (chaser.driver().mode) {
  case DriverMode::Push:
    return 0.0;
  case DriverMode::Conserve:
    return 0.42;
  default:
    return 0.28;
  }
}

double BlueFlagChaserMarginScale(const Car &chaser) {
  switch (chaser.driver().mode) {
  case DriverMode::Push:
    return 1.0;
  case DriverMode::Conserve:
    return 0.58;
  default:
    return 0.74;
  }
}

void ApplyBlueFlagChaserRisk(const Car &attacker, const Car &defender, double gap,
                             double combinedLength, double relativeSpeed,
                             PassSide attackSide, bool alongside,
                             TrafficModifiers &attMod) {
  if (attackSide == PassSide::None)
    return;

  const double riskSkill = ChaserTrafficRiskSkill(attacker);
  const double modeExtra = BlueFlagChaserModeExtra(attacker);
  const double marginScale = BlueFlagChaserMarginScale(attacker);
  const double gapNorm =
      std::clamp(gap / std::max(combinedLength * 2.5, 1.0), 0.0, 1.0);
  const double caution = std::clamp(
      (1.0 - riskSkill) * (0.5 + gapNorm * 0.4) +
          modeExtra * (0.65 + gapNorm * 0.35),
      0.0, 1.0);

  double urgency = 1.0 - caution * 0.24;
  if (alongside)
    urgency = std::max(urgency, 0.9);
  else if (gap > combinedLength * 0.7)
    urgency = std::min(urgency, 0.76 + riskSkill * 0.12);
  if (attacker.driver().mode != DriverMode::Push && !alongside &&
      gap > combinedLength * 0.4) {
    const double maxUrgency = attacker.driver().mode == DriverMode::Conserve
                                  ? 0.68 + riskSkill * 0.1
                                  : 0.74 + riskSkill * 0.12;
    urgency = std::min(urgency, maxUrgency);
  }

  attMod.overtaking = true;
  MergePathIntent(attMod, AttackIntent(attackSide), urgency);

  const double maxBoost = 0.003 + riskSkill * 0.011;
  double boost =
      gap > combinedLength * 0.45 ? maxBoost * (1.0 - gapNorm * 0.85) : maxBoost;
  if (attacker.driver().mode != DriverMode::Push && gap > combinedLength * 0.35)
    boost *= 0.35;
  attMod.draftThrottleBoost = std::max(attMod.draftThrottleBoost, boost);

  if (relativeSpeed > 2.5 && gap > 0.0) {
    attMod.throttleLift = std::max(
        attMod.throttleLift,
        caution * 0.05 + gapNorm * 0.025 + modeExtra * 0.04);
    const double margin =
        (1.8 + riskSkill * 4.2 + gapNorm * 2.8) * marginScale;
    const double relScale =
        attacker.driver().mode == DriverMode::Push
            ? (0.26 + riskSkill * 0.14)
            : (0.18 + riskSkill * 0.1);
    const double cap =
        defender.state().currentSpeed +
        std::min(margin, relativeSpeed * relScale);
    attMod.speedCapMs =
        std::max(attMod.speedCapMs, std::max(kMinTrafficSpeedMs, cap));
  }
}

void ApplyUpsetPassCaution(const Car &attacker, const Car &defender, double gap,
                           double combinedLength, double relativeSpeed,
                           double legitimacy, PassSide attackSide,
                           bool alongside, bool inBrakingZone,
                           TrafficModifiers &attMod) {
  if (attackSide == PassSide::None)
    return;

  const double riskSkill = ChaserTrafficRiskSkill(attacker);
  const double gapNorm =
      std::clamp(gap / std::max(combinedLength * 2.5, 1.0), 0.0, 1.0);
  const double caution = std::clamp(
      (1.0 - legitimacy) * (0.74 + gapNorm * 0.2) + (1.0 - riskSkill) * 0.1 +
          (inBrakingZone ? 0.2 : 0.0),
      0.0, 1.0);

  double urgency = 0.52 + legitimacy * 0.38 - caution * 0.3;
  if (alongside)
    urgency = std::max(urgency, 0.62 + legitimacy * 0.22);
  urgency = std::clamp(urgency, 0.4, 0.9);

  attMod.overtaking = true;
  MergePathIntent(attMod, AttackIntent(attackSide), urgency);

  const double maxBoost = 0.002 + legitimacy * 0.009 + riskSkill * 0.004;
  double boost =
      gap > combinedLength * 0.45 ? maxBoost * (1.0 - gapNorm * 0.9) : maxBoost;
  if (inBrakingZone)
    boost *= 0.15;
  else if (legitimacy < 0.35)
    boost *= 0.3;
  attMod.draftThrottleBoost = std::max(attMod.draftThrottleBoost, boost);

  if (relativeSpeed > 1.5 && gap > 0.0) {
    attMod.throttleLift = std::max(
        attMod.throttleLift,
        caution * 0.065 + (inBrakingZone ? 0.045 : 0.0) + gapNorm * 0.02);
    const double marginScale = 0.42 + legitimacy * 0.58;
    const double margin = (1.1 + riskSkill * 2.2 + gapNorm * 1.4) * marginScale;
    const double cap =
        defender.state().currentSpeed +
        std::min(margin,
                 relativeSpeed * (0.1 + legitimacy * 0.16 + riskSkill * 0.08));
    attMod.speedCapMs =
        std::max(attMod.speedCapMs, std::max(kMinTrafficSpeedMs, cap));
  }
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

bool AttackerChasesHigherClass(const Car &attacker, const Car &defender) {
  return TrafficClassRank(attacker.raceClass().id) >
         TrafficClassRank(defender.raceClass().id);
}

double UpsetPassLegitimacy(const Car &attacker, const Car &defender,
                           double relativeSpeedMs) {
  double score = 0.0;
  if (defender.state().engineHealth < 75.0)
    score += 0.38;
  else if (defender.state().engineHealth < 88.0)
    score += 0.16;
  if (defender.rcState().unstableOnTrack)
    score += 0.28;
  if (defender.rcState().instabilitySec > 0.4)
    score += 0.14;
  const double structural = ComputeStructuralSeverity(
      defender.state().partDamage, defender.state().tyreDeflation);
  if (structural > 0.45)
    score += 0.32;
  else if (structural > 0.22)
    score += 0.14;
  if (relativeSpeedMs > 8.0 && defender.state().currentSpeed < 45.0)
    score += 0.36;
  else if (relativeSpeedMs > 5.5 && defender.state().currentSpeed < 38.0)
    score += 0.22;
  else if (relativeSpeedMs > 4.0 &&
           attacker.driver().mode == DriverMode::Push)
    score += 0.16;
  if (relativeSpeedMs < 4.0 && defender.state().currentSpeed > 32.0)
    score *= 0.35;
  return std::clamp(score, 0.0, 1.0);
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
      if (gap <= 0.0)
        continue;

      const double relativeSpeed =
          attacker.state().currentSpeed - defender.state().currentSpeed;
      if (relativeSpeed < 1.5)
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

      const double lookaheadDist =
          BlueFlagLookaheadSec(attacker, defender, yieldReason, lapDelta) *
          relativeSpeed;
      const double maxEngageGap =
          mustYield ? std::max(combinedLength * 6.0, lookaheadDist)
                    : combinedLength * 6.0;
      if (gap > maxEngageGap)
        continue;

      if (mustYield && gap <= lookaheadDist)
        ApplyEarlyBlueFlag(defender, modifiers[j]);

      const double normalPassWindow =
          combinedLength * (2.1 - overtakeSkill * 0.16 - paceSkill * 0.04);
      const double engageGap =
          mustYield ? std::max(lookaheadDist, combinedLength * kBlueFlagEngageLengthMul)
                    : normalPassWindow;
      if (gap > engageGap)
        continue;

      if (mustYield && gap <= engageGap) {
        TrafficModifiers &attMod = modifiers[i];
        const PassSide side =
            PickAttackerSide(attacker, corridor, attacker.state().currentDistance,
                             overtakeSkill);
        ApplyBlueFlagChaserRisk(attacker, defender, gap, combinedLength,
                                relativeSpeed, side, false, attMod);
      }

      const bool upsetPass =
          !mustYield && AttackerChasesHigherClass(attacker, defender);
      const double upsetLegitimacy =
          upsetPass ? UpsetPassLegitimacy(attacker, defender, relativeSpeed)
                    : 0.0;

      const double s = attacker.state().currentDistance;
      const bool inBrakingZone =
          corridor != nullptr && corridor->length() > 0.0 &&
          std::abs(corridor->effectiveCurvature(s, corridor->racingLineN(s))) >
              kBrakingKappaThreshold;

      if (upsetPass && gap <= engageGap) {
        TrafficModifiers &attMod = modifiers[i];
        const PassSide side =
            PickAttackerSide(attacker, corridor, s, overtakeSkill);
        ApplyUpsetPassCaution(attacker, defender, gap, combinedLength,
                              relativeSpeed, upsetLegitimacy, side, false,
                              inBrakingZone, attMod);
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
        battle->lastDecisionAt = raceTime - kDecisionIntervalSec - 0.001;
        battle->yieldReason = yieldReason;
        battle->upsetPass = upsetPass;
      } else {
        battle->yieldReason = yieldReason;
        battle->upsetPass = upsetPass;
      }

      battle->inBrakingZone = inBrakingZone;
      battle->alongside = IsAlongside(gap, combinedLength);

      if (raceTime - battle->lastDecisionAt < kDecisionIntervalSec)
        continue;
      battle->lastDecisionAt = raceTime;

      switch (battle->phase) {
      case BattlePhase::Approach:
        if (upsetPass && inBrakingZone && upsetLegitimacy < 0.48) {
          battle->phase = BattlePhase::Abort;
          modifiers[i].speedCapMs = std::max(
              modifiers[i].speedCapMs,
              std::max(kMinTrafficSpeedMs,
                       defender.state().currentSpeed * 0.985));
          modifiers[i].blockingEntryId = defender.entryId();
          break;
        }
        if (ShouldCommitAttack(attacker, overtakeSkill, gap, combinedLength,
                               mustYield, upsetPass, upsetLegitimacy)) {
          battle->phase = BattlePhase::Committed;
          battle->attackerSide =
              PickAttackerSide(attacker, corridor, s, overtakeSkill);
        }
        break;

      case BattlePhase::Committed: {
        if (ShouldAbortForImminentOverlap(gap, combinedLength, relativeSpeed)) {
          AbortBattleForOverlap(*battle, modifiers[i], defender, gap,
                                combinedLength);
          break;
        }
        if (battle->attackerSide == PassSide::None)
          battle->attackerSide =
              PickAttackerSide(attacker, corridor, s, overtakeSkill);

        if (upsetPass && inBrakingZone && upsetLegitimacy < 0.55) {
          battle->phase = BattlePhase::Abort;
          modifiers[i].speedCapMs = std::max(
              modifiers[i].speedCapMs,
              std::max(kMinTrafficSpeedMs,
                       defender.state().currentSpeed * 0.985));
          modifiers[i].blockingEntryId = defender.entryId();
          break;
        }

        if (battle->alongside) {
          battle->phase = BattlePhase::Alongside;
          break;
        }

        TrafficModifiers &defMod = modifiers[j];
        if (mustYield) {
          defMod.blueFlag = true;
          defMod.yielding = true;
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
        if (ShouldAbortForImminentOverlap(gap, combinedLength, relativeSpeed)) {
          AbortBattleForOverlap(*battle, modifiers[i], defender, gap,
                                combinedLength);
        } else if (gap > combinedLength * 0.9 && relativeSpeed < 2.0) {
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

  for (OvertakeBattle &battle : battles) {
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
      const Car &attacker = cars[ai];
      const Car &defender = cars[di];
      const double gap = WrapRaceGap(
          RaceDistance(defender, lapLength), RaceDistance(attacker, lapLength),
          lapLength);
      const double combinedLength =
          (attacker.bodyDimensions().lengthM +
           defender.bodyDimensions().lengthM) *
              0.5 +
          3.0;
      const double relativeSpeed =
          attacker.state().currentSpeed - defender.state().currentSpeed;

      if (battle.yieldReason != YieldReason::None) {
        ApplyBlueFlagChaserRisk(attacker, defender, gap, combinedLength,
                                relativeSpeed, battle.attackerSide,
                                battle.alongside, attMod);
      } else if (battle.upsetPass) {
        const double legitimacy =
            UpsetPassLegitimacy(attacker, defender, relativeSpeed);
        ApplyUpsetPassCaution(attacker, defender, gap, combinedLength,
                              relativeSpeed, legitimacy, battle.attackerSide,
                              battle.alongside, battle.inBrakingZone, attMod);
      } else {
        if (ShouldAbortForImminentOverlap(gap, combinedLength, relativeSpeed)) {
          AbortBattleForOverlap(battle, attMod, defender, gap, combinedLength);
        } else {
          attMod.overtaking = true;
          const double urgency =
              AttackUrgencyForGap(gap, combinedLength);
          MergePathIntent(attMod, AttackIntent(battle.attackerSide), urgency);
          attMod.draftThrottleBoost =
              std::max(attMod.draftThrottleBoost,
                       0.012 + cars[ai].driver().overtakingFactor() * 0.012);
        }
      }
    }

    if (battle.yieldReason != YieldReason::None) {
      defMod.blueFlag = true;
      defMod.yielding = true;
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
