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
      } else if (key == "tire_compound") {
        if (value == "Soft")
          car.tireChoice = ETireCompound::Soft;
        else if (value == "Hard")
          car.tireChoice = ETireCompound::Hard;
        else
          car.tireChoice = ETireCompound::Medium;
      } else if (key == "fuel_system") {
        if (value == "LargeTank")
          car.fuelSystemChoice = EFuelSystem::LargeTank;
        else
          car.fuelSystemChoice = EFuelSystem::StandardTank;
      } else if (key == "brake_system") {
        if (value == "CarbonCeramic")
          car.brakeSystemChoice = EBrakeSystem::CarbonCeramic;
        else if (value == "HeavyDutyEndurance")
          car.brakeSystemChoice = EBrakeSystem::HeavyDutyEndurance;
        else
          car.brakeSystemChoice = EBrakeSystem::StandardCaliper;
      } else if (key == "transmission") {
        if (value == "SevenSpeedSequential")
          car.transmissionChoice = ETransmission::SevenSpeedSequential;
        else if (value == "EightSpeedPaddle")
          car.transmissionChoice = ETransmission::EightSpeedPaddle;
        else
          car.transmissionChoice = ETransmission::SixSpeedSequential;
      } else if (key == "hybrid_system") {
        if (value == "LMDh500kW")
          car.hybridSystemChoice = EHybridSystem::LMDh500kW;
        else if (value == "HypercarHV")
          car.hybridSystemChoice = EHybridSystem::HypercarHV;
        else
          car.hybridSystemChoice = EHybridSystem::None;
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
    else if (key == "torque_coefficient")
      ac.torqueCoefficient = std::stod(val);
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

bool LoadPartCatalog(const std::string &filename, PartCatalog &catalog) {
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
    if (key == "chassis.CarbonMonocoque.mass")
      catalog.chassisCarbonMonocoque.mass = std::stod(val);
    else if (key == "chassis.CarbonMonocoque.rigidity")
      catalog.chassisCarbonMonocoque.structuralRigidity = std::stod(val);
    else if (key == "chassis.CarbonMonocoque.drag")
      catalog.chassisCarbonMonocoque.baselineDrag = std::stod(val);
    else if (key == "chassis.Spaceframe.mass")
      catalog.chassisSpaceframe.mass = std::stod(val);
    else if (key == "chassis.Spaceframe.rigidity")
      catalog.chassisSpaceframe.structuralRigidity = std::stod(val);
    else if (key == "chassis.Spaceframe.drag")
      catalog.chassisSpaceframe.baselineDrag = std::stod(val);
    else if (key == "front_aero.LowDragNose.mass")
      catalog.frontLowDragNose.mass = std::stod(val);
    else if (key == "front_aero.LowDragNose.downforce")
      catalog.frontLowDragNose.downforceCl = std::stod(val);
    else if (key == "front_aero.LowDragNose.drag")
      catalog.frontLowDragNose.dragCd = std::stod(val);
    else if (key == "front_aero.HighDownforceSplitter.mass")
      catalog.frontHighDownforceSplitter.mass = std::stod(val);
    else if (key == "front_aero.HighDownforceSplitter.downforce")
      catalog.frontHighDownforceSplitter.downforceCl = std::stod(val);
    else if (key == "front_aero.HighDownforceSplitter.drag")
      catalog.frontHighDownforceSplitter.dragCd = std::stod(val);
    else if (key == "rear_aero.StandardWing.mass")
      catalog.rearStandardWing.mass = std::stod(val);
    else if (key == "rear_aero.StandardWing.downforce")
      catalog.rearStandardWing.downforceCl = std::stod(val);
    else if (key == "rear_aero.StandardWing.drag")
      catalog.rearStandardWing.dragCd = std::stod(val);
    else if (key == "rear_aero.StandardWing.permits_wingless")
      catalog.rearStandardWing.permitsWinglessPitch = (std::stoi(val) == 1);
    else if (key == "rear_aero.HighDownforceWing.mass")
      catalog.rearHighDownforceWing.mass = std::stod(val);
    else if (key == "rear_aero.HighDownforceWing.downforce")
      catalog.rearHighDownforceWing.downforceCl = std::stod(val);
    else if (key == "rear_aero.HighDownforceWing.drag")
      catalog.rearHighDownforceWing.dragCd = std::stod(val);
    else if (key == "rear_aero.HighDownforceWing.permits_wingless")
      catalog.rearHighDownforceWing.permitsWinglessPitch = (std::stoi(val) == 1);
    else if (key == "rear_aero.WinglessGroundEffect.mass")
      catalog.rearWinglessGroundEffect.mass = std::stod(val);
    else if (key == "rear_aero.WinglessGroundEffect.downforce")
      catalog.rearWinglessGroundEffect.downforceCl = std::stod(val);
    else if (key == "rear_aero.WinglessGroundEffect.drag")
      catalog.rearWinglessGroundEffect.dragCd = std::stod(val);
    else if (key == "rear_aero.WinglessGroundEffect.permits_wingless")
      catalog.rearWinglessGroundEffect.permitsWinglessPitch =
          (std::stoi(val) == 1);
    else if (key == "cooling.SprintSlimline.mass")
      catalog.coolingSprintSlimline.mass = std::stod(val);
    else if (key == "cooling.SprintSlimline.drag")
      catalog.coolingSprintSlimline.dragCd = std::stod(val);
    else if (key == "cooling.SprintSlimline.dissipation")
      catalog.coolingSprintSlimline.thermalDissipationRate = std::stod(val);
    else if (key == "cooling.EnduranceHeavyDuty.mass")
      catalog.coolingEnduranceHeavyDuty.mass = std::stod(val);
    else if (key == "cooling.EnduranceHeavyDuty.drag")
      catalog.coolingEnduranceHeavyDuty.dragCd = std::stod(val);
    else if (key == "cooling.EnduranceHeavyDuty.dissipation")
      catalog.coolingEnduranceHeavyDuty.thermalDissipationRate =
          std::stod(val);
    else if (key == "tire.Soft.mass")
      catalog.tireSoft.mass = std::stod(val);
    else if (key == "tire.Soft.grip")
      catalog.tireSoft.gripMultiplier = std::stod(val);
    else if (key == "tire.Soft.wear_rate")
      catalog.tireSoft.wearRate = std::stod(val);
    else if (key == "tire.Soft.optimal_temp")
      catalog.tireSoft.optimalTemp = std::stod(val);
    else if (key == "tire.Medium.mass")
      catalog.tireMedium.mass = std::stod(val);
    else if (key == "tire.Medium.grip")
      catalog.tireMedium.gripMultiplier = std::stod(val);
    else if (key == "tire.Medium.wear_rate")
      catalog.tireMedium.wearRate = std::stod(val);
    else if (key == "tire.Medium.optimal_temp")
      catalog.tireMedium.optimalTemp = std::stod(val);
    else if (key == "tire.Hard.mass")
      catalog.tireHard.mass = std::stod(val);
    else if (key == "tire.Hard.grip")
      catalog.tireHard.gripMultiplier = std::stod(val);
    else if (key == "tire.Hard.wear_rate")
      catalog.tireHard.wearRate = std::stod(val);
    else if (key == "tire.Hard.optimal_temp")
      catalog.tireHard.optimalTemp = std::stod(val);
    else if (key == "fuel_system.StandardTank.mass")
      catalog.fuelStandardTank.mass = std::stod(val);
    else if (key == "fuel_system.StandardTank.capacity")
      catalog.fuelStandardTank.capacityLiters = std::stod(val);
    else if (key == "fuel_system.LargeTank.mass")
      catalog.fuelLargeTank.mass = std::stod(val);
    else if (key == "fuel_system.LargeTank.capacity")
      catalog.fuelLargeTank.capacityLiters = std::stod(val);
    else if (key == "brake.StandardCaliper.mass")
      catalog.brakeStandardCaliper.mass = std::stod(val);
    else if (key == "brake.StandardCaliper.max_pressure")
      catalog.brakeStandardCaliper.maxPressure = std::stod(val);
    else if (key == "brake.StandardCaliper.fade")
      catalog.brakeStandardCaliper.fadeUnderHeat = std::stod(val);
    else if (key == "brake.CarbonCeramic.mass")
      catalog.brakeCarbonCeramic.mass = std::stod(val);
    else if (key == "brake.CarbonCeramic.max_pressure")
      catalog.brakeCarbonCeramic.maxPressure = std::stod(val);
    else if (key == "brake.CarbonCeramic.fade")
      catalog.brakeCarbonCeramic.fadeUnderHeat = std::stod(val);
    else if (key == "brake.HeavyDutyEndurance.mass")
      catalog.brakeHeavyDutyEndurance.mass = std::stod(val);
    else if (key == "brake.HeavyDutyEndurance.max_pressure")
      catalog.brakeHeavyDutyEndurance.maxPressure = std::stod(val);
    else if (key == "brake.HeavyDutyEndurance.fade")
      catalog.brakeHeavyDutyEndurance.fadeUnderHeat = std::stod(val);
    else if (key == "transmission.SixSpeedSequential.mass")
      catalog.transmissionSixSpeed.mass = std::stod(val);
    else if (key == "transmission.SixSpeedSequential.gear_count")
      catalog.transmissionSixSpeed.gearCount = std::stoi(val);
    else if (key == "transmission.SixSpeedSequential.shift_delay")
      catalog.transmissionSixSpeed.shiftDelaySec = std::stod(val);
    else if (key == "transmission.SevenSpeedSequential.mass")
      catalog.transmissionSevenSpeed.mass = std::stod(val);
    else if (key == "transmission.SevenSpeedSequential.gear_count")
      catalog.transmissionSevenSpeed.gearCount = std::stoi(val);
    else if (key == "transmission.SevenSpeedSequential.shift_delay")
      catalog.transmissionSevenSpeed.shiftDelaySec = std::stod(val);
    else if (key == "transmission.EightSpeedPaddle.mass")
      catalog.transmissionEightSpeed.mass = std::stod(val);
    else if (key == "transmission.EightSpeedPaddle.gear_count")
      catalog.transmissionEightSpeed.gearCount = std::stoi(val);
    else if (key == "transmission.EightSpeedPaddle.shift_delay")
      catalog.transmissionEightSpeed.shiftDelaySec = std::stod(val);
    else if (key == "hybrid.None.mass")
      catalog.hybridNone.mass = std::stod(val);
    else if (key == "hybrid.LMDh500kW.mass")
      catalog.hybridLMDh500kW.mass = std::stod(val);
    else if (key == "hybrid.LMDh500kW.deploy_kw")
      catalog.hybridLMDh500kW.deployPowerKW = std::stod(val);
    else if (key == "hybrid.LMDh500kW.regen_rate")
      catalog.hybridLMDh500kW.regenRate = std::stod(val);
    else if (key == "hybrid.LMDh500kW.stint_budget_mj")
      catalog.hybridLMDh500kW.stintDeployBudgetMJ = std::stod(val);
    else if (key == "hybrid.HypercarHV.mass")
      catalog.hybridHypercarHV.mass = std::stod(val);
    else if (key == "hybrid.HypercarHV.deploy_kw")
      catalog.hybridHypercarHV.deployPowerKW = std::stod(val);
    else if (key == "hybrid.HypercarHV.regen_rate")
      catalog.hybridHypercarHV.regenRate = std::stod(val);
    else if (key == "hybrid.HypercarHV.stint_budget_mj")
      catalog.hybridHypercarHV.stintDeployBudgetMJ = std::stod(val);
    else if (key.rfind("attach.", 0) == 0)
      catalog.attachmentPoints[key.substr(7)] = val;
    else if (key.rfind("transmission.", 0) == 0) {
      const auto dot = key.rfind('.');
      if (dot == std::string::npos)
        continue;
      const std::string variant = key.substr(13, dot - 13);
      const std::string field = key.substr(dot + 1);
      TransmissionPart *tp = nullptr;
      if (variant == "SixSpeedSequential")
        tp = &catalog.transmissionSixSpeed;
      else if (variant == "SevenSpeedSequential")
        tp = &catalog.transmissionSevenSpeed;
      else if (variant == "EightSpeedPaddle")
        tp = &catalog.transmissionEightSpeed;
      if (!tp)
        continue;
      if (field.rfind("gear_", 0) == 0) {
        const int idx = std::stoi(field.substr(5)) - 1;
        if (idx >= 0 && idx < 8)
          tp->gearRatios[idx] = std::stod(val);
      } else if (field.rfind("shift_", 0) == 0) {
        const int idx = std::stoi(field.substr(6)) - 1;
        if (idx >= 0 && idx < 7)
          tp->gearShiftSpeeds[idx] = std::stod(val);
      }
    }
  }
  return true;
}
