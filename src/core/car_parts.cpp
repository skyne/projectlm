#include "car_parts.hpp"
#include "class_rules.hpp"
#include <algorithm>
#include <cmath>

ChassisPart GetChassisStats(EChassis type, const PartCatalog &catalog) {
  switch (type) {
  case EChassis::Spaceframe:
    return catalog.chassisSpaceframe;
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
  default:
    return catalog.tireMedium;
  }
}

FuelSystemPart GetFuelSystemStats(EFuelSystem type, const PartCatalog &catalog) {
  switch (type) {
  case EFuelSystem::LargeTank:
    return catalog.fuelLargeTank;
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
  CoolingPart cp = GetCoolingStats(car.coolingChoice, catalog);
  TirePart tp = GetTireStats(car.tireChoice, catalog);
  FuelSystemPart fs = GetFuelSystemStats(car.fuelSystemChoice, catalog);
  BrakePart bp = GetBrakeStats(car.brakeSystemChoice, catalog);
  TransmissionPart tr =
      GetTransmissionStats(car.transmissionChoice, catalog);
  HybridPart hp = GetHybridStats(car.hybridSystemChoice, catalog);

  car.totalDragCd = 0.20 + ch.baselineDrag + fa.dragCd + ra.dragCd + cp.dragCd;
  car.totalDownforceCl = fa.downforceCl + ra.downforceCl;
  car.structuralRigidityFactor = ch.structuralRigidity;
  car.coolingCapacity = cp.thermalDissipationRate;
  car.tireGripMultiplier = tp.gripMultiplier;
  car.tireWearRate = tp.wearRate;
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

  double radius = car.engine.bore / 2.0;
  double volumeCubicMeters =
      car.engine.cylinders * M_PI * (radius * radius) * car.engine.stroke;
  double displacementLiters = volumeCubicMeters * 1000.0;

  double engineWeight =
      (displacementLiters * ac.engineWeightCoeff) +
      (car.engine.cylinders * ac.engineWeightCylFactor);
  if (car.engine.fuelType == "Diesel")
    engineWeight *= ac.dieselWeightMult;

  car.calculatedTotalMass = ch.mass + fa.mass + ra.mass + cp.mass + tp.mass +
                            fs.mass + bp.mass + tr.mass + hp.mass +
                            engineWeight + ac.baseVehicleMass;

  double boreStrokeRatio = car.engine.bore / car.engine.stroke;
  car.peakTorque =
      displacementLiters * ac.torqueCoefficient * (1.0 / boreStrokeRatio);
  car.peakHorsepower = (car.peakTorque * car.engine.maxRPM) / ac.hpConversion;

  car.vibrationIndex = car.engine.baseVibrationFactor *
                       (car.engine.stroke / ac.referenceStroke) *
                       (car.engine.maxRPM / ac.referenceRPM);
  car.fuelBurnRate =
      (displacementLiters * ac.fuelBurnCoeff) *
      (car.engine.maxRPM / ac.fuelRefRPM);
}

void ApplyClassBoP(CarConfig &car, const ClassRule &rule) {
  if (rule.powerCapHP > 0.0 && car.peakHorsepower > rule.powerCapHP) {
    double scale = rule.powerCapHP / car.peakHorsepower;
    car.peakHorsepower = rule.powerCapHP;
    car.peakTorque *= scale;
  }

  if (rule.minWeightKg > 0.0)
    car.calculatedTotalMass =
        std::max(car.calculatedTotalMass, rule.minWeightKg);
  if (rule.maxWeightKg > 0.0)
    car.calculatedTotalMass =
        std::min(car.calculatedTotalMass, rule.maxWeightKg);

  if (rule.aeroBalanceModifier != 1.0)
    car.totalDownforceCl *= rule.aeroBalanceModifier;
}
