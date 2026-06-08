#include "car_parts.hpp"
#include "config_loader.hpp"
#include "part_catalog.hpp"
#include "part_compatibility.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

namespace {

PartCatalog catalog;
AssemblyConfig assembly;

void LoadFixtures() {
  static bool loaded = false;
  if (loaded)
    return;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  loaded = true;
}

CarConfig BaselineHypercar() {
  CarConfig car;
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), car));
  car.diffuserId = "StockFloor";
  car.exhaustId = "TwinOutletSide";
  return car;
}

} // namespace

TEST_CASE("Default diffuser and exhaust are neutral vs legacy compile",
          "[unit][car][exhaust_diffuser]") {
  LoadFixtures();

  CarConfig legacy;
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), legacy));
  legacy.diffuserId.clear();
  legacy.exhaustId.clear();
  CompileCarArchitecture(legacy, catalog, assembly);

  CarConfig withDefaults = BaselineHypercar();
  CompileCarArchitecture(withDefaults, catalog, assembly);

  REQUIRE(withDefaults.totalDownforceCl ==
          Catch::Approx(legacy.totalDownforceCl));
  REQUIRE(withDefaults.totalDragCd == Catch::Approx(legacy.totalDragCd));
  REQUIRE(withDefaults.peakTorque == Catch::Approx(legacy.peakTorque));
  REQUIRE(withDefaults.peakHorsepower ==
          Catch::Approx(legacy.peakHorsepower));
  REQUIRE(withDefaults.calculatedTotalMass ==
          Catch::Approx(legacy.calculatedTotalMass));
}

TEST_CASE("Blown exhaust boosts diffuser downforce", "[unit][car][exhaust_diffuser]") {
  LoadFixtures();

  CarConfig base = BaselineHypercar();
  base.diffuserId = "HighDownforceDiffuser";
  base.exhaustId = "TwinOutletSide";
  CompileCarArchitecture(base, catalog, assembly);
  const double clBase = base.totalDownforceCl;

  CarConfig blown = BaselineHypercar();
  blown.diffuserId = "HighDownforceDiffuser";
  blown.exhaustId = "BlownDiffuser";
  CompileCarArchitecture(blown, catalog, assembly);

  REQUIRE(blown.totalDownforceCl > clBase);
  const double expectedBoost = 0.75 * (1.0 + 0.22);
  REQUIRE(blown.totalDownforceCl - base.totalDownforceCl ==
          Catch::Approx(expectedBoost - 0.75).margin(0.02));
}

TEST_CASE("Diesel DPF reduces power and thermal load",
          "[unit][car][exhaust_diffuser]") {
  LoadFixtures();

  CarConfig oem = BaselineHypercar();
  oem.engine.fuelType = "Diesel";
  CompileCarArchitecture(oem, catalog, assembly);
  const double torqueOem = oem.peakTorque;
  const double thermalOem = oem.powertrainThermalMult;

  CarConfig dpf = BaselineHypercar();
  dpf.engine.fuelType = "Diesel";
  dpf.exhaustId = "DieselDPF";
  CompileCarArchitecture(dpf, catalog, assembly);

  REQUIRE(dpf.peakTorque < torqueOem);
  REQUIRE(dpf.peakTorque / torqueOem == Catch::Approx(0.96 * 0.92).margin(0.02));
  REQUIRE(dpf.powertrainThermalMult < thermalOem);
  REQUIRE(dpf.powertrainThermalMult / thermalOem ==
          Catch::Approx(0.92).margin(0.02));
}

