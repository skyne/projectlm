#include "powertrain_traits.hpp"
#include <algorithm>
#include <cmath>

namespace {

struct LayoutTraits {
  double massMult;
  double revMult;
  double torqueMult;
  double throttleMult;
  double cgBonus;
  double stressMult;
  double thermalMult;
};

LayoutTraits LayoutFor(const std::string &layout) {
  if (layout == "I4")
    return {0.82, 1.05, 0.92, 1.04, 1.0, 0.88, 1.05};
  if (layout == "I6")
    return {0.94, 1.0, 1.02, 1.02, 1.0, 1.05, 0.98};
  if (layout == "V8")
    return {1.12, 0.96, 1.14, 0.98, 0.99, 1.06, 1.02};
  if (layout == "V10")
    return {1.18, 1.08, 1.06, 1.06, 0.98, 0.9, 1.12};
  if (layout == "V12")
    return {1.28, 1.04, 1.1, 1.04, 0.97, 0.92, 1.15};
  if (layout == "Flat4")
    return {0.88, 1.02, 0.96, 1.0, 1.06, 0.94, 1.0};
  if (layout == "Flat6")
    return {0.96, 0.98, 1.04, 0.99, 1.05, 1.02, 0.96};
  if (layout == "Rotary")
    return {0.72, 1.18, 0.78, 1.1, 1.03, 0.72, 1.25};
  if (layout == "LMP2Spec")
    return {1.1, 0.98, 1.08, 1.0, 1.0, 1.04, 1.0};
  return {1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0};
}

struct FuelTraits {
  double massMult;
  double torqueMult;
  double revMult;
  double fuelBurnMult;
  double throttleMult;
  double thermalMult;
  double stressMult;
};

FuelTraits FuelFor(const std::string &fuel) {
  if (fuel == "Diesel")
    return {1.22, 1.18, 0.82, 0.78, 0.88, 1.2, 1.05};
  if (fuel == "Hydrogen")
    return {0.88, 0.94, 1.06, 1.35, 1.02, 0.85, 1.02};
  return {1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0};
}

struct AspirationTraits {
  double massMult;
  double torqueMult;
  double revMult;
  double fuelBurnMult;
  double throttleMult;
  double thermalMult;
  double stressMult;
  double torquePeakRatio;
  double torqueFalloff;
  double throttleLagTau;
  double serviceabilityMult;
};

AspirationTraits AspirationFor(const std::string &asp) {
  if (asp == "Single")
    return {1.04, 1.08, 1.0, 1.02, 0.94, 1.08, 1.0, 0.68, 2.4, 0.12, 1.0};
  if (asp == "TwinParallel")
    return {1.1, 1.14, 0.98, 1.06, 0.9, 1.14, 1.04, 0.65, 2.6, 0.16, 0.98};
  if (asp == "TwinSequential")
    return {1.16, 1.18, 0.96, 1.08, 0.82, 1.18, 1.1, 0.62, 2.2, 0.22, 0.9};
  if (asp == "Quad")
    return {1.24, 1.22, 0.94, 1.12, 0.78, 1.26, 1.16, 0.58, 2.8, 0.3, 0.85};
  if (asp == "EBoost")
    return {1.12, 1.12, 1.02, 1.04, 1.04, 1.06, 1.02, 0.7, 2.2, 0.06, 0.94};
  if (asp == "NA")
    return {0.96, 0.92, 1.06, 1.0, 1.08, 0.9, 0.92, 0.78, 2.0, 0.05, 1.04};
  return {1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.75, 2.0, 0.08, 1.0};
}

struct DrivetrainTraits {
  double extraMassKg;
  double deployKw;
  double regenRate;
  double stintBudgetMj;
  double throttleMult;
  double serviceabilityMult;
  double stressMult;
  double efficiency;
  bool isGeneratorOnly;
  bool isElectricDrive;
  double defaultGeneratorKw;
};

DrivetrainTraits DrivetrainFor(const std::string &drv) {
  if (drv == "ParallelHybrid")
    return {36, 50, 0.35, 8, 1.04, 0.94, 0.96, 1.0, false, false, 0};
  if (drv == "FrontAxleHybrid")
    return {32, 200, 0.5, 4.5, 1.06, 0.92, 0.94, 1.0, false, false, 0};
  if (drv == "RangeExtender")
    return {125, 0, 0.4, 2.5, 1.12, 0.82, 0.88, 0.88, true, true, 280};
  if (drv == "FullEV")
    return {130, 350, 0.55, 6, 1.15, 0.78, 0.85, 0.92, false, true, 0};
  return {0, 0, 0, 0, 1.0, 1.0, 1.0, 1.0, false, false, 0};
}

} // namespace

