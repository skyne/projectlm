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
  car.hybridSystemChoice = EHybridSystem::LMDh500kW;
  car.transmissionChoice = ETransmission::EightSpeedPaddle;
  car.brakeSystemChoice = EBrakeSystem::CarbonCeramic;
  CompileCarArchitecture(car, catalog, assembly);

  REQUIRE(car.hybridDeployPowerKW == Catch::Approx(500.0));
  REQUIRE(car.hybridStintDeployBudgetMJ == Catch::Approx(8.0));
  REQUIRE(car.gearCount == 8);
  REQUIRE(car.shiftDelaySec == Catch::Approx(0.04));
  REQUIRE(car.brakeMaxPressure == Catch::Approx(0.85));
}

TEST_CASE("Session setup adjusts aero and cooling", "[unit][car][setup]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));

  CarConfig baseline;
  baseline.rearAeroChoice = ERearAero::HighDownforceWing;
  baseline.frontWingAngle = 0.5;
  baseline.rearWingAngle = 0.5;
  CompileCarArchitecture(baseline, catalog, assembly);
  const double baseDf = baseline.totalDownforceCl;
  const double baseDrag = baseline.totalDragCd;

  CarConfig maxWing = baseline;
  maxWing.frontWingAngle = 1.0;
  maxWing.rearWingAngle = 1.0;
  CompileCarArchitecture(maxWing, catalog, assembly);
  REQUIRE(maxWing.totalDownforceCl > baseDf);
  REQUIRE(maxWing.totalDragCd > baseDrag);

  CarConfig minWing = baseline;
  minWing.frontWingAngle = 0.0;
  minWing.rearWingAngle = 0.0;
  CompileCarArchitecture(minWing, catalog, assembly);
  REQUIRE(minWing.totalDownforceCl < baseDf);
  REQUIRE(minWing.totalDragCd < baseDrag);

  CarConfig ducts = baseline;
  ducts.engineRadiatorSize = 0.8;
  ducts.engineRadiatorOpening = 0.5;
  ducts.oilCoolerSize = 0.6;
  ducts.oilCoolerOpening = 0.5;
  CompileCarArchitecture(ducts, catalog, assembly);
  REQUIRE(ducts.coolingCapacity < baseline.coolingCapacity);
}

TEST_CASE("ApplyClassBoP clamps LMGT3 power", "[unit][car][bop]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), car));
  CompileCarArchitecture(car, catalog, assembly);

  auto rules = LoadClassRules(ConfigPath("class_rules.txt"));
  REQUIRE(rules.count("LMGT3") > 0);

  double hpBefore = car.peakHorsepower;
  ApplyClassBoP(car, rules.at("LMGT3"));
  REQUIRE(car.peakHorsepower <= rules.at("LMGT3").powerCapHP);
  if (hpBefore > rules.at("LMGT3").powerCapHP)
    REQUIRE(car.peakHorsepower < hpBefore);
}
