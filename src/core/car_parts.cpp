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

} // namespace

ChassisPart GetChassisStats(EChassis type, const PartCatalog &catalog) {
  switch (type) {
  case EChassis::Spaceframe:
    return catalog.chassisSpaceframe;
  case EChassis::LMHInHouse:
    return catalog.chassisLMHInHouse;
  case EChassis::LMHDallaraBuilt:
    return catalog.chassisLMHDallaraBuilt;
  case EChassis::LMHMultimaticBuilt:
    return catalog.chassisLMHMultimaticBuilt;
  case EChassis::LMHMonocoque:
    return catalog.chassisLMHMonocoque;
  case EChassis::LMDhDallara:
    return catalog.chassisLMDhDallara;
  case EChassis::LMDhOreca:
    return catalog.chassisLMDhOreca;
  case EChassis::LMDhMultimatic:
    return catalog.chassisLMDhMultimatic;
  case EChassis::LMDhLigier:
    return catalog.chassisLMDhLigier;
  case EChassis::Oreca07:
    return catalog.chassisOreca07;
  case EChassis::GT3Oreca:
    return catalog.chassisGT3Oreca;
  case EChassis::GT3PrattMiller:
    return catalog.chassisGT3PrattMiller;
  case EChassis::GT3McLaren:
    return catalog.chassisGT3McLaren;
  case EChassis::GT3Multimatic:
    return catalog.chassisGT3Multimatic;
  case EChassis::GT3Spaceframe:
    return catalog.chassisGT3Spaceframe;
  default:
    return catalog.chassisCarbonMonocoque;
  }
}

FrontAeroPart GetFrontAeroStats(EFrontAero type, const PartCatalog &catalog) {
  switch (type) {
  case EFrontAero::HighDownforceSplitter:
    return catalog.frontHighDownforceSplitter;
  default:
    return catalog.frontLowDragNose;
  }
}

RearAeroPart GetRearAeroStats(ERearAero type, const PartCatalog &catalog) {
  switch (type) {
  case ERearAero::HighDownforceWing:
    return catalog.rearHighDownforceWing;
  case ERearAero::WinglessGroundEffect:
    return catalog.rearWinglessGroundEffect;
  default:
    return catalog.rearStandardWing;
  }
}

CoolingPart GetCoolingStats(ECoolingPack type, const PartCatalog &catalog) {
  switch (type) {
  case ECoolingPack::SprintSlimline:
    return catalog.coolingSprintSlimline;
  case ECoolingPack::DuctedRacing:
    return catalog.coolingDuctedRacing;
  case ECoolingPack::MaxFlowEndurance:
    return catalog.coolingMaxFlowEndurance;
  default:
    return catalog.coolingEnduranceHeavyDuty;
  }
}

TirePart GetTireStats(ETireCompound type, const PartCatalog &catalog) {
  switch (type) {
  case ETireCompound::Soft:
    return catalog.tireSoft;
  case ETireCompound::Hard:
    return catalog.tireHard;
  case ETireCompound::MichelinEndurance:
    return catalog.tireMichelinEndurance;
  default:
    return catalog.tireMedium;
  }
}

WheelPackagePart GetWheelPackageStats(EWheelPackage type,
                                      const PartCatalog &catalog) {
  switch (type) {
  case EWheelPackage::Hypercar18WideRear:
    return catalog.wheelHypercar18WideRear;
  case EWheelPackage::Hypercar18LowDrag:
    return catalog.wheelHypercar18LowDrag;
  case EWheelPackage::LMP2Oreca18:
    return catalog.wheelLMP2Oreca18;
  case EWheelPackage::GT3Front20Rear21:
    return catalog.wheelGT3Front20Rear21;
  case EWheelPackage::GT3WideRear21:
    return catalog.wheelGT3WideRear21;
  default:
    return catalog.wheelHypercar18Standard;
  }
}

SuspensionPart GetSuspensionStats(ESuspensionLayout type,
                                  const PartCatalog &catalog) {
  switch (type) {
  case ESuspensionLayout::PullrodDoubleWishbone:
    return catalog.suspensionPullrodDoubleWishbone;
  case ESuspensionLayout::DoubleWishboneHeaveSpring:
    return catalog.suspensionDoubleWishboneHeaveSpring;
  case ESuspensionLayout::MultilinkRearHypercar:
    return catalog.suspensionMultilinkRearHypercar;
  case ESuspensionLayout::MacPhersonStrutGT3:
    return catalog.suspensionMacPhersonStrutGT3;
  case ESuspensionLayout::DoubleWishboneGT3:
    return catalog.suspensionDoubleWishboneGT3;
  case ESuspensionLayout::OrecaLMP2Spec:
    return catalog.suspensionOrecaLMP2Spec;
  default:
    return catalog.suspensionPushrodDoubleWishbone;
  }
}

