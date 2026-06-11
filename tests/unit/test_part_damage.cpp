#include <catch_amalgamated.hpp>
#include "car_parts.hpp"
#include "config_loader.hpp"
#include "part_damage.hpp"
#include "simulation.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"

TEST_CASE("Light rubbing below impact threshold does not damage parts",
          "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);

  ApplyCollisionDamage(state, profiles, 3.5, CollisionSide::Left, false);
  REQUIRE(PartHealth(state, DamagePart::BodyFL) == 100.0);
}

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

TEST_CASE("Part damage front contact hits front axle only", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);

  ApplyCollisionDamage(state, profiles, 8.5, CollisionSide::Front, false);
  REQUIRE(PartHealth(state, DamagePart::BodyFL) < 100.0);
  REQUIRE(PartHealth(state, DamagePart::BodyFR) < 100.0);
  REQUIRE(PartHealth(state, DamagePart::BodyRL) == 100.0);
  REQUIRE(PartHealth(state, DamagePart::BodyRR) == 100.0);
}

TEST_CASE("Part damage rear contact hits rear axle only", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);

  ApplyCollisionDamage(state, profiles, 8.5, CollisionSide::Rear, false);
  REQUIRE(PartHealth(state, DamagePart::BodyRL) < 100.0);
  REQUIRE(PartHealth(state, DamagePart::BodyRR) < 100.0);
  REQUIRE(PartHealth(state, DamagePart::BodyFL) == 100.0);
}

TEST_CASE("Unknown collision side avoids symmetric front corners", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);

  ApplyCollisionDamage(state, profiles, 6.0, CollisionSide::Unknown, false);
  REQUIRE(PartHealth(state, DamagePart::BodyFL) < 100.0);
  REQUIRE(PartHealth(state, DamagePart::BodyFR) == 100.0);
}

TEST_CASE("Debris hazard puncture rolls at speed on low grip", "[unit][damage]") {
  const auto rolls = EvaluateDebrisTyrePuncture(35.0, 0.55, 0.8, 1.0, 424242U);
  REQUIRE(rolls.size() >= 1);
}

TEST_CASE("CollisionContactSide classifies alongside and shunts", "[unit][damage]") {
  const double combined = 10.0;
  REQUIRE(CollisionContactSide(4.0, combined, 0.0, -1.0) == CollisionSide::Left);
  REQUIRE(CollisionContactSide(4.0, combined, 0.0, 1.0) == CollisionSide::Right);
  REQUIRE(CollisionContactSide(8.0, combined, 0.0, 0.0) == CollisionSide::Front);
  REQUIRE(CollisionContactSide(-8.0, combined, 0.0, 0.0) == CollisionSide::Rear);
  REQUIRE(MirrorCollisionSide(CollisionSide::Left) == CollisionSide::Right);
  REQUIRE(MirrorCollisionSide(CollisionSide::Front) == CollisionSide::Rear);
}

TEST_CASE("Structural severity rises with diagonal damage", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  TyreDeflationStateArr tyres;
  ApplyPartDamageHit(state, DamagePart::BodyFL, 50.0, {6, 20, 0, 1});
  ApplyPartDamageHit(state, DamagePart::SuspRR, 50.0, {55, 40, 15, 1});
  state.health[DamagePartIndex(DamagePart::SuspRR)] = 10.0;
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
  physics.useFrenetDynamics = false;
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

TEST_CASE("Critical suspension is flagged for garage rebuild", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  state.health[DamagePartIndex(DamagePart::SuspFR)] = 10.0;
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);
  REQUIRE(HasCriticalSuspension(state, profiles));
  const CarRepairAssessment assessment = ComputeCarRepairAssessment(
      state, car, TyreDeflationStateArr{}, profiles, 86400.0);
  REQUIRE(assessment.physicallyRepairable);
  REQUIRE(assessment.sessionRepairable);
  REQUIRE(assessment.needsGarageRebuild);
}

TEST_CASE("Repair not session-viable when work exceeds remaining time",
          "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  state.health[DamagePartIndex(DamagePart::SuspFR)] = 5.0;
  state.health[DamagePartIndex(DamagePart::SuspRR)] = 5.0;
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);
  const CarRepairAssessment ok = ComputeCarRepairAssessment(
      state, car, TyreDeflationStateArr{}, profiles, 86400.0);
  REQUIRE(ok.sessionRepairable);
  const CarRepairAssessment tooLate = ComputeCarRepairAssessment(
      state, car, TyreDeflationStateArr{}, profiles, 120.0);
  REQUIRE_FALSE(tooLate.sessionRepairable);
}

