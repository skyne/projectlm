#include "simulation_engine.hpp"
#include <iomanip>
#include <iostream>

int main() {
  CarConfig entryCar;
  std::vector<TrackNode> circuit;

  if (!LoadCarConfig("car_config.txt", entryCar) ||
      !LoadTrackConfig("track_config.txt", circuit)) {
    std::cerr << "Error: Configuration assets missing!" << std::endl;
    return 1;
  }

  CompileCarArchitecture(entryCar);

  SimulationState raceState;
  double simTimeStep = 0.1; // 100ms per physics update

  // --- TARGET LAP CONFIGURATION ---
  const int TARGET_LAPS = 2; // Set exactly how many laps you want to simulate

  std::cout << "=== MODULAR MODELLING ENGINE RUNNING ===" << std::endl;
  std::cout << "Design Class: " << entryCar.name << std::endl;
  std::cout << "Mass: " << (int)entryCar.calculatedTotalMass
            << " kg | Aero Drag: " << entryCar.totalDragCd << " Cd"
            << std::endl;
  std::cout << "Calculated Net Power: " << (int)entryCar.peakHorsepower << " HP"
            << std::endl;
  std::cout << "Simulating exactly " << TARGET_LAPS << " laps...\n"
            << std::endl;

  std::cout << std::setw(6) << "Lap" << std::setw(12) << "LapTime(s)"
            << std::setw(14) << "Distance(m)" << std::setw(12) << "Speed(km/h)"
            << std::setw(8) << "RPM" << std::setw(15) << "Sector Type"
            << std::endl;
  std::cout << "---------------------------------------------------------------"
               "-----------------"
            << std::endl;

  int printCounter = 0;

  // The simulation runs as long as the current lap does not exceed our target
  // bounds
  while (raceState.currentLap <= TARGET_LAPS) {

    TickSimulation(entryCar, circuit, raceState, simTimeStep);

    // Keep the throttle snapshot prints synchronized to our 2.5s visual
    // heartbeat intervals
    if (printCounter % 25 == 0 && raceState.currentLap <= TARGET_LAPS) {
      std::string sectorName =
          circuit[raceState.currentTrackNodeIndex].isStraightaway ? "Straight"
                                                                  : "Corner";
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
  std::cout << "🏁 Race simulation completed cleanly after " << TARGET_LAPS
            << " laps. 🏁" << std::endl;
  std::cout << "Total Elapsed Event Time: " << std::setprecision(2)
            << raceState.elapsedRaceTime << " seconds" << std::endl;
  std::cout << "Remaining Fuel: " << std::setprecision(1)
            << raceState.fuelRemaining << " Liters" << std::endl;
  std::cout << "Final Engine Health Condition: " << std::setprecision(1)
            << raceState.engineHealth << "%" << std::endl;

  return 0;
}
