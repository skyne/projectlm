#include "config_loader.hpp"
#include "race.hpp"
#include "race_config.hpp"
#include "telemetry.hpp"
#include "track.hpp"
#include <iomanip>
#include <iostream>

static void PrintSectorSummary(const TelemetryLog &telemetry) {
  for (const LapRecord &lap : telemetry.laps()) {
    std::cout << "Lap " << lap.lapNumber << " — " << std::setprecision(3)
              << lap.lapTime << "s";
    for (const SectorSplit &sector : lap.sectors) {
      std::cout << " | S" << sector.sectorIndex << " "
                << std::setprecision(2) << sector.time << "s ("
                << std::setprecision(1) << sector.peakSpeed * 3.6 << " km/h)";
    }
    std::cout << std::endl;
  }
}

static int RunSingleCar(const RaceConfig &raceConfig, PartCatalog &catalog,
                        PhysicsConfig &physics, AssemblyConfig &assembly) {
  CarConfig entryCar;
  TrackDefinition circuit;

  if (!LoadCarConfig(raceConfig.carConfigPath, entryCar) ||
      !LoadTrack(raceConfig.trackConfigPath, circuit)) {
    std::cerr << "Error: Configuration assets missing!" << std::endl;
    return 1;
  }

  CompileCarArchitecture(entryCar, catalog, assembly);

  SimulationState raceState;
  TelemetryLog telemetry;

  std::cout << "=== MODULAR MODELLING ENGINE RUNNING ===" << std::endl;
  std::cout << "Track: " << circuit.name << " (" << (int)circuit.lapLength()
            << " m)" << std::endl;
  std::cout << "Design Class: " << entryCar.name << std::endl;
  std::cout << "Mass: " << (int)entryCar.calculatedTotalMass
            << " kg | Aero Drag: " << entryCar.totalDragCd << " Cd"
            << std::endl;
  std::cout << "Calculated Net Power: " << (int)entryCar.peakHorsepower << " HP"
            << std::endl;
  std::cout << "Simulating exactly " << raceConfig.targetLaps << " laps...\n"
            << std::endl;

  std::cout << std::setw(6) << "Lap" << std::setw(12) << "LapTime(s)"
            << std::setw(14) << "Distance(m)" << std::setw(12) << "Speed(km/h)"
            << std::setw(8) << "RPM" << std::setw(15) << "Sector Type"
            << std::endl;
  std::cout << "---------------------------------------------------------------"
               "-----------------"
            << std::endl;

  int printCounter = 0;

  while (raceState.currentLap <= raceConfig.targetLaps) {
    TickSimulation(entryCar, circuit, raceState, raceConfig.simTimestep,
                   physics, &telemetry);

    if (printCounter % 25 == 0 &&
        raceState.currentLap <= raceConfig.targetLaps) {
      const std::string &sectorName =
          circuit.sectorAt(raceState.currentTrackNodeIndex).name;
      std::cout << std::setw(6) << raceState.currentLap << std::setw(12)
                << std::setprecision(1) << std::fixed
                << raceState.currentLapTime << std::setw(14)
                << (int)raceState.currentDistance << std::setw(12)
                << std::setprecision(1) << raceState.currentSpeed * 3.6
                << std::setw(8) << (int)raceState.currentRPM << std::setw(15)
                << sectorName << std::endl;
    }

    printCounter++;
  }

  std::cout << "---------------------------------------------------------------"
               "-----------------"
            << std::endl;
  std::cout << "\U0001F3C1 Race simulation completed cleanly after "
            << raceConfig.targetLaps << " laps. \U0001F3C1" << std::endl;
  std::cout << "Total Elapsed Event Time: " << std::setprecision(2)
            << raceState.elapsedRaceTime << " seconds" << std::endl;
  std::cout << "Remaining Fuel: " << std::setprecision(1)
            << raceState.fuelRemaining << " Liters" << std::endl;
  std::cout << "Final Engine Health Condition: " << std::setprecision(1)
            << raceState.engineHealth << "%" << std::endl;

  if (!telemetry.laps().empty()) {
    std::cout << "\nSector splits:" << std::endl;
    PrintSectorSummary(telemetry);
  }

  if (!raceConfig.telemetryOutputPath.empty()) {
    if (telemetry.writeCsv(raceConfig.telemetryOutputPath))
      std::cout << "\nTelemetry written to " << raceConfig.telemetryOutputPath
                << std::endl;
    else
      std::cerr << "Warning: failed to write telemetry CSV" << std::endl;
  }

  return 0;
}

