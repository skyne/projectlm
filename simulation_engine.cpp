#include "simulation_engine.hpp"
#include <cmath>
#include <fstream>
#include <iostream>
#include <sstream>

constexpr double GRAVITY = 9.81;
constexpr double AIR_DENSITY = 1.225;

// --- INTERNAL FACTORY CATALOG MODULES ---
ChassisPart GetChassisStats(EChassis type) {
  if (type == EChassis::Spaceframe)
    return {120.0, 0.6, 0.05};
  return {75.0, 1.2, 0.01}; // CarbonMonocoque: lighter, stiffer, slicker
}

FrontAeroPart GetFrontAeroStats(EFrontAero type) {
  if (type == EFrontAero::HighDownforceSplitter)
    return {15.0, 1.2, 0.12};
  return {8.0, 0.5, 0.04}; // LowDragNose
}

RearAeroPart GetRearAeroStats(ERearAero type) {
  if (type == ERearAero::HighDownforceWing)
    return {25.0, 1.8, 0.22};
  if (type == ERearAero::WinglessGroundEffect)
    return {10.0, 1.3, 0.08,
            true};          // 9X8 Concept: Low drag, decent downforce via floor
  return {18.0, 1.0, 0.14}; // StandardWing
}

CoolingPart GetCoolingStats(ECoolingPack type) {
  if (type == ECoolingPack::SprintSlimline)
    return {10.0, 0.03, 0.8};
  return {25.0, 0.09,
          1.5}; // EnduranceHeavyDuty: heavier, drags more air, massive cooling
}

void CompileCarArchitecture(CarConfig &car) {
  // 1. Fetch Structural Component Properties from Catalog Database
  ChassisPart ch = GetChassisStats(car.chassisChoice);
  FrontAeroPart fa = GetFrontAeroStats(car.frontAeroChoice);
  RearAeroPart ra = GetRearAeroStats(car.rearAeroChoice);
  CoolingPart cp = GetCoolingStats(car.coolingChoice);

  // 2. Compute Rigid Component Performance baselines
  car.totalDragCd = 0.25 + ch.baselineDrag + fa.dragCd + ra.dragCd + cp.dragCd;
  car.totalDownforceCl = fa.downforceCl + ra.downforceCl;
  car.structuralRigidityFactor = ch.structuralRigidity;
  car.coolingCapacity = cp.thermalDissipationRate;

  // Advanced Ground Effect Physics Modifier (Wingless / Low Ride Height
  // Balance)
  if (ra.permitsWinglessPitch) {
    // Lower ride height exponentially scales venturi tunnel suction performance
    double groundSuckEfficiency = 0.05 / (car.rideHeight + 0.01);
    car.totalDownforceCl += (0.6 * groundSuckEfficiency);

    // Wingless configurations benefit from clean, non-turbulent structural
    // trailing wakes
    car.totalDragCd -= 0.04;
  }

  // 3. Engine Architecture Formulas (Retained & Scaled)
  double radius = car.engine.bore / 2.0;
  double volumeCubicMeters =
      car.engine.cylinders * M_PI * (radius * radius) * car.engine.stroke;
  double displacementLiters = volumeCubicMeters * 1000.0;

  double engineWeight =
      (displacementLiters * 35.0) + (car.engine.cylinders * 5.0);
  if (car.engine.fuelType == "Diesel")
    engineWeight *= 1.3;

  // Dynamic Global Weight Consolidation
  car.calculatedTotalMass = ch.mass + fa.mass + ra.mass + cp.mass +
                            engineWeight + 150.0; // 150kg generic fluids/driver

  double boreStrokeRatio = car.engine.bore / car.engine.stroke;
  car.peakTorque = displacementLiters * 110.0 * (1.0 / boreStrokeRatio);
  car.peakHorsepower = (car.peakTorque * car.engine.maxRPM) / 7127.0;

  car.vibrationIndex = car.engine.baseVibrationFactor *
                       (car.engine.stroke / 0.080) *
                       (car.engine.maxRPM / 6000.0);
  car.fuelBurnRate = (displacementLiters * 0.15) * (car.engine.maxRPM / 5000.0);
}

