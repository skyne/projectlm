#include "car_parts.hpp"
#include "config_loader.hpp"
#include "simulation.hpp"
#include "telemetry.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

namespace {

double RunOneLap(const CarConfig &car, const TrackDefinition &track,
                 const PhysicsConfig &physics) {
  SimulationState state;
  TelemetryLog telemetry;
  CarConfig mutableCar = car;
  const double dt = 0.1;
  for (int i = 0; i < 50000 && state.currentLap <= 1; ++i)
    TickSimulation(mutableCar, track, state, dt, physics, &telemetry);
  REQUIRE(state.currentLap == 2);
  REQUIRE(telemetry.laps().size() == 1);
  return telemetry.laps().front().lapTime;
}

} // namespace

TEST_CASE("La Sarthe lap time is deterministic", "[integration][determinism]") {
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
  physics.useFrenetDynamics = false;
  CompileCarArchitecture(car, catalog, assembly);

  const double first = RunOneLap(car, track, physics);
  const double second = RunOneLap(car, track, physics);
  REQUIRE(first == second);
}