PowertrainTraits ResolvePowertrainTraits(const EngineConfig &engine) {
  const LayoutTraits lay = LayoutFor(engine.layout);
  const FuelTraits fuel = FuelFor(engine.fuelType);
  const AspirationTraits asp = AspirationFor(
      engine.aspiration.empty() ? "TwinParallel" : engine.aspiration);
  const DrivetrainTraits drv = DrivetrainFor(
      engine.drivetrain.empty() ? "Mechanical" : engine.drivetrain);

  PowertrainTraits t;
  t.massMult = lay.massMult * fuel.massMult * asp.massMult;
  t.torqueMult = lay.torqueMult * fuel.torqueMult * asp.torqueMult;
  t.revMult = lay.revMult * fuel.revMult * asp.revMult;
  t.fuelBurnMult = fuel.fuelBurnMult * asp.fuelBurnMult;
  t.throttleMult = lay.throttleMult * fuel.throttleMult * asp.throttleMult *
                   drv.throttleMult;
  t.thermalMult = lay.thermalMult * fuel.thermalMult * asp.thermalMult;
  t.stressMult = lay.stressMult * fuel.stressMult * asp.stressMult *
                 drv.stressMult;
  t.torquePeakRatio =
      engine.peakTorqueRpm > 0 && engine.maxRPM > 0
          ? static_cast<double>(engine.peakTorqueRpm) / engine.maxRPM
          : asp.torquePeakRatio;
  t.torqueFalloff = asp.torqueFalloff;
  t.throttleLagTau = asp.throttleLagTau;
  t.serviceabilityMult = asp.serviceabilityMult * drv.serviceabilityMult;
  t.cgCorneringBonus = lay.cgBonus;
  t.drivetrainExtraMassKg = drv.extraMassKg;
  t.deployKw = drv.deployKw;
  t.regenRate = drv.regenRate;
  t.stintBudgetMj = drv.stintBudgetMj;
  t.isGeneratorOnly = drv.isGeneratorOnly;
  t.isElectricDrive = drv.isElectricDrive;
  t.drivetrainEfficiency = drv.efficiency;
  t.generatorKw =
      engine.generatorKw > 0.0 ? engine.generatorKw : drv.defaultGeneratorKw;

  if (engine.fuelType == "Hydrogen" && engine.energyConverter == "FuelCell") {
    const double stackKw =
        engine.generatorKw > 0.0 ? engine.generatorKw : 420.0;
    const double buffer = std::clamp(engine.bufferSize, 0.0, 1.0);
    const double burstKw = 75.0 + buffer * 75.0;
    const double bufferMassKg = 14.0 + buffer * 42.0;
    t.isFuelCell = true;
    t.isElectricDrive = true;
    t.isGeneratorOnly = false;
    t.stackKw = stackKw;
    t.generatorKw = stackKw;
    t.deployKw = burstKw;
    t.regenRate = 0.45 - buffer * 0.08;
    t.stintBudgetMj = 3.0 + buffer * 5.5;
    t.drivetrainExtraMassKg = 162.0 + stackKw * 0.062 + bufferMassKg;
    t.stressMult = 0.2;
    t.thermalMult = 0.70;
    t.fuelBurnMult = 0.86 + buffer * 0.16;
    t.throttleMult = 1.06;
    t.serviceabilityMult = 0.90 - buffer * 0.08;
    t.throttleLagTau = 0.04;
    t.drivetrainEfficiency = 0.55;
    t.torquePeakRatio = 0.85;
    t.torqueFalloff = 0.8;
  } else if (engine.fuelType == "Electric" &&
             engine.drivetrain == "FullEV") {
    double targetHp = engine.powerTargetHp;
    if (targetHp <= 0.0 && engine.peakTorqueNm > 0.0)
      targetHp = engine.peakTorqueNm / 4.2;
    if (targetHp <= 0.0)
      targetHp = 520.0;
    t.deployKw = std::clamp(targetHp / 1.34, 260.0, 520.0);
    t.isElectricDrive = true;
    t.isGeneratorOnly = false;
    t.isFuelCell = false;
    t.throttleMult *= 1.15;
    t.serviceabilityMult *= 0.78;
    t.stressMult *= 0.85;
    t.drivetrainEfficiency = 0.92;
  }
  return t;
}