void TickSimulation(const CarConfig &car, const std::vector<TrackNode> &track,
                    SimulationState &state, double deltaTime) {
  if (track.empty())
    return;
  const TrackNode &currentSector = track[state.currentTrackNodeIndex];

  // 1. Calculate Aerodynamics
  double dynamicDownforce = 0.5 * AIR_DENSITY *
                            (state.currentSpeed * state.currentSpeed) * 1.8 *
                            car.totalDownforceCl;
  double dynamicDrag = 0.5 * AIR_DENSITY *
                       (state.currentSpeed * state.currentSpeed) * 1.8 *
                       car.totalDragCd;

  // 2. Suspension Mechanical Deflection
  double totalVerticalLoad =
      (car.calculatedTotalMass * GRAVITY) + dynamicDownforce;
  double mechanicalSquat =
      totalVerticalLoad / (car.frontSpringStiffness + car.rearSpringStiffness);
  double activeDynamicRideHeight = car.rideHeight - mechanicalSquat;

  double frictionDragModifier = 1.0;
  if (activeDynamicRideHeight <= 0.01) {
    frictionDragModifier =
        1.5; // Scraping the floor plank adds high mechanical drag
  }

  // 3. Dynamic Corner Physics Limit
  double netVerticalForce =
      (car.calculatedTotalMass * GRAVITY) + dynamicDownforce;
  double tireGripForce =
      netVerticalForce * 1.6; // 1.6 tire friction coefficient
  double targetSpeed = currentSector.maxSafeSpeed;

  if (!currentSector.isStraightaway) {
    // Centripetal Force Limit: Max Speed = sqrt((Grip * Radius) / Mass)
    double structuralCornerRadius =
        (currentSector.maxSafeSpeed * currentSector.maxSafeSpeed) /
        (GRAVITY * 1.5);
    double physicalMaxSpeed = std::sqrt(
        (tireGripForce * structuralCornerRadius) / car.calculatedTotalMass);

    if (targetSpeed > physicalMaxSpeed) {
      targetSpeed = physicalMaxSpeed; // The car physically slides off track if
                                      // it tries to go faster
    }
  }

  // 4. Driver Intelligence & Speed Governor State Machine
  double forceApplied = 0.0;

  // --- REALISTIC POWER BAND AND AERODYNAMIC ADJUSTMENT ---
  if (state.currentSpeed > (targetSpeed + 1.5)) {
    double speedError = state.currentSpeed - targetSpeed;
    double brakePedalPressure = std::min(0.7, 0.1 + (speedError * 0.05));
    forceApplied = -tireGripForce * brakePedalPressure;
    state.currentRPM = car.engine.maxRPM * 0.3;
  } else {
    double gearRatio = 4.5;
    if (state.currentSpeed > 88.0)
      gearRatio = 0.82; // 6th Gear (Scaled for ~345 km/h cap)
    else if (state.currentSpeed > 72.0)
      gearRatio = 1.05; // 5th Gear
    else if (state.currentSpeed > 55.0)
      gearRatio = 1.35; // 4th Gear
    else if (state.currentSpeed > 38.0)
      gearRatio = 1.85; // 3rd Gear
    else if (state.currentSpeed > 18.0)
      gearRatio = 2.50; // 2nd Gear

    double speedClampedForRPM = std::max(2.0, state.currentSpeed);
    state.currentRPM =
        (speedClampedForRPM / 0.33) * gearRatio * (60.0 / (2.0 * M_PI));

    if (state.currentRPM > car.engine.maxRPM)
      state.currentRPM = car.engine.maxRPM;
    if (state.currentRPM < 1500.0)
      state.currentRPM = 1500.0;

    // SIMULATE A TORQUE CURVE: Engine power peaks at 75% of max RPM, drops off
    // at limits
    double rpmPercent = state.currentRPM / car.engine.maxRPM;
    double torqueCurveMultiplier = 1.0 - std::pow(rpmPercent - 0.75, 2) * 2.0;
    if (torqueCurveMultiplier < 0.4)
      torqueCurveMultiplier = 0.4; // Minimum torque safety floor

    // Apply the dynamic torque scaling
    double activeEngineTorque = car.peakTorque * torqueCurveMultiplier;
    double wheelTorque =
        activeEngineTorque * gearRatio * 3.5; // Final Drive optimization
    double engineForce = wheelTorque / 0.33;

    if (!currentSector.isStraightaway) {
      engineForce *= 0.45; // Smooth maintenance throttle
    }

    // Force application balancing engine output directly against high-velocity
    // drag layers
    forceApplied = engineForce - (dynamicDrag * frictionDragModifier);

    state.fuelRemaining -=
        (car.fuelBurnRate * (state.currentRPM / car.engine.maxRPM)) * deltaTime;
    state.currentThermalLoad +=
        (2.2 * (state.currentRPM / car.engine.maxRPM) * deltaTime);
  }

  // 5. Physics Integration (Newton's Second Law)
  double acceleration = forceApplied / car.calculatedTotalMass;
  state.currentSpeed += acceleration * deltaTime;

  // Enforce safety boundary so speed never drops negative
  if (state.currentSpeed < 1.0)
    state.currentSpeed = 1.0;

  // 6. Thermals & Wear Logic
  double velocityCoolingFactor = (state.currentSpeed / 50.0) + 0.1;
  state.currentThermalLoad -=
      (0.8 * car.coolingCapacity * velocityCoolingFactor * deltaTime);
  if (state.currentThermalLoad < 70.0)
    state.currentThermalLoad = 70.0;

  double currentVibrationStrain =
      car.vibrationIndex * (state.currentRPM / car.engine.maxRPM);
  state.engineHealth -=
      ((currentVibrationStrain / car.structuralRigidityFactor) * 0.005) *
      deltaTime;

  if (state.currentThermalLoad > 105.0) {
    state.engineHealth -=
        (0.1 * (state.currentThermalLoad - 105.0) * deltaTime);
  }

  // 7. Racetrack Spline Progression
  // Update clocks
  state.currentDistance += state.currentSpeed * deltaTime;
  state.elapsedRaceTime += deltaTime;
  state.currentLapTime += deltaTime; // Track the time of the ACTIVE lap

  if (state.currentDistance >=
      currentSector.distanceAlongSpline + currentSector.length) {
    state.currentTrackNodeIndex =
        (state.currentTrackNodeIndex + 1) % track.size();

    if (state.currentTrackNodeIndex == 0) {
      std::cout << "\n🏁 [LAP " << state.currentLap
                << " COMPLETE] Time: " << std::setprecision(3)
                << state.currentLapTime << "s 🏁\n\n";

      state.currentLap++;
      state.currentLapTime = 0.0; // Reset for the next lap
      state.currentDistance = 0.0;
    }
  }
}

