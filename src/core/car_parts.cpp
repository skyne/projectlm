#include "car_parts.hpp"
#include "cooling_layout.hpp"
#include "powertrain_traits.hpp"
#include "class_rules.hpp"
#include <algorithm>
#include <cmath>

namespace {

double AxleWidthGripFactor(double widthMm, double baselineMm) {
  const double t = (widthMm - baselineMm) / 100.0;
  if (t <= 0.0)
    return 1.0 + t * 0.08;
  const double bonus = (0.05 * t) / (1.0 + 0.45 * t);
  const double overload = 0.035 * t * t;
  return 1.0 + bonus - overload;
}

double TyreBalanceCorneringFactor(double frontMm, double rearMm,
                                  double baseFrontMm, double baseRearMm) {
  const double baseRatio = baseFrontMm / baseRearMm;
  const double currentRatio = frontMm / rearMm;
  const double ratioDelta = (currentRatio - baseRatio) / baseRatio;
  const double understeer = std::max(0.0, ratioDelta) * 0.42;
  const double oversteer = std::max(0.0, -ratioDelta) * 0.28;
  const double frontExcess = std::max(0.0, (frontMm - baseFrontMm) / 200.0);
  const double turnInLoss = frontExcess * 0.18;
  return std::clamp(1.0 - understeer - oversteer - turnInLoss, 0.72, 1.04);
}

double AxleWidthWearFactor(double widthMm, double baselineMm) {
  const double delta = (widthMm - baselineMm) / 200.0;
  return 1.0 + delta * 0.08 + std::max(0.0, -delta) * 0.045;
}

double AxleWidthHeatFactor(double widthMm, double baselineMm) {
  const double delta = (widthMm - baselineMm) / 200.0;
  return 1.0 + std::max(0.0, delta) * 0.16 + std::max(0.0, -delta) * 0.05;
}

double AxleCoolFactor(double widthMm, double baselineMm) {
  const double delta = (widthMm - baselineMm) / 200.0;
  return std::clamp(1.0 + delta * 0.05, 0.92, 1.10);
}

double AxleDiameterThermalMassFactor(double diaDelta) {
  return std::clamp(1.0 + diaDelta * 0.04, 0.88, 1.10);
}

constexpr double kRideHeightMinM = 0.020;
constexpr double kRideHeightMaxM = 0.120;
constexpr double kSpringMinNm = 80000.0;
constexpr double kSpringMaxNm = 220000.0;
constexpr double kArbMin = 0.5;
constexpr double kArbMax = 1.5;
constexpr int kDamperMin = 1;
constexpr int kDamperMax = 15;

double RideHeightBalanceFactor(double frontM, double rearM) {
  const double rakeMm = (frontM - rearM) * 1000.0;
  return std::clamp(1.0 - rakeMm * 0.004, 0.92, 1.04);
}

double ArbBalanceFactor(double frontArb, double rearArb) {
  const double frontEffect = 1.0 - (frontArb - 1.0) * 0.06;
  const double rearEffect = 1.0 + (rearArb - 1.0) * 0.06;
  return std::clamp(frontEffect * rearEffect, 0.92, 1.04);
}

} // namespace

bool SuspensionSetupDelta::hasAnyChange() const {
  return std::abs(frontRideHeightDelta) > 1e-9 ||
         std::abs(rearRideHeightDelta) > 1e-9 ||
         std::abs(frontSpringDelta) > 1e-6 ||
         std::abs(rearSpringDelta) > 1e-6 ||
         std::abs(frontArbDelta) > 1e-6 || std::abs(rearArbDelta) > 1e-6 ||
         frontDamperBumpDelta != 0 || frontDamperReboundDelta != 0 ||
         rearDamperBumpDelta != 0 || rearDamperReboundDelta != 0;
}

