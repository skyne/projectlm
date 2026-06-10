#ifndef OVERTAKE_BATTLE_HPP
#define OVERTAKE_BATTLE_HPP

#include "traffic.hpp"
#include <string>
#include <unordered_map>
#include <vector>

class Car;
class TrackCorridor;

enum class PassSide { None, Inside, Outside };

enum class BattlePhase {
  None,
  Approach,
  Committed,
  DefendReact,
  Alongside,
  Abort,
};

/** Why the defender must yield instead of defending (not class-specific). */
enum class YieldReason {
  None,
  FasterClass,
  Lapped,
};

struct OvertakeBattle {
  std::string attackerId;
  std::string defenderId;
  BattlePhase phase = BattlePhase::None;
  PassSide attackerSide = PassSide::None;
  PassSide defenderSide = PassSide::None;
  YieldReason yieldReason = YieldReason::None;
  double startedAt = 0.0;
  double lastDecisionAt = 0.0;
  int defenderMoveCount = 0;
  bool alongside = false;
  bool inBrakingZone = false;
};

int TrafficClassRank(const std::string &classId);

bool DefenderMustYield(const Car &attacker, const Car &defender, int lapDelta);

void UpdateOvertakeBattles(const std::vector<Car> &cars, double lapLength,
                           double raceTime, bool noOvertaking,
                           const std::vector<Car *> &leaderboard,
                           const TrafficLateralContext &lateral,
                           std::vector<OvertakeBattle> &battles,
                           std::vector<TrafficModifiers> &modifiers,
                           std::vector<TrafficEvent> &eventsOut,
                           std::unordered_map<std::string, double> &eventCooldowns);

#endif
