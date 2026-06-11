#include "traffic.hpp"
#include "car_entity.hpp"
#include "driver.hpp"
#include "overtake_battle.hpp"
#include "part_damage.hpp"
#include "track_corridor.hpp"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <unordered_map>

namespace {

constexpr double kCollisionEventCooldownSec = 5.0;
/** Closing speed (m/s) before wheel-to-wheel contact can damage parts. */
constexpr double kMinCollisionClosingSpeedMs = 14.0;
/** Longitudinal gap (car-lengths) for damage vs proximity-only blocking. */
constexpr double kDamageEnvelopeAheadMul = 0.72;
constexpr double kDamageEnvelopeBehindMul = 0.55;
/** Lateral separation must be within this fraction of body overlap for damage. */
constexpr double kDamageLateralOverlapFrac = 0.72;
/** Effective severity below this is proximity only — no parts damage. */
constexpr double kMinCollisionDamageSeverity = 3.5;
constexpr double kMinTrafficSpeedMs = 22.0;

bool CooldownReady(std::unordered_map<std::string, double> &cooldowns,
                   const std::string &key, double raceTime,
                   double cooldownSec) {
  const auto it = cooldowns.find(key);
  if (it != cooldowns.end() && raceTime - it->second < cooldownSec)
    return false;
  cooldowns[key] = raceTime;
  return true;
}

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

struct BlueFlagPassInfo {
  bool active = false;
  std::string chaserId;
  std::string defenderId;
  bool chaserWasOvertaking = false;
  bool defenderWasCooperating = false;
  bool defenderWasBlocking = false;
};

BlueFlagPassInfo ClassifyBlueFlagPass(const Car &self, const Car &other,
                                      const TrafficModifiers &selfMod,
                                      const TrafficModifiers &otherMod,
                                      double otherAheadM, double combinedLength,
                                      double relativeSpeed) {
  BlueFlagPassInfo info;
  auto assign = [&](const Car &chaser, const Car &defender,
                    const TrafficModifiers &chaserMod,
                    const TrafficModifiers &defMod,
                    bool chaserOvertaking) {
    info.active = true;
    info.chaserId = chaser.entryId();
    info.defenderId = defender.entryId();
    info.chaserWasOvertaking = chaserOvertaking;
    info.defenderWasCooperating = defMod.yielding;
    info.defenderWasBlocking = defMod.defending;
  };

  if (selfMod.overtaking && otherMod.blueFlag) {
    assign(self, other, selfMod, otherMod, true);
    return info;
  }
  if (otherMod.overtaking && selfMod.blueFlag) {
    assign(other, self, otherMod, selfMod, true);
    return info;
  }

  const double passProximity = combinedLength * 2.8;
  if (otherAheadM > 0.0 && otherAheadM < passProximity) {
    if (otherMod.blueFlag && relativeSpeed > 2.0) {
      assign(self, other, selfMod, otherMod,
             selfMod.overtaking || relativeSpeed > 4.5);
      return info;
    }
    if (selfMod.blueFlag && relativeSpeed > 2.0 && otherAheadM < combinedLength * 2.0) {
      assign(other, self, otherMod, selfMod,
             otherMod.overtaking || relativeSpeed > 3.5);
      return info;
    }
  }
  return info;
}

void ApplyBlueFlagPassMetadata(TrafficEvent &ev, const BlueFlagPassInfo &pass) {
  if (!pass.active)
    return;
  ev.blueFlagPassActive = true;
  ev.blueFlagChaserId = pass.chaserId;
  ev.blueFlagDefenderId = pass.defenderId;
  ev.chaserWasOvertaking = pass.chaserWasOvertaking;
  ev.defenderHadBlueFlag = true;
  ev.defenderWasYielding = pass.defenderWasCooperating;
  ev.defenderWasBlocking = pass.defenderWasBlocking;
}

constexpr double kPitMergeNormalizedOffset = 0.58;

double MergeRejoinLateralNM(double mergeDistance,
                            const TrafficLateralContext &lateral) {
  if (lateral.corridor != nullptr && lateral.corridor->length() > 0.0)
    return lateral.corridor->lateralOffsetM(mergeDistance,
                                            kPitMergeNormalizedOffset);
  return kPitMergeNormalizedOffset * lateral.trackWidthM * 0.5;
}

bool LaterallyConflicting(double nA, double nB, double widthA, double widthB) {
  return std::abs(nA - nB) < (widthA + widthB) * 0.5 + 0.5;
}

bool UsesMetreLateral(const Car &car, const TrafficLateralContext &lateral) {
  if (lateral.corridor != nullptr && lateral.corridor->length() > 0.0)
    return true;
  return lateral.useFrenetDynamics || car.state().lateralOffsetM != 0.0;
}

double LateralSepMetres(const Car &self, const Car &other,
                        const TrafficLateralContext &lateral) {
  const double sSelf = self.state().currentDistance;
  const double sOther = other.state().currentDistance;
  if (UsesMetreLateral(self, lateral) || UsesMetreLateral(other, lateral)) {
    const double nSelf =
        self.lateralNM(lateral.trackWidthM, lateral.useFrenetDynamics,
                       lateral.corridor, sSelf);
    const double nOther =
        other.lateralNM(lateral.trackWidthM, lateral.useFrenetDynamics,
                        lateral.corridor, sOther);
    return std::abs(nSelf - nOther);
  }
  return std::abs(self.lateralOffset() - other.lateralOffset()) *
         lateral.trackWidthM * 0.5;
}

double LateralNMetres(const Car &car, const TrafficLateralContext &lateral) {
  const double s = car.state().currentDistance;
  if (UsesMetreLateral(car, lateral))
    return car.lateralNM(lateral.trackWidthM, lateral.useFrenetDynamics,
                         lateral.corridor, s);
  return car.lateralOffset() * lateral.trackWidthM * 0.5;
}

double ComputeBaseImpact(double relativeSpeed) {
  return std::min(10.0, (relativeSpeed - 10.0) * 0.75);
}

double ComputeObliqueFactor(CollisionSide side, double lateralSep,
                            double widthOverlap) {
  if (side == CollisionSide::Left || side == CollisionSide::Right) {
    const double overlap =
        1.0 - lateralSep / std::max(0.5, widthOverlap);
    return 1.0 + 0.4 * std::clamp(overlap, 0.0, 1.0);
  }
  if (side == CollisionSide::Front || side == CollisionSide::Rear)
    return 1.1;
  return 1.0;
}

double ComputeClassFactor(double aggressorMass, double victimMass) {
  if (victimMass <= 0.0)
    return 1.0;
  return std::clamp(std::sqrt(aggressorMass / victimMass), 1.0, 1.6);
}

double ComputeChicaneFactor(const TrackCorridor *corridor, double s, double n) {
  if (corridor == nullptr || corridor->length() <= 0.0)
    return 1.0;
  const double kappa = std::abs(corridor->effectiveCurvature(s, n));
  return 1.0 + std::min(0.35, kappa * 80.0);
}

double ComputeKerbEdgeFactor(const TrackCorridor *corridor, double s, double n) {
  if (corridor == nullptr || corridor->length() <= 0.0)
    return 1.0;
  const double halfW = corridor->maxLateralN(s);
  if (halfW <= 0.1)
    return 1.0;
  const double edgeDist = std::abs(std::abs(n) - halfW);
  const double band = std::max(0.5, halfW * 0.15);
  if (edgeDist < band)
    return 1.0 + 0.25 * (1.0 - edgeDist / band);
  return 1.0;
}

double ComputeWeatherFactor(double weatherGripScale) {
  if (weatherGripScale > 0.0 && weatherGripScale < 1.0)
    return std::min(1.25, 1.0 / weatherGripScale);
  return 1.0;
}

double ComputeEffectiveSeverity(double baseImpact, CollisionSide side,
                                double lateralSep, double widthOverlap,
                                double aggressorMass, double victimMass,
                                const TrackCorridor *corridor, double s,
                                double n, double weatherGripScale) {
  double severity = baseImpact;
  severity *= ComputeObliqueFactor(side, lateralSep, widthOverlap);
  severity *= ComputeClassFactor(aggressorMass, victimMass);
  severity *= ComputeChicaneFactor(corridor, s, n);
  severity *= ComputeKerbEdgeFactor(corridor, s, n);
  severity *= ComputeWeatherFactor(weatherGripScale);
  return std::min(15.0, severity);
}

uint32_t HashCollisionSeed(uint32_t seed, int salt) {
  seed ^= static_cast<uint32_t>(salt + 0x9e3779b9);
  seed *= 0x85ebca6bU;
  seed ^= seed >> 13;
  return seed;
}

void ApplyCollisionModifier(TrafficModifiers &mod, double severity,
                            double baseImpact, CollisionSide side,
                            double overlapFactor) {
  if (severity <= 0.0)
    return;
  if (severity >= mod.collisionDamage) {
    mod.collisionDamage = severity;
    mod.collisionBaseImpact = baseImpact;
    mod.collisionSide = side;
    mod.collisionOverlapFactor = overlapFactor;
    mod.collision = true;
  }
}

void MaybeApplyInstability(TrafficModifiers &mod, double severity,
                           double driverSkill, uint32_t seed) {
  if (severity < 5.0)
    return;
  const double skillNorm = std::clamp(driverSkill / 100.0, 0.0, 1.0);
  const double chance =
      std::clamp((severity - 5.0) / 8.0, 0.0, 0.95) * (1.0 - 0.35 * skillNorm);
  const double roll =
      static_cast<double>(HashCollisionSeed(seed, 7) % 10000) / 10000.0;
  if (roll >= chance)
    return;
  mod.instabilitySec =
      std::max(mod.instabilitySec, 0.8 + (severity - 5.0) * 0.35);
  mod.instabilityGripScale =
      std::min(mod.instabilityGripScale,
               std::max(0.55, 1.0 - severity * 0.04));
  const double wanderSign =
      (HashCollisionSeed(seed, 11) % 2 == 0) ? 1.0 : -1.0;
  mod.lateralWanderMps +=
      wanderSign * (0.4 + severity * 0.07);
  mod.unstableOnTrack = true;
}

void ApplyContactImpulse(TrafficModifiers &aggressorMod,
                         TrafficModifiers &victimMod, CollisionSide aggressorSide,
                         double severity, double aggressorMass,
                         double victimMass) {
  const double massRatio =
      std::sqrt(aggressorMass / std::max(1.0, victimMass));
  const double impulseMag =
      severity * 0.35 * std::min(1.8, massRatio);
  if (aggressorSide == CollisionSide::Front) {
    victimMod.impulseSpeedMs += impulseMag;
    aggressorMod.impulseSpeedMs -= impulseMag * 0.3;
  } else if (aggressorSide == CollisionSide::Rear) {
    victimMod.impulseSpeedMs -= impulseMag * 0.5;
    aggressorMod.impulseSpeedMs += impulseMag * 0.35;
  } else if (aggressorSide == CollisionSide::Left ||
             aggressorSide == CollisionSide::Right) {
    const double latSign = aggressorSide == CollisionSide::Left ? -1.0 : 1.0;
    victimMod.impulseLateralMps += latSign * impulseMag * 0.5;
    aggressorMod.impulseLateralMps -= latSign * impulseMag * 0.25;
  }
}

} // namespace

