#include "car_entity.hpp"
#include "track.hpp"
#include <algorithm>
#include <cmath>

Car::Car(std::string entryId, std::string teamName, RaceClass raceClass,
         CarConfig car, int gridPosition, int carNumber)
    : entryId_(std::move(entryId)), teamName_(std::move(teamName)),
      carNumber_(carNumber > 0 ? carNumber : gridPosition),
      raceClass_(std::move(raceClass)), config_(std::move(car)),
      gridPosition_(gridPosition) {
  placeOnGrid(gridPosition);
}

void Car::placeOnGrid(int gridPosition) {
  gridPosition_ = gridPosition;
  state_.currentDistance = -(gridPosition - 1) * 12.0;
}

void Car::resetForRestart() {
  state_ = SimulationState{};
  retired_ = false;
  retireReason_.clear();
  telemetry_.reset();
  bestLapTime_ = 0.0;
  placeOnGrid(gridPosition_);
}

CarTickResult Car::tick(const TrackDefinition &track,
                      const PhysicsConfig &physics, double deltaTime,
                      TelemetryLog *telemetry,
                      const CarInteractionContext *interaction) {
  (void)telemetry;
  (void)interaction;

  CarTickResult result;
  if (retired_ || track.sectors.empty())
    return result;

  const int prevLap = state_.currentLap;
  const size_t prevSectorIdx = state_.currentTrackNodeIndex;

  TickSimulation(config_, track, state_, deltaTime, physics, &telemetry_);

  result.sectorCrossed =
      state_.currentTrackNodeIndex != prevSectorIdx ||
      state_.currentLap != prevLap;
  if (result.sectorCrossed) {
    result.completedSectorIndex = static_cast<int>(prevSectorIdx);
    result.completedLap = state_.currentLap;
  }

  if (state_.currentLap > prevLap) {
    result.lapCompleted = true;
    result.completedLap = prevLap;
    result.completedSectorIndex = static_cast<int>(prevSectorIdx);
    const std::vector<LapRecord> &laps = telemetry_.laps();
    if (!laps.empty()) {
      const double completed = laps.back().lapTime;
      if (completed > 0.0 &&
          (bestLapTime_ <= 0.0 || completed < bestLapTime_))
        bestLapTime_ = completed;
    }
  }

  if (state_.engineHealth <= 0.0 && !retired_) {
    markRetired("Engine failure");
    result.retired = true;
  }

  return result;
}

CarSnapshot Car::snapshot(const TrackDefinition &track, int racePosition,
                          bool inPit) const {
  const TrackPose pose = track.poseAtDistance(state_.currentDistance);

  CarSnapshot snap;
  snap.entryId = entryId_;
  snap.teamName = teamName_;
  snap.carNumber = carNumber_;
  snap.classId = raceClass_.id;
  snap.lap = state_.currentLap;
  snap.distance = state_.currentDistance;
  snap.normalizedT = pose.normalizedT;
  snap.speed = state_.currentSpeed;
  snap.rpm = state_.currentRPM;
  snap.fuel = state_.fuelRemaining;
  snap.tireWear = state_.tireWear;
  snap.hybridDeployMJ = state_.hybridDeployRemainingMJ;
  snap.engineHealth = state_.engineHealth;
  snap.sectorIndex = static_cast<int>(state_.currentTrackNodeIndex);
  snap.racePosition = racePosition;
  snap.inPit = inPit;
  snap.retired = retired_;
  snap.currentLapTime = state_.currentLapTime;
  snap.currentSectorTime = state_.currentSectorTime;
  snap.lastLapTime =
      telemetry_.laps().empty() ? 0.0 : telemetry_.laps().back().lapTime;
  snap.bestLapTime = bestLapTime_;

  for (const SectorSplit &split : telemetry_.inProgress().sectors)
    snap.currentLapSectorTimes.push_back(split.time);

  snap.lapHistory.reserve(telemetry_.laps().size());
  for (const LapRecord &lap : telemetry_.laps()) {
    LapTimingSnapshot history;
    history.lapNumber = lap.lapNumber;
    history.lapTime = lap.lapTime;
    history.sectorTimes.reserve(lap.sectors.size());
    for (const SectorSplit &split : lap.sectors)
      history.sectorTimes.push_back(split.time);
    snap.lapHistory.push_back(std::move(history));
  }

  snap.position = pose.position;
  snap.tangent = pose.tangent;
  return snap;
}

double ComputeGapToLeader(const Car &car, const Car &leader,
                          double lapLength) {
  if (car.entryId() == leader.entryId())
    return 0.0;

  const int lapDiff = leader.state().currentLap - car.state().currentLap;
  double distanceGap = leader.state().currentDistance - car.state().currentDistance;
  distanceGap += static_cast<double>(lapDiff) * lapLength;

  const double refSpeed = std::max(leader.state().currentSpeed, 1.0);
  return std::max(0.0, distanceGap / refSpeed);
}

bool Car::isAheadOf(const Car &other) const {
  if (state_.currentLap != other.state_.currentLap)
    return state_.currentLap > other.state_.currentLap;
  return state_.currentDistance > other.state_.currentDistance;
}

void Car::markRetired(const std::string &reason) {
  retired_ = true;
  retireReason_ = reason;
}