void ClampSuspensionSetup(CarConfig &car) {
  car.frontRideHeightM =
      std::clamp(car.frontRideHeightM, kRideHeightMinM, kRideHeightMaxM);
  car.rearRideHeightM =
      std::clamp(car.rearRideHeightM, kRideHeightMinM, kRideHeightMaxM);
  car.frontSpringStiffness =
      std::clamp(car.frontSpringStiffness, kSpringMinNm, kSpringMaxNm);
  car.rearSpringStiffness =
      std::clamp(car.rearSpringStiffness, kSpringMinNm, kSpringMaxNm);
  car.frontArbStiffness =
      std::clamp(car.frontArbStiffness, kArbMin, kArbMax);
  car.rearArbStiffness = std::clamp(car.rearArbStiffness, kArbMin, kArbMax);
  car.frontDamperBump =
      std::clamp(car.frontDamperBump, kDamperMin, kDamperMax);
  car.frontDamperRebound =
      std::clamp(car.frontDamperRebound, kDamperMin, kDamperMax);
  car.rearDamperBump = std::clamp(car.rearDamperBump, kDamperMin, kDamperMax);
  car.rearDamperRebound =
      std::clamp(car.rearDamperRebound, kDamperMin, kDamperMax);
}

void FinalizeSuspensionDerivedStats(CarConfig &car) {
  car.rideHeight = (car.frontRideHeightM + car.rearRideHeightM) * 0.5;
  const double rhBalance =
      RideHeightBalanceFactor(car.frontRideHeightM, car.rearRideHeightM);
  const double arbBalance =
      ArbBalanceFactor(car.frontArbStiffness, car.rearArbStiffness);
  car.tyreBalanceFactor = std::clamp(
      car.wheelTyreBalanceFactor * rhBalance * arbBalance, 0.72, 1.04);
  const double arbRoll =
      (car.frontArbStiffness + car.rearArbStiffness) * 0.5;
  car.rollStiffnessFactor = car.suspensionRollStiffnessBase * arbRoll;

  const double camberDelta = (car.frontCamberDeg - car.rearCamberDeg) / 10.0;
  const double toePenalty =
      (std::abs(car.frontToeDeg) + std::abs(car.rearToeDeg)) * 0.04;
  const double camberGrip =
      1.0 + (car.frontCamberDeg + car.rearCamberDeg) * 0.004;
  car.suspensionMechanicalGrip =
      std::clamp(car.suspensionMechanicalGrip * camberGrip * (1.0 - toePenalty),
                 0.85, 1.08);
  car.tyreBalanceFactor = std::clamp(
      car.tyreBalanceFactor * (1.0 - camberDelta * 0.06), 0.72, 1.04);
}

