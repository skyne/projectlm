#include "part_damage.hpp"
#include "simulation.hpp"
#include "telemetry.hpp"
#include <algorithm>
#include <cmath>

namespace {

void NormalizeWeights(double weights[4]) {
  double sum = weights[0] + weights[1] + weights[2] + weights[3];
  if (sum <= 1e-9) {
    for (int i = 0; i < 4; ++i)
      weights[i] = 0.25;
    return;
  }
  for (int i = 0; i < 4; ++i)
    weights[i] /= sum;
}

void SetAxleSplit(double weights[4], bool leftTurn, double inside, double outside) {
  const double frontShare = 0.42;
  const double rearShare = 0.58;
  if (leftTurn) {
    weights[static_cast<int>(WheelIndex::FL)] = frontShare * inside;
    weights[static_cast<int>(WheelIndex::FR)] = frontShare * outside;
    weights[static_cast<int>(WheelIndex::RL)] = rearShare * inside;
    weights[static_cast<int>(WheelIndex::RR)] = rearShare * outside;
  } else {
    weights[static_cast<int>(WheelIndex::FL)] = frontShare * outside;
    weights[static_cast<int>(WheelIndex::FR)] = frontShare * inside;
    weights[static_cast<int>(WheelIndex::RL)] = rearShare * outside;
    weights[static_cast<int>(WheelIndex::RR)] = rearShare * inside;
  }
}

double WheelWearScale(const CarConfig &car, int wheelIdx) {
  const bool front = wheelIdx <= static_cast<int>(WheelIndex::FR);
  return car.wheelWearFactor *
         (front ? car.frontAxleWearFactor : car.rearAxleWearFactor);
}

double WheelHeatScale(const CarConfig &car, int wheelIdx) {
  const bool front = wheelIdx <= static_cast<int>(WheelIndex::FR);
  return front ? car.frontAxleHeatFactor : car.rearAxleHeatFactor;
}

double WheelCoolScale(const CarConfig &car, int wheelIdx) {
  const bool front = wheelIdx <= static_cast<int>(WheelIndex::FR);
  return front ? car.frontAxleCoolFactor : car.rearAxleCoolFactor;
}

} // namespace

void AddTireWear(SimulationState &state, const double weights[4],
                 double amount) {
  if (amount <= 0.0)
    return;
  for (int i = 0; i < 4; ++i) {
    state.tireWear[i] += amount * weights[i];
    if (state.tireWear[i] > 1.0)
      state.tireWear[i] = 1.0;
  }
}

void AddTireWearUniform(SimulationState &state, double amount) {
  const double weights[4] = {0.25, 0.25, 0.25, 0.25};
  AddTireWear(state, weights, amount);
}

void AddTireHeat(SimulationState &state, const double weights[4],
                 double amount) {
  if (amount <= 0.0)
    return;
  for (int i = 0; i < 4; ++i)
    state.tireTempC[i] += amount * weights[i];
}

void AddTireHeatUniform(SimulationState &state, double amount) {
  const double weights[4] = {0.25, 0.25, 0.25, 0.25};
  AddTireHeat(state, weights, amount);
}

void ClampTireTemps(SimulationState &state, double ambientTempC) {
  for (int i = 0; i < 4; ++i) {
    if (state.tireTempC[i] < ambientTempC)
      state.tireTempC[i] = ambientTempC;
    if (state.tireTempC[i] > 140.0)
      state.tireTempC[i] = 140.0;
  }
}

void CornerTireWearWeights(double signedKappa, double weights[4]) {
  SetAxleSplit(weights, signedKappa >= 0.0, 0.34, 0.66);
}