CarBodyDimensions DimensionsForClass(const std::string &classId) {
  if (classId == "Hypercar")
    return {5.3, 2.05};
  if (classId == "LMGT3")
    return {4.85, 2.0};
  if (classId == "LMP2")
    return {4.75, 1.95};
  return {5.0, 2.0};
}

double WrapDistanceGap(double aheadDistance, double behindDistance,
                       double lapLength) {
  return WrapRaceGap(aheadDistance, behindDistance, lapLength);
}

bool PitMergeGapSafe(const Car &rejoining, const std::vector<Car> &cars,
                     double lapLength, double mergeDistance,
                     double rejoinSpeedMs, const TrafficLateralContext &lateral) {
  if (lapLength <= 0.0)
    return true;

  const CarBodyDimensions dim = rejoining.bodyDimensions();
  const double minAheadGap = dim.lengthM + 12.0;
  const double minBehindGap = dim.lengthM * 2.0 + 20.0;
  const double rejoinRaceDist =
      mergeDistance +
      static_cast<double>(rejoining.state().currentLap) * lapLength;
  const bool checkLateral =
      lateral.useFrenetDynamics || lateral.corridor != nullptr;
  const double rejoinN =
      checkLateral ? MergeRejoinLateralNM(mergeDistance, lateral) : 0.0;

  for (const Car &other : cars) {
    if (other.entryId() == rejoining.entryId())
      continue;
    if (other.isRetired() || other.inPitLane())
      continue;
    if (other.rcState().trackStatus == TrackStatus::Cleared ||
        other.rcState().trackStatus == TrackStatus::ReturningToGarage)
      continue;

    const double gap = WrapRaceGap(RaceDistance(other, lapLength), rejoinRaceDist,
                                   lapLength);
    const CarBodyDimensions otherDim = other.bodyDimensions();
    const double otherN =
        checkLateral
            ? other.lateralNM(lateral.trackWidthM, lateral.useFrenetDynamics,
                              lateral.corridor, other.state().currentDistance)
            : 0.0;
    const bool lateralConflict =
        !checkLateral ||
        LaterallyConflicting(rejoinN, otherN, dim.widthM, otherDim.widthM);

    if (gap > 0.0 && gap < minAheadGap && lateralConflict)
      return false;

    if (gap < 0.0) {
      const double behind = -gap;
      const double closing = other.state().currentSpeed - rejoinSpeedMs;
      if (behind < minBehindGap && lateralConflict)
        return false;
      if (lateralConflict && closing > 4.0 &&
          behind < minBehindGap + closing * 2.5)
        return false;
    }
  }
  return true;
}

