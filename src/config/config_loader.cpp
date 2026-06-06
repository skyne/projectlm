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

static EWheelPackage ParseWheelPackage(const std::string &value) {
  if (value == "Hypercar18WideRear")
    return EWheelPackage::Hypercar18WideRear;
  if (value == "Hypercar18LowDrag")
    return EWheelPackage::Hypercar18LowDrag;
  if (value == "LMP2Oreca18")
    return EWheelPackage::LMP2Oreca18;
  if (value == "GT3Front20Rear21")
    return EWheelPackage::GT3Front20Rear21;
  if (value == "GT3WideRear21")
    return EWheelPackage::GT3WideRear21;
  return EWheelPackage::Hypercar18Standard;
}

static ESuspensionLayout ParseSuspensionLayout(const std::string &value) {
  if (value == "PullrodDoubleWishbone")
    return ESuspensionLayout::PullrodDoubleWishbone;
  if (value == "DoubleWishboneHeaveSpring")
    return ESuspensionLayout::DoubleWishboneHeaveSpring;
  if (value == "MultilinkRearHypercar")
    return ESuspensionLayout::MultilinkRearHypercar;
  if (value == "MacPhersonStrutGT3")
    return ESuspensionLayout::MacPhersonStrutGT3;
  if (value == "DoubleWishboneGT3")
    return ESuspensionLayout::DoubleWishboneGT3;
  if (value == "OrecaLMP2Spec")
    return ESuspensionLayout::OrecaLMP2Spec;
  return ESuspensionLayout::PushrodDoubleWishbone;
}

static ETireCompound ParseTireCompound(const std::string &value) {
  if (value == "Soft")
    return ETireCompound::Soft;
  if (value == "Hard")
    return ETireCompound::Hard;
  if (value == "MichelinEndurance")
    return ETireCompound::Medium;
  return ETireCompound::Medium;
}

static WheelPackagePart *WheelCatalogEntry(PartCatalog &catalog,
                                           const std::string &name) {
  if (name == "Hypercar18WideRear")
    return &catalog.wheelHypercar18WideRear;
  if (name == "Hypercar18LowDrag")
    return &catalog.wheelHypercar18LowDrag;
  if (name == "LMP2Oreca18")
    return &catalog.wheelLMP2Oreca18;
  if (name == "GT3Front20Rear21")
    return &catalog.wheelGT3Front20Rear21;
  if (name == "GT3WideRear21")
    return &catalog.wheelGT3WideRear21;
  return &catalog.wheelHypercar18Standard;
}

