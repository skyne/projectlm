#ifndef TRAFFIC_HPP
#define TRAFFIC_HPP

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
  double pressureLevel = 0.0;
  std::string blockingEntryId;
};

struct TrafficEvent {
  enum class Type { Overtake, Collision, Blocked };
  Type type = Type::Blocked;
  std::string entryId;
  std::string otherEntryId;
  std::string message;
};

CarBodyDimensions DimensionsForClass(const std::string &classId);

void ResolveTraffic(const std::vector<Car> &cars, double lapLength,
                    double trackWidthM, double raceTime,
                    std::unordered_map<std::string, double> &eventCooldowns,
                    std::vector<TrafficModifiers> &modifiersOut,
                    std::vector<TrafficEvent> &eventsOut);

double WrapDistanceGap(double aheadDistance, double behindDistance,
                       double lapLength);

#endif