TEST_CASE("Catastrophic same-side loss stops the car on track", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  TyreDeflationStateArr tyres;
  state.health[DamagePartIndex(DamagePart::BodyFR)] = 0.0;
  state.health[DamagePartIndex(DamagePart::BodyRR)] = 0.0;
  state.health[DamagePartIndex(DamagePart::SuspFR)] = 0.0;
  state.health[DamagePartIndex(DamagePart::SuspRR)] = 0.0;
  state.irreparable[DamagePartIndex(DamagePart::SuspFR)] = true;
  state.irreparable[DamagePartIndex(DamagePart::SuspRR)] = true;
  REQUIRE(HasCatastrophicSameSideLoss(state));
  REQUIRE(EvaluateLimpMode(state, CarConfig{}, tyres, 0.0) == LimpMode::Immobilized);
}

TEST_CASE("Catastrophic front or rear axle loss stops the car on track",
          "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  state.health[DamagePartIndex(DamagePart::BodyFL)] = 0.0;
  state.health[DamagePartIndex(DamagePart::BodyFR)] = 0.0;
  state.health[DamagePartIndex(DamagePart::SuspFL)] = 0.0;
  state.health[DamagePartIndex(DamagePart::SuspFR)] = 0.0;
  REQUIRE(HasCatastrophicSameSideLoss(state));

  InitPartDamageState(state);
  state.health[DamagePartIndex(DamagePart::BodyRL)] = 0.0;
  state.health[DamagePartIndex(DamagePart::BodyRR)] = 0.0;
  state.health[DamagePartIndex(DamagePart::SuspRL)] = 0.0;
  state.health[DamagePartIndex(DamagePart::SuspRR)] = 0.0;
  REQUIRE(HasCatastrophicSameSideLoss(state));
}

TEST_CASE("Low but non-zero corner damage can still limp", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  TyreDeflationStateArr tyres;
  state.health[DamagePartIndex(DamagePart::BodyFR)] = 3.0;
  state.health[DamagePartIndex(DamagePart::BodyRR)] = 2.0;
  state.health[DamagePartIndex(DamagePart::SuspFR)] = 4.0;
  state.health[DamagePartIndex(DamagePart::SuspRR)] = 1.0;
  REQUIRE_FALSE(HasCatastrophicSameSideLoss(state));
  const LimpMode limp = EvaluateLimpMode(state, CarConfig{}, tyres, 0.0);
  REQUIRE((limp == LimpMode::BarelyDriveable || limp == LimpMode::Immobilized));
}

TEST_CASE("Huge crash stresses monocoque", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);
  ApplyCollisionDamage(state, profiles, 14.5, CollisionSide::Right, true);
  REQUIRE(PartHealth(state, DamagePart::Monocoque) < 100.0);
  REQUIRE(FireIgnitionChanceFromImpact(14.5, true, true) > 0.0);
}

TEST_CASE("Breached monocoque is not physically repairable", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  state.health[DamagePartIndex(DamagePart::Monocoque)] = 0.0;
  REQUIRE(IsMonocoqueBreached(state));
  REQUIRE_FALSE(IsCarPhysicallyRepairable(state, CarConfig{}));
}

TEST_CASE("Fire damage erodes monocoque over time", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  CarConfig car;
  static const PartCatalog catalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, catalog, profiles);
  const double before = PartHealth(state, DamagePart::Monocoque);
  ApplyFireDamage(state, profiles, 5.0);
  REQUIRE(PartHealth(state, DamagePart::Monocoque) < before);
}

TEST_CASE("Same-side severity uses left/right wheel pairs", "[unit][damage]") {
  PartDamageState state;
  InitPartDamageState(state);
  TyreDeflationStateArr tyres;
  ApplyPartDamageHit(state, DamagePart::BodyFR, 100.0, {6, 20, 0, 1});
  ApplyPartDamageHit(state, DamagePart::SuspRR, 100.0, {55, 40, 15, 1});
  const double rightSide = ComputeStructuralSeverity(state, tyres);
  InitPartDamageState(state);
  ApplyPartDamageHit(state, DamagePart::BodyFL, 100.0, {6, 20, 0, 1});
  ApplyPartDamageHit(state, DamagePart::SuspRL, 100.0, {55, 40, 15, 1});
  const double leftSide = ComputeStructuralSeverity(state, tyres);
  REQUIRE(rightSide >= 55.0);
  REQUIRE(leftSide >= 55.0);
}
