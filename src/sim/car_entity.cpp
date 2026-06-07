#include "car_entity.hpp"
#include "car_parts.hpp"
#include "driver.hpp"
#include "track.hpp"
#include "traffic.hpp"
#include "weather.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <functional>

namespace {
bool IsValidCarNumber(const std::string &number) {
  if (number.empty())
    return false;
  for (char c : number) {
    if (!std::isdigit(static_cast<unsigned char>(c)))
      return false;
  }
  return number != "0";
}

void ApplyMistakeWheelSpike(SimulationModifiers &mods, double totalWear,
                            double totalTempSpike, DriverMistakeKind kind,
                            double signedKappa, std::string &worstWheelOut) {
  double weights[4];
  switch (kind) {
  case DriverMistakeKind::Lockup:
    LockupTireWearWeights(signedKappa, weights);
    break;
  case DriverMistakeKind::Overdrive:
    OverdriveTireWearWeights(signedKappa, weights);
    break;
  default:
    RanWideTireWearWeights(signedKappa, weights);
    break;
  }

  int worstIdx = 0;
  double worstWeight = weights[0];
  static const char *kWheelLabels[] = {"FL", "FR", "RL", "RR"};
  for (int i = 0; i < 4; ++i) {
    mods.wearSpikePerWheel[i] = totalWear * weights[i];
    mods.tireTempSpikePerWheel[i] = totalTempSpike * weights[i];
    if (weights[i] > worstWeight) {
      worstWeight = weights[i];
      worstIdx = i;
    }
  }
  worstWheelOut = kWheelLabels[worstIdx];
}
} // namespace

Car::Car(std::string entryId, std::string teamName, RaceClass raceClass,
         CarConfig car, int gridPosition, std::string carNumber)
    : entryId_(std::move(entryId)), teamName_(std::move(teamName)),
      carNumber_(IsValidCarNumber(carNumber) ? std::move(carNumber)
                                             : std::to_string(gridPosition)),
      raceClass_(std::move(raceClass)), config_(std::move(car)),
      gridPosition_(gridPosition) {
  body_ = DimensionsForClass(raceClass_.id);
  const uint32_t seed = static_cast<uint32_t>(
      std::hash<std::string>{}(entryId_) & 0xFFFFFFFFu);
  driver_ = MakeDefaultDrivers(teamName_, 2, seed);
  state_.fuelRemaining = config_.fuelTankCapacity;
  state_.hybridDeployRemainingMJ = config_.hybridStintDeployBudgetMJ;
  state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
  wingAngleDelta_ = config_.startingWingDelta;
  brakeBias_ = config_.startingBrakeBias;
  placeOnGrid(gridPosition);
}

void Car::placeOnGrid(int gridPosition) {
  gridPosition_ = gridPosition;
  state_.currentDistance = -(gridPosition - 1) * (body_.lengthM + 2.0);
  lateralOffset_ = (gridPosition % 2 == 0) ? 0.15 : -0.15;
  garageHold_ = false;
}

void Car::placeInGarageHold(const TrackDefinition &track) {
  garageHold_ = true;
  state_.currentSpeed = 0.0;
  state_.currentDistance = 0.0;
  lateralOffset_ = 0.0;
  pit_.pendingEnter = false;
  pit_.plan = PitStopPlan{};
  if (track.pitLane.valid()) {
    pit_.inPit = true;
    pit_.phase = PitPhase::AtBox;
    pit_.pitLaneDistance = track.pitLane.boxDistance;
    pit_.pitElapsed = 0.0;
    pit_.pitDuration = 0.0;
    pit_.statusMessage = "In garage";
  } else {
    pit_.inPit = false;
    pit_.phase = PitPhase::None;
    pit_.statusMessage = "In garage";
  }
}

bool Car::releaseFromGarage(const TrackDefinition &track) {
  if (!garageHold_ || retired_)
    return false;
  garageHold_ = false;
  if (pit_.inPit && track.pitLane.valid()) {
    pit_.phase = PitPhase::DrivingOut;
    state_.currentSpeed = track.pitLane.speedLimitMs;
    pit_.statusMessage = "Leaving garage";
    return true;
  }
  state_.currentSpeed = 12.0;
  pit_.statusMessage = "On track";
  return true;
}

