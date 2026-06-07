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

TEST_CASE("Tyre wear accumulates gradually not instantly", "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);
  car.tireChoice = ETireCompound::Soft;
  CompileCarArchitecture(car, catalog, assembly);

  SimulationState state;
  state.currentSpeed = 55.0;
  const double dt = 0.1;
  for (int i = 0; i < 80; ++i)
    TickSimulation(car, track, state, dt, physics);

  REQUIRE(state.maxTireWear() < 0.5);
}

TEST_CASE("Mistake wear spike adds immediate tyre damage", "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  SimulationState state;
  state.currentSpeed = 55.0;
  SimulationModifiers mods;
  mods.wearSpikePerWheel[static_cast<int>(WheelIndex::FR)] = 0.04;
  mods.tireTempSpikePerWheel[static_cast<int>(WheelIndex::FR)] = 12.0;

  TickSimulation(car, track, state, 0.1, physics, nullptr, mods);

  REQUIRE(state.tireWear[static_cast<int>(WheelIndex::FR)] >= 0.04);
  REQUIRE(state.tireWear[static_cast<int>(WheelIndex::FL)] < 0.01);
  REQUIRE(state.tireTempC[static_cast<int>(WheelIndex::FR)] >= 85.0 + 10.0);
  REQUIRE(state.tireTempC[static_cast<int>(WheelIndex::FL)] < 90.0);
}

TEST_CASE("Per-wheel corner wear loads outside tyres more", "[unit][sim]") {
  double weights[4];
  CornerTireWearWeights(0.05, weights);
  REQUIRE(weights[static_cast<int>(WheelIndex::FR)] >
            weights[static_cast<int>(WheelIndex::FL)]);
  REQUIRE(weights[static_cast<int>(WheelIndex::RR)] >
            weights[static_cast<int>(WheelIndex::RL)]);

  CornerTireWearWeights(-0.05, weights);
  REQUIRE(weights[static_cast<int>(WheelIndex::FL)] >
            weights[static_cast<int>(WheelIndex::FR)]);
}

TEST_CASE("Wide front tyres heat and wear front axle more", "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  CarConfig wideFront = car;
  wideFront.hasCustomWheelDims = true;
  wideFront.customFrontTireWidthMm = 335.0;
  CompileCarArchitecture(wideFront, catalog, assembly);

  REQUIRE(wideFront.frontAxleWearFactor > car.frontAxleWearFactor);
  REQUIRE(wideFront.frontAxleHeatFactor > car.frontAxleHeatFactor);
  REQUIRE(wideFront.rearAxleWearFactor == Catch::Approx(car.rearAxleWearFactor));

  SimulationState baselineState;
  SimulationState wideState;
  baselineState.currentSpeed = 55.0;
  wideState.currentSpeed = 55.0;
  const double dt = 0.1;
  for (int i = 0; i < 120; ++i) {
    TickSimulation(car, track, baselineState, dt, physics);
    TickSimulation(wideFront, track, wideState, dt, physics);
  }

  const int fl = static_cast<int>(WheelIndex::FL);
  const int fr = static_cast<int>(WheelIndex::FR);
  const int rl = static_cast<int>(WheelIndex::RL);
  REQUIRE(wideState.tireWear[fl] > baselineState.tireWear[fl]);
  REQUIRE(wideState.tireWear[fr] > baselineState.tireWear[fr]);
  REQUIRE(wideState.tireTempC[fl] > baselineState.tireTempC[fl]);
  REQUIRE(wideState.tireTempC[fr] > baselineState.tireTempC[fr]);
  REQUIRE(wideState.tireWear[rl] == Catch::Approx(baselineState.tireWear[rl]).margin(0.002));
}

TEST_CASE("Pit rejoin speed accelerates past first-gear ceiling",
          "[unit][sim][pit]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  car.gearCount = 6;
  car.gearRatios[0] = 4.5;
  car.gearRatios[1] = 2.5;
  car.engine.maxRPM = 6000;
  car.finalDriveRatio = 3.5;
  car.gearShiftSpeeds[0] = 18.0;
  CompileCarArchitecture(car, catalog, assembly);

  SimulationState state;
  const double pitExitSpeed = (60.0 / 3.6) * 0.85;
  state.currentSpeed = pitExitSpeed;
  state.currentGearIndex = 0;
  state.throttleBlend = 1.0;
  state.fuelRemaining = car.fuelTankCapacity;

  SyncGearForSpeed(car, state);

  for (int i = 0; i < 300; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.currentSpeed > pitExitSpeed + 8.0);
}

TEST_CASE("Out of fuel car coasts to stop", "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  SimulationState state;
  state.currentSpeed = 40.0;
  state.fuelRemaining = 0.0;

  for (int i = 0; i < 500; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.currentSpeed < 1.0);
}

TEST_CASE("Engine wear scales linearly with stress not squared",
          "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  car.engine.fuelType = "Gasoline";
  CompileCarArchitecture(car, catalog, assembly);

  SimulationState gasState;
  gasState.currentSpeed = 75.0;
  gasState.currentRPM = static_cast<double>(car.engine.maxRPM) * 0.92;
  gasState.fuelRemaining = car.fuelTankCapacity;
  const double dt = 0.1;
  const int ticks = 400;
  for (int i = 0; i < ticks; ++i)
    TickSimulation(car, track, gasState, dt, physics);
  const double gasWear = 100.0 - gasState.engineHealth;

  car.engine.fuelType = "Hydrogen";
  CompileCarArchitecture(car, catalog, assembly);

  SimulationState h2State;
  h2State.currentSpeed = 75.0;
  h2State.currentRPM = static_cast<double>(car.engine.maxRPM) * 0.92;
  h2State.fuelRemaining = car.fuelTankCapacity;
  for (int i = 0; i < ticks; ++i)
    TickSimulation(car, track, h2State, dt, physics);
  const double h2Wear = 100.0 - h2State.engineHealth;

  REQUIRE(gasWear > 0.05);
  const double ratio = h2Wear / gasWear;
  REQUIRE(ratio > 0.95);
  REQUIRE(ratio < 1.12);
}