void ApplyTireCompoundStats(CarConfig &car, ETireCompound compound,
                            const PartCatalog &catalog) {
  TirePart tp = GetTireStats(compound, catalog);
  car.tireChoice = compound;
  car.tireGripMultiplier = tp.gripMultiplier;
  car.tireWearRate = tp.wearRate;
  car.tireOptimalTempC = tp.optimalTemp;
}

FuelSystemPart GetFuelSystemStats(EFuelSystem type, const PartCatalog &catalog) {
  switch (type) {
  case EFuelSystem::LargeTank:
    return catalog.fuelLargeTank;
  case EFuelSystem::LeMans90L:
    return catalog.fuelLeMans90L;
  case EFuelSystem::LeMans110L:
    return catalog.fuelLeMans110L;
  case EFuelSystem::HydrogenTank:
    return catalog.fuelHydrogenTank;
  default:
    return catalog.fuelStandardTank;
  }
}

BrakePart GetBrakeStats(EBrakeSystem type, const PartCatalog &catalog) {
  switch (type) {
  case EBrakeSystem::CarbonCeramic:
    return catalog.brakeCarbonCeramic;
  case EBrakeSystem::HeavyDutyEndurance:
    return catalog.brakeHeavyDutyEndurance;
  case EBrakeSystem::BremboHypercar:
    return catalog.brakeBremboHypercar;
  case EBrakeSystem::AkebonoHypercar:
    return catalog.brakeAkebonoHypercar;
  case EBrakeSystem::APRacingPrototype:
    return catalog.brakeAPRacingPrototype;
  default:
    return catalog.brakeStandardCaliper;
  }
}

TransmissionPart GetTransmissionStats(ETransmission type,
                                    const PartCatalog &catalog) {
  switch (type) {
  case ETransmission::SevenSpeedSequential:
    return catalog.transmissionSevenSpeed;
  case ETransmission::EightSpeedPaddle:
    return catalog.transmissionEightSpeed;
  case ETransmission::XtracP1359:
    return catalog.transmissionXtracP1359;
  case ETransmission::XtracP529:
    return catalog.transmissionXtracP529;
  case ETransmission::SingleSpeedEDrive:
    return catalog.transmissionSingleSpeedEDrive;
  default:
    return catalog.transmissionSixSpeed;
  }
}

HybridPart GetHybridStats(EHybridSystem type, const PartCatalog &catalog) {
  switch (type) {
  case EHybridSystem::LMDh500kW:
    return catalog.hybridLMDh500kW;
  case EHybridSystem::HypercarHV:
    return catalog.hybridHypercarHV;
  case EHybridSystem::LMDh50kW:
    return catalog.hybridLMDh50kW;
  default:
    return catalog.hybridNone;
  }
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
  ChassisPart ch = GetChassisStats(car.chassisChoice, catalog);
  FrontAeroPart fa = GetFrontAeroStats(car.frontAeroChoice, catalog);
  RearAeroPart ra = GetRearAeroStats(car.rearAeroChoice, catalog);
  CoolingCompiled coolingCompiled;
  if (car.hasCustomCoolingLayout) {
    coolingCompiled = CompileCoolingLayout(car.coolingLayout, 1.0);
  } else {
    CoolingPart cp = GetCoolingStats(car.coolingChoice, catalog);
    coolingCompiled.massKg = cp.mass;
    coolingCompiled.dragCd = cp.dragCd;
    coolingCompiled.dissipation = cp.thermalDissipationRate;
  }
  const WheelPackagePart wpBase =
      GetWheelPackageStats(car.wheelPackageChoice, catalog);
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
      GetSuspensionStats(car.frontSuspensionChoice, catalog);
  SuspensionPart rearSp =
      GetSuspensionStats(car.rearSuspensionChoice, catalog);
  FuelSystemPart fs = GetFuelSystemStats(car.fuelSystemChoice, catalog);
  BrakePart bp = GetBrakeStats(car.brakeSystemChoice, catalog);
  TransmissionPart tr =
      GetTransmissionStats(car.transmissionChoice, catalog);
  HybridPart hp = GetHybridStats(car.hybridSystemChoice, catalog);

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
  car.rideHeight = (frontSp.rideHeightM + rearSp.rideHeightM) * 0.5;
  car.rollStiffnessFactor =
      (frontSp.rollStiffness + rearSp.rollStiffness) * 0.5;
  car.aeroPlatformStability =
      (frontSp.aeroPlatformStability + rearSp.aeroPlatformStability) * 0.5;
  car.suspensionMechanicalGrip =
      (frontSp.mechanicalGrip + rearSp.mechanicalGrip) * 0.5;

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
  car.rollStiffnessFactor *= pt.cgCorneringBonus;
  car.serviceabilityFactor *= pt.serviceabilityMult;

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
}
