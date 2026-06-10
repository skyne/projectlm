#include "car_parts.hpp"
#include "class_rules.hpp"
#include "config_loader.hpp"
#include "simulation.hpp"
#include "telemetry.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

namespace {

double RunOneLap(const CarConfig &compiledCar, const TrackDefinition &track,
                 const PhysicsConfig &physics) {
  SimulationState state;
  TelemetryLog telemetry;
  CarConfig car = compiledCar;
  const double dt = 0.1;
  for (int i = 0; i < 50000 && state.currentLap <= 1; ++i)
    TickSimulation(car, track, state, dt, physics, &telemetry);
  REQUIRE(state.currentLap == 2);
  REQUIRE(telemetry.laps().size() == 1);
  return telemetry.laps().front().lapTime;
}

CarConfig LoadClassCar(const PartCatalog &catalog, const AssemblyConfig &assembly,
                       const PhysicsConfig &physics,
                       const std::map<std::string, ClassRule> &rules,
                       const char *carPath, const char *classId) {
  CarConfig car;
  REQUIRE(LoadCarConfig(carPath, car));
  auto ruleIt = rules.find(classId);
  if (ruleIt != rules.end()) {
    SanitizeCarForClassRules(car, ruleIt->second);
    CompileCarArchitecture(car, catalog, assembly);
    ApplyClassBoP(car, ruleIt->second);
  } else {
    CompileCarArchitecture(car, catalog, assembly);
  }
  (void)physics;
  return car;
}

} // namespace

TEST_CASE("Paul Ricard multiclass pace separation", "[integration][golden]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  PhysicsConfig physics;
  TrackDefinition track;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  physics.useFrenetDynamics = false;
  REQUIRE(LoadTrack(TrackPath("paul_ricard.json"), track));

  const auto rules = LoadClassRules(ConfigPath("class_rules.txt"));

  const CarConfig hypercar = LoadClassCar(
      catalog, assembly, physics, rules,
      ConfigPath("cars/lemans2026/toyota_gr010.txt").c_str(), "Hypercar");
  const CarConfig lmp2 = LoadClassCar(
      catalog, assembly, physics, rules,
      ConfigPath("cars/lemans2026/oreca_07_gibson.txt").c_str(), "LMP2");
  const CarConfig gt3 = LoadClassCar(
      catalog, assembly, physics, rules,
      ConfigPath("cars/lemans2026/porsche_911_gt3_r.txt").c_str(), "LMGT3");

  const double hyperLap = RunOneLap(hypercar, track, physics);
  const double lmp2Lap = RunOneLap(lmp2, track, physics);
  const double gt3Lap = RunOneLap(gt3, track, physics);

  REQUIRE(hyperLap > 110.0);
  REQUIRE(hyperLap < 145.0);
  REQUIRE(lmp2Lap > hyperLap + 6.0);
  REQUIRE(lmp2Lap < hyperLap + 18.0);
  REQUIRE(gt3Lap > lmp2Lap + 6.0);
  REQUIRE(gt3Lap < lmp2Lap + 20.0);
}
