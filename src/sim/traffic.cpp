#include "traffic.hpp"
#include "car_entity.hpp"
#include "driver.hpp"
#include "overtake_battle.hpp"
#include "track_corridor.hpp"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <unordered_map>

namespace {
constexpr double kCollisionEventCooldownSec = 5.0;
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

      if (other.isOnTrackObstruction() && gap > 0.0 &&
          gap < combinedLength * 5.0) {
        selfMod.blocked = true;
        selfMod.speedCapMs = std::max(
            selfMod.speedCapMs,
            std::max(kMinTrafficSpeedMs, 12.0));
        selfMod.blockingEntryId = other.entryId();
      }

      if (selfObstruction)
        continue;

      if (gap <= 0.0 || gap > combinedLength * 6.0)
        continue;

      const double relativeSpeed =
          self.state().currentSpeed - other.state().currentSpeed;

      const double lateralSep = LateralSepMetres(self, other, lateral);
      const double widthOverlap =
          (selfDim.widthM + otherDim.widthM) * 0.42;

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
      if (gap < combinedLength * 0.85 &&
          lateralSep < widthOverlap) {
        const TrafficModifiers &otherMod = modifiersOut[j];
        const bool negotiatedPass =
            gap > 0.0 && selfMod.overtaking && otherMod.yielding;
        if (relativeSpeed > 8.5) {
          const double impact =
              std::min(10.0, (relativeSpeed - 6.5) * 0.75);
          if (negotiatedPass && impact < 5.0)
            continue;
          selfMod.collisionDamage = std::max(selfMod.collisionDamage, impact);
          selfMod.collision = true;
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
                  << std::setprecision(1) << impact << ")";
              ev.message = oss.str();
            }
            ev.impact = impact;
            ev.relativeSpeedMs = relativeSpeed;
            ev.lateralSepM = lateralSep;
            ev.closingFromRear = gap > 0.0;
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
