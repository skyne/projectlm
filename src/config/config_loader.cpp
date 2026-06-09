#include "config_loader.hpp"
#include <fstream>
#include <sstream>

static std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

static ETireCompound ParseTireCompound(const std::string &value) {
  if (value == "Soft")
    return ETireCompound::Soft;
  if (value == "Hard")
    return ETireCompound::Hard;
  if (value == "MichelinEndurance")
    return ETireCompound::MichelinEndurance;
  return ETireCompound::Medium;
}

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
      key = Trim(key);
      value = Trim(value);
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
      else if (key == "peak_torque_nm")
        car.engine.peakTorqueNm = std::stod(value);
      else if (key == "peak_torque_rpm")
        car.engine.peakTorqueRpm = std::stoi(value);
      else if (key == "engine_specific_torque_nm_per_l")
        car.engine.specificTorqueNmPerL = std::stod(value);
      else if (key == "aspiration")
        car.engine.aspiration = value;
      else if (key == "drivetrain")
        car.engine.drivetrain = value;
      else if (key == "energy_converter")
        car.engine.energyConverter = value;
      else if (key == "buffer_size")
        car.engine.bufferSize = std::stod(value);
      else if (key == "generator_kw")
        car.engine.generatorKw = std::stod(value);
      else if (key == "power_target")
        car.engine.powerTargetHp = std::stod(value);
      else if (key == "chassis_type")
        car.chassisId = value;
      else if (key == "front_aero_type")
        car.frontAeroId = value;
      else if (key == "rear_aero_type")
        car.rearAeroId = value;
      else if (key == "diffuser_type")
        car.diffuserId = value;
      else if (key == "exhaust_type")
        car.exhaustId = value;
      else if (key == "cooling_pack") {
        if (value == "Custom")
          car.hasCustomCoolingLayout = true;
        else
          car.coolingId = value;
      } else if (key == "engine_radiator_size") {
        car.coolingLayout.engineRadiator = std::stod(value);
        car.hasCustomCoolingLayout = true;
      } else if (key == "oil_cooler_size") {
        car.coolingLayout.oilCooler = std::stod(value);
        car.hasCustomCoolingLayout = true;
      } else if (key == "charge_air_cooler_size") {
        car.coolingLayout.chargeAirCooler = std::stod(value);
        car.hasCustomCoolingLayout = true;
      } else if (key == "gearbox_cooler_size") {
        car.coolingLayout.gearboxCooler = std::stod(value);
        car.hasCustomCoolingLayout = true;
      } else if (key == "duct_airflow") {
        car.ductAirflowFactor = std::stod(value);
      } else if (key == "tire_compound") {
        car.tireChoice = ParseTireCompound(value);
      } else if (key == "starting_tire_compound") {
        car.tireChoice = ParseTireCompound(value);
      } else if (key == "wheel_package") {
        car.wheelPackageId = value;
      } else if (key == "suspension_layout") {
        car.suspensionId = value;
        car.frontSuspensionId = value;
        car.rearSuspensionId = value;
      } else if (key == "front_suspension_layout") {
        car.frontSuspensionId = value;
        car.suspensionId = value;
      } else if (key == "rear_suspension_layout") {
        car.rearSuspensionId = value;
      } else if (key == "front_wheel_diameter_in") {
        car.hasCustomWheelDims = true;
        car.customFrontWheelDiameterM = std::stod(value) * 0.0254;
      } else if (key == "rear_wheel_diameter_in") {
        car.hasCustomWheelDims = true;
        car.customRearWheelDiameterM = std::stod(value) * 0.0254;
      } else if (key == "front_tire_width_mm") {
        car.hasCustomWheelDims = true;
        car.customFrontTireWidthMm = std::stod(value);
      } else if (key == "rear_tire_width_mm") {
        car.hasCustomWheelDims = true;
        car.customRearTireWidthMm = std::stod(value);
      } else if (key == "fuel_system") {
        car.fuelSystemId = value;
      } else if (key == "brake_system") {
        car.brakeSystemId = value;
      } else if (key == "transmission") {
        car.transmissionId = value;
      } else if (key == "hybrid_system") {
        car.hybridSystemId = value;
      } else if (key == "front_spring_stiffness") {
        car.frontSpringStiffness = std::stod(value);
        car.hasCustomFrontSpring = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "rear_spring_stiffness") {
        car.rearSpringStiffness = std::stod(value);
        car.hasCustomRearSpring = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "ride_height") {
        const double rh = std::stod(value);
        car.frontRideHeightM = rh;
        car.rearRideHeightM = rh;
        car.rideHeight = rh;
        car.hasCustomFrontRideHeight = true;
        car.hasCustomRearRideHeight = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "front_ride_height_m") {
        car.frontRideHeightM = std::stod(value);
        car.hasCustomFrontRideHeight = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "rear_ride_height_m") {
        car.rearRideHeightM = std::stod(value);
        car.hasCustomRearRideHeight = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "front_arb_stiffness") {
        car.frontArbStiffness = std::stod(value);
        car.hasCustomFrontArb = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "rear_arb_stiffness") {
        car.rearArbStiffness = std::stod(value);
        car.hasCustomRearArb = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "front_damper_bump") {
        car.frontDamperBump = std::stoi(value);
        car.hasCustomDampers = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "front_damper_rebound") {
        car.frontDamperRebound = std::stoi(value);
        car.hasCustomDampers = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "rear_damper_bump") {
        car.rearDamperBump = std::stoi(value);
        car.hasCustomDampers = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "rear_damper_rebound") {
        car.rearDamperRebound = std::stoi(value);
        car.hasCustomDampers = true;
        car.hasCustomSuspensionSetup = true;
      } else if (key == "front_camber_deg") {
        car.frontCamberDeg = std::stod(value);
      } else if (key == "rear_camber_deg") {
        car.rearCamberDeg = std::stod(value);
      } else if (key == "front_toe_deg") {
        car.frontToeDeg = std::stod(value);
      } else if (key == "rear_toe_deg") {
        car.rearToeDeg = std::stod(value);
      } else if (key == "final_drive_ratio") {
        car.finalDriveRatio = std::stod(value);
      } else if (key == "starting_wing_delta") {
        car.startingWingDelta = std::stod(value);
      } else if (key == "starting_brake_bias") {
        car.startingBrakeBias = std::stod(value);
      }
    }
  }
  return true;
}

