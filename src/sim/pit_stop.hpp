#ifndef PIT_STOP_HPP
#define PIT_STOP_HPP

#include "commands.hpp"
#include "car_parts.hpp"
#include "race_control_common.hpp"
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
  bool skipBoxService = false;
  PitStopPlan plan;
  std::string statusMessage;
};

struct StaffModifiers {
  double mechanicSkill = 75.0;
  double engineerSkill = 75.0;
  double strategistSkill = 75.0;
};

double ComputePitServiceDuration(const PitStopPlan &plan, const CarConfig &car,
                                 const StaffModifiers &staff,
                                 const SimulationState *simState = nullptr);

double EstimatePitRemainingSec(const PitStopState &pit,
                               const TrackDefinition &track);

void ApplyPitServices(PitStopPlan &plan, CarConfig &car,
                      SimulationState &state, DriverState &driver);

bool ShouldEnterPitLane(const PitStopState &pit, double normalizedT,
                        bool lapJustCompleted, int currentLap,
                        double entryT, bool redFlagActive = false,
                        double entryWindow = 0.015);

bool PitPlanHasActiveService(const PitStopPlan &plan);

bool CarNeedsEmergencyPit(const CarConfig &car, const SimulationState &state,
                          const CarRaceControlState &rc);

/** Strip routine work; keep fuel / deflated tyres / damage repairs only. */
void SanitizeRedFlagEmergencyPlan(PitStopPlan &plan, const CarConfig &car,
                                const SimulationState &state,
                                const CarRaceControlState &rc);

#endif
