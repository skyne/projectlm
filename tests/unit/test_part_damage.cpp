#include <catch_amalgamated.hpp>
#include "part_damage.hpp"
#include "simulation.hpp"

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
