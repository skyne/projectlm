#ifndef PIT_STOP_HPP
#define PIT_STOP_HPP

#include "commands.hpp"
#include "car_parts.hpp"
#include <string>

struct SimulationState;
struct DriverState;
struct CarConfig;
struct TrackDefinition;

enum class PitPhase {
  None,
  DrivingIn,
  AtBox,
  DrivingOut,
};

struct PitStopState {
  bool inPit = false;
  bool pendingEnter = false;
  PitPhase phase = PitPhase::None;
  double pitLaneDistance = 0.0;
  double pitElapsed = 0.0;
  double pitDuration = 0.0;
  PitStopPlan plan;
  std::string statusMessage;
};

struct StaffModifiers {
  double mechanicSkill = 75.0;
  double engineerSkill = 75.0;
  double strategistSkill = 75.0;
};

double ComputePitServiceDuration(const PitStopPlan &plan, const CarConfig &car,
                                 const StaffModifiers &staff);

double EstimatePitRemainingSec(const PitStopState &pit,
                               const TrackDefinition &track);

void ApplyPitServices(PitStopPlan &plan, CarConfig &car,
                      SimulationState &state, DriverState &driver);

bool ShouldEnterPitLane(const PitStopState &pit, double normalizedT,
                        bool lapJustCompleted, int currentLap);

#endif