void LockupTireWearWeights(double signedKappa, double weights[4]) {
  const bool leftTurn = signedKappa >= 0.0;
  const int outsideFront = leftTurn ? static_cast<int>(WheelIndex::FR)
                                    : static_cast<int>(WheelIndex::FL);
  const int insideFront = leftTurn ? static_cast<int>(WheelIndex::FL)
                                   : static_cast<int>(WheelIndex::FR);
  for (int i = 0; i < 4; ++i)
    weights[i] = 0.0;
  weights[outsideFront] = 0.58;
  weights[insideFront] = 0.22;
  weights[static_cast<int>(WheelIndex::RL)] = 0.10;
  weights[static_cast<int>(WheelIndex::RR)] = 0.10;
  NormalizeWeights(weights);
}

void OverdriveTireWearWeights(double signedKappa, double weights[4]) {
  SetAxleSplit(weights, signedKappa >= 0.0, 0.28, 0.72);
}

void RanWideTireWearWeights(double signedKappa, double weights[4]) {
  SetAxleSplit(weights, signedKappa >= 0.0, 0.22, 0.78);
}

static int SelectGearIndex(const CarConfig &car, double speed) {
  const int maxGear = std::max(1, std::min(car.gearCount, 8));
  int gear = 0;
  for (int i = 1; i < maxGear; ++i) {
    if (speed > car.gearShiftSpeeds[i - 1])
      gear = i;
  }
  return gear;
}

static double DrivenWheelRadius(const CarConfig &car) {
  return std::max(0.25, (car.frontWheelRadiusM + car.rearWheelRadiusM) * 0.5);
}

static double KinematicRPM(double speed, double gearRatio, double wheelRadius,
                           double finalDrive) {
  return (std::max(speed, 0.01) / wheelRadius) * gearRatio * finalDrive *
         (60.0 / (2.0 * M_PI));
}

static double MaxSpeedForGear(int maxRPM, double gearRatio, double wheelRadius,
                              double finalDrive) {
  return (static_cast<double>(maxRPM) * (2.0 * M_PI) * wheelRadius) /
         (60.0 * gearRatio * finalDrive);
}

static double RevLimiterTorqueFactor(double kinematicRPM, int maxRPM) {
  const double limit = static_cast<double>(maxRPM);
  if (kinematicRPM <= limit)
    return 1.0;
  const double overshoot = (kinematicRPM - limit) / limit;
  return std::max(0.0, 1.0 - overshoot * 30.0);
}

void SyncGearForSpeed(const CarConfig &car, SimulationState &state) {
  const int maxGear = std::max(1, std::min(car.gearCount, 8));
  const double drivenWheelRadius = DrivenWheelRadius(car);
  const double finalDrive =
      car.finalDriveRatio > 0.0 ? car.finalDriveRatio : 3.5;

  const int desiredGear = SelectGearIndex(car, state.currentSpeed);
  int gear = std::clamp(state.currentGearIndex, 0, maxGear - 1);

  if (desiredGear > gear) {
    gear = desiredGear;
  } else if (desiredGear < gear) {
    const double maxInDesired = MaxSpeedForGear(
        car.engine.maxRPM,
        car.gearRatios[std::clamp(desiredGear, 0, 7)], drivenWheelRadius,
        finalDrive);
    if (state.currentSpeed < maxInDesired - 0.2)
      gear = desiredGear;
  }

  const double maxInGear = MaxSpeedForGear(
      car.engine.maxRPM, car.gearRatios[std::clamp(gear, 0, 7)],
      drivenWheelRadius, finalDrive);
  if (state.currentSpeed >= maxInGear - 0.2 && gear < maxGear - 1)
    ++gear;

  state.currentGearIndex = gear;
  state.shiftCooldownSec = 0.0;
}

