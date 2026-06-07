#include <catch_amalgamated.hpp>
#include "car_parts.hpp"
#include "config_loader.hpp"
#include "part_damage.hpp"
#include "simulation.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"

TEST_CASE("Part damage collision routes to side", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  CarConfig car;
  car.hybridDeployPowerKW = 0.0;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);

  ApplyCollisionDamage(state, profiles, 6.0, CollisionSide::Left, false);
  REQUIRE(PartHealth(state, DamagePart::BodyFL) < 100.0);
  REQUIRE(PartHealth(state, DamagePart::BodyFR) == 100.0);
}

TEST_CASE("Structural severity rises with diagonal damage", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  TyreDeflationStateArr tyres;
  ApplyPartDamageHit(state, DamagePart::BodyFL, 50.0, {6, 20, 0, 1});
  ApplyPartDamageHit(state, DamagePart::SuspRR, 50.0, {55, 40, 15, 1});
  state.irreparable[DamagePartIndex(DamagePart::SuspRR)] = true;
  const double sev = ComputeStructuralSeverity(state, tyres);
  REQUIRE(sev >= 55.0);
}

TEST_CASE("Tyre deflation damages body while moving", "[unit][damage]") {
  SimulationState state;
  InitPartDamageState(state.partDamage);
  state.currentSpeed = 30.0;
  ApplyTyrePuncture(state, 2, true);
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);
  const double before = PartHealth(state.partDamage, DamagePart::BodyRL);
  TickDeflatedTyreBodyDamage(state, profiles, 1.0, 5.0);
  REQUIRE(PartHealth(state.partDamage, DamagePart::BodyRL) < before);
}

TEST_CASE("Stock 24h gradual wear keeps parts above 85 percent",
          "[unit][damage][endurance]") {
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
  state.currentSpeed = 58.0;
  state.currentRPM = car.engine.maxRPM * 0.72;
  const double dt = 0.1;
  const int ticks = static_cast<int>(24.0 * 3600.0 / dt);
  for (int i = 0; i < ticks; ++i)
    TickSimulation(car, track, state, dt, physics);

  for (int pi = 0; pi < static_cast<int>(DamagePart::Count); ++pi) {
    const DamagePart part = static_cast<DamagePart>(pi);
    INFO(DamagePartToken(part));
    REQUIRE(PartHealth(state.partDamage, part) >= 85.0);
  }
  REQUIRE(state.partDamage.hiddenFaults.empty());
}

TEST_CASE("Pit repair restores engine part health", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  state.health[DamagePartIndex(DamagePart::Engine)] = 40.0;
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);
  REQUIRE(RepairPartToken(state, "engine", profiles));
  REQUIRE(PartHealth(state, DamagePart::Engine) > 40.0);
}
