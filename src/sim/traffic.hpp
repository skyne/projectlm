#ifndef TRAFFIC_HPP
#define TRAFFIC_HPP

#include "race_control_common.hpp"
#include <string>
#include <unordered_map>
#include <vector>

class Car;

struct CarBodyDimensions {
  double lengthM = 5.0;
  double widthM = 2.0;
};

struct TrafficModifiers {
  double speedCapMs = 0.0;
  double draftThrottleBoost = 0.0;
  double collisionDamage = 0.0;
  bool blocked = false;
  bool overtaking = false;
  bool collision = false;
  bool underAttack = false;
  bool blueFlag = false;
  double localGripScale = 1.0;
  double scRestartThrottleBoost = 0.0;
  double pressureLevel = 0.0;
  std::string blockingEntryId;
};

struct TrafficEvent {
  enum class Type { Overtake, Collision, Blocked };
  Type type = Type::Blocked;
  std::string entryId;
  std::string otherEntryId;
  std::string message;
  /** Collision severity estimate from closing speed (0–10). */
  double impact = 0.0;
  /** Positive when entryId was closing on otherEntryId. */
  double relativeSpeedMs = 0.0;
  /** Lateral separation in metres at contact. */
  double lateralSepM = 0.0;
  /** True when entryId was behind otherEntryId on track. */
  bool closingFromRear = false;
};

CarBodyDimensions DimensionsForClass(const std::string &classId);

void ResolveTraffic(const std::vector<Car> &cars, double lapLength,
                    double trackWidthM, double raceTime,
                    std::unordered_map<std::string, double> &eventCooldowns,
                    std::vector<TrafficModifiers> &modifiersOut,
                    std::vector<TrafficEvent> &eventsOut,
                    const SessionRaceControl &raceControl = SessionRaceControl{},
                    const std::vector<Car *> &leaderboard = {});

double WrapDistanceGap(double aheadDistance, double behindDistance,
                       double lapLength);

#endif