void TickSimulation(const CarConfig &car, const TrackDefinition &track,
                    SimulationState &state, double deltaTime,
                    const PhysicsConfig &p, TelemetryLog *telemetry,
                    const SimulationModifiers &mods) {
  if (track.sectors.empty())
    return;

  if (state.fuelRemaining < 0.0)
    state.fuelRemaining = car.fuelTankCapacity;
  if (state.hybridDeployRemainingMJ < 0.0)
    state.hybridDeployRemainingMJ = car.hybridStintDeployBudgetMJ;
  if (state.batteryChargeMJ < 0.0)
    state.batteryChargeMJ = car.hybridStintDeployBudgetMJ;

  const size_t prevSectorIdx = state.currentTrackNodeIndex;
  const double finalDrive =
      car.finalDriveRatio > 0.0 ? car.finalDriveRatio : p.finalDriveRatio;

  const double kappa =
      track.maxCurvatureAhead(state.currentDistance, p.curvatureLookAheadM);
  const bool onStraight = kappa < p.straightCurvatureThreshold;
  const double signedKappa =
      track.signedCurvatureAtDistance(state.currentDistance);
  const double cornerRadius =
      std::max(1.0 / std::max(kappa, 1e-9), p.minCornerRadiusM);

  const double kTireAmbientC =
      mods.tireAmbientTempC > 0.0 ? mods.tireAmbientTempC : p.tireAmbientTempC;
  const double airDensity = p.airDensity * std::max(0.85, mods.airDensityScale);
  const double effectiveSpeed =
      std::max(0.0, state.currentSpeed + mods.windHeadwindMs);
  const double kTireOptimalC = car.tireOptimalTempC;
  constexpr double kTireOverheatC = 115.0;
  const double lapLength = track.lapLength();
  const double lapFraction =
      lapLength > 0.0
          ? std::max(0.0, state.currentSpeed * deltaTime / lapLength)
          : 0.0;
  double cornerLoad = 0.0;
  if (!onStraight && state.currentSpeed > p.tireWearSpeedThreshold) {
    const double lateralG =
        (state.currentSpeed * state.currentSpeed) / cornerRadius / p.gravity;
    constexpr double kMaxWearCornerLoad = 2.5;
    cornerLoad = std::min(
        kMaxWearCornerLoad, lateralG / std::max(0.5, p.cornerGForceDivisor));
    const double heatAmount = cornerLoad * cornerLoad * 0.36 * deltaTime;
    double cornerWeights[4];
    CornerTireWearWeights(signedKappa, cornerWeights);
    const double maxCornerWeight =
        *std::max_element(cornerWeights, cornerWeights + 4);
    for (int i = 0; i < 4; ++i) {
      const double heatShare =
          maxCornerWeight > 1e-9 ? cornerWeights[i] / maxCornerWeight : 1.0;
      state.tireTempC[i] += heatAmount * heatShare * WheelHeatScale(car, i);
    }
    // Catalog wear_rate: fraction of tyre life per lap at ~1 corner-load unit.
    const double wearBase = car.tireWearRate * mods.wearMultiplier *
                            mods.wearLoadMultiplier * cornerLoad * lapFraction;
    for (int i = 0; i < 4; ++i) {
      state.tireWear[i] +=
          wearBase * cornerWeights[i] * WheelWearScale(car, i);
      if (state.tireWear[i] > 1.0)
        state.tireWear[i] = 1.0;
    }
  }
  {
    for (int i = 0; i < 4; ++i) {
      if (mods.wearSpikePerWheel[i] <= 0.0)
        continue;
      state.tireWear[i] += mods.wearSpikePerWheel[i];
      if (state.tireWear[i] > 1.0)
        state.tireWear[i] = 1.0;
    }
  }
  {
    for (int i = 0; i < 4; ++i) {
      if (mods.tireTempSpikePerWheel[i] <= 0.0)
        continue;
      state.tireTempC[i] += mods.tireTempSpikePerWheel[i];
    }
  }

  double dynamicDownforce =
      0.5 * airDensity * (effectiveSpeed * effectiveSpeed) * p.frontalArea *
      car.totalDownforceCl;
  double dynamicDrag =
      0.5 * airDensity * (effectiveSpeed * effectiveSpeed) * p.frontalArea *
      car.totalDragCd;

  double totalVerticalLoad =
      (car.calculatedTotalMass * p.gravity) + dynamicDownforce;
  double mechanicalSquat =
      totalVerticalLoad /
      ((car.frontSpringStiffness + car.rearSpringStiffness) *
       std::max(0.5, car.aeroPlatformStability));
  const double avgRideHeight =
      (car.frontRideHeightM + car.rearRideHeightM) * 0.5;
  double activeDynamicRideHeight = avgRideHeight - mechanicalSquat;

  double frictionDragModifier = 1.0;
  if (activeDynamicRideHeight <= p.rideHeightScrapeLimit) {
    frictionDragModifier = p.scrapeDragModifier;
  }

  const double widthGripFactor =
      0.38 * car.frontAxleGripFactor + 0.62 * car.rearAxleGripFactor;
  double netVerticalForce =
      (car.calculatedTotalMass * p.gravity) + dynamicDownforce;
  double effectiveTireFriction =
      p.tireFriction * car.tireGripMultiplier * car.wheelGripFactor *
      widthGripFactor * car.suspensionMechanicalGrip *
      (1.0 - state.effectiveGripTireWear() * p.tireWearEffect);
  effectiveTireFriction *=
      state.effectiveGripTireTempFactor(kTireOptimalC, kTireOverheatC);
  effectiveTireFriction *= std::max(0.15, mods.weatherGripScale);
  double tireGripForce = netVerticalForce * effectiveTireFriction;

  const double maxCorneringSpeedBase =
      std::sqrt((tireGripForce * cornerRadius) / car.calculatedTotalMass) *
      std::sqrt(std::max(0.75, car.rollStiffnessFactor)) *
      car.tyreBalanceFactor;

  const auto damperAxleStability = [](int bump, int rebound) {
    return (1.0 - 0.02 * std::abs(bump - 8) +
            1.0 - 0.02 * std::abs(rebound - 8)) *
           0.5;
  };
  const double damperStability =
      0.5 * damperAxleStability(car.frontDamperBump, car.frontDamperRebound) +
      0.5 * damperAxleStability(car.rearDamperBump, car.rearDamperRebound);
  constexpr double kHighSpeedDamperOnsetMs = 38.0;
  constexpr double kHighSpeedDamperFullMs = 55.0;
  double damperCorneringScale = 1.0;
  if (state.currentSpeed > kHighSpeedDamperOnsetMs) {
    const double blend = std::clamp(
        (state.currentSpeed - kHighSpeedDamperOnsetMs) /
            std::max(1.0, kHighSpeedDamperFullMs - kHighSpeedDamperOnsetMs),
        0.0, 1.0);
    damperCorneringScale = 1.0 - blend * (1.0 - damperStability);
  }
  const double maxCorneringSpeed =
      maxCorneringSpeedBase * damperCorneringScale;
  double targetSpeed = maxCorneringSpeed * mods.skillFactor;

  if (mods.mistakePenalty > 0.0)
    targetSpeed = std::max(p.minSpeed, targetSpeed - mods.mistakePenalty);

  const bool outOfFuel = state.fuelRemaining <= 0.0;

  const double drivenWheelRadius = DrivenWheelRadius(car);
  const int maxGear = std::max(1, std::min(car.gearCount, 8));
  const double maxEngineRPM =
      std::max(1.0, static_cast<double>(car.engine.maxRPM));

  double forceApplied = 0.0;
  bool isBraking = false;
  double brakePedalPressure = 0.0;
  double throttleLoad = 0.0;
  double rpmPercent = 0.0;
  double cornerThrottleFactor = 1.0;
  double generatorFuelKw = 0.0;

  if (outOfFuel) {
    const double rolling = tireGripForce * 0.12;
    const double engineBraking =
        state.currentSpeed > 2.0 ? tireGripForce * 0.35 : 0.0;
    forceApplied =
        -(dynamicDrag * frictionDragModifier + rolling + engineBraking);
    state.currentRPM = std::max(0.0, state.currentRPM * 0.85);
    state.brakeHeat = std::max(0.0, state.brakeHeat - deltaTime * 0.35);
    throttleLoad = 0.0;
    rpmPercent = 0.0;
  } else if (state.currentSpeed > (targetSpeed + p.brakeTriggerMargin)) {
    isBraking = true;
    const double speedError = state.currentSpeed - targetSpeed;
    const double brakeHeatFade =
        1.0 - (state.brakeHeat * car.brakeFadeUnderHeat);
    brakePedalPressure =
        std::min(car.brakeMaxPressure,
                 p.brakeBasePressure + (speedError * p.brakeGain)) *
        std::max(0.2, brakeHeatFade);
    forceApplied = -tireGripForce * brakePedalPressure;
    state.brakeHeat =
        std::min(1.0, state.brakeHeat + brakePedalPressure * deltaTime * 0.8);

    const double gearRatio =
        car.gearRatios[std::clamp(state.currentGearIndex, 0, 7)];
    const double kinematicRPM = KinematicRPM(
        state.currentSpeed, gearRatio, drivenWheelRadius, finalDrive);
    state.currentRPM =
        std::clamp(kinematicRPM * 0.55, p.minRPM, maxEngineRPM);

    throttleLoad = p.fuelOverrunFraction + brakePedalPressure * 0.08;
    rpmPercent = state.currentRPM / maxEngineRPM;

    if (car.hybridRegenRate > 0.0 && mods.hybridRegenScale > 0.0) {
      const double regenMJ = car.hybridRegenRate * brakePedalPressure * deltaTime *
                             p.hybridRegenBaseScale * mods.hybridRegenScale;
      state.hybridDeployRemainingMJ = std::min(
          car.hybridStintDeployBudgetMJ,
          state.hybridDeployRemainingMJ + regenMJ);
    }
  } else {
    state.brakeHeat = std::max(0.0, state.brakeHeat - deltaTime * 0.35);

    if (state.shiftCooldownSec > 0.0)
      state.shiftCooldownSec =
          std::max(0.0, state.shiftCooldownSec - deltaTime);

    double gearRatio =
        car.gearRatios[std::clamp(state.currentGearIndex, 0, 7)];
    double kinematicRPM = KinematicRPM(
        state.currentSpeed, gearRatio, drivenWheelRadius, finalDrive);

    if (kinematicRPM >= maxEngineRPM * 0.96 &&
        state.currentGearIndex < maxGear - 1 &&
        state.shiftCooldownSec <= 0.0) {
      state.currentGearIndex++;
      state.shiftCooldownSec = car.shiftDelaySec * 0.55;
      gearRatio = car.gearRatios[std::clamp(state.currentGearIndex, 0, 7)];
      kinematicRPM = KinematicRPM(state.currentSpeed, gearRatio,
                                  drivenWheelRadius, finalDrive);
    }

    const int desiredGear = SelectGearIndex(car, state.currentSpeed);
    if (desiredGear > state.currentGearIndex && state.shiftCooldownSec <= 0.0) {
      state.currentGearIndex = desiredGear;
      state.shiftCooldownSec = car.shiftDelaySec;
      gearRatio = car.gearRatios[std::clamp(state.currentGearIndex, 0, 7)];
      kinematicRPM = KinematicRPM(state.currentSpeed, gearRatio,
                                  drivenWheelRadius, finalDrive);
    } else if (desiredGear < state.currentGearIndex &&
               state.shiftCooldownSec <= 0.0) {
      const double maxInDesired = MaxSpeedForGear(
          car.engine.maxRPM,
          car.gearRatios[std::clamp(desiredGear, 0, 7)], drivenWheelRadius,
          finalDrive);
      if (state.currentSpeed < maxInDesired - 0.2) {
        state.currentGearIndex = desiredGear;
        state.shiftCooldownSec = car.shiftDelaySec;
        gearRatio = car.gearRatios[std::clamp(state.currentGearIndex, 0, 7)];
        kinematicRPM = KinematicRPM(state.currentSpeed, gearRatio,
                                    drivenWheelRadius, finalDrive);
      }
    }

    state.currentRPM = std::clamp(kinematicRPM, p.minRPM, maxEngineRPM);
    rpmPercent = state.currentRPM / maxEngineRPM;

    const double peakRatio =
        car.torquePeakRatio > 0.0 ? car.torquePeakRatio : p.torquePeakRPM;
    const double falloff =
        car.torqueCurveFalloff > 0.0 ? car.torqueCurveFalloff : p.torqueFalloff;
    double torqueCurveMultiplier =
        1.0 - std::pow(rpmPercent - peakRatio, 2) * falloff;
    if (torqueCurveMultiplier < p.torqueMinFloor)
      torqueCurveMultiplier = p.torqueMinFloor;

    const double lagTau = std::max(0.01, car.throttleLagTau);
    state.throttleBlend +=
        (1.0 - state.throttleBlend) * std::min(1.0, deltaTime / lagTau);

    double engineForce = 0.0;
    if (car.isElectricDrive) {
      double electricalKw = car.electricalDeployKW;
      if (car.isGeneratorOnly) {
        const double demandKw =
            (car.peakHorsepower / 1.34) *
            torqueCurveMultiplier * state.throttleBlend;
        const double genKw =
            std::min(car.generatorPowerKW * car.drivetrainEfficiency, demandKw);
        generatorFuelKw = genKw;
        electricalKw = genKw;
        if (state.batteryChargeMJ > 0.0 && demandKw > genKw) {
          const double burstKw =
              std::min(demandKw - genKw, car.hybridDeployPowerKW);
          electricalKw += burstKw;
          const double burstMJ = (burstKw * 1000.0 * deltaTime) / 1.0e6;
          state.batteryChargeMJ =
              std::max(0.0, state.batteryChargeMJ - burstMJ);
        }
      } else {
        electricalKw *= torqueCurveMultiplier * state.throttleBlend;
        if (state.batteryChargeMJ > 0.0) {
          const double usedMJ = (electricalKw * 1000.0 * deltaTime) / 1.0e6;
          state.batteryChargeMJ =
              std::max(0.0, state.batteryChargeMJ - usedMJ);
        }
      }
      engineForce =
          (electricalKw * 1000.0) / std::max(state.currentSpeed, p.minSpeed);
    } else {
      const double activeEngineTorque = car.peakTorque * torqueCurveMultiplier;
      const double wheelTorque =
          activeEngineTorque * gearRatio * finalDrive;
      engineForce = wheelTorque / drivenWheelRadius;
    }

    const double shiftPenalty =
        (car.isElectricDrive || state.shiftCooldownSec <= 0.0) ? 1.0 : 0.35;
    engineForce *= shiftPenalty * mods.throttleMultiplier *
                   car.engineThrottleResponse * state.throttleBlend *
                   (1.0 + std::min(0.06, mods.draftThrottleBoost));

    cornerThrottleFactor = 1.0;
    if (!onStraight) {
      const double speedRatio =
          state.currentSpeed / std::max(maxCorneringSpeed, p.minSpeed);
      const double cornerDemand = std::clamp(speedRatio, 0.0, 1.0);
      cornerThrottleFactor =
          p.cornerThrottleFactor * (1.0 - 0.32 * cornerDemand);
      engineForce *= cornerThrottleFactor;
    }

    const double revLimiterFactor =
        RevLimiterTorqueFactor(kinematicRPM, car.engine.maxRPM);
    engineForce *= revLimiterFactor;

    const double maxSpeedInGear = MaxSpeedForGear(
        car.engine.maxRPM, gearRatio, drivenWheelRadius, finalDrive);
    if (state.currentSpeed >= maxSpeedInGear - 0.2 && engineForce > 0.0 &&
        state.currentGearIndex >= maxGear - 1)
      engineForce = 0.0;

    if (onStraight && car.hybridDeployPowerKW > 0.0 &&
        state.hybridDeployRemainingMJ > 0.0 &&
        state.currentSpeed >= p.hybridMinDeploySpeedMs &&
        state.throttleBlend >= 0.55 && mods.hybridDeployScale > 0.0) {
      const double deployWatts = car.hybridDeployPowerKW * 1000.0 *
                                 mods.hybridDeployScale * state.throttleBlend;
      const double deployForce =
          deployWatts / std::max(state.currentSpeed, p.minSpeed);
      const double maxDeployForce = tireGripForce * 0.25;
      const double appliedDeploy = std::min(deployForce, maxDeployForce);
      engineForce += appliedDeploy * revLimiterFactor;
      const double energyUsedMJ =
          (appliedDeploy * state.currentSpeed * deltaTime) / 1.0e6;
      state.hybridDeployRemainingMJ =
          std::max(0.0, state.hybridDeployRemainingMJ - energyUsedMJ);
    }

    forceApplied = engineForce - (dynamicDrag * frictionDragModifier);

    throttleLoad = std::clamp(
        state.throttleBlend * mods.throttleMultiplier * cornerThrottleFactor,
        0.12, 1.15);
  }

  if (!outOfFuel) {
    if (car.isGeneratorOnly) {
      state.fuelRemaining -=
          (generatorFuelKw * 0.00032 * car.powertrainFuelBurnMult *
           mods.fuelMultiplier) *
          deltaTime;
    } else if (!car.isElectricDrive) {
      const double fuelLoad = rpmPercent * throttleLoad * mods.fuelMultiplier;
      state.fuelRemaining -= car.fuelBurnRate * fuelLoad * deltaTime;
    }
    if (state.fuelRemaining < 0.0)
      state.fuelRemaining = 0.0;
  }

  if (!outOfFuel) {
    if (car.isElectricDrive && !car.isGeneratorOnly) {
      throttleLoad = std::max(throttleLoad, state.throttleBlend * 0.35);
    }
    const double thermalLoad =
        rpmPercent * std::max(throttleLoad, p.thermalOverrunFraction) *
        car.powertrainThermalMult;
    const double velocityCoolingFactor =
        (state.currentSpeed / p.coolingVelocityFactor) + p.coolingBaseFactor;
    const double coolingPower =
        p.coolingRate * car.coolingCapacity * car.ductAirflowFactor *
        velocityCoolingFactor;
    const double heatIn = p.thermalLoadRate * thermalLoad;
    const double coolOut = coolingPower;
    state.currentThermalLoad += (heatIn - coolOut) * deltaTime;
    if (heatIn > coolOut * 0.25) {
      const double loadRatio = heatIn / std::max(coolOut, 0.05);
      const double targetTemp =
          p.coolingIdleTemp +
          (loadRatio / (loadRatio + 1.0)) *
              (p.thermalOverheat - p.coolingIdleTemp) * 0.88;
      state.currentThermalLoad +=
          (targetTemp - state.currentThermalLoad) *
          std::min(1.0, deltaTime * 0.18);
    }
    state.currentThermalLoad =
        std::clamp(state.currentThermalLoad, p.coolingIdleTemp - 4.0,
                   p.thermalOverheat + 8.0);
  }

  double acceleration = forceApplied / car.calculatedTotalMass;
  state.currentSpeed += acceleration * deltaTime;

  if (outOfFuel) {
    state.currentSpeed = std::max(0.0, state.currentSpeed);
  } else if (state.currentSpeed < p.minSpeed) {
    state.currentSpeed = p.minSpeed;
  }

  if (mods.speedCapMs > 0.0 && state.currentSpeed > mods.speedCapMs) {
    const double blend = std::min(1.0, deltaTime * 4.0);
    state.currentSpeed += (mods.speedCapMs - state.currentSpeed) * blend;
  }

  if (isBraking && state.currentSpeed > p.tireWearSpeedThreshold) {
    const double brakeTireHeat =
        brakePedalPressure * state.currentSpeed * 0.055 * deltaTime;
    state.tireTempC[static_cast<int>(WheelIndex::FL)] +=
        brakeTireHeat * 0.52 * WheelHeatScale(car, static_cast<int>(WheelIndex::FL));
    state.tireTempC[static_cast<int>(WheelIndex::FR)] +=
        brakeTireHeat * 0.52 * WheelHeatScale(car, static_cast<int>(WheelIndex::FR));
  }
  {
    const double straightWarmth =
        0.62 + std::min(0.16, state.currentSpeed * 0.0018);
    const double coolTarget =
        onStraight
            ? (kTireAmbientC + (kTireOptimalC - kTireAmbientC) * straightWarmth)
            : (kTireOptimalC +
               std::min(8.0, cornerLoad * 4.0));
    const double coolRate = onStraight ? 0.045 : 0.032;
    for (int i = 0; i < 4; ++i) {
      state.tireTempC[i] +=
          (coolTarget - state.tireTempC[i]) * coolRate *
          WheelCoolScale(car, i) * deltaTime;
    }
  }
  ClampTireTemps(state, kTireAmbientC);
  for (int i = 0; i < 4; ++i) {
    if (state.tireTempC[i] <= kTireOverheatC)
      continue;
    const double over = (state.tireTempC[i] - kTireOverheatC) / 25.0;
    const double overheatWear =
        car.tireWearRate * over * 0.12 * lapFraction * WheelWearScale(car, i);
    state.tireWear[i] += overheatWear;
    if (state.tireWear[i] > 1.0)
      state.tireWear[i] = 1.0;
  }

  static const PartCatalog kDamageCatalog{};
  CarDamageProfiles damageProfiles;
  BuildCarDamageProfiles(car, kDamageCatalog, damageProfiles);

  double currentVibrationStrain =
      car.vibrationIndex *
      (state.currentRPM / std::max(1.0, static_cast<double>(car.engine.maxRPM)));
  SyncDerivedEngineHealth(state, car);
  const double healthFactor =
      std::clamp(state.engineHealth / 100.0, 0.35, 1.0);
  const double vibWear =
      ((currentVibrationStrain / car.structuralRigidityFactor) *
       p.vibrationDamageRate * healthFactor) *
      deltaTime;
  ApplyPartWear(state.partDamage, DamagePart::Engine, vibWear * 0.82,
                damageProfiles.profiles[DamagePartIndex(DamagePart::Engine)]);
  ApplyPartWear(state.partDamage, DamagePart::Gearbox, vibWear * 0.18,
                damageProfiles.profiles[DamagePartIndex(DamagePart::Gearbox)]);

  if (state.currentThermalLoad > p.thermalOverheat) {
    const double overheat = state.currentThermalLoad - p.thermalOverheat;
    const double thermalScale = 1.0 / (1.0 + overheat * 0.08);
    const double thermalWear =
        (p.thermalDamageRate * overheat * thermalScale * healthFactor) *
        deltaTime;
    ApplyPartWear(state.partDamage, DamagePart::Engine, thermalWear * 0.65,
                  damageProfiles.profiles[DamagePartIndex(DamagePart::Engine)]);
    ApplyPartWear(state.partDamage, DamagePart::Cooling, thermalWear * 0.35,
                  damageProfiles.profiles[DamagePartIndex(DamagePart::Cooling)]);
  }

  ApplyHiddenFaultBleed(state.partDamage, deltaTime);
  RevealEscalatedHiddenFaults(state.partDamage);
  TickTyreDeflationRisk(state, car, deltaTime, p.punctureWearThreshold);
  TickDeflatedTyreBodyDamage(state, damageProfiles, deltaTime,
                             p.tireWearSpeedThreshold * 0.5);
  SyncDerivedEngineHealth(state, car);

  state.currentDistance += state.currentSpeed * deltaTime;
  state.elapsedRaceTime += deltaTime;
  state.currentLapTime += deltaTime;
  state.currentSectorTime += deltaTime;

  if (state.currentSpeed > state.currentSectorPeakSpeed) {
    state.currentSectorPeakSpeed = state.currentSpeed;
  }

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