bool LoadPhysicsConfig(const std::string &filename, PhysicsConfig &p) {
  std::ifstream file(filename);
  if (!file.is_open())
    return false;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#')
      continue;
    auto eq = line.find('=');
    if (eq == std::string::npos)
      continue;
    std::string key = Trim(line.substr(0, eq));
    std::string val = Trim(line.substr(eq + 1));
    if (key == "gravity")
      p.gravity = std::stod(val);
    else if (key == "air_density")
      p.airDensity = std::stod(val);
    else if (key == "frontal_area")
      p.frontalArea = std::stod(val);
    else if (key == "wheel_radius")
      p.wheelRadius = std::stod(val);
    else if (key == "final_drive")
      p.finalDriveRatio = std::stod(val);
    else if (key == "corner_throttle_factor")
      p.cornerThrottleFactor = std::stod(val);
    else if (key == "tire_friction")
      p.tireFriction = std::stod(val);
    else if (key == "min_speed")
      p.minSpeed = std::stod(val);
    else if (key == "min_rpm")
      p.minRPM = std::stod(val);
    else if (key == "ride_height_scrape_limit")
      p.rideHeightScrapeLimit = std::stod(val);
    else if (key == "scrape_drag_modifier")
      p.scrapeDragModifier = std::stod(val);
    else if (key == "gear_1")
      p.gearRatios[0] = std::stod(val);
    else if (key == "gear_2")
      p.gearRatios[1] = std::stod(val);
    else if (key == "gear_3")
      p.gearRatios[2] = std::stod(val);
    else if (key == "gear_4")
      p.gearRatios[3] = std::stod(val);
    else if (key == "gear_5")
      p.gearRatios[4] = std::stod(val);
    else if (key == "gear_6")
      p.gearRatios[5] = std::stod(val);
    else if (key == "shift_1_2")
      p.gearShiftSpeeds[0] = std::stod(val);
    else if (key == "shift_2_3")
      p.gearShiftSpeeds[1] = std::stod(val);
    else if (key == "shift_3_4")
      p.gearShiftSpeeds[2] = std::stod(val);
    else if (key == "shift_4_5")
      p.gearShiftSpeeds[3] = std::stod(val);
    else if (key == "shift_5_6")
      p.gearShiftSpeeds[4] = std::stod(val);
    else if (key == "brake_max_pressure")
      p.brakeMaxPressure = std::stod(val);
    else if (key == "brake_base")
      p.brakeBasePressure = std::stod(val);
    else if (key == "brake_gain")
      p.brakeGain = std::stod(val);
    else if (key == "brake_trigger_margin")
      p.brakeTriggerMargin = std::stod(val);
    else if (key == "brake_target_rpm_factor")
      p.brakeTargetRPMFactor = std::stod(val);
    else if (key == "corner_g_force_divisor")
      p.cornerGForceDivisor = std::stod(val);
    else if (key == "curvature_look_ahead_m")
      p.curvatureLookAheadM = std::stod(val);
    else if (key == "curvature_sample_step_m")
      p.curvatureSampleStepM = std::stod(val);
    else if (key == "straight_curvature_threshold")
      p.straightCurvatureThreshold = std::stod(val);
    else if (key == "min_corner_radius_m")
      p.minCornerRadiusM = std::stod(val);
    else if (key == "torque_peak_rpm")
      p.torquePeakRPM = std::stod(val);
    else if (key == "torque_falloff")
      p.torqueFalloff = std::stod(val);
    else if (key == "torque_min_floor")
      p.torqueMinFloor = std::stod(val);
    else if (key == "cooling_velocity_factor")
      p.coolingVelocityFactor = std::stod(val);
    else if (key == "cooling_rate")
      p.coolingRate = std::stod(val);
    else if (key == "cooling_base_factor")
      p.coolingBaseFactor = std::stod(val);
    else if (key == "cooling_idle_temp")
      p.coolingIdleTemp = std::stod(val);
    else if (key == "thermal_load_rate")
      p.thermalLoadRate = std::stod(val);
    else if (key == "thermal_overheat")
      p.thermalOverheat = std::stod(val);
    else if (key == "thermal_damage_rate")
      p.thermalDamageRate = std::stod(val);
    else if (key == "vibration_damage_rate")
      p.vibrationDamageRate = std::stod(val);
    else if (key == "tire_wear_effect")
      p.tireWearEffect = std::stod(val);
    else if (key == "tire_wear_speed_threshold")
      p.tireWearSpeedThreshold = std::stod(val);
    else if (key == "tire_ambient_temp_c")
      p.tireAmbientTempC = std::stod(val);
    else if (key == "fuel_overrun_fraction")
      p.fuelOverrunFraction = std::stod(val);
    else if (key == "thermal_overrun_fraction")
      p.thermalOverrunFraction = std::stod(val);
  }
  return true;
}