static int RunMultiCar(const RaceConfig &raceConfig, PartCatalog &catalog,
                       PhysicsConfig &physics, AssemblyConfig &assembly) {
  RaceSession session;
  session.physics = physics;
  session.targetLaps = raceConfig.targetLaps;

  if (!LoadTrack(raceConfig.trackConfigPath, session.track) ||
      !LoadEntriesFromConfig(session, raceConfig.entriesPath, catalog,
                             assembly)) {
    std::cerr << "Error: Multi-car race assets missing!" << std::endl;
    return 1;
  }
  InitSessionCorridor(session);

  std::cout << "=== MULTICLASS ENDURANCE SESSION ===" << std::endl;
  std::cout << "Entries: " << session.cars.size() << " | Laps: "
            << raceConfig.targetLaps << std::endl;

  while (!IsRaceComplete(session))
    TickRace(session, raceConfig.simTimestep);

  std::cout << "\n--- Final Classification ---" << std::endl;
  auto board = GetLeaderboard(session);
  int position = 1;
  for (const Car *car : board) {
    std::cout << position++ << ". " << car->teamName() << " ["
              << car->raceClass().id << "] — Lap "
              << car->state().currentLap - 1 << " | Fuel "
              << std::setprecision(1) << car->state().fuelRemaining
              << " L | Engine " << car->state().engineHealth << "%"
              << std::endl;
  }

  std::cout << "\nElapsed: " << std::setprecision(2) << session.elapsedRaceTime
            << " s" << std::endl;
  return 0;
}

int main(int argc, char *argv[]) {
  RaceConfig raceConfig;
  std::string configPath = "configs/race_config.txt";
  bool lapsOverride = false;
  int lapsOverrideValue = 0;
  bool carOverride = false;
  std::string carOverridePath;
  bool telemetryOverride = false;
  std::string telemetryOverridePath;

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--config" && i + 1 < argc) {
      configPath = argv[++i];
    } else if (arg == "--laps" && i + 1 < argc) {
      lapsOverride = true;
      lapsOverrideValue = std::stoi(argv[++i]);
    } else if (arg == "--car" && i + 1 < argc) {
      carOverride = true;
      carOverridePath = argv[++i];
    } else if (arg == "--telemetry" && i + 1 < argc) {
      telemetryOverride = true;
      telemetryOverridePath = argv[++i];
    }
  }

  LoadRaceConfig(configPath, raceConfig);

  if (lapsOverride)
    raceConfig.targetLaps = lapsOverrideValue;
  if (carOverride)
    raceConfig.carConfigPath = carOverridePath;
  if (telemetryOverride)
    raceConfig.telemetryOutputPath = telemetryOverridePath;

  PartCatalog catalog;
  LoadPartCatalog(raceConfig.partCatalogPath, catalog);

  PhysicsConfig physics;
  LoadPhysicsConfig(raceConfig.physicsConfigPath, physics);

  AssemblyConfig assembly;
  LoadAssemblyConfig(raceConfig.physicsConfigPath, assembly);

  if (!raceConfig.entriesPath.empty())
    return RunMultiCar(raceConfig, catalog, physics, assembly);

  return RunSingleCar(raceConfig, catalog, physics, assembly);
}
