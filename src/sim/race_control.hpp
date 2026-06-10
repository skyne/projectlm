#ifndef RACE_CONTROL_HPP
#define RACE_CONTROL_HPP

#include "race.hpp"
#include "race_control_common.hpp"
#include "traffic.hpp"
#include <vector>

void InitSessionRaceControl(RaceSession &session);

void UpdateTrackObstructions(RaceSession &session, double deltaTime);

/** Mark a stopped car as a track obstruction (local yellow / FCY / SC pipeline). */
void StrandStoppedCar(Car &car, RaceSession &session, const std::string &reason,
                      HazardKind hazardKind = HazardKind::Debris,
                      double hazardGrip = 0.6, double hazardSpan = 35.0);

void SpawnSurfaceHazard(RaceSession &session, double distance,
                        HazardKind kind, const std::string &sourceEntryId,
                        double gripMultiplier, double spanMeters,
                        double centerLateralM = 0.0,
                        double lateralSpanM = 0.0);

void UpdateTrackHazards(RaceSession &session, double deltaTime);

double LocalGripMultiplierAt(const RaceSession &session, double distance,
                             double lateralNM, double lapLength);

void UpdateRaceControl(RaceSession &session,
                       const std::vector<TrafficEvent> &trafficEvents);

void ProcessCollisionPenalties(RaceSession &session,
                               const std::vector<TrafficEvent> &trafficEvents);

void UpdatePenalties(RaceSession &session, double deltaTime,
                     const std::vector<TrafficModifiers> &trafficMods);

void ApplyFlagModifiers(RaceSession &session,
                        std::vector<TrafficModifiers> &trafficMods);

void NotifyCarLapComplete(Car &car, RaceSession &session);

int CountTrackObstructions(const RaceSession &session);

int CountBurningCarsOnTrack(const RaceSession &session);

void SyncRaceControlFlags(SessionRaceControl &rc);

void UpdateRedFlagPitProcedure(RaceSession &session);

void TransitionRedFlagToSc(RaceSession &session);

void UpdateScPitRelease(RaceSession &session);

void TickSafetyCar(RaceSession &session, double deltaTime);

void OnSafetyCarDeploy(RaceSession &session);

void OnSafetyCarPeelOff(RaceSession &session);

void EnforceSafetyCarTrainPositions(RaceSession &session);

CarSnapshot MakeSafetyCarSnapshot(const RaceSession &session);

struct DebugRaceControlRequest {
  std::string action;
  std::string phase;
  int sectorIndex = 0;
  int level = 0;
  std::string entryId;
  std::string reason;
  std::string kind;
  double gripMultiplier = 0.7;
  double lateralNM = 0.0;
  double lateralSpanM = 0.0;
  bool active = true;
};

/** Dev-only race director injection — emits control events when g_raceEventOut is set. */
bool ApplyDebugRaceControl(RaceSession &session,
                           const DebugRaceControlRequest &req,
                           std::string *errorOut = nullptr);

#endif