void ApplySuspensionSetupDelta(CarConfig &car,
                               const SuspensionSetupDelta &delta) {
  if (!delta.hasAnyChange())
    return;

  if (std::abs(delta.frontRideHeightDelta) > 1e-9) {
    car.frontRideHeightM += delta.frontRideHeightDelta;
    car.hasCustomFrontRideHeight = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (std::abs(delta.rearRideHeightDelta) > 1e-9) {
    car.rearRideHeightM += delta.rearRideHeightDelta;
    car.hasCustomRearRideHeight = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (std::abs(delta.frontSpringDelta) > 1e-6) {
    car.frontSpringStiffness += delta.frontSpringDelta;
    car.hasCustomFrontSpring = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (std::abs(delta.rearSpringDelta) > 1e-6) {
    car.rearSpringStiffness += delta.rearSpringDelta;
    car.hasCustomRearSpring = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (std::abs(delta.frontArbDelta) > 1e-6) {
    car.frontArbStiffness += delta.frontArbDelta;
    car.hasCustomFrontArb = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (std::abs(delta.rearArbDelta) > 1e-6) {
    car.rearArbStiffness += delta.rearArbDelta;
    car.hasCustomRearArb = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (delta.frontDamperBumpDelta != 0) {
    car.frontDamperBump += delta.frontDamperBumpDelta;
    car.hasCustomDampers = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (delta.frontDamperReboundDelta != 0) {
    car.frontDamperRebound += delta.frontDamperReboundDelta;
    car.hasCustomDampers = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (delta.rearDamperBumpDelta != 0) {
    car.rearDamperBump += delta.rearDamperBumpDelta;
    car.hasCustomDampers = true;
    car.hasCustomSuspensionSetup = true;
  }
  if (delta.rearDamperReboundDelta != 0) {
    car.rearDamperRebound += delta.rearDamperReboundDelta;
    car.hasCustomDampers = true;
    car.hasCustomSuspensionSetup = true;
  }

  ClampSuspensionSetup(car);
  FinalizeSuspensionDerivedStats(car);
}

namespace {

const PartStats kEmptyStats{};

const PartStats &LookupStats(const PartCatalog &catalog,
                             const std::string &slot,
                             const std::string &partId) {
  const PartStats *stats = catalog.FindStats(slot, partId);
  return stats ? *stats : kEmptyStats;
}

} // namespace

std::string PartChoiceForSlot(const CarConfig &car, const std::string &slot) {
  if (slot == "chassis")
    return car.chassisId;
  if (slot == "front_aero")
    return car.frontAeroId;
  if (slot == "rear_aero")
    return car.rearAeroId;
  if (slot == "cooling")
    return car.hasCustomCoolingLayout ? "Custom" : car.coolingId;
  if (slot == "fuel_system")
    return car.fuelSystemId;
  if (slot == "brake_system")
    return car.brakeSystemId;
  if (slot == "transmission")
    return car.transmissionId;
  if (slot == "hybrid_system")
    return car.hybridSystemId;
  if (slot == "wheel_package")
    return car.wheelPackageId;
  if (slot == "suspension")
    return car.frontSuspensionId;
  return "";
}

std::string TireCompoundCatalogId(ETireCompound compound) {
  switch (compound) {
  case ETireCompound::Soft:
    return "Soft";
  case ETireCompound::Hard:
    return "Hard";
  case ETireCompound::MichelinEndurance:
    return "MichelinEndurance";
  default:
    return "Medium";
  }
}

ChassisPart GetChassisStats(const PartCatalog &catalog,
                            const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "chassis", partId);
  ChassisPart part;
  part.mass = PartStatD(s, "mass");
  part.structuralRigidity = PartStatD(s, "rigidity", 1.0);
  part.baselineDrag = PartStatD(s, "drag");
  part.serviceability = PartStatD(s, "serviceability", 1.0);
  part.driverChangeFactor = PartStatD(s, "driver_change", 1.0);
  return part;
}

FrontAeroPart GetFrontAeroStats(const PartCatalog &catalog,
                                const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "front_aero", partId);
  FrontAeroPart part;
  part.mass = PartStatD(s, "mass");
  part.downforceCl = PartStatD(s, "downforce");
  part.dragCd = PartStatD(s, "drag");
  return part;
}

RearAeroPart GetRearAeroStats(const PartCatalog &catalog,
                              const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "rear_aero", partId);
  RearAeroPart part;
  part.mass = PartStatD(s, "mass");
  part.downforceCl = PartStatD(s, "downforce");
  part.dragCd = PartStatD(s, "drag");
  part.permitsWinglessPitch = PartStatB(s, "permits_wingless");
  return part;
}

CoolingPart GetCoolingStats(const PartCatalog &catalog,
                            const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "cooling", partId);
  CoolingPart part;
  part.mass = PartStatD(s, "mass");
  part.dragCd = PartStatD(s, "drag");
  part.thermalDissipationRate = PartStatD(s, "dissipation", 1.0);
  return part;
}

TirePart GetTireStats(const PartCatalog &catalog, const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "tire", partId);
  TirePart part;
  part.mass = PartStatD(s, "mass");
  part.gripMultiplier = PartStatD(s, "grip", 1.0);
  part.wearRate = PartStatD(s, "wear_rate");
  part.optimalTemp = PartStatD(s, "optimal_temp", 80.0);
  return part;
}

WheelPackagePart GetWheelPackageStats(const PartCatalog &catalog,
                                      const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "wheel_package", partId);
  WheelPackagePart part;
  part.mass = PartStatD(s, "mass");
  part.frontDiameterM = PartStatD(s, "front_diameter_m", 0.457);
  part.rearDiameterM = PartStatD(s, "rear_diameter_m", 0.457);
  part.frontWidthMm = PartStatD(s, "front_width_mm", 305.0);
  part.rearWidthMm = PartStatD(s, "rear_width_mm", 310.0);
  part.gripFactor = PartStatD(s, "grip_factor", 1.0);
  part.wearFactor = PartStatD(s, "wear_factor", 1.0);
  part.dragCd = PartStatD(s, "drag");
  part.unsprungMassKg = PartStatD(s, "unsprung_mass_kg", 8.0);
  return part;
}

SuspensionPart GetSuspensionStats(const PartCatalog &catalog,
                                  const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "suspension", partId);
  SuspensionPart part;
  part.mass = PartStatD(s, "mass");
  part.frontSpringStiffness = PartStatD(s, "front_spring", 130000.0);
  part.rearSpringStiffness = PartStatD(s, "rear_spring", 145000.0);
  part.rideHeightM = PartStatD(s, "ride_height", 0.040);
  part.rollStiffness = PartStatD(s, "roll_stiffness", 1.0);
  part.aeroPlatformStability = PartStatD(s, "aero_stability", 1.0);
  part.unsprungFactor = PartStatD(s, "unsprung_factor", 1.0);
  part.mechanicalGrip = PartStatD(s, "mechanical_grip", 1.0);
  return part;
}

void ApplyTireCompoundStats(CarConfig &car, ETireCompound compound,
                            const PartCatalog &catalog) {
  TirePart tp = GetTireStats(catalog, TireCompoundCatalogId(compound));
  car.tireChoice = compound;
  car.tireGripMultiplier = tp.gripMultiplier;
  car.tireWearRate = tp.wearRate;
  car.tireOptimalTempC = tp.optimalTemp;
}

FuelSystemPart GetFuelSystemStats(const PartCatalog &catalog,
                                  const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "fuel_system", partId);
  FuelSystemPart part;
  part.mass = PartStatD(s, "mass");
  part.capacityLiters = PartStatD(s, "capacity", 100.0);
  return part;
}

