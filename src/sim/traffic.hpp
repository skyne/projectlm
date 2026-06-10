#ifndef TRAFFIC_HPP
#define TRAFFIC_HPP

#include "race_control_common.hpp"
#include <string>
#include <unordered_map>
#include <vector>

class Car;
class TrackCorridor;

struct TrafficLateralContext {
  double trackWidthM = 12.0;
  const TrackCorridor *corridor = nullptr;
  bool useFrenetDynamics = false;
};

struct CarBodyDimensions {
  double lengthM = 5.0;
  double widthM = 2.0;
};

enum class TrafficPathIntent {
  None,
  RacingLine,
  AttackInside,
  AttackOutside,
  YieldInside,
  YieldOutside,
  DefendInside,
  DefendOutside,
};

inline int TrafficPathIntentPriority(TrafficPathIntent intent) {
  switch (intent) {
  case TrafficPathIntent::YieldInside:
  case TrafficPathIntent::YieldOutside:
    return 4;
  case TrafficPathIntent::AttackInside:
  case TrafficPathIntent::AttackOutside:
    return 3;
  case TrafficPathIntent::DefendInside:
  case TrafficPathIntent::DefendOutside:
    return 2;
  case TrafficPathIntent::RacingLine:
    return 1;
  case TrafficPathIntent::None:
  default:
    return 0;
  }
}

struct TrafficModifiers {
  double speedCapMs = 0.0;
  double draftThrottleBoost = 0.0;
  double collisionDamage = 0.0;
  bool blocked = false;
  bool overtaking = false;
  bool collision = false;
  bool underAttack = false;
  bool blueFlag = false;
  bool yielding = false;
  bool defending = false;
  bool alongside = false;
  TrafficPathIntent pathIntent = TrafficPathIntent::None;
  double pathUrgency = 0.0;
  double localGripScale = 1.0;
  double scRestartThrottleBoost = 0.0;
  double pressureLevel = 0.0;
  std::string blockingEntryId;
};

struct TrafficEvent {
  enum class Type { Overtake, Collision, Blocked, Weaving };
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

/** Seconds after pit exit where the car must yield to faster on-track traffic. */
constexpr double kPitRejoinYieldSec = 12.0;

/** True when merge point has room for a pit-exit car at rejoinSpeedMs. */
bool PitMergeGapSafe(const Car &rejoining, const std::vector<Car> &cars,
                     double lapLength, double mergeDistance,
                     double rejoinSpeedMs,
                     const TrafficLateralContext &lateral = {});

struct OvertakeBattle;

void ResolveTraffic(const std::vector<Car> &cars, double lapLength,
                    double raceTime,
                    std::unordered_map<std::string, double> &eventCooldowns,
                    std::vector<TrafficModifiers> &modifiersOut,
                    std::vector<TrafficEvent> &eventsOut,
                    const SessionRaceControl &raceControl = SessionRaceControl{},
                    const std::vector<Car *> &leaderboard = {},
                    const TrafficLateralContext &lateral = {},
                    std::vector<OvertakeBattle> *battles = nullptr);

double WrapDistanceGap(double aheadDistance, double behindDistance,
                       double lapLength);

#endif