double Car::lastLapTime() const {
  return telemetry_.laps().empty() ? 0.0 : telemetry_.laps().back().lapTime;
}

void Car::applyClassStintLimit(double maxStintSeconds) {
  if (maxStintSeconds <= 0.0)
    return;
  maxDriverStintSeconds_ = maxStintSeconds;
  for (DriverProfile &driver : driver_.roster)
    driver.maxStintSeconds = std::min(driver.maxStintSeconds, maxStintSeconds);
}

void Car::setDrivers(DriverState drivers) {
  driver_ = std::move(drivers);
}

void Car::resetForRestart() {
  state_ = SimulationState{};
  state_.fuelRemaining = config_.fuelTankCapacity;
  state_.hybridDeployRemainingMJ = config_.hybridStintDeployBudgetMJ;
  state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
  retired_ = false;
  retireReason_.clear();
  telemetry_.reset();
  bestLapTime_ = 0.0;
  pit_ = PitStopState{};
  wingAngleDelta_ = 0.0;
  brakeBias_ = 0.5;
  setupFeedback_.clear();
  collisionCooldown_ = 0.0;
  setupFeedbackTimer_ = 0.0;
  outOfFuelTimer_ = 0.0;
  overtakingVisual_ = false;
  blockedVisual_ = false;
  lastMistakeTimer_ = 0.0;
  lastMistakeWearAdded_ = 0.0;
  lastMistakeWheel_.clear();
  mistakeWearBoostTimer_ = 0.0;
  mistakeWearBoostMultiplier_ = 1.0;
  mistakePenaltyTimer_ = 0.0;
  mistakePenaltyDuration_ = 0.0;
  mistakePenaltyPeak_ = 0.0;
  pitCount_ = 0;
  totalPitSeconds_ = 0.0;
  driver_.resetForRestart();
  garageHold_ = false;
  placeOnGrid(gridPosition_);
}

void Car::applyCommand(const SimCommand &command) {
  switch (command.type) {
  case SimCommandType::PitRequest:
    pit_.pendingEnter = true;
    pit_.plan = command.pit;
    if (pit_.plan.tiresToChange.empty() && pit_.plan.fuelLiters <= 0.0 &&
        pit_.plan.repairs.empty() && !pit_.plan.changeDriver) {
      pit_.plan.fuelLiters = std::max(0.0, config_.fuelTankCapacity - state_.fuelRemaining);
      pit_.plan.tiresToChange = {"FL", "FR", "RL", "RR"};
    }
    break;
  case SimCommandType::CancelPit:
    pit_.pendingEnter = false;
    break;
  case SimCommandType::DriverMode:
    driver_.mode = command.driverMode;
    break;
  case SimCommandType::HybridStrategy:
    driver_.hybridStrategy = command.hybridStrategy;
    break;
  case SimCommandType::DriverSwap:
    if (command.swapToDriverIndex >= 0)
      driver_.swapDriver(command.swapToDriverIndex);
    break;
  case SimCommandType::StartingCompound: {
    if (state_.elapsedRaceTime > 0.5 || state_.currentDistance > 5.0) {
      setupFeedback_ = "Starting compound locked after green flag";
      setupFeedbackTimer_ = 6.0;
      break;
    }
    static const PartCatalog kCatalog{};
    ApplyTireCompoundStats(config_, command.tireCompound, kCatalog);
    setupFeedback_ = "Starting compound set";
    setupFeedbackTimer_ = 6.0;
    break;
  }
  case SimCommandType::WetTyresFit: {
    if (state_.elapsedRaceTime > 0.5 || state_.currentDistance > 5.0) {
      setupFeedback_ = "Tyre choice locked after green flag";
      setupFeedbackTimer_ = 6.0;
      break;
    }
    config_.tyreTread = command.tyreTread;
    if (command.tyreTread == ETyreTread::Wet)
      setupFeedback_ = "Wet tyres fitted";
    else if (command.tyreTread == ETyreTread::Intermediate)
      setupFeedback_ = "Intermediate tyres fitted";
    else
      setupFeedback_ = "Slick tyres fitted";
    setupFeedbackTimer_ = 6.0;
    break;
  }
  case SimCommandType::SetupChange: {
    if (!pit_.inPit && !pit_.pendingEnter) {
      setupFeedback_ = "Setup changes only in pit lane";
      setupFeedbackTimer_ = 6.0;
      break;
    }
    wingAngleDelta_ = std::clamp(wingAngleDelta_ + command.wingAngleDelta, -0.25, 0.25);
    brakeBias_ = std::clamp(brakeBias_ + command.brakeBiasDelta, 0.40, 0.60);
    SuspensionSetupDelta suspensionDelta = command.suspension;
    if (std::abs(command.rideHeightDelta) > 1e-9 &&
        !suspensionDelta.hasAnyChange()) {
      suspensionDelta.frontRideHeightDelta = command.rideHeightDelta;
      suspensionDelta.rearRideHeightDelta = command.rideHeightDelta;
    }
    ApplySuspensionSetupDelta(config_, suspensionDelta);
    config_.totalDownforceCl =
        std::max(0.1, config_.totalDownforceCl + command.wingAngleDelta * 0.08);
    config_.totalDragCd =
        std::max(0.05, config_.totalDragCd + command.wingAngleDelta * 0.02);
    setupFeedback_ = driver_.setupFeedbackForChange(
        command.wingAngleDelta, command.brakeBiasDelta, suspensionDelta);
    setupFeedbackTimer_ = 8.0;
    break;
  }
  default:
    break;
  }
}

