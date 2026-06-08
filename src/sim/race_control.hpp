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
                        double gripMultiplier, double spanMeters);

void UpdateTrackHazards(RaceSession &session, double deltaTime);

double LocalGripMultiplierAt(const RaceSession &session, double distance,
                             double lapLength);

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

void UpdateScPitRelease(RaceSession &session);

#endif
