#include "car_parts.hpp"
#include "class_rules.hpp"
#include "config_loader.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

TEST_CASE("CompileCarArchitecture produces sane hypercar", "[unit][car]") {
  PartCatalog catalog;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));

  AssemblyConfig assembly;
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));

  CarConfig car;
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), car));
  CompileCarArchitecture(car, catalog, assembly);

  REQUIRE(car.calculatedTotalMass > 400.0);
  REQUIRE(car.peakHorsepower > 200.0);
  REQUIRE(car.fuelTankCapacity > 0.0);
  REQUIRE(car.tireGripMultiplier > 0.0);
  REQUIRE(car.brakeMaxPressure > 0.0);
  REQUIRE(car.gearCount >= 6);
  REQUIRE(car.gearRatios[0] > 0.0);
}

TEST_CASE("CompileCarArchitecture applies hybrid and transmission stats",
          "[unit][car]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));

  CarConfig car;
  car.hybridSystemChoice = EHybridSystem::LMDh50kW;
  car.transmissionChoice = ETransmission::XtracP1359;
  car.brakeSystemChoice = EBrakeSystem::BremboHypercar;
  CompileCarArchitecture(car, catalog, assembly);

  REQUIRE(car.hybridDeployPowerKW == Catch::Approx(50.0));
  REQUIRE(car.hybridStintDeployBudgetMJ == Catch::Approx(8.0));
  REQUIRE(car.gearCount == 7);
  REQUIRE(car.shiftDelaySec == Catch::Approx(0.050));
  REQUIRE(car.brakeMaxPressure == Catch::Approx(0.92));
}

TEST_CASE("LoadClassRules parses config", "[unit][car][bop]") {
  auto rules = LoadClassRules(ConfigPath("class_rules.txt"));
  REQUIRE(rules.size() == 3);
  REQUIRE(rules.count("Hypercar") > 0);
}

TEST_CASE("ApplyClassBoP clamps LMGT3 power", "[unit][car][bop]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), car));
  CompileCarArchitecture(car, catalog, assembly);
  REQUIRE(car.peakHorsepower > 0.0);

  std::map<std::string, ClassRule> rules;
  rules = LoadClassRules(ConfigPath("class_rules.txt"));
  REQUIRE(rules.count("LMGT3") > 0);

  double hpBefore = car.peakHorsepower;
  REQUIRE_NOTHROW(ApplyClassBoP(car, rules.at("LMGT3")));
  REQUIRE(car.peakHorsepower <= rules.at("LMGT3").powerCapHP);
  if (hpBefore > rules.at("LMGT3").powerCapHP)
    REQUIRE(car.peakHorsepower < hpBefore);
}

TEST_CASE("ApplyClassBoP Hypercar faster than LMP2 on power", "[unit][car][bop]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));

  auto rules = LoadClassRules(ConfigPath("class_rules.txt"));
  REQUIRE(rules.count("Hypercar") > 0);
  REQUIRE(rules.count("LMP2") > 0);

  CarConfig hypercar;
  CarConfig lmp2;
  REQUIRE(LoadCarConfig(ConfigPath("cars/lemans2026/bmw_m_hybrid_v8.txt"), hypercar));
  REQUIRE(LoadCarConfig(ConfigPath("cars/lemans2026/oreca_07_gibson.txt"), lmp2));
  CompileCarArchitecture(hypercar, catalog, assembly);
  CompileCarArchitecture(lmp2, catalog, assembly);
  ApplyClassBoP(hypercar, rules.at("Hypercar"));
  ApplyClassBoP(lmp2, rules.at("LMP2"));

  REQUIRE(hypercar.peakHorsepower > lmp2.peakHorsepower);
  REQUIRE(lmp2.peakHorsepower >= rules.at("LMGT3").powerCapHP * 0.85);
}

TEST_CASE("Suspension setup overrides compile and pit deltas clamp",
          "[unit][car][suspension]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));

  CarConfig car;
  car.frontSpringStiffness = 150000.0;
  car.rearSpringStiffness = 160000.0;
  car.frontRideHeightM = 0.035;
  car.rearRideHeightM = 0.045;
  car.frontArbStiffness = 1.1;
  car.rearArbStiffness = 0.95;
  car.frontDamperBump = 10;
  car.frontDamperRebound = 6;
  car.hasCustomFrontSpring = true;
  car.hasCustomRearSpring = true;
  car.hasCustomFrontRideHeight = true;
  car.hasCustomRearRideHeight = true;
  car.hasCustomFrontArb = true;
  car.hasCustomRearArb = true;
  car.hasCustomDampers = true;
  car.hasCustomSuspensionSetup = true;

  CompileCarArchitecture(car, catalog, assembly);

  REQUIRE(car.frontSpringStiffness == Catch::Approx(150000.0));
  REQUIRE(car.rearSpringStiffness == Catch::Approx(160000.0));
  REQUIRE(car.frontRideHeightM == Catch::Approx(0.035));
  REQUIRE(car.rearRideHeightM == Catch::Approx(0.045));
  REQUIRE(car.rideHeight == Catch::Approx(0.040));
  REQUIRE(car.frontArbStiffness == Catch::Approx(1.1));
  REQUIRE(car.rearArbStiffness == Catch::Approx(0.95));
  REQUIRE(car.frontDamperBump == 10);
  REQUIRE(car.frontDamperRebound == 6);

  const double balanceBefore = car.tyreBalanceFactor;
  REQUIRE(car.rollStiffnessFactor > car.suspensionRollStiffnessBase);

  SuspensionSetupDelta delta;
  delta.frontRideHeightDelta = -0.020;
  delta.rearArbDelta = 0.60;
  ApplySuspensionSetupDelta(car, delta);

  REQUIRE(car.frontRideHeightM == Catch::Approx(0.020));
  REQUIRE(car.rearArbStiffness == Catch::Approx(1.5));
  REQUIRE(car.rideHeight == Catch::Approx((0.020 + 0.045) * 0.5));
  REQUIRE(car.tyreBalanceFactor != Catch::Approx(balanceBefore));
  REQUIRE(car.rollStiffnessFactor > car.suspensionRollStiffnessBase * 1.2);
}