bool Car::processPitEntry(double normalizedT, bool lapJustCompleted) {
  if (!ShouldEnterPitLane(pit_, normalizedT, lapJustCompleted, state_.currentLap,
                          state_.fuelRemaining, config_.fuelTankCapacity))
    return false;
  pit_.inPit = true;
  pit_.pendingEnter = false;
  pit_.phase = PitPhase::DrivingIn;
  pit_.pitLaneDistance = 0.0;
  pit_.pitElapsed = 0.0;
  pit_.pitDuration = 0.0;
  pit_.statusMessage = "Pit entry";
  state_.currentDistance = 0.0;
  state_.currentSpeed = 0.0;
  lateralOffset_ = 0.0;
  return true;
}

bool Car::processPitLaneTick(const TrackDefinition &track, double deltaTime,
                             const StaffModifiers &staff) {
  if (!pit_.inPit)
    return false;

  totalPitSeconds_ += deltaTime;

  const PitLaneDefinition &lane = track.pitLane;
  if (!lane.valid()) {
    if (pit_.pitDuration <= 0.0)
      pit_.pitDuration = ComputePitServiceDuration(pit_.plan, config_, staff);
    pit_.pitElapsed += deltaTime;
    if (pit_.pitElapsed < pit_.pitDuration)
      return false;
    ApplyPitServices(pit_.plan, config_, state_, driver_);
    if (pit_.plan.wingAngleDelta != 0.0)
      wingAngleDelta_ =
          std::clamp(wingAngleDelta_ + pit_.plan.wingAngleDelta, -0.5, 0.5);
    if (pit_.plan.brakeBiasDelta != 0.0)
      brakeBias_ = std::clamp(brakeBias_ + pit_.plan.brakeBiasDelta, 0.35, 0.65);
    pitCount_ += 1;
    pit_.inPit = false;
    pit_.phase = PitPhase::None;
    pit_.pitElapsed = 0.0;
    pit_.pitDuration = 0.0;
    pit_.plan = PitStopPlan{};
    pit_.statusMessage = "Pit exit";
    return true;
  }

  const double speedLimit = lane.speedLimitMs;

  switch (pit_.phase) {
  case PitPhase::DrivingIn:
    state_.currentSpeed = speedLimit;
    pit_.pitLaneDistance += speedLimit * deltaTime;
    pit_.statusMessage = "Pit lane";
    if (pit_.pitLaneDistance >= lane.boxDistance) {
      pit_.pitLaneDistance = lane.boxDistance;
      pit_.phase = PitPhase::AtBox;
      state_.currentSpeed = 0.0;
      pit_.pitElapsed = 0.0;
      pit_.pitDuration = ComputePitServiceDuration(pit_.plan, config_, staff);
      pit_.statusMessage = "In pits";
    }
    break;

  case PitPhase::AtBox:
    state_.currentSpeed = 0.0;
    if (garageHold_)
      break;
    pit_.pitElapsed += deltaTime;
    if (pit_.pitElapsed < pit_.pitDuration)
      break;
    pit_.phase = PitPhase::DrivingOut;
    state_.currentSpeed = speedLimit;
    pit_.statusMessage = "Pit exit";
    break;

  case PitPhase::DrivingOut:
    state_.currentSpeed = speedLimit;
    pit_.pitLaneDistance += speedLimit * deltaTime;
    if (pit_.pitLaneDistance < lane.totalLength())
      break;

    pit_.pitLaneDistance = lane.totalLength();
    ApplyPitServices(pit_.plan, config_, state_, driver_);
    if (pit_.plan.wingAngleDelta != 0.0)
      wingAngleDelta_ =
          std::clamp(wingAngleDelta_ + pit_.plan.wingAngleDelta, -0.5, 0.5);
    if (pit_.plan.brakeBiasDelta != 0.0)
      brakeBias_ = std::clamp(brakeBias_ + pit_.plan.brakeBiasDelta, 0.35, 0.65);
    pitCount_ += 1;

    state_.currentDistance = lane.mergeTrackDistance;
    state_.currentSpeed = speedLimit * 0.85;
    SyncGearForSpeed(config_, state_);
    pit_.inPit = false;
    pit_.phase = PitPhase::None;
    pit_.pitElapsed = 0.0;
    pit_.pitDuration = 0.0;
    pit_.plan = PitStopPlan{};
    pit_.statusMessage = "Rejoining";
    return true;

  default:
    break;
  }

  return false;
}

