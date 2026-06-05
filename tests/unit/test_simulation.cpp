#include "car_parts.hpp"
#include "config_loader.hpp"
#include "simulation.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

static void LoadGoldenCar(PartCatalog &catalog, AssemblyConfig &assembly,
                          CarConfig &car, PhysicsConfig &physics,
                          TrackDefinition &track) {
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), car));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));
  CompileCarArchitecture(car, catalog, assembly);
}

TEST_CASE("TickSimulation advances distance", "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  SimulationState state;
  const double dt = 0.1;
  TickSimulation(car, track, state, dt, physics);

  REQUIRE(state.currentDistance > 0.0);
  REQUIRE(state.currentSpeed > 0.0);
  REQUIRE(state.fuelRemaining > 0.0);
  REQUIRE(state.fuelRemaining <= car.fuelTankCapacity);
}

TEST_CASE("fuel clamps at zero", "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  SimulationState state;
  state.fuelRemaining = 0.01;
  for (int i = 0; i < 500; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.fuelRemaining >= 0.0);
}
