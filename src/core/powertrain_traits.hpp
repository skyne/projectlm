#ifndef POWERTRAIN_TRAITS_HPP
#define POWERTRAIN_TRAITS_HPP

#include "car_parts.hpp"

struct PowertrainTraits {
  double massMult = 1.0;
  double torqueMult = 1.0;
  double revMult = 1.0;
  double fuelBurnMult = 1.0;
  double throttleMult = 1.0;
  double thermalMult = 1.0;
  double stressMult = 1.0;
  double torquePeakRatio = 0.75;
  double torqueFalloff = 2.0;
  double throttleLagTau = 0.08;
  double serviceabilityMult = 1.0;
  double cgCorneringBonus = 1.0;
  double drivetrainExtraMassKg = 0.0;
  double deployKw = 0.0;
  double regenRate = 0.0;
  double stintBudgetMj = 0.0;
  double generatorKw = 0.0;
  double drivetrainEfficiency = 1.0;
  bool isGeneratorOnly = false;
  bool isElectricDrive = false;
  bool isFuelCell = false;
  double stackKw = 0.0;
};

PowertrainTraits ResolvePowertrainTraits(const EngineConfig &engine);

#endif