void Car::applyTrafficVisuals(const TrafficModifiers &traffic, double deltaTime) {
  overtakingVisual_ = traffic.overtaking;
  blockedVisual_ = traffic.blocked;

  const double target =
      traffic.overtaking ? 0.55 : traffic.blocked ? 0.0 : (gridPosition_ % 2 == 0 ? 0.12 : -0.12);
  const double blend = std::min(1.0, deltaTime * 2.5);
  lateralOffset_ = std::clamp(lateralOffset_ + (target - lateralOffset_) * blend,
                              -0.75, 0.75);
}

CarTickResult Car::tick(const TrackDefinition &track, const PhysicsConfig &physics,
                      double deltaTime, double raceTime,
                      TelemetryLog *telemetry,
                      const TrafficModifiers *traffic,
                      const WeatherState &weather, bool isNight) {
  CarTickResult result;
  if (retired_ || track.sectors.empty() || pit_.inPit)
    return result;

  driver_.tickStint(deltaTime);

  const int prevLap = state_.currentLap;
  const size_t prevSectorIdx = state_.currentTrackNodeIndex;

  SimulationModifiers mods;
  mods.throttleMultiplier = driver_.modeThrottleMultiplier();
  mods.wearMultiplier = driver_.modeWearMultiplier();
  mods.fuelMultiplier = driver_.modeFuelMultiplier();
  mods.skillFactor = driver_.paceFactor(weather.trackWetness, isNight,
                                        weather.visibilityKm,
                                        weather.windSpeedMs);
  if (config_.hybridDeployPowerKW > 0.0) {
    HybridStrategyModifiers(driver_.hybridStrategy, mods.hybridDeployScale,
                            mods.hybridRegenScale);
  } else {
    mods.hybridDeployScale = 0.0;
    mods.hybridRegenScale = 0.0;
  }

  mods.weatherGripScale =
      WeatherTireGripScale(weather, config_.tireChoice, config_.tyreTread);
  mods.tireAmbientTempC =
      weather.ambientTempC +
      (weather.trackTempC - weather.ambientTempC) * 0.85;
  mods.airDensityScale =
      288.15 / std::max(1.0, weather.ambientTempC + 273.15);
  mods.windHeadwindMs = weather.windSpeedMs * 0.35;

  if (traffic != nullptr) {
    driver_.setPressure(traffic->pressureLevel);
    applyTrafficVisuals(*traffic, deltaTime);
    if (traffic->speedCapMs > 0.0)
      mods.speedCapMs = traffic->speedCapMs;
    if (traffic->blueFlag)
      mods.throttleMultiplier *= 1.02;
    if (traffic->draftThrottleBoost > 0.0)
      mods.draftThrottleBoost = traffic->draftThrottleBoost;
    if (traffic->collisionDamage > 0.0) {
      if (collisionCooldown_ <= 0.0) {
        state_.engineHealth = std::max(
            0.0, state_.engineHealth - traffic->collisionDamage);
        collisionCooldown_ = 3.0;
        setupFeedback_ = "Contact — check bodywork";
      }
      if (state_.engineHealth < 30.0)
        mods.throttleMultiplier *= 0.82;
    }
  }

  if (collisionCooldown_ > 0.0)
    collisionCooldown_ = std::max(0.0, collisionCooldown_ - deltaTime);

  if (setupFeedbackTimer_ > 0.0) {
    setupFeedbackTimer_ = std::max(0.0, setupFeedbackTimer_ - deltaTime);
    if (setupFeedbackTimer_ <= 0.0)
      setupFeedback_.clear();
  }

  if (lastMistakeTimer_ > 0.0)
    lastMistakeTimer_ = std::max(0.0, lastMistakeTimer_ - deltaTime);
  if (mistakeWearBoostTimer_ > 0.0) {
    mistakeWearBoostTimer_ = std::max(0.0, mistakeWearBoostTimer_ - deltaTime);
    if (mistakeWearBoostTimer_ <= 0.0)
      mistakeWearBoostMultiplier_ = 1.0;
  }
  if (mistakePenaltyTimer_ > 0.0) {
    mistakePenaltyTimer_ = std::max(0.0, mistakePenaltyTimer_ - deltaTime);
    if (mistakePenaltyTimer_ > 0.0 && mistakePenaltyDuration_ > 0.0) {
      mods.mistakePenalty =
          mistakePenaltyPeak_ * (mistakePenaltyTimer_ / mistakePenaltyDuration_);
    }
  }
  if (mistakeWearBoostTimer_ > 0.0)
    mods.wearLoadMultiplier = mistakeWearBoostMultiplier_;

  if (state_.engineHealth > 0.0 && state_.engineHealth < 35.0) {
    mods.throttleMultiplier *= 0.88 + state_.engineHealth / 35.0 * 0.10;
  }

  const double kappa =
      track.maxCurvatureAhead(state_.currentDistance, physics.curvatureLookAheadM);
  const bool onStraight = kappa < physics.straightCurvatureThreshold;
  const double signedKappa =
      track.signedCurvatureAtDistance(state_.currentDistance);

  const bool underAttack = traffic != nullptr && traffic->underAttack;
  if (driver_.rollMistake(deltaTime, raceTime, underAttack)) {
    const double consistencyGap = 1.0 - driver_.consistencyFactor();
    DriverMistakeKind kind = DriverMistakeKind::RanWide;
    double wearSpike = 0.02 + consistencyGap * 0.025;
    double tempSpike = 0.0;
    double boostMult = 1.22;
    double boostDuration = 2.5;
    double penalty = 5.0 + consistencyGap * 8.0;
    double penaltyDuration = 2.0;

    if (onStraight && state_.currentSpeed > physics.tireWearSpeedThreshold) {
      kind = DriverMistakeKind::Lockup;
      wearSpike = 0.038 + consistencyGap * 0.035;
      tempSpike = 14.0 + consistencyGap * 12.0;
      boostMult = 1.55;
      boostDuration = 4.0;
      penalty = 7.0 + consistencyGap * 10.0;
      penaltyDuration = 2.8;
      setupFeedback_ = driver_.active().name + " locked up — flat spot on the tyre";
    } else if (driver_.mode == DriverMode::Push && !onStraight) {
      kind = DriverMistakeKind::Overdrive;
      wearSpike = 0.028 + consistencyGap * 0.03;
      tempSpike = 6.0 + consistencyGap * 8.0;
      boostMult = 1.42;
      boostDuration = 3.5;
      penalty = 6.0 + consistencyGap * 9.0;
      penaltyDuration = 2.4;
      setupFeedback_ = driver_.active().name + " overdid it — extra tyre scrub";
    } else if (underAttack && driver_.defendingFactor() < 0.92) {
      kind = DriverMistakeKind::RanWide;
      wearSpike = 0.024 + consistencyGap * 0.028;
      boostMult = 1.28;
      boostDuration = 3.0;
      penalty = 6.5 + consistencyGap * 9.0;
      penaltyDuration = 2.6;
      setupFeedback_ =
          driver_.active().name + " cracked under pressure — ran wide";
    } else if (driver_.fatigue > 0.75) {
      wearSpike = 0.022 + consistencyGap * 0.022;
      boostMult = 1.25;
      boostDuration = 2.8;
      penalty = 5.5 + consistencyGap * 8.5;
      penaltyDuration = 2.2;
      setupFeedback_ = driver_.active().name + " tired — mistake at the limit";
    } else {
      setupFeedback_ = driver_.active().name + " ran wide — tyres punished";
    }

    ApplyMistakeWheelSpike(mods, wearSpike, tempSpike, kind, signedKappa,
                           lastMistakeWheel_);
    mistakeWearBoostMultiplier_ = boostMult;
    mistakeWearBoostTimer_ = boostDuration;
    mods.wearLoadMultiplier = boostMult;
    mistakePenaltyPeak_ = penalty;
    mistakePenaltyDuration_ = penaltyDuration;
    mistakePenaltyTimer_ = penaltyDuration;
    mods.mistakePenalty = penalty;
    lastMistakeKind_ = kind;
    lastMistakeTimer_ = 8.0;
    lastMistakeWearAdded_ = wearSpike;
    setupFeedbackTimer_ = 6.0;
  }

  TickSimulation(config_, track, state_, deltaTime, physics, &telemetry_, mods);

  if (state_.fuelRemaining <= 0.0) {
    if (state_.currentSpeed < 0.5)
      outOfFuelTimer_ += deltaTime;
    else
      outOfFuelTimer_ = 0.0;
    if (outOfFuelTimer_ > 4.0 && !retired_) {
      markRetired("Out of fuel");
      result.retired = true;
    }
  } else {
    outOfFuelTimer_ = 0.0;
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

  if (state_.engineHealth > 0.0 && state_.engineHealth < 12.0 && !retired_) {
    const double failRate =
        (12.0 - state_.engineHealth) * 0.000012 * deltaTime;
    const double roll =
        std::fmod(std::sin((raceTime + state_.elapsedRaceTime) * 0.17 +
                           static_cast<double>(entryId_.length())) *
                      43758.5453,
                  1.0);
    if (roll < failRate) {
      markRetired("Mechanical failure");
      result.retired = true;
    }
  }

  return result;
}

CarSnapshot Car::snapshot(const TrackDefinition &track, int racePosition) const {
  TrackPose pose;
  if (pit_.inPit && track.pitLane.valid()) {
    pose = track.pitLane.poseAtDistance(pit_.pitLaneDistance);
  } else {
    pose = track.poseAtRaceDistance(state_.currentDistance);
  }

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
  snap.tireWearFL = state_.tireWear[static_cast<int>(WheelIndex::FL)];
  snap.tireWearFR = state_.tireWear[static_cast<int>(WheelIndex::FR)];
  snap.tireWearRL = state_.tireWear[static_cast<int>(WheelIndex::RL)];
  snap.tireWearRR = state_.tireWear[static_cast<int>(WheelIndex::RR)];
  snap.tireWear = state_.maxTireWear();
  snap.tireCompound = TireCompoundId(config_.tireChoice, config_.tyreTread);
  snap.tireTempFL = state_.tireTempC[static_cast<int>(WheelIndex::FL)];
  snap.tireTempFR = state_.tireTempC[static_cast<int>(WheelIndex::FR)];
  snap.tireTempRL = state_.tireTempC[static_cast<int>(WheelIndex::RL)];
  snap.tireTempRR = state_.tireTempC[static_cast<int>(WheelIndex::RR)];
  snap.tireTempC = state_.maxTireTempC();
  snap.coolantTempC = state_.currentThermalLoad;
  snap.hybridDeployMJ = state_.hybridDeployRemainingMJ;
  snap.hybridBudgetMJ = config_.hybridStintDeployBudgetMJ;
  snap.hybridStrategy = HybridStrategyLabel(driver_.hybridStrategy);
  snap.engineHealth = state_.engineHealth;
  snap.sectorIndex = static_cast<int>(state_.currentTrackNodeIndex);
  snap.racePosition = racePosition;
  snap.inGarage = garageHold_;
  snap.inPit = pit_.inPit;
  snap.pitQueued = pit_.pendingEnter && !pit_.inPit;
  snap.retired = retired_;
  snap.retireReason = retireReason_;
  snap.currentLapTime = state_.currentLapTime;
  snap.currentSectorTime = state_.currentSectorTime;
  snap.lastLapTime =
      telemetry_.laps().empty() ? 0.0 : telemetry_.laps().back().lapTime;
  snap.bestLapTime = bestLapTime_;
  snap.lateralOffset = lateralOffset_;
  snap.carLengthM = body_.lengthM;
  snap.carWidthM = body_.widthM;
  snap.driverName = driver_.active().name;
  snap.driverMode = driver_.mode == DriverMode::Push
                        ? "push"
                        : driver_.mode == DriverMode::Conserve
                              ? "conserve"
                              : "normal";
  snap.driverStamina = (1.0 - driver_.fatigue) * 100.0;
  snap.driverPressure = driver_.pressure * 100.0;
  snap.driverMistakeRisk = driver_.mistakeRiskMultiplier() * 100.0;
  snap.activeDriverIndex = driver_.activeIndex;
  if (lastMistakeTimer_ > 0.0) {
    snap.lastMistakeKind = DriverMistakeKindLabel(lastMistakeKind_);
    snap.lastMistakeRemainingSec = lastMistakeTimer_;
    snap.lastMistakeWearPct = lastMistakeWearAdded_ * 100.0;
    snap.lastMistakeWheel = lastMistakeWheel_;
  }
  if (mistakeWearBoostTimer_ > 0.0) {
    snap.wearBoostRemainingSec = mistakeWearBoostTimer_;
    snap.wearBoostMultiplier = mistakeWearBoostMultiplier_;
  }
  snap.driverRoster.reserve(driver_.roster.size());
  for (size_t i = 0; i < driver_.roster.size(); ++i) {
    const DriverProfile &d = driver_.roster[i];
    DriverSnapshot ds;
    ds.name = d.name;
    ds.tier = d.tier;
    ds.nationality = d.nationality;
    ds.dryPace = d.dryPace;
    ds.wetPace = d.wetPace;
    ds.consistency = d.consistency;
    ds.overtaking = d.overtaking;
    ds.defending = d.defending;
    ds.setupFeedback = d.setupFeedback;
    ds.stamina = d.stamina;
    ds.composure = d.composure;
    ds.active = static_cast<int>(i) == driver_.activeIndex;
    snap.driverRoster.push_back(std::move(ds));
  }
  snap.overtaking = overtakingVisual_;
  snap.blocked = blockedVisual_;
  snap.pitRemainingSec =
      pit_.inPit ? EstimatePitRemainingSec(pit_, track) : 0.0;
  snap.pitLaneDistance = pit_.inPit ? pit_.pitLaneDistance : 0.0;
  snap.setupFeedback = setupFeedback_;
  snap.wingAngle = wingAngleDelta_;
  snap.brakeBias = brakeBias_;
  snap.frontRideHeightMm = config_.frontRideHeightM * 1000.0;
  snap.rearRideHeightMm = config_.rearRideHeightM * 1000.0;
  snap.frontSpringNm = config_.frontSpringStiffness;
  snap.rearSpringNm = config_.rearSpringStiffness;
  snap.frontArbStiffness = config_.frontArbStiffness;
  snap.rearArbStiffness = config_.rearArbStiffness;
  snap.frontCamberDeg = config_.frontCamberDeg;
  snap.rearCamberDeg = config_.rearCamberDeg;
  snap.serviceabilityFactor = config_.serviceabilityFactor;
  snap.driverChangeFactor = config_.driverChangeFactor;
  snap.pitCount = pitCount_;
  snap.totalPitSeconds = totalPitSeconds_;
  snap.fuelTankCapacity = config_.fuelTankCapacity;
  snap.driverStintSeconds = driver_.stintTimeSeconds;
  snap.maxDriverStintSeconds = maxDriverStintSeconds_;

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

double ComputeTimingGap(const Car &car, const Car &leader) {
  if (car.entryId() == leader.entryId())
    return 0.0;
  const double carBest = car.bestLapTime();
  const double leaderBest = leader.bestLapTime();
  if (carBest <= 0.0 || leaderBest <= 0.0)
    return 0.0;
  return std::max(0.0, carBest - leaderBest);
}

double ComputeGapToLeader(const Car &car, const Car &leader,
                          double lapLength) {
  if (car.entryId() == leader.entryId())
    return 0.0;

  const int lapDiff = leader.state().currentLap - car.state().currentLap;
  double distanceGap =
      leader.state().currentDistance - car.state().currentDistance;
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