void ResolveTraffic(const std::vector<Car> &cars, double lapLength,
                    double raceTime,
                    std::unordered_map<std::string, double> &eventCooldowns,
                    std::vector<TrafficModifiers> &modifiersOut,
                    std::vector<TrafficEvent> &eventsOut,
                    const SessionRaceControl &raceControl,
                    const std::vector<Car *> &leaderboard,
                    const TrafficLateralContext &lateral,
                    std::vector<OvertakeBattle> *battles) {
  modifiersOut.assign(cars.size(), TrafficModifiers{});
  eventsOut.clear();

  if (cars.size() < 2 || lapLength <= 0.0)
    return;

  const bool noOvertaking =
      raceControl.flagPhase == FlagPhase::FCY ||
      raceControl.flagPhase == FlagPhase::SC ||
      raceControl.flagPhase == FlagPhase::SCInLap ||
      raceControl.flagPhase == FlagPhase::RedFlag;

  const double safetyGap = 3.0;

  if (battles != nullptr) {
    UpdateOvertakeBattles(cars, lapLength, raceTime, noOvertaking, leaderboard,
                          lateral, *battles, modifiersOut, eventsOut,
                          eventCooldowns);
  }

  for (size_t i = 0; i < cars.size(); ++i) {
    const Car &self = cars[i];
    if (self.isRetired() || self.inPitLane())
      continue;
    if (self.rcState().trackStatus == TrackStatus::Cleared ||
        self.rcState().trackStatus == TrackStatus::ReturningToGarage)
      continue;

    const CarBodyDimensions selfDim = self.bodyDimensions();
    TrafficModifiers &selfMod = modifiersOut[i];
    const double selfRaceDist = RaceDistance(self, lapLength);
    const bool selfObstruction = self.isOnTrackObstruction();

    for (size_t j = 0; j < cars.size(); ++j) {
      if (i == j)
        continue;

      const Car &other = cars[j];
      if (other.isRetired() || other.inPitLane())
        continue;
      if (other.rcState().trackStatus == TrackStatus::Cleared ||
        other.rcState().trackStatus == TrackStatus::ReturningToGarage)
        continue;

      const CarBodyDimensions otherDim = other.bodyDimensions();
      const double gap = WrapRaceGap(RaceDistance(other, lapLength),
                                     selfRaceDist, lapLength);
      const double combinedLength =
          (selfDim.lengthM + otherDim.lengthM) * 0.5 + safetyGap;
      const double widthOverlap =
          (selfDim.widthM + otherDim.widthM) * 0.42;

      if (other.isOnTrackObstruction() && gap > 0.0 &&
          gap < combinedLength * 5.0) {
        selfMod.blocked = true;
        selfMod.speedCapMs = std::max(
            selfMod.speedCapMs,
            std::max(kMinTrafficSpeedMs, 12.0));
        selfMod.blockingEntryId = other.entryId();
      }

      const bool otherUnstable = other.rcState().unstableOnTrack;
      const bool otherRiskyRejoin = other.rcState().riskyRejoinSec > 0.0;
      if ((otherUnstable || otherRiskyRejoin) && gap > 0.0 &&
          gap < combinedLength * 2.8) {
        const double lateralSepUnstable = LateralSepMetres(self, other, lateral);
        if (lateralSepUnstable < widthOverlap * 1.25) {
          selfMod.speedCapMs = std::max(
              selfMod.speedCapMs,
              std::max(kMinTrafficSpeedMs,
                       other.state().currentSpeed * (otherUnstable ? 0.91 : 0.94)));
          if (otherUnstable && gap < combinedLength * 1.6 &&
              lateralSepUnstable < widthOverlap * 1.05) {
            selfMod.localGripScale =
                std::min(selfMod.localGripScale, 0.9);
          }
        }
      }

      if (selfObstruction)
        continue;

      const TrafficModifiers &otherMod = modifiersOut[j];
      const bool passPair =
          (selfMod.overtaking && otherMod.blueFlag) ||
          (selfMod.blueFlag && otherMod.overtaking);
      const double otherAheadM = gap;

      if (otherAheadM > combinedLength * 6.0)
        continue;
      if (otherAheadM <= 0.0 && !passPair)
        continue;
      if (otherAheadM <= 0.0 && passPair &&
          (-otherAheadM) > combinedLength * 0.65)
        continue;

      const double relativeSpeed =
          self.state().currentSpeed - other.state().currentSpeed;

      if (otherAheadM > 0.0 && otherMod.blueFlag && relativeSpeed > 3.0) {
        const DriverMode chaserMode = self.driver().mode;
        const double engageLength =
            chaserMode == DriverMode::Push ? 2.4 : 3.0;
        if (otherAheadM < combinedLength * engageLength) {
          const auto &d = self.driver().active();
          const double riskSkill = std::clamp(
              (d.trafficManagement * 0.5 + d.composure * 0.5) / 100.0, 0.0, 1.0);
          const double gapNorm = std::clamp(
              otherAheadM / std::max(combinedLength * 2.0, 1.0), 0.0, 1.0);
          const double modeExtra = chaserMode == DriverMode::Push
                                       ? 0.0
                                   : chaserMode == DriverMode::Conserve ? 0.4
                                                                        : 0.26;
          const double marginScale = chaserMode == DriverMode::Push
                                         ? 1.0
                                     : chaserMode == DriverMode::Conserve ? 0.6
                                                                          : 0.76;
          const double margin =
              (2.0 + riskSkill * 3.5 + gapNorm * 2.5) * marginScale;
          const double relScale = chaserMode == DriverMode::Push
                                      ? (0.24 + riskSkill * 0.14)
                                      : (0.16 + riskSkill * 0.1);
          const double cap =
              other.state().currentSpeed +
              std::min(margin, relativeSpeed * relScale);
          selfMod.speedCapMs =
              std::max(selfMod.speedCapMs,
                       std::max(kMinTrafficSpeedMs, cap));
          if (chaserMode != DriverMode::Push &&
              otherAheadM < combinedLength * 1.8) {
            selfMod.throttleLift = std::max(
                selfMod.throttleLift,
                (1.0 - riskSkill) * (0.03 + gapNorm * 0.035) +
                    modeExtra * 0.035);
          }
        }
      }

      if (otherAheadM > 0.0 && relativeSpeed > 1.8 &&
          AttackerChasesHigherClass(self, other) && !otherMod.blueFlag) {
        const double legitimacy = UpsetPassLegitimacy(self, other, relativeSpeed);
        if (otherAheadM < combinedLength * (1.8 + legitimacy * 0.8)) {
          const auto &d = self.driver().active();
          const double riskSkill = std::clamp(
              (d.trafficManagement * 0.5 + d.composure * 0.5) / 100.0, 0.0, 1.0);
          const double gapNorm = std::clamp(
              otherAheadM / std::max(combinedLength * 2.0, 1.0), 0.0, 1.0);
          const double marginScale = 0.4 + legitimacy * 0.55;
          const double margin =
              (1.0 + riskSkill * 2.0 + gapNorm * 1.2) * marginScale;
          const double cap =
              other.state().currentSpeed +
              std::min(margin, relativeSpeed * (0.08 + legitimacy * 0.12));
          selfMod.speedCapMs =
              std::max(selfMod.speedCapMs,
                       std::max(kMinTrafficSpeedMs, cap));
          if (legitimacy < 0.45 && otherAheadM < combinedLength * 1.5) {
            selfMod.throttleLift = std::max(
                selfMod.throttleLift,
                (1.0 - legitimacy) * (0.04 + gapNorm * 0.03));
          }
        }
      }

      const double lateralSep = LateralSepMetres(self, other, lateral);

      // Rejoining cars yield — only when closing traffic shares the corridor.
      if (other.isRejoiningYield() && gap > 0.0 && relativeSpeed > 4.0 &&
          lateralSep < widthOverlap) {
        TrafficModifiers &otherMod = modifiersOut[j];
        otherMod.blueFlag = true;
        otherMod.speedCapMs = std::max(
            otherMod.speedCapMs,
            std::max(kMinTrafficSpeedMs, self.state().currentSpeed * 0.97));
        if (gap < combinedLength * 1.25)
          continue;
      }
      const bool inProximityEnvelope =
          otherAheadM > 0.0
              ? otherAheadM < combinedLength * 0.85
              : (-otherAheadM) < combinedLength * 0.65;
      const bool inDamageEnvelope =
          otherAheadM > 0.0
              ? otherAheadM < combinedLength * kDamageEnvelopeAheadMul
              : (-otherAheadM) < combinedLength * kDamageEnvelopeBehindMul;
      const double damageLateralLimit = widthOverlap * kDamageLateralOverlapFrac;
      if (inProximityEnvelope &&
          lateralSep < widthOverlap) {
        TrafficModifiers &otherModMut = modifiersOut[j];
        const bool negotiatedPass =
            otherAheadM > 0.0 && selfMod.overtaking && otherModMut.yielding;
        if (inDamageEnvelope && lateralSep < damageLateralLimit &&
            relativeSpeed > kMinCollisionClosingSpeedMs) {
          const double baseImpact = ComputeBaseImpact(relativeSpeed);
          if (negotiatedPass && otherMod.blueFlag && otherMod.yielding &&
              baseImpact < 5.0 && lateralSep > damageLateralLimit * 0.65)
            continue;
          if (negotiatedPass && !otherMod.blueFlag && baseImpact < 6.0)
            continue;

          const double selfN = LateralNMetres(self, lateral);
          const double otherN = LateralNMetres(other, lateral);
          const CollisionSide selfSide =
              CollisionContactSide(gap, combinedLength, selfN, otherN);
          const CollisionSide otherSide = MirrorCollisionSide(selfSide);
          const double overlapFactor =
              std::clamp(1.0 - lateralSep / std::max(0.5, damageLateralLimit), 0.35,
                         1.0);
          const double sSelf = self.state().currentDistance;
          const double selfMass = self.config().calculatedTotalMass;
          const double otherMass = other.config().calculatedTotalMass;
          const double effectiveSeverity = ComputeEffectiveSeverity(
              baseImpact, selfSide, lateralSep, widthOverlap, selfMass,
              otherMass, lateral.corridor, sSelf, selfN,
              lateral.weatherGripScale);
          const double victimSeverity = effectiveSeverity * overlapFactor;

          if (effectiveSeverity >= kMinCollisionDamageSeverity) {
            ApplyCollisionModifier(selfMod, effectiveSeverity, baseImpact, selfSide,
                                 overlapFactor);
            ApplyCollisionModifier(otherModMut, victimSeverity, baseImpact, otherSide,
                                 overlapFactor);
          }
          if (!selfMod.collision && !otherModMut.collision)
            continue;

          ApplyContactImpulse(selfMod, otherModMut, selfSide, effectiveSeverity,
                              selfMass, otherMass);

          const uint32_t pairSeed =
              HashCollisionSeed(static_cast<uint32_t>(i * 131U + j), 3);
          MaybeApplyInstability(selfMod, effectiveSeverity,
                                self.driver().active().consistency, pairSeed);
          MaybeApplyInstability(otherModMut, victimSeverity,
                                other.driver().active().consistency, pairSeed + 1);

          if (battles != nullptr)
            AbortBattleOnCollision(*battles, self.entryId(), other.entryId(),
                                   modifiersOut, cars);

          const std::string key =
              self.entryId() + ":" + other.entryId() + ":c";
          if (CooldownReady(eventCooldowns, key, raceTime,
                            kCollisionEventCooldownSec)) {
            TrafficEvent ev;
            ev.type = TrafficEvent::Type::Collision;
            ev.entryId = self.entryId();
            ev.otherEntryId = other.entryId();
            {
              std::ostringstream oss;
              oss << EntryDisplayLabel(self) << " contact with "
                  << EntryDisplayLabel(other) << " (impact " << std::fixed
                  << std::setprecision(1) << effectiveSeverity << ")";
              ev.message = oss.str();
            }
            ev.impact = effectiveSeverity;
            ev.baseImpact = baseImpact;
            ev.contactSide = selfSide;
            ev.relativeSpeedMs = relativeSpeed;
            ev.lateralSepM = lateralSep;
            ev.closingFromRear = otherAheadM > 0.0;
            ApplyBlueFlagPassMetadata(
                ev, ClassifyBlueFlagPass(self, other, selfMod, otherMod,
                                         otherAheadM, combinedLength,
                                         relativeSpeed));
            if (otherAheadM > 0.0 && !ev.blueFlagPassActive) {
              ev.defenderHadBlueFlag = otherMod.blueFlag;
              ev.defenderWasYielding = otherMod.yielding;
              ev.defenderOnYieldPath =
                  otherMod.pathIntent == TrafficPathIntent::YieldInside ||
                  otherMod.pathIntent == TrafficPathIntent::YieldOutside;
            }
            eventsOut.push_back(std::move(ev));
          }
        } else if (other.state().currentSpeed > self.state().currentSpeed + 1.0) {
          selfMod.blocked = true;
          selfMod.speedCapMs = std::max(
              selfMod.speedCapMs,
              std::max(kMinTrafficSpeedMs, other.state().currentSpeed * 0.98));
          selfMod.blockingEntryId = other.entryId();
        }
      }

      if (gap < 0.0) {
        const double behindGap = -gap;
        const double chaseSpeed =
            other.state().currentSpeed - self.state().currentSpeed;
        if (behindGap < combinedLength * 1.4 && chaseSpeed > 2.0) {
          const double closeness =
              1.0 - behindGap / (combinedLength * 1.4);
          const double chaseFactor = std::min(1.0, chaseSpeed / 12.0);
          const double pressure = closeness * chaseFactor;
          selfMod.pressureLevel =
              std::max(selfMod.pressureLevel, pressure);
          if (pressure > 0.45)
            selfMod.underAttack = true;
        }
      }

      if (gap > combinedLength && gap < combinedLength * 3.0 &&
          other.state().currentSpeed > self.state().currentSpeed + 0.5) {
        const double draftStrength =
            1.0 - (gap - combinedLength) / (combinedLength * 2.0);
        selfMod.draftThrottleBoost =
            std::max(selfMod.draftThrottleBoost, draftStrength * 0.04);
      }

    }
  }
}
