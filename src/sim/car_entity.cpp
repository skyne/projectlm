#include "car_entity.hpp"
#include "track.hpp"
#include "traffic.hpp"
#include "weather.hpp"
#include <algorithm>
#include <cmath>
#include <random>

namespace {

std::string TireCompoundToString(ETireCompound compound) {
  switch (compound) {
  case ETireCompound::Soft:
    return "Soft";
  case ETireCompound::Hard:
    return "Hard";
  default:
    return "Medium";
  }
}

bool IsCorneringHard(const TrackDefinition &track, const SimulationState &state,
                     const PhysicsConfig &physics) {
  const double kappa =
      track.maxCurvatureAhead(state.currentDistance, physics.curvatureLookAheadM);
  return kappa >= physics.straightCurvatureThreshold && state.currentSpeed > 48.0;
}

} // namespace

Car::Car(std::string entryId, std::string teamName, RaceClass raceClass,
         CarConfig car, int gridPosition, int carNumber)
    : entryId_(std::move(entryId)), teamName_(std::move(teamName)),
      carNumber_(carNumber > 0 ? carNumber : gridPosition),
      raceClass_(std::move(raceClass)), config_(std::move(car)),
      gridPosition_(gridPosition) {
  state_.activeTireCompound = config_.tireChoice;
  state_.usingWetTyres = false;
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
  driverModeScale_ = 1.0;
  blueFlagActive_ = false;
  trackLimitsWarnings_ = 0;
  state_.activeTireCompound = config_.tireChoice;
  state_.usingWetTyres = false;
  placeOnGrid(gridPosition_);
}

void Car::setTireCompound(ETireCompound compound, bool wetTyres) {
  state_.activeTireCompound = compound;
  state_.usingWetTyres = wetTyres;
  state_.tireWear = std::min(state_.tireWear, 0.08);
}

CarTickResult Car::tick(const TrackDefinition &track,
                      const PhysicsConfig &physics, double deltaTime,
                      TelemetryLog *telemetry,
                      const CarInteractionContext *interaction) {
  (void)telemetry;

  CarTickResult result;
  if (retired_ || track.sectors.empty())
    return result;

  const int prevLap = state_.currentLap;
  const size_t prevSectorIdx = state_.currentTrackNodeIndex;

  SimulationModifiers simMods;
  if (interaction != nullptr && interaction->weather != nullptr) {
    simMods.tireGripScale = WeatherTireGripScale(
        *interaction->weather, state_.activeTireCompound, state_.usingWetTyres);

    const TrafficModifiers traffic = ComputeTrafficModifiers(*this, *interaction);
    simMods.engineForceScale *= traffic.speedScale;
    if (traffic.passDifficulty > 1.0)
      simMods.tireGripScale /= traffic.passDifficulty;
    blueFlagActive_ = traffic.blueFlag;
  } else if (interaction != nullptr) {
    const double wetPenalty = 1.0 - interaction->trackWetness * 0.35;
    const double tempPenalty =
        interaction->ambientTempC > 32.0
            ? 1.0 - std::min(0.08, (interaction->ambientTempC - 32.0) * 0.004)
            : 1.0;
    simMods.tireGripScale =
        wetPenalty * interaction->trackGripEvolution * tempPenalty;

    const TrafficModifiers traffic = ComputeTrafficModifiers(*this, *interaction);
    simMods.engineForceScale *= traffic.speedScale;
    if (traffic.passDifficulty > 1.0)
      simMods.tireGripScale /= traffic.passDifficulty;
    blueFlagActive_ = traffic.blueFlag;
  }

  if (state_.engineHealth <= 35.0)
    simMods.limpModeScale = 0.72;
  else if (state_.engineHealth <= 55.0)
    simMods.limpModeScale = 0.86;

  simMods.engineForceScale *= driverModeScale_;

  TickSimulation(config_, track, state_, deltaTime, physics, &telemetry_,
                 &simMods);

  if (interaction != nullptr && interaction->fcySpeedLimitMps > 0.0)
    state_.currentSpeed =
        std::min(state_.currentSpeed, interaction->fcySpeedLimitMps);
  if (interaction != nullptr && interaction->scSpeedLimitMps > 0.0)
    state_.currentSpeed =
        std::min(state_.currentSpeed, interaction->scSpeedLimitMps);

  if (interaction != nullptr && interaction->field != nullptr &&
      interaction->lapLength > 0.0) {
    const TrafficModifiers traffic = ComputeTrafficModifiers(*this, *interaction);
    if (traffic.blueFlag) {
      blueFlagActive_ = true;
      state_.currentSpeed = std::min(state_.currentSpeed, 55.0);
    }
  }

  if (IsCorneringHard(track, state_, physics) && state_.currentSectorPeakSpeed > 52.0) {
    trackLimitsWarnings_ = std::min(3, trackLimitsWarnings_ + 1);
  }

  if (interaction != nullptr && interaction->rng != nullptr &&
      state_.engineHealth > 0.0 && state_.engineHealth < 92.0) {
    const double healthFactor = std::clamp(state_.engineHealth / 100.0, 0.2, 1.0);
    const double thermalStress =
        std::max(0.0, state_.currentThermalLoad - 100.0) * 0.002;
    const double failChance =
        (0.000002 + (1.0 - healthFactor) * 0.000015 + thermalStress) *
        deltaTime;
    std::uniform_real_distribution<double> roll(0.0, 1.0);
    if (roll(*interaction->rng) < failChance) {
      state_.engineHealth = std::max(0.0, state_.engineHealth - 8.0);
    }
  }

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

  if (state_.fuelRemaining <= 0.0 && state_.fuelRemaining > -1.0 && !retired_) {
    state_.currentSpeed = std::max(physics.minSpeed, state_.currentSpeed * 0.92);
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
  snap.fuelTankCapacity = config_.fuelTankCapacity;
  snap.coolantTempC = state_.currentThermalLoad;
  snap.blueFlag = blueFlagActive_;
  snap.limpMode = state_.engineHealth <= 55.0;
  snap.trackLimitsWarnings = trackLimitsWarnings_;
  snap.tireCompound = TireCompoundToString(state_.activeTireCompound);
  snap.wetTyres = state_.usingWetTyres;
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
