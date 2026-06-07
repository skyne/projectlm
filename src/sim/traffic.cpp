#include "traffic.hpp"
#include "car_entity.hpp"
#include "driver.hpp"
#include <algorithm>
#include <cmath>
#include <unordered_map>

namespace {
constexpr double kOvertakeEventCooldownSec = 8.0;
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

void TryEmitEvent(std::vector<TrafficEvent> &eventsOut,
                  std::unordered_map<std::string, double> &cooldowns,
                  TrafficEvent::Type type, const std::string &selfId,
                  const std::string &otherId, const std::string &message,
                  double raceTime) {
  const std::string key =
      selfId + ":" + otherId + ":" +
      (type == TrafficEvent::Type::Overtake
           ? "o"
           : type == TrafficEvent::Type::Collision ? "c" : "b");
  const double cooldown = type == TrafficEvent::Type::Overtake
                              ? kOvertakeEventCooldownSec
                              : kCollisionEventCooldownSec;
  if (!CooldownReady(cooldowns, key, raceTime, cooldown))
    return;

  TrafficEvent ev;
  ev.type = type;
  ev.entryId = selfId;
  ev.otherEntryId = otherId;
  ev.message = message;
  eventsOut.push_back(std::move(ev));
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

int ClassRank(const std::string &classId) {
  if (classId == "Hypercar")
    return 0;
  if (classId == "LMP2")
    return 1;
  return 2;
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

void ResolveTraffic(const std::vector<Car> &cars, double lapLength,
                    double trackWidthM, double raceTime,
                    std::unordered_map<std::string, double> &eventCooldowns,
                    std::vector<TrafficModifiers> &modifiersOut,
                    std::vector<TrafficEvent> &eventsOut) {
  modifiersOut.assign(cars.size(), TrafficModifiers{});
  eventsOut.clear();

  if (cars.size() < 2 || lapLength <= 0.0)
    return;

  const double safetyGap = 3.0;

  for (size_t i = 0; i < cars.size(); ++i) {
    const Car &self = cars[i];
    if (self.isRetired() || self.inPitLane())
      continue;

    const CarBodyDimensions selfDim = self.bodyDimensions();
    TrafficModifiers &selfMod = modifiersOut[i];
    const double paceSkill = self.driver().paceFactor(0.0, false);
    const double overtakeSkill = self.driver().overtakingFactor();
    const double selfRaceDist = RaceDistance(self, lapLength);

    for (size_t j = 0; j < cars.size(); ++j) {
      if (i == j)
        continue;

      const Car &other = cars[j];
      if (other.isRetired() || other.inPitLane())
        continue;

      const CarBodyDimensions otherDim = other.bodyDimensions();
      const double gap = WrapRaceGap(RaceDistance(other, lapLength),
                                     selfRaceDist, lapLength);
      const double combinedLength =
          (selfDim.lengthM + otherDim.lengthM) * 0.5 + safetyGap;

      if (gap <= 0.0 || gap > combinedLength * 6.0)
        continue;

      const double relativeSpeed =
          self.state().currentSpeed - other.state().currentSpeed;
      const double lateralSep =
          std::abs(self.lateralOffset() - other.lateralOffset()) *
          trackWidthM * 0.5;
      const double widthOverlap =
          (selfDim.widthM + otherDim.widthM) * 0.42;

      if (gap < combinedLength * 0.85 &&
          lateralSep < widthOverlap) {
        if (relativeSpeed > 8.5) {
          const double impact =
              std::min(10.0, (relativeSpeed - 6.5) * 0.75);
          selfMod.collisionDamage = std::max(selfMod.collisionDamage, impact);
          selfMod.collision = true;
          TryEmitEvent(eventsOut, eventCooldowns, TrafficEvent::Type::Collision,
                       self.entryId(), other.entryId(),
                       self.teamName() + " contact with " + other.teamName(),
                       raceTime);
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

      const double passWindow =
          combinedLength * (1.75 - overtakeSkill * 0.14 - paceSkill * 0.04);
      if (gap > 0.0 && gap < passWindow &&
          self.state().currentSpeed > other.state().currentSpeed + 1.5) {
        const double trafficRoom =
            self.driver().active().trafficManagement / 100.0;
        const bool hasRoom =
            lateralSep > selfDim.widthM * (0.58 - trafficRoom * 0.08) ||
            std::abs(self.lateralOffset()) > 0.12;

        if (hasRoom || overtakeSkill > 1.02) {
          selfMod.overtaking = true;
          selfMod.draftThrottleBoost =
              std::max(selfMod.draftThrottleBoost,
                       0.012 + overtakeSkill * 0.012);

          if (gap < combinedLength * 0.75) {
            TryEmitEvent(eventsOut, eventCooldowns,
                         TrafficEvent::Type::Overtake, self.entryId(),
                         other.entryId(),
                         self.driver().active().name + " overtaking " +
                             other.teamName(),
                         raceTime);
          }
        } else {
          selfMod.blocked = true;
          selfMod.speedCapMs = std::max(
              selfMod.speedCapMs,
              std::max(kMinTrafficSpeedMs, other.state().currentSpeed * 0.96));
          selfMod.blockingEntryId = other.entryId();
        }
      }

      if (gap > combinedLength && gap < combinedLength * 3.0 &&
          other.state().currentSpeed > self.state().currentSpeed + 0.5) {
        const double draftStrength =
            1.0 - (gap - combinedLength) / (combinedLength * 2.0);
        selfMod.draftThrottleBoost =
            std::max(selfMod.draftThrottleBoost, draftStrength * 0.04);
      }

      // Blue flag: slower class ahead must not block a faster closing car.
      if (gap > 0.0 && gap < combinedLength * 4.5 &&
          ClassRank(self.raceClass().id) < ClassRank(other.raceClass().id) &&
          relativeSpeed > 2.5) {
        TrafficModifiers &otherMod = modifiersOut[j];
        otherMod.blueFlag = true;
        otherMod.speedCapMs = std::max(
            otherMod.speedCapMs,
            std::max(kMinTrafficSpeedMs, self.state().currentSpeed * 0.99));
        TryEmitEvent(eventsOut, eventCooldowns, TrafficEvent::Type::Blocked,
                     other.entryId(), self.entryId(),
                     other.teamName() + " blue flag — " + self.teamName(),
                     raceTime);
      }
    }
  }
}