// Simple Token Parsing Mechanics for Custom Assembly Sets
bool LoadCarConfig(const std::string &filename, CarConfig &car) {
  std::ifstream file(filename);
  if (!file.is_open())
    return false;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#')
      continue;
    std::istringstream is_line(line);
    std::string key, value;
    if (std::getline(is_line, key, '=') && std::getline(is_line, value)) {
      if (key == "car_name")
        car.name = value;
      else if (key == "engine_layout")
        car.engine.layout = value;
      else if (key == "fuel_type")
        car.engine.fuelType = value;
      else if (key == "cylinders")
        car.engine.cylinders = std::stoi(value);
      else if (key == "bore")
        car.engine.bore = std::stod(value);
      else if (key == "stroke")
        car.engine.stroke = std::stod(value);
      else if (key == "max_rpm")
        car.engine.maxRPM = std::stoi(value);
      else if (key == "base_vibration")
        car.engine.baseVibrationFactor = std::stod(value);
      // New Assembly Allocations
      else if (key == "chassis_type") {
        if (value == "Spaceframe")
          car.chassisChoice = EChassis::Spaceframe;
        else
          car.chassisChoice = EChassis::CarbonMonocoque;
      } else if (key == "front_aero_type") {
        if (value == "LowDragNose")
          car.frontAeroChoice = EFrontAero::LowDragNose;
        else
          car.frontAeroChoice = EFrontAero::HighDownforceSplitter;
      } else if (key == "rear_aero_type") {
        if (value == "HighDownforceWing")
          car.rearAeroChoice = ERearAero::HighDownforceWing;
        else if (value == "WinglessGroundEffect")
          car.rearAeroChoice = ERearAero::WinglessGroundEffect;
        else
          car.rearAeroChoice = ERearAero::StandardWing;
      } else if (key == "cooling_pack") {
        if (value == "SprintSlimline")
          car.coolingChoice = ECoolingPack::SprintSlimline;
        else
          car.coolingChoice = ECoolingPack::EnduranceHeavyDuty;
      } else if (key == "front_spring_stiffness")
        car.frontSpringStiffness = std::stod(value);
      else if (key == "rear_spring_stiffness")
        car.rearSpringStiffness = std::stod(value);
      else if (key == "ride_height")
        car.rideHeight = std::stod(value);
    }
  }
  return true;
}

// (LoadTrackConfig function code remains identical to previous iteration)
bool LoadTrackConfig(const std::string &filename,
                     std::vector<TrackNode> &track) {
  std::ifstream file(filename);
  if (!file.is_open())
    return false;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty())
      continue;
    std::stringstream ss(line);
    std::string val;
    TrackNode node;
    std::getline(ss, val, ',');
    node.distanceAlongSpline = std::stod(val);
    std::getline(ss, val, ',');
    node.length = std::stod(val);
    std::getline(ss, val, ',');
    node.maxSafeSpeed = std::stod(val);
    std::getline(ss, val, ',');
    node.isStraightaway = (std::stoi(val) == 1);
    track.push_back(node);
  }
  return !track.empty();
}