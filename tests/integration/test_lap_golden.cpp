#include "car_parts.hpp"
#include "config_loader.hpp"
#include "simulation.hpp"
#include "telemetry.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

TEST_CASE("La Sarthe single lap golden time", "[integration][golden]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), car));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));
  CompileCarArchitecture(car, catalog, assembly);

  SimulationState state;
  TelemetryLog telemetry;
  const double dt = 0.1;
  const int maxTicks = 50000;

  for (int i = 0; i < maxTicks && state.currentLap <= 1; ++i)
    TickSimulation(car, track, state, dt, physics, &telemetry);

  REQUIRE(state.currentLap == 2);
  REQUIRE(telemetry.laps().size() == 1);

  const double lapTime = telemetry.laps().front().lapTime;
  // Curvature-based physics baseline (~350.7s on default car/build)
  REQUIRE(lapTime == Catch::Approx(350.7).margin(20.0));
}