bool LoadAssemblyConfig(const std::string &filename, AssemblyConfig &ac) {
  std::ifstream file(filename);
  if (!file.is_open())
    return false;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#')
      continue;
    auto eq = line.find('=');
    if (eq == std::string::npos)
      continue;
    std::string key = Trim(line.substr(0, eq));
    std::string val = Trim(line.substr(eq + 1));
    if (key == "engine_weight_coeff")
      ac.engineWeightCoeff = std::stod(val);
    else if (key == "engine_weight_cyl_factor")
      ac.engineWeightCylFactor = std::stod(val);
    else if (key == "diesel_weight_mult")
      ac.dieselWeightMult = std::stod(val);
    else if (key == "base_vehicle_mass")
      ac.baseVehicleMass = std::stod(val);
    else if (key == "default_specific_torque_nm_per_l")
      ac.defaultSpecificTorqueNmPerL = std::stod(val);
    else if (key == "torque_coefficient")
      ac.defaultSpecificTorqueNmPerL = std::stod(val);
    else if (key == "body_base_drag_cd")
      ac.bodyBaseDragCd = std::stod(val);
    else if (key == "hp_conversion")
      ac.hpConversion = std::stod(val);
    else if (key == "reference_stroke")
      ac.referenceStroke = std::stod(val);
    else if (key == "reference_rpm")
      ac.referenceRPM = std::stod(val);
    else if (key == "fuel_burn_coeff")
      ac.fuelBurnCoeff = std::stod(val);
    else if (key == "fuel_ref_rpm")
      ac.fuelRefRPM = std::stod(val);
    else if (key == "ground_suck_numerator")
      ac.groundSuckNumerator = std::stod(val);
    else if (key == "ground_suck_offset")
      ac.groundSuckOffset = std::stod(val);
    else if (key == "ground_effect_downforce")
      ac.groundEffectDownforce = std::stod(val);
    else if (key == "wingless_drag_reduction")
      ac.winglessDragReduction = std::stod(val);
  }
  return true;
}