BrakePart GetBrakeStats(const PartCatalog &catalog, const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "brake", partId);
  BrakePart part;
  part.mass = PartStatD(s, "mass");
  part.maxPressure = PartStatD(s, "max_pressure", 0.7);
  part.fadeUnderHeat = PartStatD(s, "fade", 0.1);
  return part;
}

TransmissionPart GetTransmissionStats(const PartCatalog &catalog,
                                      const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "transmission", partId);
  TransmissionPart tr;
  tr.mass = PartStatD(s, "mass");
  tr.gearCount = PartStatI(s, "gear_count", 6);
  tr.shiftDelaySec = PartStatD(s, "shift_delay", 0.08);
  for (int i = 0; i < 8; ++i)
    tr.gearRatios[i] = PartStatD(s, "gear_" + std::to_string(i + 1));
  for (int i = 0; i < 7; ++i)
    tr.gearShiftSpeeds[i] = PartStatD(s, "shift_" + std::to_string(i + 1));
  return tr;
}

HybridPart GetHybridStats(const PartCatalog &catalog,
                          const std::string &partId) {
  const PartStats &s = LookupStats(catalog, "hybrid", partId);
  HybridPart part;
  part.mass = PartStatD(s, "mass");
  part.deployPowerKW = PartStatD(s, "deploy_kw");
  part.regenRate = PartStatD(s, "regen_rate");
  part.stintDeployBudgetMJ = PartStatD(s, "stint_budget_mj");
  return part;
}

