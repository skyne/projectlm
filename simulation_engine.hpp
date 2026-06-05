#ifndef SIMULATION_ENGINE_HPP
#define SIMULATION_ENGINE_HPP

#include <string>
#include <vector>

// --- SUB-ASSEMBLY TYPES ---
enum class EChassis { CarbonMonocoque, Spaceframe };
enum class EFrontAero { LowDragNose, HighDownforceSplitter };
enum class ERearAero { StandardWing, HighDownforceWing, WinglessGroundEffect };
enum class ECoolingPack { SprintSlimline, EnduranceHeavyDuty };

// --- PART PROPERTIES DATA ---
struct ChassisPart {
  double mass = 0.0;
  double structuralRigidity = 1.0; // Multiplier against harmonic damage
  double baselineDrag = 0.0;
};

struct FrontAeroPart {
  double mass = 0.0;
  double downforceCl = 0.0;
  double dragCd = 0.0;
};

struct RearAeroPart {
  double mass = 0.0;
  double downforceCl = 0.0;
  double dragCd = 0.0;
  bool permitsWinglessPitch = false; // High-floor venturi logic
};

struct CoolingPart {
  double mass = 0.0;
  double dragCd = 0.0;
  double thermalDissipationRate = 1.0;
};

// --- ENGINE STORAGE CORE (Retained) ---
struct EngineConfig {
  std::string layout;
  std::string fuelType;
  int cylinders = 0;
  double bore = 0.0;
  double stroke = 0.0;
  int maxRPM = 0;
  double baseVibrationFactor = 1.0;
};

// --- GLOBAL VEHICLE COMPILED CONFIG ---
struct CarConfig {
  std::string name;
  EngineConfig engine;

  // Component Enumerator Assignments
  EChassis chassisChoice = EChassis::CarbonMonocoque;
  EFrontAero frontAeroChoice = EFrontAero::LowDragNose;
  ERearAero rearAeroChoice = ERearAero::StandardWing;
  ECoolingPack coolingChoice = ECoolingPack::EnduranceHeavyDuty;

  // Suspension Parameters (Player Slider Tuning)
  double frontSpringStiffness = 100000.0; // N/m
  double rearSpringStiffness = 100000.0;  // N/m
  double rideHeight = 0.050;              // meters

  // Automatically Derived Simulation Coefficients
  double calculatedTotalMass = 0.0;
  double totalDragCd = 0.0;
  double totalDownforceCl = 0.0;
  double structuralRigidityFactor = 1.0;
  double coolingCapacity = 1.0;

  double peakHorsepower = 0.0;
  double peakTorque = 0.0;
  double vibrationIndex = 0.0;
  double fuelBurnRate = 0.0;
};

struct TrackNode {
  double distanceAlongSpline = 0.0;
  double length = 0.0;
  double maxSafeSpeed = 0.0;
  bool isStraightaway = false;
};

struct SimulationState {
  double currentDistance = 0.0;
  double currentSpeed = 0.0;
  double currentRPM = 0.0;
  double elapsedRaceTime = 0.0;
  double fuelRemaining = 100.0;
  double engineHealth = 100.0;
  double currentThermalLoad = 70.0;
  size_t currentTrackNodeIndex = 0;

  // --- ADD THESE FOR GAMEPLAY TRACKING ---
  int currentLap = 1;
  double currentLapTime = 0.0;
};

// Pipeline Declarations
void CompileCarArchitecture(CarConfig &car);
void TickSimulation(const CarConfig &car, const std::vector<TrackNode> &track,
                    SimulationState &state, double deltaTime);
bool LoadCarConfig(const std::string &filename, CarConfig &car);
bool LoadTrackConfig(const std::string &filename,
                     std::vector<TrackNode> &track);

#endif
