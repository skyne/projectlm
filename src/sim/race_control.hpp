#ifndef RACE_CONTROL_HPP
#define RACE_CONTROL_HPP

#include "race.hpp"
#include "race_control_common.hpp"
#include "traffic.hpp"
#include <vector>

void InitSessionRaceControl(RaceSession &session);

void UpdateTrackObstructions(RaceSession &session, double deltaTime);

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

void SyncRaceControlFlags(SessionRaceControl &rc);

#endif
