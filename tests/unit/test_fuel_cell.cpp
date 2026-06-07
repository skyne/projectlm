#include "car_parts.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "simulation.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

static void CompileFromFile(const std::string &relPath, CarConfig &car,
                            PartCatalog &catalog, AssemblyConfig &assembly) {
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadCarConfig(ConfigPath(relPath), car));
  CompileCarArchitecture(car, catalog, assembly);
}

static double SimulateFuelUsed(CarConfig &car, PhysicsConfig &physics,
                               TrackDefinition &track, double seconds,
                               double speedMs = 72.0) {
  SimulationState state;
  state.currentSpeed = speedMs;
  state.fuelRemaining = car.fuelTankCapacity;
  state.hybridDeployRemainingMJ = car.hybridStintDeployBudgetMJ;
  state.batteryChargeMJ = car.hybridStintDeployBudgetMJ;
  const double dt = 0.1;
  const int ticks = static_cast<int>(seconds / dt);
  for (int i = 0; i < ticks; ++i)
    TickSimulation(car, track, state, dt, physics);
  return car.fuelTankCapacity - state.fuelRemaining;
}

TEST_CASE("Fuel cell compiles as electric H2 powertrain", "[unit][fuelcell]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  CompileFromFile("cars/lemans2026/h2_fuel_cell_concept.txt", car, catalog,
                  assembly);

  REQUIRE(car.isFuelCell);
  REQUIRE(car.isElectricDrive);
  REQUIRE_FALSE(car.isGeneratorOnly);
  REQUIRE(car.fuelBurnRate == 0.0);
  REQUIRE(car.vibrationIndex == 0.0);
  REQUIRE(car.engine.energyConverter == "FuelCell");
  REQUIRE(car.electricalDeployKW > 300.0);
}

TEST_CASE("Fuel cell has better H2 range than combustion ICE", "[unit][fuelcell]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  PhysicsConfig physics;
  TrackDefinition track;
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  CarConfig ice;
  CompileFromFile("cars/lemans2026/h2_combustion_reference.txt", ice, catalog,
                  assembly);
  const double iceBurn = SimulateFuelUsed(ice, physics, track, 600.0);

  CarConfig fc;
  CompileFromFile("cars/lemans2026/h2_fuel_cell_concept.txt", fc, catalog,
                  assembly);
  const double fcBurn = SimulateFuelUsed(fc, physics, track, 600.0);

  REQUIRE(iceBurn > 0.0);
  REQUIRE(fcBurn > 0.0);
  REQUIRE(fcBurn < iceBurn * 0.72);
}

TEST_CASE("Fuel cell avoids ICE vibration wear", "[unit][fuelcell]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  PhysicsConfig physics;
  TrackDefinition track;
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  CarConfig fc;
  CompileFromFile("cars/lemans2026/h2_fuel_cell_concept.txt", fc, catalog,
                  assembly);

  SimulationState state;
  state.currentSpeed = 75.0;
  state.currentRPM = 9000.0;
  state.fuelRemaining = fc.fuelTankCapacity;
  state.hybridDeployRemainingMJ = fc.hybridStintDeployBudgetMJ;
  for (int i = 0; i < 4000; ++i)
    TickSimulation(fc, track, state, 0.1, physics);

  REQUIRE(state.engineHealth == Catch::Approx(100.0).margin(0.01));
}

TEST_CASE("Fuel cell compatibility rejects hybrid and wrong transmission",
          "[unit][fuelcell]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  CompileFromFile("cars/lemans2026/h2_fuel_cell_concept.txt", car, catalog,
                  assembly);

  std::string error;
  REQUIRE(ValidatePartCompatibility(car, {}, &error));

  car.hybridSystemId = "LMDh50kW";
  REQUIRE_FALSE(ValidatePartCompatibility(car, {}, &error));
  REQUIRE(error.find("hybrid") != std::string::npos);

  car.hybridSystemId = "None";
  car.transmissionId = "XtracP1359";
  REQUIRE_FALSE(ValidatePartCompatibility(car, {}, &error));
  REQUIRE(error.find("SingleSpeedEDrive") != std::string::npos);
}

TEST_CASE("Fuel cell exceeds ICE-style single-speed top speed cap",
          "[unit][fuelcell]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  PhysicsConfig physics;
  TrackDefinition track;
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadTrack(TrackPath("imola.json"), track));

  CarConfig fc;
  CompileFromFile("cars/lemans2026/h2_fuel_cell_concept.txt", fc, catalog,
                  assembly);
  REQUIRE(fc.gearRatios[0] < 1.2);

  SimulationState state;
  state.currentSpeed = 28.0;
  state.throttleBlend = 1.0;
  state.fuelRemaining = fc.fuelTankCapacity;
  state.hybridDeployRemainingMJ = fc.hybridStintDeployBudgetMJ;
  SyncGearForSpeed(fc, state);

  double peakSpeed = state.currentSpeed;
  for (int i = 0; i < 800; ++i) {
    TickSimulation(fc, track, state, 0.1, physics);
    peakSpeed = std::max(peakSpeed, state.currentSpeed);
  }

  REQUIRE(peakSpeed > 50.0);
}

TEST_CASE("Hydrogen range-extender is blocked", "[unit][fuelcell]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  CompileFromFile("cars/lemans2026/h2_combustion_reference.txt", car, catalog,
                  assembly);

  car.engine.drivetrain = "RangeExtender";
  std::string error;
  REQUIRE_FALSE(ValidatePartCompatibility(car, {}, &error));
  REQUIRE(error.find("range-extender") != std::string::npos);
}