std::string GetAttachmentPoint(const PartCatalog &catalog,
                               const std::string &slot,
                               const std::string &partName) {
  const std::string key = slot + "." + partName;
  auto it = catalog.attachmentPoints.find(key);
  if (it != catalog.attachmentPoints.end())
    return it->second;
  return slot + ".mount." + partName;
}

void CompileCarArchitecture(CarConfig &car, const PartCatalog &catalog,
                            const AssemblyConfig &ac) {
  const bool customFrontSpring = car.hasCustomFrontSpring;
  const bool customRearSpring = car.hasCustomRearSpring;
  const bool customFrontRide = car.hasCustomFrontRideHeight;
  const bool customRearRide = car.hasCustomRearRideHeight;
  const bool customFrontArb = car.hasCustomFrontArb;
  const bool customRearArb = car.hasCustomRearArb;
  const bool customDampers = car.hasCustomDampers;
  const double frontSpringOverride = car.frontSpringStiffness;
  const double rearSpringOverride = car.rearSpringStiffness;
  const double frontRideOverride = car.frontRideHeightM;
  const double rearRideOverride = car.rearRideHeightM;
  const double frontArbOverride = car.frontArbStiffness;
  const double rearArbOverride = car.rearArbStiffness;
  const int frontBumpOverride = car.frontDamperBump;
  const int frontReboundOverride = car.frontDamperRebound;
  const int rearBumpOverride = car.rearDamperBump;
  const int rearReboundOverride = car.rearDamperRebound;

  ChassisPart ch = GetChassisStats(catalog, car.chassisId);
  FrontAeroPart fa = GetFrontAeroStats(catalog, car.frontAeroId);
  RearAeroPart ra = GetRearAeroStats(catalog, car.rearAeroId);
  CoolingCompiled coolingCompiled;
  if (car.hasCustomCoolingLayout) {
    coolingCompiled = CompileCoolingLayout(car.coolingLayout, 1.0);
  } else {
    CoolingPart cp = GetCoolingStats(catalog, car.coolingId);
    coolingCompiled.massKg = cp.mass;
    coolingCompiled.dragCd = cp.dragCd;
    coolingCompiled.dissipation = cp.thermalDissipationRate;
  }
  const WheelPackagePart wpBase =
      GetWheelPackageStats(catalog, car.wheelPackageId);
  WheelPackagePart wp = wpBase;
  if (car.hasCustomWheelDims) {
    if (car.customFrontWheelDiameterM > 0.0)
      wp.frontDiameterM = car.customFrontWheelDiameterM;
    if (car.customRearWheelDiameterM > 0.0)
      wp.rearDiameterM = car.customRearWheelDiameterM;
    if (car.customFrontTireWidthMm > 0.0)
      wp.frontWidthMm = car.customFrontTireWidthMm;
    if (car.customRearTireWidthMm > 0.0)
      wp.rearWidthMm = car.customRearTireWidthMm;
  }

  const double frontWidthDelta =
      (wp.frontWidthMm - wpBase.frontWidthMm) / 200.0;
  const double rearWidthDelta =
      (wp.rearWidthMm - wpBase.rearWidthMm) / 200.0;
  const double frontDiaDelta =
      (wp.frontDiameterM - wpBase.frontDiameterM) / 0.0254;
  const double rearDiaDelta =
      (wp.rearDiameterM - wpBase.rearDiameterM) / 0.0254;

  // Per-axle aero/mass tradeoffs — wear/heat scaling is per axle below.
  const double totalWidthDelta =
      std::max(0.0, frontWidthDelta) + std::max(0.0, rearWidthDelta);
  wp.dragCd += std::max(0.0, frontWidthDelta) * 0.028 +
               std::max(0.0, rearWidthDelta) * 0.012 +
               totalWidthDelta * 0.015 + frontDiaDelta * 0.0025 +
               rearDiaDelta * 0.0015;
  wp.unsprungMassKg *=
      1.0 + (frontDiaDelta + rearDiaDelta) * 0.04 +
      (frontWidthDelta + rearWidthDelta) * 0.035;
  wp.mass += (frontWidthDelta + rearWidthDelta) * 2.2 +
             (frontDiaDelta + rearDiaDelta) * 1.5;
  SuspensionPart frontSp =
      GetSuspensionStats(catalog, car.frontSuspensionId);
  SuspensionPart rearSp =
      GetSuspensionStats(catalog, car.rearSuspensionId);
  FuelSystemPart fs = GetFuelSystemStats(catalog, car.fuelSystemId);
  BrakePart bp = GetBrakeStats(catalog, car.brakeSystemId);
  TransmissionPart tr =
      GetTransmissionStats(catalog, car.transmissionId);
  HybridPart hp = GetHybridStats(catalog, car.hybridSystemId);

  ApplyTireCompoundStats(car, car.tireChoice, catalog);

  car.frontWheelRadiusM = wp.frontDiameterM * 0.5;
  car.rearWheelRadiusM = wp.rearDiameterM * 0.5;
  car.frontAxleGripFactor =
      AxleWidthGripFactor(wp.frontWidthMm, wpBase.frontWidthMm);
  car.rearAxleGripFactor =
      AxleWidthGripFactor(wp.rearWidthMm, wpBase.rearWidthMm);
  car.tyreBalanceFactor = TyreBalanceCorneringFactor(
      wp.frontWidthMm, wp.rearWidthMm, wpBase.frontWidthMm,
      wpBase.rearWidthMm);
  car.wheelTyreBalanceFactor = car.tyreBalanceFactor;
  car.frontAxleWearFactor =
      AxleWidthWearFactor(wp.frontWidthMm, wpBase.frontWidthMm);
  car.rearAxleWearFactor =
      AxleWidthWearFactor(wp.rearWidthMm, wpBase.rearWidthMm);
  const double frontThermalMass = AxleDiameterThermalMassFactor(frontDiaDelta);
  const double rearThermalMass = AxleDiameterThermalMassFactor(rearDiaDelta);
  car.frontAxleHeatFactor =
      AxleWidthHeatFactor(wp.frontWidthMm, wpBase.frontWidthMm) /
      frontThermalMass;
  car.rearAxleHeatFactor =
      AxleWidthHeatFactor(wp.rearWidthMm, wpBase.rearWidthMm) /
      rearThermalMass;
  car.frontAxleCoolFactor =
      AxleCoolFactor(wp.frontWidthMm, wpBase.frontWidthMm) / frontThermalMass;
  car.rearAxleCoolFactor =
      AxleCoolFactor(wp.rearWidthMm, wpBase.rearWidthMm) / rearThermalMass;
  car.wheelGripFactor = wp.gripFactor;
  car.wheelWearFactor = wp.wearFactor;
  car.unsprungMassKg = wp.unsprungMassKg *
                       ((frontSp.unsprungFactor + rearSp.unsprungFactor) * 0.5);

  car.frontSpringStiffness = frontSp.frontSpringStiffness;
  car.rearSpringStiffness = rearSp.rearSpringStiffness;
  car.frontRideHeightM = frontSp.rideHeightM;
  car.rearRideHeightM = rearSp.rideHeightM;
  car.rideHeight = (frontSp.rideHeightM + rearSp.rideHeightM) * 0.5;
  car.rollStiffnessFactor =
      (frontSp.rollStiffness + rearSp.rollStiffness) * 0.5;
  car.aeroPlatformStability =
      (frontSp.aeroPlatformStability + rearSp.aeroPlatformStability) * 0.5;
  car.suspensionMechanicalGrip =
      (frontSp.mechanicalGrip + rearSp.mechanicalGrip) * 0.5;

  if (customFrontSpring)
    car.frontSpringStiffness = frontSpringOverride;
  if (customRearSpring)
    car.rearSpringStiffness = rearSpringOverride;
  if (customFrontRide)
    car.frontRideHeightM = frontRideOverride;
  if (customRearRide)
    car.rearRideHeightM = rearRideOverride;
  if (customFrontArb)
    car.frontArbStiffness = frontArbOverride;
  else
    car.frontArbStiffness = 1.0;
  if (customRearArb)
    car.rearArbStiffness = rearArbOverride;
  else
    car.rearArbStiffness = 1.0;
  if (customDampers) {
    car.frontDamperBump = frontBumpOverride;
    car.frontDamperRebound = frontReboundOverride;
    car.rearDamperBump = rearBumpOverride;
    car.rearDamperRebound = rearReboundOverride;
  } else {
    car.frontDamperBump = 8;
    car.frontDamperRebound = 8;
    car.rearDamperBump = 8;
    car.rearDamperRebound = 8;
  }
  ClampSuspensionSetup(car);

  car.totalDragCd =
      ac.bodyBaseDragCd + ch.baselineDrag + fa.dragCd + ra.dragCd +
      coolingCompiled.dragCd + wp.dragCd;
  car.totalDownforceCl = fa.downforceCl + ra.downforceCl;
  car.structuralRigidityFactor = ch.structuralRigidity;
  car.serviceabilityFactor = ch.serviceability;
  car.driverChangeFactor = ch.driverChangeFactor;
  car.coolingCapacity = coolingCompiled.dissipation;
  car.fuelTankCapacity = fs.capacityLiters;
  car.brakeMaxPressure = bp.maxPressure;
  car.brakeFadeUnderHeat = bp.fadeUnderHeat;
  car.gearCount = tr.gearCount;
  car.shiftDelaySec = tr.shiftDelaySec;
  for (int i = 0; i < 8; ++i)
    car.gearRatios[i] = tr.gearRatios[i];
  for (int i = 0; i < 7; ++i)
    car.gearShiftSpeeds[i] = tr.gearShiftSpeeds[i];
  car.hybridDeployPowerKW = hp.deployPowerKW;
  car.hybridRegenRate = hp.regenRate;
  car.hybridStintDeployBudgetMJ = hp.stintDeployBudgetMJ;

  if (ra.permitsWinglessPitch) {
    double groundSuckEfficiency =
        ac.groundSuckNumerator / (car.rideHeight + ac.groundSuckOffset);
    car.totalDownforceCl += (ac.groundEffectDownforce * groundSuckEfficiency);
    car.totalDragCd -= ac.winglessDragReduction;
  }

  PowertrainTraits pt = ResolvePowertrainTraits(car.engine);

  double radius = car.engine.bore / 2.0;
  double volumeCubicMeters =
      car.engine.cylinders * M_PI * (radius * radius) * car.engine.stroke;
  double displacementLiters = volumeCubicMeters * 1000.0;

  double engineWeight =
      (displacementLiters * ac.engineWeightCoeff * pt.massMult) +
      (car.engine.cylinders * ac.engineWeightCylFactor);
  if (car.engine.fuelType == "Diesel")
    engineWeight *= ac.dieselWeightMult;
  if (pt.isElectricDrive && car.engine.drivetrain == "FullEV")
    engineWeight = 12.0;

  car.calculatedTotalMass = ch.mass + fa.mass + ra.mass + coolingCompiled.massKg +
                            wp.mass +
                            ((frontSp.mass + rearSp.mass) * 0.5) + fs.mass +
                            bp.mass + tr.mass + hp.mass +
                            car.unsprungMassKg + engineWeight +
                            pt.drivetrainExtraMassKg + ac.baseVehicleMass;

  double boreStrokeRatio =
      car.engine.stroke > 0.0 ? car.engine.bore / car.engine.stroke : 1.1;
  if (car.engine.peakTorqueNm > 0.0) {
    car.peakTorque = car.engine.peakTorqueNm;
  } else {
    const double specificTorque =
        car.engine.specificTorqueNmPerL > 0.0
            ? car.engine.specificTorqueNmPerL
            : ac.defaultSpecificTorqueNmPerL;
    car.peakTorque = displacementLiters * specificTorque * pt.torqueMult *
                     std::sqrt(std::max(0.5, boreStrokeRatio));
  }

  const int peakTorqueRpm =
      car.engine.peakTorqueRpm > 0
          ? car.engine.peakTorqueRpm
          : static_cast<int>(car.engine.maxRPM * pt.torquePeakRatio);
  car.peakHorsepower =
      (car.peakTorque * peakTorqueRpm) / ac.hpConversion;

  if (pt.isGeneratorOnly && pt.generatorKw > 0.0) {
    const double elecKw = pt.generatorKw * pt.drivetrainEfficiency;
    car.peakHorsepower = elecKw * 1.34;
    car.electricalDeployKW = elecKw + pt.deployKw;
  } else if (pt.isElectricDrive && car.engine.drivetrain == "FullEV") {
    car.peakHorsepower = pt.deployKw * 1.34;
    car.electricalDeployKW = pt.deployKw;
  }

  car.engineThrottleResponse = pt.throttleMult;
  car.throttleLagTau = pt.throttleLagTau;
  car.torquePeakRatio = pt.torquePeakRatio;
  car.torqueCurveFalloff = pt.torqueFalloff;
  car.engineStressMult = pt.stressMult;
  car.cgCorneringBonus = pt.cgCorneringBonus;
  car.powertrainFuelBurnMult = pt.fuelBurnMult;
  car.powertrainThermalMult = pt.thermalMult;
  car.drivetrainExtraMassKg = pt.drivetrainExtraMassKg;
  car.isGeneratorOnly = pt.isGeneratorOnly;
  car.isElectricDrive = pt.isElectricDrive;
  car.generatorPowerKW = pt.generatorKw;
  car.drivetrainEfficiency = pt.drivetrainEfficiency;
  car.powertrainServiceabilityMult = pt.serviceabilityMult;
  car.suspensionRollStiffnessBase =
      (frontSp.rollStiffness + rearSp.rollStiffness) * 0.5 *
      pt.cgCorneringBonus;
  car.serviceabilityFactor *= pt.serviceabilityMult;

  FinalizeSuspensionDerivedStats(car);

  if (pt.deployKw > 0.0 && hp.deployPowerKW <= 0.0) {
    car.hybridDeployPowerKW = pt.deployKw;
    car.hybridRegenRate = pt.regenRate;
    car.hybridStintDeployBudgetMJ = pt.stintBudgetMj;
  }

  car.vibrationIndex = car.engineStressMult *
                       (car.engine.stroke / ac.referenceStroke) *
                       (car.engine.maxRPM / ac.referenceRPM);
  car.fuelBurnRate = (displacementLiters * ac.fuelBurnCoeff) *
                     (car.engine.maxRPM / ac.fuelRefRPM) *
                     car.powertrainFuelBurnMult;
  if (car.isElectricDrive && car.engine.drivetrain == "FullEV")
    car.fuelBurnRate = 0.0;
}

void ApplyClassBoP(CarConfig &car, const ClassRule &rule) {
  if (rule.powerCapHP > 0.0 && car.peakHorsepower > rule.powerCapHP) {
    const double scale = rule.powerCapHP / car.peakHorsepower;
    car.peakHorsepower = rule.powerCapHP;
    car.peakTorque *= scale;
  }

  if (rule.minWeightKg > 0.0)
    car.calculatedTotalMass =
        std::max(car.calculatedTotalMass, rule.minWeightKg);
  if (rule.maxWeightKg > 0.0)
    car.calculatedTotalMass =
        std::min(car.calculatedTotalMass, rule.maxWeightKg);

  if (rule.aeroBalanceModifier > 0.0)
    car.totalDownforceCl *= rule.aeroBalanceModifier;
  if (rule.dragModifier > 0.0)
    car.totalDragCd *= rule.dragModifier;

  if (rule.fuelBurnModifier > 0.0)
    car.fuelBurnRate *= rule.fuelBurnModifier;
}
