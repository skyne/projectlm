#include "car_entity.hpp"
#include "part_damage.hpp"

namespace {
void MaybeRollHiddenFault(PartDamageState &damage, double impact, uint32_t salt) {
  // Target: <5% of stock grid cars develop a hidden fault per 24h race.
  if (impact < 11.0) return;
  const double roll = std::fmod(std::sin(salt * 0.173) * 43758.5453, 1.0);
  if (roll > 0.004 + impact * 0.00022) return;
  HiddenFault fault;
  if (impact >= kHugeCrashImpact + 1.0 &&
      std::fmod(std::sin(salt * 0.311) * 43758.5453, 1.0) < 0.35) {
    fault.kind = HiddenFaultKind::TubStress;
    fault.linkedPart = DamagePart::Monocoque;
    fault.severity = 28.0 + impact * 2.5;
  } else if (impact > 12.0) {
    fault.kind = HiddenFaultKind::CoolingHoseLeak;
    fault.linkedPart = DamagePart::Cooling;
    fault.severity = 20.0 + impact * 2.0;
  } else {
    fault.kind = HiddenFaultKind::HairlineCrack;
    fault.linkedPart = DamagePart::SuspFL;
    fault.severity = 20.0 + impact * 2.0;
  }
  fault.revealed = false;
  damage.hiddenFaults.push_back(fault);
}
} // namespace
#include "car_parts.hpp"
#include "driver.hpp"
#include "path_controller.hpp"
#include "path_dynamics.hpp"
#include "track.hpp"
#include "track_corridor.hpp"
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
  if (IsBatteryPrimaryEv(config_)) {
    state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
    state_.fuelRemaining = state_.batteryChargeMJ;
    state_.hybridDeployRemainingMJ = state_.batteryChargeMJ;
  } else {
    state_.fuelRemaining = config_.fuelTankCapacity;
    state_.hybridDeployRemainingMJ = config_.hybridStintDeployBudgetMJ;
    state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
  }
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
  if (!garageHold_ || retired_ || garageRebuildActive_)
    return false;
  garageHold_ = false;
  rc_.trackStatus = TrackStatus::Racing;
  rc_.obstructionSinceTime = -1.0;
  rc_.marshalDispatchTime = -1.0;
  rc_.fireExtinguishEndTime = -1.0;
  rc_.recoveryStartTime = -1.0;
  rc_.recoveryEndTime = -1.0;
  rc_.recoveryProgress = 0.0;
  rc_.stoppedTimer = 0.0;
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
  InitPartDamageState(state_.partDamage);
  if (IsBatteryPrimaryEv(config_)) {
    state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
    state_.fuelRemaining = state_.batteryChargeMJ;
    state_.hybridDeployRemainingMJ = state_.batteryChargeMJ;
  } else {
    state_.fuelRemaining = config_.fuelTankCapacity;
    state_.hybridDeployRemainingMJ = config_.hybridStintDeployBudgetMJ;
    state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
  }
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
  redFlagHold_ = false;
  redFlagEmergencyWorked_ = false;
  garageRebuildActive_ = false;
  garageRebuildEndTime_ = 0.0;
  garageRestoreTargetHealth_ = kRaceableHealthThreshold;
  onFire_ = false;
  rc_ = CarRaceControlState{};
  placeOnGrid(gridPosition_);
}