TEST_CASE("Balance: low-drag trim vs wingless ground effect",
          "[unit][car][exhaust_diffuser][balance]") {
  LoadFixtures();

  CarConfig lowDrag;
  lowDrag.frontAeroId = "LowDragNose";
  lowDrag.rearAeroId = "StandardWingLowDrag";
  lowDrag.diffuserId = "FlatFloor";
  lowDrag.exhaustId = "TopExitBodywork";
  CompileCarArchitecture(lowDrag, catalog, assembly);

  CarConfig wingless;
  wingless.frontAeroId = "LowDragNose";
  wingless.rearAeroId = "WinglessGroundEffect";
  wingless.diffuserId = "WinglessBaseline";
  wingless.exhaustId = "TwinOutletSide";
  CompileCarArchitecture(wingless, catalog, assembly);

  REQUIRE(wingless.totalDragCd < lowDrag.totalDragCd);
  REQUIRE(wingless.totalDownforceCl > lowDrag.totalDownforceCl);
  const double dfGap = wingless.totalDownforceCl - lowDrag.totalDownforceCl;
  REQUIRE(dfGap > 0.3);
  REQUIRE(dfGap < 2.5);
}

TEST_CASE("Wingless rear requires diffuser floor package", "[unit][compat][exhaust_diffuser]") {
  LoadFixtures();
  const auto rules =
      LoadPartCompatibility(ConfigPath("part_compatibility.txt"));

  CarConfig wingless;
  wingless.rearAeroId = "WinglessGroundEffect";
  wingless.frontAeroId = "LowDragNose";
  wingless.diffuserId = "StockFloor";

  std::string error;
  REQUIRE_FALSE(ValidatePartCompatibility(wingless, rules, &error));

  wingless.diffuserId = "WinglessBaseline";
  REQUIRE(ValidatePartCompatibility(wingless, rules));
}

TEST_CASE("Active underbody boosts diffuser on e-drive wingless quali",
          "[unit][car][exhaust_diffuser]") {
  LoadFixtures();

  CarConfig sealed;
  sealed.frontAeroId = "LowDragNose";
  sealed.rearAeroId = "WinglessGroundEffect";
  sealed.diffuserId = "DoubleDeckerDiffuser";
  sealed.exhaustId = "None";
  sealed.engine.drivetrain = "FullEV";
  sealed.engine.fuelType = "Hydrogen";
  sealed.engine.energyConverter = "FuelCell";
  sealed.engine.generatorKw = 420;
  CompileCarArchitecture(sealed, catalog, assembly);
  const double clSealed = sealed.totalDownforceCl;

  CarConfig active = sealed;
  active.exhaustId = "ActiveUnderbody";
  CompileCarArchitecture(active, catalog, assembly);

  REQUIRE(active.totalDownforceCl > clSealed);
  REQUIRE(active.aeroPlatformStability < sealed.aeroPlatformStability);
}

TEST_CASE("E-drive rejects ICE exhaust in compatibility", "[unit][compat][exhaust_diffuser]") {
  LoadFixtures();
  const auto rules =
      LoadPartCompatibility(ConfigPath("part_compatibility.txt"));

  CarConfig ev;
  ev.engine.drivetrain = "FullEV";
  ev.engine.fuelType = "Gasoline";
  ev.exhaustId = "TwinOutletSide";

  std::string error;
  REQUIRE_FALSE(ValidatePartCompatibility(ev, rules, &error));

  ev.exhaustId = "LowDragUnderfloor";
  REQUIRE(ValidatePartCompatibility(ev, rules));
}

TEST_CASE("Balance: blown combo trades stability for rear load",
          "[unit][car][exhaust_diffuser][balance]") {
  LoadFixtures();

  CarConfig standard = BaselineHypercar();
  standard.diffuserId = "HighDownforceDiffuser";
  standard.exhaustId = "SideExitTwin";
  CompileCarArchitecture(standard, catalog, assembly);

  CarConfig blown = BaselineHypercar();
  blown.diffuserId = "HighDownforceDiffuser";
  blown.exhaustId = "BlownDiffuser";
  CompileCarArchitecture(blown, catalog, assembly);

  REQUIRE(blown.totalDownforceCl > standard.totalDownforceCl);
  const double clGain = blown.totalDownforceCl - standard.totalDownforceCl;
  REQUIRE(clGain > 0.12);
  REQUIRE(clGain < 0.30);
  REQUIRE(blown.aeroPlatformStability < standard.aeroPlatformStability);
}
