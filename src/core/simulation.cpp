#include "simulation.hpp"
#include "telemetry.hpp"
#include <algorithm>
#include <cmath>

static int SelectGearIndex(const CarConfig &car, double speed) {
  const int maxGear = std::max(1, std::min(car.gearCount, 8));
  int gear = 0;
  for (int i = 1; i < maxGear; ++i) {
    if (speed > car.gearShiftSpeeds[i - 1])
      gear = i;
  }
  return gear;
}

void TickSimulation(const CarConfig &car, const TrackDefinition &track,
                    SimulationState &state, double deltaTime,
                    const PhysicsConfig &p, TelemetryLog *telemetry,
                    const SimulationModifiers *modifiers) {
  const SimulationModifiers defaultMods;
  const SimulationModifiers &mods = modifiers != nullptr ? *modifiers : defaultMods;
  if (track.sectors.empty())
    return;

  if (state.fuelRemaining < 0.0)
    state.fuelRemaining = car.fuelTankCapacity;
  if (state.hybridDeployRemainingMJ < 0.0)
    state.hybridDeployRemainingMJ = car.hybridStintDeployBudgetMJ;

  const size_t prevSectorIdx = state.currentTrackNodeIndex;

  double dynamicDownforce =
      0.5 * p.airDensity * (state.currentSpeed * state.currentSpeed) *
      p.frontalArea * car.totalDownforceCl;
  double dynamicDrag =
      0.5 * p.airDensity * (state.currentSpeed * state.currentSpeed) *
      p.frontalArea * car.totalDragCd;

  double totalVerticalLoad =
      (car.calculatedTotalMass * p.gravity) + dynamicDownforce;
  double mechanicalSquat =
      totalVerticalLoad / (car.frontSpringStiffness + car.rearSpringStiffness);
  double activeDynamicRideHeight = car.rideHeight - mechanicalSquat;

  double frictionDragModifier = 1.0;
  if (activeDynamicRideHeight <= p.rideHeightScrapeLimit) {
    frictionDragModifier = p.scrapeDragModifier;
  }

  double netVerticalForce =
      (car.calculatedTotalMass * p.gravity) + dynamicDownforce;
  double effectiveTireFriction =
      p.tireFriction * car.tireGripMultiplier *
      (1.0 - state.tireWear * p.tireWearEffect) * mods.tireGripScale;
  double tireGripForce = netVerticalForce * effectiveTireFriction;

  const double kappa =
      track.maxCurvatureAhead(state.currentDistance, p.curvatureLookAheadM);
  const bool onStraight = kappa < p.straightCurvatureThreshold;
  const double cornerRadius =
      std::max(1.0 / std::max(kappa, 1e-9), p.minCornerRadiusM);
  const double maxCorneringSpeed = std::sqrt(
      (tireGripForce * cornerRadius) / car.calculatedTotalMass);
  const double targetSpeed = maxCorneringSpeed;

  double forceApplied = 0.0;
  bool isBraking = false;

  if (state.currentSpeed > (targetSpeed + p.brakeTriggerMargin)) {
    isBraking = true;
    double speedError = state.currentSpeed - targetSpeed;
    const double brakeHeatFade =
        1.0 - (state.brakeHeat * car.brakeFadeUnderHeat);
    double brakePedalPressure =
        std::min(car.brakeMaxPressure,
                 p.brakeBasePressure + (speedError * p.brakeGain)) *
        std::max(0.2, brakeHeatFade);
    forceApplied = -tireGripForce * brakePedalPressure;
    state.currentRPM = car.engine.maxRPM * p.brakeTargetRPMFactor;
    state.brakeHeat =
        std::min(1.0, state.brakeHeat + brakePedalPressure * deltaTime * 0.8);
    if (car.hybridRegenRate > 0.0) {
      const double regenMJ =
          car.hybridRegenRate * brakePedalPressure * deltaTime * 0.05;
      state.hybridDeployRemainingMJ = std::min(
          car.hybridStintDeployBudgetMJ,
          state.hybridDeployRemainingMJ + regenMJ);
    }
  } else {
    state.brakeHeat = std::max(0.0, state.brakeHeat - deltaTime * 0.35);

    const int desiredGear = SelectGearIndex(car, state.currentSpeed);
    if (desiredGear != state.currentGearIndex && state.shiftCooldownSec <= 0.0) {
      state.currentGearIndex = desiredGear;
      state.shiftCooldownSec = car.shiftDelaySec;
    }
    if (state.shiftCooldownSec > 0.0)
      state.shiftCooldownSec =
          std::max(0.0, state.shiftCooldownSec - deltaTime);

    const double gearRatio =
        car.gearRatios[std::clamp(state.currentGearIndex, 0, 7)];

    double speedClampedForRPM = std::max(p.minSpeed, state.currentSpeed);
    state.currentRPM =
        (speedClampedForRPM / p.wheelRadius) * gearRatio * (60.0 / (2.0 * M_PI));

    if (state.currentRPM > car.engine.maxRPM)
      state.currentRPM = car.engine.maxRPM;
    if (state.currentRPM < p.minRPM)
      state.currentRPM = p.minRPM;

    double rpmPercent = state.currentRPM / car.engine.maxRPM;
    double torqueCurveMultiplier =
        1.0 - std::pow(rpmPercent - p.torquePeakRPM, 2) * p.torqueFalloff;
    if (torqueCurveMultiplier < p.torqueMinFloor)
      torqueCurveMultiplier = p.torqueMinFloor;

    double activeEngineTorque = car.peakTorque * torqueCurveMultiplier;
    double wheelTorque = activeEngineTorque * gearRatio * p.finalDriveRatio;
    double engineForce = wheelTorque / p.wheelRadius;

    const double shiftPenalty =
        (state.shiftCooldownSec > 0.0) ? 0.35 : 1.0;
    engineForce *= shiftPenalty;

    if (!onStraight) {
      const double speedRatio =
          state.currentSpeed / std::max(maxCorneringSpeed, p.minSpeed);
      const double cornerDemand = std::clamp(speedRatio, 0.0, 1.0);
      engineForce *=
          p.cornerThrottleFactor * (1.0 - 0.32 * cornerDemand);
    }

    if (onStraight && car.hybridDeployPowerKW > 0.0 &&
        state.hybridDeployRemainingMJ > 0.0) {
      const double deployWatts = car.hybridDeployPowerKW * 1000.0;
      const double deployForce =
          deployWatts / std::max(state.currentSpeed, p.minSpeed);
      const double maxDeployForce = tireGripForce * 0.25;
      const double appliedDeploy =
          std::min(deployForce, maxDeployForce);
      engineForce += appliedDeploy;
      const double energyUsedMJ =
          (appliedDeploy * state.currentSpeed * deltaTime) / 1.0e6;
      state.hybridDeployRemainingMJ =
          std::max(0.0, state.hybridDeployRemainingMJ - energyUsedMJ);
    }

    forceApplied = engineForce - (dynamicDrag * frictionDragModifier);
    forceApplied *= mods.engineForceScale * mods.limpModeScale;

    state.fuelRemaining -= (car.fuelBurnRate * rpmPercent) * deltaTime;
    if (state.fuelRemaining < 0.0)
      state.fuelRemaining = 0.0;
    state.currentThermalLoad += (p.thermalLoadRate * rpmPercent) * deltaTime;
  }

  (void)isBraking;

  if (!onStraight && state.currentSpeed > p.tireWearSpeedThreshold) {
    const double lateralG =
        (state.currentSpeed * state.currentSpeed) / cornerRadius / p.gravity;
    state.tireWear +=
        car.tireWearRate * lateralG * lateralG * deltaTime;
    if (state.tireWear > 1.0)
      state.tireWear = 1.0;
  }

  double acceleration = forceApplied / car.calculatedTotalMass;
  state.currentSpeed += acceleration * deltaTime;

  if (state.currentSpeed < p.minSpeed)
    state.currentSpeed = p.minSpeed;

  double velocityCoolingFactor =
      (state.currentSpeed / p.coolingVelocityFactor) + p.coolingBaseFactor;
  state.currentThermalLoad -=
      (p.coolingRate * car.coolingCapacity * velocityCoolingFactor * deltaTime);
  if (state.currentThermalLoad < p.coolingIdleTemp)
    state.currentThermalLoad = p.coolingIdleTemp;

  double currentVibrationStrain =
      car.vibrationIndex * (state.currentRPM / car.engine.maxRPM);
  const double healthFactor =
      std::clamp(state.engineHealth / 100.0, 0.35, 1.0);
  state.engineHealth -=
      ((currentVibrationStrain / car.structuralRigidityFactor) *
       p.vibrationDamageRate * healthFactor) *
      deltaTime;

  if (state.currentThermalLoad > p.thermalOverheat) {
    const double overheat = state.currentThermalLoad - p.thermalOverheat;
    const double thermalScale = 1.0 / (1.0 + overheat * 0.08);
    state.engineHealth -=
        (p.thermalDamageRate * overheat * thermalScale * healthFactor) *
        deltaTime;
  }

  state.currentDistance += state.currentSpeed * deltaTime;
  state.elapsedRaceTime += deltaTime;
  state.currentLapTime += deltaTime;
  state.currentSectorTime += deltaTime;

  if (state.currentSpeed > state.currentSectorPeakSpeed) {
    state.currentSectorPeakSpeed = state.currentSpeed;
  }

  const double lapLength = track.lapLength();
  const bool lapComplete = lapLength > 0.0 && state.currentDistance >= lapLength;
  const size_t newSectorIdx =
      lapComplete ? 0 : track.sectorIndexAtDistance(state.currentDistance);

  if (newSectorIdx != prevSectorIdx || lapComplete) {
    if (telemetry) {
      telemetry->recordSectorCrossing(static_cast<int>(prevSectorIdx),
                                      state.currentSectorTime,
                                      state.currentSectorPeakSpeed);
    }
    state.currentSectorTime = 0.0;
    state.currentSectorPeakSpeed = 0.0;
  }

  if (lapComplete) {
    if (telemetry) {
      telemetry->completeLap(state.currentLap, state.currentLapTime,
                           state.fuelRemaining, state.engineHealth);
    }
    state.currentLap++;
    state.currentLapTime = 0.0;
    state.currentDistance -= lapLength;
  }

  state.currentTrackNodeIndex = track.sectorIndexAtDistance(state.currentDistance);
}