void Car::applyCommand(const SimCommand &command) {
  switch (command.type) {
  case SimCommandType::PitRequest:
    pit_.pendingEnter = true;
    pit_.plan = command.pit;
    if (rc_.pendingPenalty == PendingPenalty::DriveThrough)
      pit_.plan.driveThrough = true;
    if (rc_.pendingPenalty == PendingPenalty::StopGo ||
        rc_.pendingPenalty == PendingPenalty::Black)
      pit_.plan.stopGo = true;
    if (pit_.plan.tiresToChange.empty() && pit_.plan.fuelLiters <= 0.0 &&
        pit_.plan.repairs.empty() && !pit_.plan.changeDriver &&
        !pit_.plan.garageRebuild) {
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

bool Car::isUnderPitService() const {
  if (PitPlanHasActiveService(pit_.plan))
    return true;
  if (pit_.phase == PitPhase::AtBox && pit_.pitDuration > 0.0 &&
      pit_.pitElapsed < pit_.pitDuration)
    return true;
  return false;
}

void Car::applyRedFlagHold() {
  redFlagHold_ = true;
  garageHold_ = true;
  state_.currentSpeed = 0.0;
  pit_.statusMessage = "Red flag hold";
}

void Car::clearRedFlagHold() {
  redFlagHold_ = false;
}

bool Car::processPitEntry(double normalizedT, bool lapJustCompleted,
                          bool redFlagActive) {
  if (!ShouldEnterPitLane(pit_, normalizedT, lapJustCompleted, state_.currentLap,
                          redFlagActive))
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

void Car::beginRejoinYield(double seconds) {
  rejoinYieldSec_ = std::max(rejoinYieldSec_, seconds);
}

double Car::lateralNM(double trackWidthM, bool useFrenetDynamics,
                      const TrackCorridor *corridor,
                      double arcLengthM) const {
  if (useFrenetDynamics)
    return state_.lateralOffsetM;
  const double s =
      arcLengthM >= 0.0 ? arcLengthM : state_.currentDistance;
  if (corridor != nullptr && corridor->length() > 0.0)
    return corridor->lateralOffsetM(s, lateralOffset_);
  return lateralOffset_ * trackWidthM * 0.5;
}

bool Car::processPitLaneTick(const TrackDefinition &track, double deltaTime,
                             const StaffModifiers &staff,
                             double remainingSessionSec, bool redFlagActive,
                             const std::vector<Car> *peerCars,
                             bool requireMergeGap,
                             const TrafficLateralContext *lateral) {
  if (!pit_.inPit)
    return false;

  totalPitSeconds_ += deltaTime;

  const PitLaneDefinition &lane = track.pitLane;
  if (!lane.valid()) {
    if (pit_.pitDuration <= 0.0)
      pit_.pitDuration =
          ComputePitServiceDuration(pit_.plan, config_, staff, &state_);
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
    if (pit_.plan.garageRebuild) {
      if (startGarageRebuildAfterPit(track, state_.elapsedRaceTime,
                                     remainingSessionSec, 100.0, true,
                                     "Full garage rebuild in progress")) {
        pit_.plan = PitStopPlan{};
        return false;
      }
    } else if (handlePostPitRepairDecision(track, state_.elapsedRaceTime,
                                             remainingSessionSec)) {
      pit_.plan = PitStopPlan{};
      return false;
    }
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
      const bool penaltyStop =
          pit_.plan.driveThrough || pit_.plan.stopGo;
      if (penaltyStop && pit_.plan.driveThrough) {
        pit_.phase = PitPhase::DrivingOut;
        state_.currentSpeed = speedLimit;
        pit_.statusMessage = "Drive-through";
      } else if (redFlagActive && !penaltyStop) {
        pit_.phase = PitPhase::AtBox;
        state_.currentSpeed = 0.0;
        pit_.pitElapsed = 0.0;
        pit_.pitDuration = 0.0;
        SanitizeRedFlagEmergencyPlan(pit_.plan, config_, state_, rc_);
        if (!PitPlanHasActiveService(pit_.plan)) {
          applyRedFlagHold();
          pit_.statusMessage = "Red flag hold";
        } else {
          pit_.statusMessage = "Red flag emergency work";
        }
      } else if (pit_.skipBoxService) {
        pit_.phase = PitPhase::DrivingOut;
        state_.currentSpeed = speedLimit;
        pit_.statusMessage = "Drive-through";
      } else {
        pit_.phase = PitPhase::AtBox;
        state_.currentSpeed = 0.0;
        pit_.pitElapsed = 0.0;
        if (pit_.plan.stopGo)
          pit_.pitDuration =
              rc_.penaltyStopSeconds > 0.0 ? rc_.penaltyStopSeconds : 10.0;
        else
          pit_.pitDuration =
              ComputePitServiceDuration(pit_.plan, config_, staff, &state_);
        pit_.statusMessage = "In pits";
      }
    }
    break;

  case PitPhase::AtBox:
    state_.currentSpeed = 0.0;
    if (redFlagActive && !pit_.plan.driveThrough && !pit_.plan.stopGo) {
      SanitizeRedFlagEmergencyPlan(pit_.plan, config_, state_, rc_);
      if (PitPlanHasActiveService(pit_.plan)) {
        if (pit_.pitDuration <= 0.0) {
          pit_.pitDuration =
              ComputePitServiceDuration(pit_.plan, config_, staff, &state_);
          pit_.pitElapsed = 0.0;
          redFlagHold_ = false;
          garageHold_ = false;
          pit_.statusMessage = "Red flag emergency work";
        }
        pit_.pitElapsed += deltaTime;
        if (pit_.pitElapsed < pit_.pitDuration)
          break;
        ApplyPitServices(pit_.plan, config_, state_, driver_);
        redFlagEmergencyWorked_ = true;
        pit_.plan = PitStopPlan{};
        pit_.pitDuration = 0.0;
        pit_.pitElapsed = 0.0;
        applyRedFlagHold();
        pit_.statusMessage = "Red flag hold";
        break;
      }
      if (!redFlagHold_)
        applyRedFlagHold();
      break;
    }
    if (garageHold_)
      break;
    pit_.pitElapsed += deltaTime;
    if (pit_.pitElapsed < pit_.pitDuration)
      break;
    if (pit_.plan.stopGo && rc_.pendingPenalty != PendingPenalty::None) {
      rc_.pendingPenalty = PendingPenalty::None;
      rc_.penaltyReason.clear();
      rc_.lapsToComply = 0;
      rc_.penaltyStopSeconds = 0.0;
    }
    pit_.phase = PitPhase::DrivingOut;
    state_.currentSpeed = speedLimit;
    pit_.statusMessage = "Pit exit";
    break;

  case PitPhase::DrivingOut:
    if (redFlagActive && !pit_.plan.driveThrough && !pit_.plan.stopGo) {
      applyRedFlagHold();
      pit_.phase = PitPhase::AtBox;
      pit_.pitLaneDistance = lane.boxDistance;
      state_.currentSpeed = 0.0;
      pit_.statusMessage = "Red flag hold";
      break;
    }
    state_.currentSpeed = speedLimit;
    {
      const double nextLaneDist = pit_.pitLaneDistance + speedLimit * deltaTime;
      if (nextLaneDist < lane.totalLength()) {
        pit_.pitLaneDistance = nextLaneDist;
        break;
      }
      pit_.pitLaneDistance = lane.totalLength();
      if (requireMergeGap && peerCars != nullptr &&
          !PitMergeGapSafe(*this, *peerCars, track.lapLength(),
                           lane.mergeTrackDistance, speedLimit,
                           lateral != nullptr ? *lateral
                                              : TrafficLateralContext{})) {
        pit_.statusMessage = "Waiting for gap";
        break;
      }
    }
    if (!pit_.plan.driveThrough)
      ApplyPitServices(pit_.plan, config_, state_, driver_);
    if (pit_.plan.driveThrough && rc_.pendingPenalty == PendingPenalty::DriveThrough) {
      rc_.pendingPenalty = PendingPenalty::None;
      rc_.penaltyReason.clear();
      rc_.lapsToComply = 0;
    }
    if (pit_.plan.wingAngleDelta != 0.0)
      wingAngleDelta_ =
          std::clamp(wingAngleDelta_ + pit_.plan.wingAngleDelta, -0.5, 0.5);
    if (pit_.plan.brakeBiasDelta != 0.0)
      brakeBias_ = std::clamp(brakeBias_ + pit_.plan.brakeBiasDelta, 0.35, 0.65);
    pitCount_ += 1;

    if (pit_.plan.garageRebuild) {
      if (startGarageRebuildAfterPit(track, state_.elapsedRaceTime,
                                     remainingSessionSec, 100.0, true,
                                     "Full garage rebuild in progress")) {
        pit_.plan = PitStopPlan{};
        return false;
      }
    } else if (handlePostPitRepairDecision(track, state_.elapsedRaceTime,
                                           remainingSessionSec)) {
      pit_.plan = PitStopPlan{};
      return false;
    }

    state_.currentDistance = lane.mergeTrackDistance;
    state_.currentSpeed = speedLimit * 0.85;
    SyncGearForSpeed(config_, state_);
    lateralOffset_ = 0.58;
    beginRejoinYield();
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

void Car::applyTrafficVisuals(const TrafficModifiers &traffic, double deltaTime,
                              const TrackCorridor &corridor, bool useFrenet) {
  overtakingVisual_ = traffic.overtaking;
  blockedVisual_ = traffic.blocked;

  const PathTarget pathTarget =
      computePathTarget(*this, corridor, traffic, state_.currentDistance);
  pathTargetNM_ = pathTarget.targetNM;

  if (useFrenet)
    return;

  const double maxN =
      std::max(1e-6, corridor.maxLateralN(state_.currentDistance));
  const double targetNorm =
      std::clamp(pathTarget.targetNM / maxN, -0.95, 0.95);
  const double blend =
      std::min(1.0, deltaTime * (2.5 + pathTarget.urgency * 4.0));
  lateralOffset_ = std::clamp(
      lateralOffset_ + (targetNorm - lateralOffset_) * blend, -0.95, 0.95);
}

CarTickResult Car::tick(const TrackDefinition &track,
                      const TrackCorridor &corridor,
                      const PhysicsConfig &physics, double deltaTime, double raceTime,
                      TelemetryLog *telemetry,
                      const TrafficModifiers *traffic,
                      const WeatherState &weather, bool isNight,
                      double remainingSessionSec, bool pauseDriverStint) {
  CarTickResult result;
  if (retired_ || track.sectors.empty() || pit_.inPit)
    return result;

  const TrackStatus ts = rc_.trackStatus;
  if (ts == TrackStatus::Stranded || ts == TrackStatus::Recovering)
    return result;

  if (!pauseDriverStint)
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
  if (config_.hybridDeployPowerKW > 0.0 || IsBatteryPrimaryEv(config_)) {
    HybridStrategyModifiers(driver_.hybridStrategy, mods.hybridDeployScale,
                            mods.hybridRegenScale);
    // Battery-primary EVs have no separate deploy system (drive power IS the
    // battery), but braking regen must still credit the pack.
    if (IsBatteryPrimaryEv(config_))
      mods.hybridDeployScale = 0.0;
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
    applyTrafficVisuals(*traffic, deltaTime, corridor, physics.useFrenetDynamics);
    if (traffic->speedCapMs > 0.0)
      mods.speedCapMs = traffic->speedCapMs;
    if (traffic->blueFlag)
      mods.throttleMultiplier *= 1.02;
    if (traffic->localGripScale > 0.0 && traffic->localGripScale < 1.0)
      mods.localGripScale = traffic->localGripScale;
    if (traffic->scRestartThrottleBoost > 0.0)
      mods.throttleMultiplier *= 1.0 + traffic->scRestartThrottleBoost;
    if (traffic->draftThrottleBoost > 0.0)
      mods.draftThrottleBoost = traffic->draftThrottleBoost;
    if (traffic->collisionDamage > 0.0) {
      if (collisionCooldown_ <= 0.0) {
        static const PartCatalog kCatalog{};
        CarDamageProfiles profiles;
        BuildCarDamageProfiles(config_, kCatalog, profiles);
        const CollisionSide side = CollisionSideFromLateral(lateralOffset_);
        ApplyCollisionDamage(state_.partDamage, profiles, traffic->collisionDamage,
                             side, config_.hybridDeployPowerKW > 0.0);
        for (int w : CollisionPunctureWheels(traffic->collisionDamage, side))
          ApplyTyrePuncture(state_, w, true);
        SyncDerivedEngineHealth(state_, config_);
        MaybeRollHiddenFault(state_.partDamage, traffic->collisionDamage,
                             static_cast<uint32_t>(entryId_.length() + state_.currentLap));
        const bool hasFuel = state_.fuelRemaining > 0.5;
        const bool hasHybrid = config_.hybridDeployPowerKW > 0.0;
        tryIgniteFire(FireIgnitionChanceFromImpact(traffic->collisionDamage,
                                                   hasFuel, hasHybrid),
                      raceTime);
        if (traffic->collisionDamage >= kHugeCrashImpact)
          setupFeedback_ = "Heavy impact — check safety cell";
        else
          setupFeedback_ = "Contact — check bodywork";
        setupFeedbackTimer_ = 6.0;
        collisionCooldown_ = 3.0;
      }
      if (state_.engineHealth < 30.0)
        mods.throttleMultiplier *= 0.82;
    }
  }

  if (collisionCooldown_ > 0.0)
    collisionCooldown_ = std::max(0.0, collisionCooldown_ - deltaTime);
  if (rejoinYieldSec_ > 0.0)
    rejoinYieldSec_ = std::max(0.0, rejoinYieldSec_ - deltaTime);

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

  if (onFire_) {
    tickFireDamage(deltaTime);
    mods.throttleMultiplier *= 0.35;
    mods.speedCapMs = mods.speedCapMs > 0.0 ? std::min(mods.speedCapMs, 18.0) : 18.0;
    if (IsMonocoqueBreached(state_.partDamage) && !retired_) {
      markRetired("Monocoque breached — fire");
      result.retired = true;
      return result;
    }
  }

  static const PartCatalog kLimpCatalog{};
  CarDamageProfiles limpProfiles;
  BuildCarDamageProfiles(config_, kLimpCatalog, limpProfiles);
  for (int i = 0; i < 4; ++i) {
    const auto defl = state_.tyreDeflation.state[i];
    if (defl == TyreDeflationState::Flat)
      mods.wearSpikePerWheel[i] += 0.5;
    else if (defl == TyreDeflationState::Soft)
      mods.wearSpikePerWheel[i] += 0.12;
  }

  const LimpMode limp = EvaluateLimpMode(
      state_.partDamage, config_, state_.tyreDeflation,
      state_.batteryChargeMJ > 0.0 ? state_.batteryChargeMJ
                                   : state_.hybridDeployRemainingMJ);
  const CarRepairAssessment repairPlan = ComputeCarRepairAssessment(
      state_.partDamage, config_, state_.tyreDeflation, limpProfiles,
      remainingSessionSec);
  const bool canSessionRepair = repairPlan.sessionRepairable;

  if (HasCatastrophicSameSideLoss(state_.partDamage)) {
    ApplyMonocoqueImpactDamage(state_.partDamage, limpProfiles, 14.5);
    tryIgniteFire(0.24, raceTime);
    pit_.pendingEnter = false;
    state_.currentSpeed = 0.0;
    result.stoppedOnTrack = true;
    return result;
  }
  const double structural = ComputeStructuralSeverity(state_.partDamage,
                                                      state_.tyreDeflation);
  if (limp == LimpMode::Immobilized) {
    mods.speedCapMs = std::max(mods.speedCapMs, 4.0);
    mods.throttleMultiplier *= 0.15;
    if (canSessionRepair && !pit_.pendingEnter && !pit_.inPit)
      pit_.pendingEnter = true;
  } else if (limp == LimpMode::BarelyDriveable) {
    const double capMs = std::max(11.0, 28.0 - structural * 0.18);
    mods.speedCapMs = mods.speedCapMs > 0.0 ? std::min(mods.speedCapMs, capMs) : capMs;
    mods.throttleMultiplier *= 0.55;
    if (canSessionRepair && !pit_.pendingEnter && !pit_.inPit)
      pit_.pendingEnter = true;
  } else if (limp == LimpMode::HybridOnly) {
    mods.throttleMultiplier *= 0.05;
    mods.hybridDeployScale = std::max(mods.hybridDeployScale, 0.35);
    mods.speedCapMs = mods.speedCapMs > 0.0 ? std::min(mods.speedCapMs, 36.0) : 36.0;
    if (canSessionRepair && !pit_.pendingEnter && !pit_.inPit)
      pit_.pendingEnter = true;
  } else if (limp == LimpMode::ReducedPower) {
    mods.throttleMultiplier *= 0.45;
    mods.speedCapMs = mods.speedCapMs > 0.0 ? std::min(mods.speedCapMs, 50.0) : 50.0;
  }

  if (physics.useFrenetDynamics) {
    if (traffic == nullptr) {
      pathTargetNM_ =
          computePathTarget(*this, corridor, TrafficModifiers{},
                            state_.currentDistance)
              .targetNM;
    }

    const double s = state_.currentDistance;
    PathDynamicsInput pd;
    pd.targetNM = pathTargetNM_;
    pd.trackWidthM = corridor.widthAt(s);
    pd.effectiveKappa = corridor.effectiveCurvature(s, state_.lateralOffsetM);
    pd.mu = physics.tireFriction * mods.weatherGripScale * mods.localGripScale;
    pd.mass = std::max(1.0, config_.calculatedTotalMass);
    pd.v = std::max(physics.minSpeed, state_.currentSpeed);
    pd.beta = state_.headingError;
    pd.n = state_.lateralOffsetM;
    pd.lateralVelocity = state_.lateralVelocity;
    pd.FxDesired = 0.0;
    pd.maxLateralN = physics.pathLateralGain * 1.5;

    const PathDynamicsOutput out = stepPathDynamics(pd, deltaTime);
    state_.lateralOffsetM += out.dn * deltaTime;
    state_.headingError += out.dBeta * deltaTime;
    state_.lateralVelocity = out.dn;
    state_.currentDistance += out.ds * deltaTime;

    const double maxN = corridor.maxLateralN(s);
    const double carHalfWidth = body_.widthM * 0.5;
    const double limitN = std::max(0.0, maxN - carHalfWidth);
    if (std::abs(state_.lateralOffsetM) > limitN) {
      state_.lateralOffsetM = std::copysign(limitN, state_.lateralOffsetM);
      state_.lateralVelocity *= 0.25;
      state_.currentSpeed =
          std::max(physics.minSpeed, state_.currentSpeed * 0.97);
    }
    if (maxN > 1e-6)
      lateralOffset_ =
          std::clamp(state_.lateralOffsetM / maxN, -1.0, 1.0);
  }

  TickSimulation(config_, track, state_, deltaTime, physics, &telemetry_, mods);

  if (!HasDrivableEnergy(config_, state_.fuelRemaining, state_.batteryChargeMJ,
                         state_.hybridDeployRemainingMJ)) {
    if (state_.currentSpeed < 0.5)
      outOfFuelTimer_ += deltaTime;
    else
      outOfFuelTimer_ = 0.0;
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

  if (state_.engineHealth <= 0.0 && !retired_ && pit_.inPit && !garageRebuildActive_) {
    // Defer to post-pit / garage rebuild assessment on pit exit.
  }

  if (state_.engineHealth > 0.0 && state_.engineHealth < 12.0 && !retired_ &&
      pit_.inPit && !garageRebuildActive_) {
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

bool Car::isOnTrackObstruction() const {
  const TrackStatus ts = rc_.trackStatus;
  return ts == TrackStatus::Stranded || ts == TrackStatus::Recovering;
}

void Car::markRetired(const std::string &reason) {
  retired_ = true;
  retireReason_ = reason;
  garageRebuildActive_ = false;
  onFire_ = false;
  rc_.fireStartedAt = -1.0;
}

void Car::igniteFire() {
  if (retired_)
    return;
  onFire_ = true;
  if (rc_.fireStartedAt < 0.0)
    rc_.fireStartedAt = state_.elapsedRaceTime;
}

void Car::extinguishFire() {
  onFire_ = false;
  rc_.fireStartedAt = -1.0;
}

void Car::tryIgniteFire(double chance, double raceTime) {
  if (onFire_ || retired_ || chance <= 0.0)
    return;
  const double roll = std::fmod(
      std::sin((raceTime + static_cast<double>(entryId_.length())) * 0.41) *
          43758.5453,
      1.0);
  if (roll >= chance)
    return;
  onFire_ = true;
  if (rc_.fireStartedAt < 0.0)
    rc_.fireStartedAt = raceTime;
  setupFeedback_ = "Fire — stop immediately";
  setupFeedbackTimer_ = 10.0;
}

void Car::tickFireDamage(double deltaTime) {
  static const PartCatalog kCatalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(config_, kCatalog, profiles);
  ApplyFireDamage(state_.partDamage, profiles, deltaTime);
  SyncDerivedEngineHealth(state_, config_);
  if (state_.engineHealth <= 0.0 && state_.fuelRemaining > 0.5 &&
      !retired_) {
    const double roll = std::fmod(
        std::sin((state_.elapsedRaceTime + 3.1) * 0.29) * 43758.5453, 1.0);
    if (roll < 0.0015 * deltaTime * 60.0)
      tryIgniteFire(1.0, state_.elapsedRaceTime);
  }
}

void Car::restoreFullStintEnergy() {
  if (IsBatteryPrimaryEv(config_)) {
    state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
    state_.fuelRemaining = state_.batteryChargeMJ;
    state_.hybridDeployRemainingMJ = state_.batteryChargeMJ;
  } else {
    state_.fuelRemaining = config_.fuelTankCapacity;
    state_.hybridDeployRemainingMJ = config_.hybridStintDeployBudgetMJ;
    state_.batteryChargeMJ = config_.hybridStintDeployBudgetMJ;
  }
  outOfFuelTimer_ = 0.0;
}

void Car::beginOpenSessionEnergyRecovery(const TrackDefinition &track,
                                         double raceTime) {
  static constexpr double kOpenSessionRefuelSec = 75.0;
  beginGarageRebuild(track, raceTime, kOpenSessionRefuelSec,
                     "Garage — refuelling after tow", false);
}

void Car::beginGarageRebuild(const TrackDefinition &track, double raceTime,
                             double durationSec, const std::string &status,
                             bool damageRebuild, double restoreTargetHealth) {
  placeInGarageHold(track);
  garageRebuildActive_ = true;
  garageRebuildEndTime_ =
      raceTime + ComputeGarageRebuildDurationSec(durationSec, damageRebuild);
  garageRestoreTargetHealth_ = restoreTargetHealth;
  pit_.pendingEnter = false;
  pit_.statusMessage = status;
  rc_.recoveryEndTime = -1.0;
  rc_.recoveryProgress = 0.0;
  extinguishFire();
}

double Car::garageRebuildRemainingSec(double raceTime) const {
  if (!garageRebuildActive_)
    return 0.0;
  return std::max(0.0, garageRebuildEndTime_ - raceTime);
}

void Car::tickGarageRebuild(const TrackDefinition &track, double raceTime,
                            double remainingSessionSec) {
  if (!garageRebuildActive_ || retired_)
    return;

  const double rebuildRemaining = garageRebuildEndTime_ - raceTime;
  if (rebuildRemaining > remainingSessionSec + 1.0) {
    markRetired("Insufficient session time for repair");
    pit_.statusMessage = "Retired — insufficient session time";
    return;
  }

  if (raceTime + 1e-6 >= garageRebuildEndTime_) {
    RestoreDamagedPartsToRaceable(state_.partDamage, garageRestoreTargetHealth_);
    garageRestoreTargetHealth_ = kRaceableHealthThreshold;
    const std::string &recoveryReason = rc_.obstructionReason;
    if (recoveryReason.find("Out of fuel") != std::string::npos ||
        recoveryReason.find("Battery depleted") != std::string::npos) {
      restoreFullStintEnergy();
      rc_.obstructionReason.clear();
    }
    SyncDerivedEngineHealth(state_, config_);
    garageRebuildActive_ = false;
    garageRebuildEndTime_ = 0.0;
    pit_.statusMessage = "Rebuild complete — rejoining";
    releaseFromGarage(track);
  }
}

bool Car::deliverTowedToGarage(const TrackDefinition &track, double raceTime,
                               double remainingSessionSec) {
  if (retired_)
    return false;

  static const PartCatalog kCatalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(config_, kCatalog, profiles);
  const CarRepairAssessment assessment = ComputeCarRepairAssessment(
      state_.partDamage, config_, state_.tyreDeflation, profiles,
      remainingSessionSec);
  const double garageSec =
      ComputeGarageRebuildDurationSec(assessment.totalRepairSec);
  if (!assessment.physicallyRepairable || garageSec > remainingSessionSec + 1.0)
    return false;

  beginGarageRebuild(track, raceTime, assessment.totalRepairSec,
                     "Garage rebuild after tow");
  return true;
}

bool Car::startGarageRebuildAfterPit(const TrackDefinition &track,
                                     double raceTime,
                                     double remainingSessionSec,
                                     double restoreTargetHealth,
                                     bool evenIfRaceable,
                                     const std::string &status) {
  if (retired_)
    return true;

  static const PartCatalog kCatalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(config_, kCatalog, profiles);
  SyncDerivedEngineHealth(state_, config_);
  const double battery = state_.batteryChargeMJ > 0.0
                             ? state_.batteryChargeMJ
                             : state_.hybridDeployRemainingMJ;
  if (!evenIfRaceable &&
      IsCarRaceable(state_.partDamage, config_, state_.tyreDeflation, battery))
    return false;

  const CarRepairAssessment assessment = ComputeCarRepairAssessment(
      state_.partDamage, config_, state_.tyreDeflation, profiles,
      remainingSessionSec, restoreTargetHealth);
  if (!assessment.physicallyRepairable) {
    markRetired(IsMonocoqueBreached(state_.partDamage) ? "Monocoque breached"
                                                       : "Beyond repair");
    pit_.pendingEnter = false;
    pit_.inPit = true;
    pit_.phase = PitPhase::AtBox;
    garageHold_ = true;
    state_.currentSpeed = 0.0;
    pit_.statusMessage = "Retired — beyond repair";
    return true;
  }
  const double garageSec =
      ComputeGarageRebuildDurationSec(assessment.totalRepairSec);
  if (garageSec > remainingSessionSec + 1.0) {
    markRetired("Insufficient session time for repair");
    pit_.pendingEnter = false;
    pit_.inPit = true;
    pit_.phase = PitPhase::AtBox;
    garageHold_ = true;
    state_.currentSpeed = 0.0;
    pit_.statusMessage = "Retired — insufficient session time";
    return true;
  }

  beginGarageRebuild(track, raceTime, assessment.totalRepairSec, status, true,
                     restoreTargetHealth);
  return true;
}

bool Car::handlePostPitRepairDecision(const TrackDefinition &track,
                                      double raceTime,
                                      double remainingSessionSec) {
  return startGarageRebuildAfterPit(track, raceTime, remainingSessionSec,
                                    kRaceableHealthThreshold, false,
                                    "Garage rebuild in progress");
}

CarSnapshot Car::snapshot(const TrackDefinition &track, int racePosition,
                          double remainingSessionSec,
                          const TrackCorridor *corridor,
                          const PhysicsConfig *physics,
                          double trackWidthM) const {
  TrackPose pose;
  double lateralM = 0.0;
  bool poseIncludesLateral = false;
  double headingRad = 0.0;

  if (pit_.inPit && track.pitLane.valid()) {
    pose = track.pitLane.poseAtDistance(pit_.pitLaneDistance);
  } else if (corridor != nullptr && corridor->length() > 0.0) {
    const bool frenet =
        physics != nullptr && physics->useFrenetDynamics;
    lateralM = lateralNM(trackWidthM, frenet, corridor);
    pose = corridor->poseAt(state_.currentDistance, lateralM);
    poseIncludesLateral = true;
    if (frenet)
      headingRad = state_.headingError;
  } else {
    pose = track.poseAtRaceDistance(state_.currentDistance);
    lateralM = lateralOffset_ * trackWidthM * 0.5;
  }

  if (std::abs(headingRad) > 1e-9) {
    const double c = std::cos(headingRad);
    const double s = std::sin(headingRad);
    const double tx = pose.tangent.x;
    const double tz = pose.tangent.z;
    pose.tangent.x = tx * c - tz * s;
    pose.tangent.z = tx * s + tz * c;
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
  if (IsBatteryPrimaryEv(config_)) {
    snap.fuel = state_.batteryChargeMJ;
    snap.fuelTankCapacity = config_.hybridStintDeployBudgetMJ;
  } else {
    snap.fuel = state_.fuelRemaining;
    snap.fuelTankCapacity = config_.fuelTankCapacity;
  }
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
  if (IsBatteryPrimaryEv(config_)) {
    snap.hybridDeployMJ = state_.batteryChargeMJ;
    snap.hybridBudgetMJ = config_.hybridStintDeployBudgetMJ;
  } else {
    snap.hybridDeployMJ = state_.hybridDeployRemainingMJ;
    snap.hybridBudgetMJ = config_.hybridStintDeployBudgetMJ;
  }
  snap.hybridStrategy = HybridStrategyLabel(driver_.hybridStrategy);
  snap.engineHealth = state_.engineHealth;
  snap.structuralSeverity =
      ComputeStructuralSeverity(state_.partDamage, state_.tyreDeflation);
  const LimpMode limpSnap = EvaluateLimpMode(
      state_.partDamage, config_, state_.tyreDeflation,
      state_.batteryChargeMJ > 0.0 ? state_.batteryChargeMJ
                                   : state_.hybridDeployRemainingMJ);
  snap.limpMode = LimpModeLabel(limpSnap);
  static const PartCatalog kSnapCatalog{};
  CarDamageProfiles snapProfiles;
  BuildCarDamageProfiles(config_, kSnapCatalog, snapProfiles);
  const CarRepairAssessment repairSnap = ComputeCarRepairAssessment(
      state_.partDamage, config_, state_.tyreDeflation, snapProfiles,
      remainingSessionSec);
  snap.physicallyRepairable = repairSnap.physicallyRepairable;
  snap.sessionRepairable = repairSnap.sessionRepairable;
  snap.totalRepairSec = repairSnap.totalRepairSec;
  snap.remainingSessionSec = repairSnap.remainingSessionSec;
  snap.garageRebuildActive = garageRebuildActive_;
  snap.garageRebuildRemainingSec =
      garageRebuildActive_ ? garageRebuildRemainingSec(state_.elapsedRaceTime) : 0.0;
  snap.onFire = onFire_;
  snap.partHealth.clear();
  snap.partIrreparable.clear();
  snap.partRepairSec.clear();
  for (const PartRepairAssessment &part : repairSnap.parts) {
    snap.partHealth[part.token] = part.health;
    snap.partRepairSec[part.token] = part.repairSec;
    if (part.needsGarageRebuild)
      snap.partIrreparable.push_back(part.token);
  }
  for (int pi = 0; pi < static_cast<int>(DamagePart::Count); ++pi) {
    const DamagePart part = static_cast<DamagePart>(pi);
    const std::string tok = DamagePartToken(part);
    const double h = PartHealth(state_.partDamage, part);
    if (h < 99.5 && !snap.partHealth.count(tok))
      snap.partHealth[tok] = h;
  }
  snap.tyreDeflation.clear();
  static const char *kWheel[] = {"FL", "FR", "RL", "RR"};
  for (int i = 0; i < 4; ++i) {
    if (state_.tyreDeflation.state[i] != TyreDeflationState::Normal)
      snap.tyreDeflation[kWheel[i]] =
          TyreDeflationLabel(state_.tyreDeflation.state[i]);
  }
  snap.hiddenFaults.clear();
  int faultIdx = 0;
  for (const HiddenFault &fault : state_.partDamage.hiddenFaults) {
    if (!fault.revealed && fault.severity > 45.0)
      snap.suspectedIssues = true;
    CarSnapshot::HiddenFaultSnapshot fs;
    fs.id = "hf-" + std::to_string(faultIdx++);
    fs.kind = HiddenFaultKindToken(fault.kind);
    fs.linkedPart = DamagePartToken(fault.linkedPart);
    fs.severity = fault.severity;
    fs.revealed = fault.revealed;
    snap.hiddenFaults.push_back(std::move(fs));
  }
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
  snap.lateralOffsetM = lateralM;
  snap.headingError = headingRad;
  snap.poseIncludesLateral = poseIncludesLateral;
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
  snap.trackStatus = TrackStatusName(rc_.trackStatus);
  snap.blueFlag = rc_.blueFlagActive;
  snap.blueFlagStrikes = rc_.blueFlagStrikes;
  snap.pendingPenalty = PendingPenaltyName(rc_.pendingPenalty);
  snap.penaltyReason = rc_.penaltyReason;
  snap.lapsToComply = rc_.lapsToComply;
  snap.meatballFlag = rc_.meatballActive;
  snap.blackFlag = rc_.pendingPenalty == PendingPenalty::Black;
  snap.collisionWarnings = rc_.collisionWarnings;
  snap.penaltyStopSeconds = rc_.penaltyStopSeconds;
  snap.recoveryProgress = rc_.recoveryProgress;
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
