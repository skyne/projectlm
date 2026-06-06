#ifndef SIMULATION_HPP
#define SIMULATION_HPP

#include "car_parts.hpp"
#include "track.hpp"

class TelemetryLog;

struct SimulationState {
  double currentDistance = 0.0;
  double currentSpeed = 0.0;
  double currentRPM = 0.0;
  double elapsedRaceTime = 0.0;
  double fuelRemaining = -1.0;
  double tireWear = 0.0;
  double engineHealth = 100.0;
  double currentThermalLoad = 70.0;
  double brakeHeat = 0.0;
  double hybridDeployRemainingMJ = -1.0;
  int currentGearIndex = 0;
  double shiftCooldownSec = 0.0;
  size_t currentTrackNodeIndex = 0;
  int currentLap = 1;
  double currentLapTime = 0.0;
  double currentSectorTime = 0.0;
  double currentSectorPeakSpeed = 0.0;
  ETireCompound activeTireCompound = ETireCompound::Medium;
  bool usingWetTyres = false;
};

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
};

struct SimulationModifiers {
  double tireGripScale = 1.0;
  double engineForceScale = 1.0;
  double limpModeScale = 1.0;
};

void TickSimulation(const CarConfig &car, const TrackDefinition &track,
                    SimulationState &state, double deltaTime,
                    const PhysicsConfig &physics,
                    TelemetryLog *telemetry = nullptr,
                    const SimulationModifiers *modifiers = nullptr);

#endif
