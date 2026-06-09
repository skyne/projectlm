#include "car_parts.hpp"
#include "config_loader.hpp"
#include "simulation.hpp"
#include "track.hpp"
#include "../helpers/paths.hpp"
#include <algorithm>
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

  const int fl = static_cast<int>(WheelIndex::FL);
  const int fr = static_cast<int>(WheelIndex::FR);
  const int rl = static_cast<int>(WheelIndex::RL);

  auto wheelWearScale = [](const CarConfig &c, int wheelIdx) {
    const bool front = wheelIdx <= static_cast<int>(WheelIndex::FR);
    return c.wheelWearFactor *
           (front ? c.frontAxleWearFactor : c.rearAxleWearFactor);
  };

  SimulationState baselineWear;
  SimulationState wideWear;
  double cornerWeights[4];
  CornerTireWearWeights(0.05, cornerWeights);
  const double wearBase = car.tireWearRate * 0.01;
  for (int i = 0; i < 4; ++i) {
    baselineWear.tireWear[i] +=
        wearBase * cornerWeights[i] * wheelWearScale(car, i);
    wideWear.tireWear[i] +=
        wearBase * cornerWeights[i] * wheelWearScale(wideFront, i);
  }
  REQUIRE(wideWear.tireWear[fl] > baselineWear.tireWear[fl]);
  REQUIRE(wideWear.tireWear[fr] > baselineWear.tireWear[fr]);
  REQUIRE(wideWear.tireWear[rl] ==
          Catch::Approx(baselineWear.tireWear[rl]));

  auto wheelHeatScale = [](const CarConfig &c, int wheelIdx) {
    const bool front = wheelIdx <= static_cast<int>(WheelIndex::FR);
    return front ? c.frontAxleHeatFactor : c.rearAxleHeatFactor;
  };

  SimulationState baselineHeat;
  SimulationState wideHeat;
  const double maxCornerWeight =
      *std::max_element(cornerWeights, cornerWeights + 4);
  const double heatAmount = 1.0;
  for (int i = 0; i < 4; ++i) {
    const double heatShare =
        maxCornerWeight > 1e-9 ? cornerWeights[i] / maxCornerWeight : 1.0;
    baselineHeat.tireTempC[i] +=
        heatAmount * heatShare * wheelHeatScale(car, i);
    wideHeat.tireTempC[i] +=
        heatAmount * heatShare * wheelHeatScale(wideFront, i);
  }
  REQUIRE(wideHeat.tireTempC[fl] > baselineHeat.tireTempC[fl]);
  REQUIRE(wideHeat.tireTempC[fr] > baselineHeat.tireTempC[fr]);
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

TEST_CASE("BEV deploy scales from power target", "[unit][bev]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  car.engine.fuelType = "Electric";
  car.engine.drivetrain = "FullEV";
  car.engine.powerTargetHp = 680.0;
  car.engine.peakTorqueNm = 2856.0;
  car.fuelSystemId = "BatteryPackSprint";
  CompileCarArchitecture(car, catalog, assembly);

  REQUIRE(car.isBatteryPrimaryEv);
  REQUIRE(car.electricalDeployKW > 500.0);
  REQUIRE(car.electricalDeployKW < 520.0);
}

TEST_CASE("BEV battery depletes and stops delivering power", "[unit][sim][bev]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);

  car.engine.fuelType = "Electric";
  car.engine.drivetrain = "FullEV";
  car.fuelSystemId = "BatteryPackStandard";
  CompileCarArchitecture(car, catalog, assembly);
  REQUIRE(car.isBatteryPrimaryEv);
  REQUIRE(car.hybridStintDeployBudgetMJ > 0.0);

  SimulationState state;
  state.currentSpeed = 72.0;
  state.throttleBlend = 1.0;
  state.batteryChargeMJ = car.hybridStintDeployBudgetMJ;
  state.fuelRemaining = state.batteryChargeMJ;
  state.hybridDeployRemainingMJ = state.batteryChargeMJ;

  const double startMj = state.batteryChargeMJ;
  for (int i = 0; i < 8000; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.batteryChargeMJ < startMj * 0.5);
  REQUIRE(state.fuelRemaining == Catch::Approx(state.batteryChargeMJ));
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
  state.hybridDeployRemainingMJ = 0.0;
  state.batteryChargeMJ = 0.0;

  for (int i = 0; i < 500; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.currentSpeed < 1.0);
}

TEST_CASE("REX EV drives on battery when REX fuel is empty", "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  car.engine.fuelType = "Electric";
  car.engine.drivetrain = "RangeExtender";
  car.fuelSystemId = "BatteryPackStandard";
  car.transmissionId = "SingleSpeedEDrive";
  CompileCarArchitecture(car, catalog, assembly);
  REQUIRE(car.isGeneratorOnly);
  REQUIRE_FALSE(car.isBatteryPrimaryEv);

  SimulationState state;
  state.currentSpeed = 8.0;
  state.throttleBlend = 1.0;
  state.fuelRemaining = 0.0;
  state.batteryChargeMJ = car.hybridStintDeployBudgetMJ;
  state.hybridDeployRemainingMJ = car.hybridStintDeployBudgetMJ;

  for (int i = 0; i < 200; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.currentSpeed > 12.0);
  REQUIRE(state.batteryChargeMJ < car.hybridStintDeployBudgetMJ);
}

TEST_CASE("REX EV uses hybrid pack MJ when batteryChargeMJ was drained separately",
          "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  car.engine.fuelType = "Electric";
  car.engine.drivetrain = "RangeExtender";
  car.fuelSystemId = "BatteryPackStandard";
  car.transmissionId = "SingleSpeedEDrive";
  CompileCarArchitecture(car, catalog, assembly);

  SimulationState state;
  state.currentSpeed = 8.0;
  state.throttleBlend = 1.0;
  state.fuelRemaining = 0.0;
  state.batteryChargeMJ = 0.0;
  state.hybridDeployRemainingMJ = car.hybridStintDeployBudgetMJ;

  for (int i = 0; i < 200; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.currentSpeed > 12.0);
  REQUIRE(state.hybridDeployRemainingMJ < car.hybridStintDeployBudgetMJ);
  REQUIRE(state.batteryChargeMJ == Catch::Approx(state.hybridDeployRemainingMJ));
}

TEST_CASE("Hybrid drives on electric deploy when ICE fuel is empty",
          "[unit][sim]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  PhysicsConfig physics;
  TrackDefinition track;
  LoadGoldenCar(catalog, assembly, car, physics, track);
  REQUIRE(car.hybridDeployPowerKW > 0.0);

  SimulationState state;
  state.currentSpeed = 8.0;
  state.throttleBlend = 1.0;
  state.fuelRemaining = 0.0;
  state.hybridDeployRemainingMJ = car.hybridStintDeployBudgetMJ;
  state.batteryChargeMJ = car.hybridStintDeployBudgetMJ;

  for (int i = 0; i < 200; ++i)
    TickSimulation(car, track, state, 0.1, physics);

  REQUIRE(state.currentSpeed > 10.0);
  REQUIRE(state.hybridDeployRemainingMJ < car.hybridStintDeployBudgetMJ);
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