static SuspensionPart *SuspensionCatalogEntry(PartCatalog &catalog,
                                              const std::string &name) {
  if (name == "PullrodDoubleWishbone")
    return &catalog.suspensionPullrodDoubleWishbone;
  if (name == "DoubleWishboneHeaveSpring")
    return &catalog.suspensionDoubleWishboneHeaveSpring;
  if (name == "MultilinkRearHypercar")
    return &catalog.suspensionMultilinkRearHypercar;
  if (name == "MacPhersonStrutGT3")
    return &catalog.suspensionMacPhersonStrutGT3;
  if (name == "DoubleWishboneGT3")
    return &catalog.suspensionDoubleWishboneGT3;
  if (name == "OrecaLMP2Spec")
    return &catalog.suspensionOrecaLMP2Spec;
  return &catalog.suspensionPushrodDoubleWishbone;
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
      else if (key == "generator_kw")
        car.engine.generatorKw = std::stod(value);
      else if (key == "chassis_type") {
        if (value == "Spaceframe")
          car.chassisChoice = EChassis::Spaceframe;
        else if (value == "LMHInHouse")
          car.chassisChoice = EChassis::LMHInHouse;
        else if (value == "LMHDallaraBuilt")
          car.chassisChoice = EChassis::LMHDallaraBuilt;
        else if (value == "LMHMultimaticBuilt")
          car.chassisChoice = EChassis::LMHMultimaticBuilt;
        else if (value == "LMHMonocoque")
          car.chassisChoice = EChassis::LMHMonocoque;
        else if (value == "LMDhDallara")
          car.chassisChoice = EChassis::LMDhDallara;
        else if (value == "LMDhOreca")
          car.chassisChoice = EChassis::LMDhOreca;
        else if (value == "LMDhMultimatic")
          car.chassisChoice = EChassis::LMDhMultimatic;
        else if (value == "LMDhLigier")
          car.chassisChoice = EChassis::LMDhLigier;
        else if (value == "Oreca07")
          car.chassisChoice = EChassis::Oreca07;
        else if (value == "GT3Oreca")
          car.chassisChoice = EChassis::GT3Oreca;
        else if (value == "GT3PrattMiller")
          car.chassisChoice = EChassis::GT3PrattMiller;
        else if (value == "GT3McLaren")
          car.chassisChoice = EChassis::GT3McLaren;
        else if (value == "GT3Multimatic")
          car.chassisChoice = EChassis::GT3Multimatic;
        else if (value == "GT3Spaceframe")
          car.chassisChoice = EChassis::GT3Spaceframe;
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
        else if (value == "DuctedRacing")
          car.coolingChoice = ECoolingPack::DuctedRacing;
        else if (value == "MaxFlowEndurance")
          car.coolingChoice = ECoolingPack::MaxFlowEndurance;
        else if (value == "Custom")
          car.hasCustomCoolingLayout = true;
        else
          car.coolingChoice = ECoolingPack::EnduranceHeavyDuty;
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
        car.wheelPackageChoice = ParseWheelPackage(value);
      } else if (key == "suspension_layout") {
        car.suspensionChoice = ParseSuspensionLayout(value);
        car.frontSuspensionChoice = car.suspensionChoice;
        car.rearSuspensionChoice = car.suspensionChoice;
      } else if (key == "front_suspension_layout") {
        car.frontSuspensionChoice = ParseSuspensionLayout(value);
        car.suspensionChoice = car.frontSuspensionChoice;
      } else if (key == "rear_suspension_layout") {
        car.rearSuspensionChoice = ParseSuspensionLayout(value);
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
        if (value == "LargeTank")
          car.fuelSystemChoice = EFuelSystem::LargeTank;
        else if (value == "LeMans90L")
          car.fuelSystemChoice = EFuelSystem::LeMans90L;
        else if (value == "LeMans110L")
          car.fuelSystemChoice = EFuelSystem::LeMans110L;
        else if (value == "HydrogenTank")
          car.fuelSystemChoice = EFuelSystem::HydrogenTank;
        else
          car.fuelSystemChoice = EFuelSystem::StandardTank;
      } else if (key == "brake_system") {
        if (value == "CarbonCeramic")
          car.brakeSystemChoice = EBrakeSystem::CarbonCeramic;
        else if (value == "HeavyDutyEndurance")
          car.brakeSystemChoice = EBrakeSystem::HeavyDutyEndurance;
        else if (value == "BremboHypercar")
          car.brakeSystemChoice = EBrakeSystem::BremboHypercar;
        else if (value == "AkebonoHypercar")
          car.brakeSystemChoice = EBrakeSystem::AkebonoHypercar;
        else if (value == "APRacingPrototype")
          car.brakeSystemChoice = EBrakeSystem::APRacingPrototype;
        else
          car.brakeSystemChoice = EBrakeSystem::StandardCaliper;
      } else if (key == "transmission") {
        if (value == "SevenSpeedSequential")
          car.transmissionChoice = ETransmission::SevenSpeedSequential;
        else if (value == "EightSpeedPaddle")
          car.transmissionChoice = ETransmission::EightSpeedPaddle;
        else if (value == "XtracP1359")
          car.transmissionChoice = ETransmission::XtracP1359;
        else if (value == "XtracP529")
          car.transmissionChoice = ETransmission::XtracP529;
        else if (value == "SingleSpeedEDrive")
          car.transmissionChoice = ETransmission::SingleSpeedEDrive;
        else
          car.transmissionChoice = ETransmission::SixSpeedSequential;
      } else if (key == "hybrid_system") {
        if (value == "LMDh500kW")
          car.hybridSystemChoice = EHybridSystem::LMDh500kW;
        else if (value == "HypercarHV")
          car.hybridSystemChoice = EHybridSystem::HypercarHV;
        else if (value == "LMDh50kW")
          car.hybridSystemChoice = EHybridSystem::LMDh50kW;
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

static ChassisPart *FindChassisPart(PartCatalog &catalog,
                                    const std::string &name) {
  if (name == "CarbonMonocoque")
    return &catalog.chassisCarbonMonocoque;
  if (name == "Spaceframe")
    return &catalog.chassisSpaceframe;
  if (name == "LMHInHouse")
    return &catalog.chassisLMHInHouse;
  if (name == "LMHDallaraBuilt")
    return &catalog.chassisLMHDallaraBuilt;
  if (name == "LMHMultimaticBuilt")
    return &catalog.chassisLMHMultimaticBuilt;
  if (name == "LMHMonocoque")
    return &catalog.chassisLMHMonocoque;
  if (name == "LMDhDallara")
    return &catalog.chassisLMDhDallara;
  if (name == "LMDhOreca")
    return &catalog.chassisLMDhOreca;
  if (name == "LMDhMultimatic")
    return &catalog.chassisLMDhMultimatic;
  if (name == "LMDhLigier")
    return &catalog.chassisLMDhLigier;
  if (name == "Oreca07")
    return &catalog.chassisOreca07;
  if (name == "GT3Spaceframe")
    return &catalog.chassisGT3Spaceframe;
  if (name == "GT3Oreca")
    return &catalog.chassisGT3Oreca;
  if (name == "GT3PrattMiller")
    return &catalog.chassisGT3PrattMiller;
  if (name == "GT3McLaren")
    return &catalog.chassisGT3McLaren;
  if (name == "GT3Multimatic")
    return &catalog.chassisGT3Multimatic;
  return nullptr;
}

static bool TryParseChassisExtendedStat(PartCatalog &catalog,
                                      const std::string &key,
                                      const std::string &val) {
  const std::string prefix = "chassis.";
  if (key.rfind(prefix, 0) != 0)
    return false;

  double parsed = 0.0;
  try {
    parsed = std::stod(val);
  } catch (...) {
    return false;
  }

  const std::string serviceSuffix = ".serviceability";
  const std::string driverSuffix = ".driver_change";
  std::string partName;
  ChassisPart *part = nullptr;

  if (key.size() > prefix.size() + serviceSuffix.size() &&
      key.compare(key.size() - serviceSuffix.size(), serviceSuffix.size(),
                  serviceSuffix) == 0) {
    partName = key.substr(prefix.size(),
                          key.size() - prefix.size() - serviceSuffix.size());
    part = FindChassisPart(catalog, partName);
    if (!part)
      return false;
    part->serviceability = parsed;
    return true;
  }

  if (key.size() > prefix.size() + driverSuffix.size() &&
      key.compare(key.size() - driverSuffix.size(), driverSuffix.size(),
                  driverSuffix) == 0) {
    partName = key.substr(prefix.size(),
                          key.size() - prefix.size() - driverSuffix.size());
    part = FindChassisPart(catalog, partName);
    if (!part)
      return false;
    part->driverChangeFactor = parsed;
    return true;
  }

  return false;
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
    if (TryParseChassisExtendedStat(catalog, key, val))
      continue;
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
    else if (key == "chassis.LMHInHouse.mass")
      catalog.chassisLMHInHouse.mass = std::stod(val);
    else if (key == "chassis.LMHInHouse.rigidity")
      catalog.chassisLMHInHouse.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMHInHouse.drag")
      catalog.chassisLMHInHouse.baselineDrag = std::stod(val);
    else if (key == "chassis.LMHDallaraBuilt.mass")
      catalog.chassisLMHDallaraBuilt.mass = std::stod(val);
    else if (key == "chassis.LMHDallaraBuilt.rigidity")
      catalog.chassisLMHDallaraBuilt.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMHDallaraBuilt.drag")
      catalog.chassisLMHDallaraBuilt.baselineDrag = std::stod(val);
    else if (key == "chassis.LMHMultimaticBuilt.mass")
      catalog.chassisLMHMultimaticBuilt.mass = std::stod(val);
    else if (key == "chassis.LMHMultimaticBuilt.rigidity")
      catalog.chassisLMHMultimaticBuilt.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMHMultimaticBuilt.drag")
      catalog.chassisLMHMultimaticBuilt.baselineDrag = std::stod(val);
    else if (key == "chassis.LMHMonocoque.mass")
      catalog.chassisLMHMonocoque.mass = std::stod(val);
    else if (key == "chassis.LMHMonocoque.rigidity")
      catalog.chassisLMHMonocoque.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMHMonocoque.drag")
      catalog.chassisLMHMonocoque.baselineDrag = std::stod(val);
    else if (key == "chassis.LMDhDallara.mass")
      catalog.chassisLMDhDallara.mass = std::stod(val);
    else if (key == "chassis.LMDhDallara.rigidity")
      catalog.chassisLMDhDallara.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMDhDallara.drag")
      catalog.chassisLMDhDallara.baselineDrag = std::stod(val);
    else if (key == "chassis.LMDhOreca.mass")
      catalog.chassisLMDhOreca.mass = std::stod(val);
    else if (key == "chassis.LMDhOreca.rigidity")
      catalog.chassisLMDhOreca.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMDhOreca.drag")
      catalog.chassisLMDhOreca.baselineDrag = std::stod(val);
    else if (key == "chassis.LMDhMultimatic.mass")
      catalog.chassisLMDhMultimatic.mass = std::stod(val);
    else if (key == "chassis.LMDhMultimatic.rigidity")
      catalog.chassisLMDhMultimatic.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMDhMultimatic.drag")
      catalog.chassisLMDhMultimatic.baselineDrag = std::stod(val);
    else if (key == "chassis.LMDhLigier.mass")
      catalog.chassisLMDhLigier.mass = std::stod(val);
    else if (key == "chassis.LMDhLigier.rigidity")
      catalog.chassisLMDhLigier.structuralRigidity = std::stod(val);
    else if (key == "chassis.LMDhLigier.drag")
      catalog.chassisLMDhLigier.baselineDrag = std::stod(val);
    else if (key == "chassis.Oreca07.mass")
      catalog.chassisOreca07.mass = std::stod(val);
    else if (key == "chassis.Oreca07.rigidity")
      catalog.chassisOreca07.structuralRigidity = std::stod(val);
    else if (key == "chassis.Oreca07.drag")
      catalog.chassisOreca07.baselineDrag = std::stod(val);
    else if (key == "chassis.GT3Spaceframe.mass")
      catalog.chassisGT3Spaceframe.mass = std::stod(val);
    else if (key == "chassis.GT3Spaceframe.rigidity")
      catalog.chassisGT3Spaceframe.structuralRigidity = std::stod(val);
    else if (key == "chassis.GT3Spaceframe.drag")
      catalog.chassisGT3Spaceframe.baselineDrag = std::stod(val);
    else if (key == "chassis.GT3Oreca.mass")
      catalog.chassisGT3Oreca.mass = std::stod(val);
    else if (key == "chassis.GT3Oreca.rigidity")
      catalog.chassisGT3Oreca.structuralRigidity = std::stod(val);
    else if (key == "chassis.GT3Oreca.drag")
      catalog.chassisGT3Oreca.baselineDrag = std::stod(val);
    else if (key == "chassis.GT3PrattMiller.mass")
      catalog.chassisGT3PrattMiller.mass = std::stod(val);
    else if (key == "chassis.GT3PrattMiller.rigidity")
      catalog.chassisGT3PrattMiller.structuralRigidity = std::stod(val);
    else if (key == "chassis.GT3PrattMiller.drag")
      catalog.chassisGT3PrattMiller.baselineDrag = std::stod(val);
    else if (key == "chassis.GT3McLaren.mass")
      catalog.chassisGT3McLaren.mass = std::stod(val);
    else if (key == "chassis.GT3McLaren.rigidity")
      catalog.chassisGT3McLaren.structuralRigidity = std::stod(val);
    else if (key == "chassis.GT3McLaren.drag")
      catalog.chassisGT3McLaren.baselineDrag = std::stod(val);
    else if (key == "chassis.GT3Multimatic.mass")
      catalog.chassisGT3Multimatic.mass = std::stod(val);
    else if (key == "chassis.GT3Multimatic.rigidity")
      catalog.chassisGT3Multimatic.structuralRigidity = std::stod(val);
    else if (key == "chassis.GT3Multimatic.drag")
      catalog.chassisGT3Multimatic.baselineDrag = std::stod(val);
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
    else if (key == "cooling.DuctedRacing.mass")
      catalog.coolingDuctedRacing.mass = std::stod(val);
    else if (key == "cooling.DuctedRacing.drag")
      catalog.coolingDuctedRacing.dragCd = std::stod(val);
    else if (key == "cooling.DuctedRacing.dissipation")
      catalog.coolingDuctedRacing.thermalDissipationRate = std::stod(val);
    else if (key == "cooling.MaxFlowEndurance.mass")
      catalog.coolingMaxFlowEndurance.mass = std::stod(val);
    else if (key == "cooling.MaxFlowEndurance.drag")
      catalog.coolingMaxFlowEndurance.dragCd = std::stod(val);
    else if (key == "cooling.MaxFlowEndurance.dissipation")
      catalog.coolingMaxFlowEndurance.thermalDissipationRate = std::stod(val);
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
    else if (key == "tire.MichelinEndurance.mass")
      catalog.tireMichelinEndurance.mass = std::stod(val);
    else if (key == "tire.MichelinEndurance.grip")
      catalog.tireMichelinEndurance.gripMultiplier = std::stod(val);
    else if (key == "tire.MichelinEndurance.wear_rate")
      catalog.tireMichelinEndurance.wearRate = std::stod(val);
    else if (key == "tire.MichelinEndurance.optimal_temp")
      catalog.tireMichelinEndurance.optimalTemp = std::stod(val);
    else if (key.rfind("wheel_package.", 0) == 0) {
      const auto dot1 = key.find('.', 14);
      const auto dot2 = key.find('.', dot1 + 1);
      if (dot1 != std::string::npos && dot2 != std::string::npos) {
        const std::string name = key.substr(14, dot1 - 14);
        const std::string stat = key.substr(dot2 + 1);
        WheelPackagePart *wp = WheelCatalogEntry(catalog, name);
        if (stat == "mass")
          wp->mass = std::stod(val);
        else if (stat == "front_diameter_m")
          wp->frontDiameterM = std::stod(val);
        else if (stat == "rear_diameter_m")
          wp->rearDiameterM = std::stod(val);
        else if (stat == "front_width_mm")
          wp->frontWidthMm = std::stod(val);
        else if (stat == "rear_width_mm")
          wp->rearWidthMm = std::stod(val);
        else if (stat == "grip_factor")
          wp->gripFactor = std::stod(val);
        else if (stat == "wear_factor")
          wp->wearFactor = std::stod(val);
        else if (stat == "drag_cd")
          wp->dragCd = std::stod(val);
        else if (stat == "unsprung_mass")
          wp->unsprungMassKg = std::stod(val);
      }
    } else if (key.rfind("suspension.", 0) == 0) {
      const auto dot1 = key.find('.', 11);
      const auto dot2 = key.find('.', dot1 + 1);
      if (dot1 != std::string::npos && dot2 != std::string::npos) {
        const std::string name = key.substr(11, dot1 - 11);
        const std::string stat = key.substr(dot2 + 1);
        SuspensionPart *sp = SuspensionCatalogEntry(catalog, name);
        if (stat == "mass")
          sp->mass = std::stod(val);
        else if (stat == "front_spring")
          sp->frontSpringStiffness = std::stod(val);
        else if (stat == "rear_spring")
          sp->rearSpringStiffness = std::stod(val);
        else if (stat == "ride_height")
          sp->rideHeightM = std::stod(val);
        else if (stat == "roll_stiffness")
          sp->rollStiffness = std::stod(val);
        else if (stat == "aero_stability")
          sp->aeroPlatformStability = std::stod(val);
        else if (stat == "unsprung_factor")
          sp->unsprungFactor = std::stod(val);
        else if (stat == "mechanical_grip")
          sp->mechanicalGrip = std::stod(val);
      }
    } else if (key == "fuel_system.StandardTank.mass")
      catalog.fuelStandardTank.mass = std::stod(val);
    else if (key == "fuel_system.StandardTank.capacity")
      catalog.fuelStandardTank.capacityLiters = std::stod(val);
    else if (key == "fuel_system.LargeTank.mass")
      catalog.fuelLargeTank.mass = std::stod(val);
    else if (key == "fuel_system.LargeTank.capacity")
      catalog.fuelLargeTank.capacityLiters = std::stod(val);
    else if (key == "fuel_system.LeMans90L.mass")
      catalog.fuelLeMans90L.mass = std::stod(val);
    else if (key == "fuel_system.LeMans90L.capacity")
      catalog.fuelLeMans90L.capacityLiters = std::stod(val);
    else if (key == "fuel_system.LeMans110L.mass")
      catalog.fuelLeMans110L.mass = std::stod(val);
    else if (key == "fuel_system.LeMans110L.capacity")
      catalog.fuelLeMans110L.capacityLiters = std::stod(val);
    else if (key == "fuel_system.HydrogenTank.mass")
      catalog.fuelHydrogenTank.mass = std::stod(val);
    else if (key == "fuel_system.HydrogenTank.capacity")
      catalog.fuelHydrogenTank.capacityLiters = std::stod(val);
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
    else if (key == "brake.BremboHypercar.mass")
      catalog.brakeBremboHypercar.mass = std::stod(val);
    else if (key == "brake.BremboHypercar.max_pressure")
      catalog.brakeBremboHypercar.maxPressure = std::stod(val);
    else if (key == "brake.BremboHypercar.fade")
      catalog.brakeBremboHypercar.fadeUnderHeat = std::stod(val);
    else if (key == "brake.AkebonoHypercar.mass")
      catalog.brakeAkebonoHypercar.mass = std::stod(val);
    else if (key == "brake.AkebonoHypercar.max_pressure")
      catalog.brakeAkebonoHypercar.maxPressure = std::stod(val);
    else if (key == "brake.AkebonoHypercar.fade")
      catalog.brakeAkebonoHypercar.fadeUnderHeat = std::stod(val);
    else if (key == "brake.APRacingPrototype.mass")
      catalog.brakeAPRacingPrototype.mass = std::stod(val);
    else if (key == "brake.APRacingPrototype.max_pressure")
      catalog.brakeAPRacingPrototype.maxPressure = std::stod(val);
    else if (key == "brake.APRacingPrototype.fade")
      catalog.brakeAPRacingPrototype.fadeUnderHeat = std::stod(val);
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
    else if (key == "transmission.XtracP1359.mass")
      catalog.transmissionXtracP1359.mass = std::stod(val);
    else if (key == "transmission.XtracP1359.gear_count")
      catalog.transmissionXtracP1359.gearCount = std::stoi(val);
    else if (key == "transmission.XtracP1359.shift_delay")
      catalog.transmissionXtracP1359.shiftDelaySec = std::stod(val);
    else if (key == "transmission.XtracP529.mass")
      catalog.transmissionXtracP529.mass = std::stod(val);
    else if (key == "transmission.XtracP529.gear_count")
      catalog.transmissionXtracP529.gearCount = std::stoi(val);
    else if (key == "transmission.XtracP529.shift_delay")
      catalog.transmissionXtracP529.shiftDelaySec = std::stod(val);
    else if (key == "transmission.SingleSpeedEDrive.mass")
      catalog.transmissionSingleSpeedEDrive.mass = std::stod(val);
    else if (key == "transmission.SingleSpeedEDrive.gear_count")
      catalog.transmissionSingleSpeedEDrive.gearCount = std::stoi(val);
    else if (key == "transmission.SingleSpeedEDrive.shift_delay")
      catalog.transmissionSingleSpeedEDrive.shiftDelaySec = std::stod(val);
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
    else if (key == "hybrid.LMDh50kW.mass")
      catalog.hybridLMDh50kW.mass = std::stod(val);
    else if (key == "hybrid.LMDh50kW.deploy_kw")
      catalog.hybridLMDh50kW.deployPowerKW = std::stod(val);
    else if (key == "hybrid.LMDh50kW.regen_rate")
      catalog.hybridLMDh50kW.regenRate = std::stod(val);
    else if (key == "hybrid.LMDh50kW.stint_budget_mj")
      catalog.hybridLMDh50kW.stintDeployBudgetMJ = std::stod(val);
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
      else if (variant == "XtracP1359")
        tp = &catalog.transmissionXtracP1359;
      else if (variant == "XtracP529")
        tp = &catalog.transmissionXtracP529;
      else if (variant == "SingleSpeedEDrive")
        tp = &catalog.transmissionSingleSpeedEDrive;
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
