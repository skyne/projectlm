#ifndef SIMULATION_HPP
#define SIMULATION_HPP

#include "car_parts.hpp"
#include "track.hpp"
#include <algorithm>
#include <string>

class TelemetryLog;

enum class WheelIndex : int { FL = 0, FR = 1, RL = 2, RR = 3, Count = 4 };

inline int WheelIndexFromLabel(const std::string &label) {
  if (label == "FL" || label == "fl")
    return static_cast<int>(WheelIndex::FL);
  if (label == "FR" || label == "fr")
    return static_cast<int>(WheelIndex::FR);
  if (label == "RL" || label == "rl")
    return static_cast<int>(WheelIndex::RL);
  if (label == "RR" || label == "rr")
    return static_cast<int>(WheelIndex::RR);
  return -1;
}

struct SimulationState {
  double currentDistance = 0.0;
  double currentSpeed = 0.0;
  double currentRPM = 0.0;
  double elapsedRaceTime = 0.0;
  double fuelRemaining = -1.0;
  double tireWear[4] = {0.0, 0.0, 0.0, 0.0};
  double tireTempC[4] = {85.0, 85.0, 85.0, 85.0};
  double engineHealth = 100.0;
  double currentThermalLoad = 70.0;
  double brakeHeat = 0.0;
  double hybridDeployRemainingMJ = -1.0;
  double throttleBlend = 1.0;
  double batteryChargeMJ = -1.0;
  int currentGearIndex = 0;
  double shiftCooldownSec = 0.0;
  size_t currentTrackNodeIndex = 0;
  int currentLap = 1;
  double currentLapTime = 0.0;
  double currentSectorTime = 0.0;
  double currentSectorPeakSpeed = 0.0;

  double maxTireWear() const {
    return std::max({tireWear[0], tireWear[1], tireWear[2], tireWear[3]});
  }

  double effectiveGripTireWear() const {
    const double frontAxle =
        std::max(tireWear[static_cast<int>(WheelIndex::FL)],
                 tireWear[static_cast<int>(WheelIndex::FR)]);
    const double rearAxle =
        std::max(tireWear[static_cast<int>(WheelIndex::RL)],
                 tireWear[static_cast<int>(WheelIndex::RR)]);
    return 0.42 * frontAxle + 0.58 * rearAxle;
  }

  double maxTireTempC() const {
    return std::max({tireTempC[0], tireTempC[1], tireTempC[2], tireTempC[3]});
  }

  double effectiveGripTireTempFactor(double optimalTempC,
                                     double overheatTempC) const {
    auto wheelFactor = [&](int idx) {
      const double temp = tireTempC[idx];
      if (temp < optimalTempC - 12.0)
        return 0.96;
      if (temp > overheatTempC)
        return 1.0 - std::min(0.22, (temp - overheatTempC) * 0.009);
      return 1.0;
    };
    const double frontAxle = std::min(
        wheelFactor(static_cast<int>(WheelIndex::FL)),
        wheelFactor(static_cast<int>(WheelIndex::FR)));
    const double rearAxle = std::min(
        wheelFactor(static_cast<int>(WheelIndex::RL)),
        wheelFactor(static_cast<int>(WheelIndex::RR)));
    return 0.42 * frontAxle + 0.58 * rearAxle;
  }
};

struct SimulationModifiers {
  double speedCapMs = 0.0;
  double draftThrottleBoost = 0.0;
  double throttleMultiplier = 1.0;
  double wearMultiplier = 1.0;
  double wearLoadMultiplier = 1.0;
  double wearSpikePerWheel[4] = {0.0, 0.0, 0.0, 0.0};
  double tireTempSpikePerWheel[4] = {0.0, 0.0, 0.0, 0.0};
  double fuelMultiplier = 1.0;
  double skillFactor = 1.0;
  double mistakePenalty = 0.0;
  double hybridDeployScale = 1.0;
  double hybridRegenScale = 1.0;
  double weatherGripScale = 1.0;
  /** When > 0, overrides PhysicsConfig tireAmbientTempC for clamp/cool targets. */
  double tireAmbientTempC = -1.0;
  /** Multiplier on PhysicsConfig airDensity (from air temperature). */
  double airDensityScale = 1.0;
  /** Lap-averaged headwind added to effective airspeed for drag/downforce. */
  double windHeadwindMs = 0.0;
};

void AddTireWear(SimulationState &state, const double weights[4],
                 double amount);
void AddTireWearUniform(SimulationState &state, double amount);
void AddTireHeat(SimulationState &state, const double weights[4],
                 double amount);
void AddTireHeatUniform(SimulationState &state, double amount);
void ClampTireTemps(SimulationState &state, double ambientTempC);
void CornerTireWearWeights(double signedKappa, double weights[4]);
void LockupTireWearWeights(double signedKappa, double weights[4]);
void OverdriveTireWearWeights(double signedKappa, double weights[4]);
void RanWideTireWearWeights(double signedKappa, double weights[4]);

struct PhysicsConfig {
  double gravity = 9.81;
  double airDensity = 1.225;
  double frontalArea = 1.8;
  double wheelRadius = 0.33;
  double finalDriveRatio = 3.5;
  double cornerThrottleFactor = 0.45;
  double tireFriction = 1.6;
  double minSpeed = 1.0;
  double minRPM = 1500.0;
  double rideHeightScrapeLimit = 0.01;
  double scrapeDragModifier = 1.5;
  double gearRatios[6] = {4.5, 2.50, 1.85, 1.35, 1.05, 0.82};
  double gearShiftSpeeds[5] = {18.0, 38.0, 55.0, 72.0, 88.0};
  double brakeMaxPressure = 0.7;
  double brakeBasePressure = 0.1;
  double brakeGain = 0.05;
  double brakeTriggerMargin = 1.5;
  double brakeTargetRPMFactor = 0.3;
  double cornerGForceDivisor = 1.5;
  double curvatureLookAheadM = 120.0;
  double curvatureSampleStepM = 8.0;
  double straightCurvatureThreshold = 0.00008;
  double minCornerRadiusM = 35.0;
  double torquePeakRPM = 0.75;
  double torqueFalloff = 2.0;
  double torqueMinFloor = 0.4;
  double coolingVelocityFactor = 50.0;
  double coolingRate = 0.8;
  double coolingBaseFactor = 0.1;
  double coolingIdleTemp = 70.0;
  double thermalLoadRate = 2.2;
  double thermalOverheat = 105.0;
  double thermalDamageRate = 0.1;
  double vibrationDamageRate = 0.005;
  double tireWearEffect = 0.5;
  double tireWearSpeedThreshold = 15.0;
  double tireAmbientTempC = 55.0;
  double fuelOverrunFraction = 0.28;
  double thermalOverrunFraction = 0.22;
  /** WEC Hypercar deploy threshold (~120 km/h). */
  double hybridMinDeploySpeedMs = 33.33;
  /** Scales regenMJ = regenRate * brake * dt * hybridRegenBaseScale. */
  double hybridRegenBaseScale = 0.38;
};

void TickSimulation(const CarConfig &car, const TrackDefinition &track,
                    SimulationState &state, double deltaTime,
                    const PhysicsConfig &physics,
                    TelemetryLog *telemetry = nullptr,
                    const SimulationModifiers &mods = SimulationModifiers{});

/** Align gear with rejoin speed after pit exit (avoids 1st-gear ceiling trap). */
void SyncGearForSpeed(const CarConfig &car, SimulationState &state);

#endif
