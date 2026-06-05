#ifndef CAR_ENTITY_HPP
#define CAR_ENTITY_HPP

#include "car_parts.hpp"
#include "simulation.hpp"
#include "telemetry.hpp"
#include "track.hpp"
#include <string>
#include <vector>

struct RaceClass {
  std::string id;
  std::string displayName;
};

struct CarInteractionContext;
struct CarTickResult;

struct LapTimingSnapshot {
  int lapNumber = 0;
  double lapTime = 0.0;
  std::vector<double> sectorTimes;
};

struct CarSnapshot {
  std::string entryId;
  std::string teamName;
  int carNumber = 0;
  std::string classId;
  int lap = 0;
  double distance = 0.0;
  double normalizedT = 0.0;
  double speed = 0.0;
  double rpm = 0.0;
  double fuel = 0.0;
  double tireWear = 0.0;
  double hybridDeployMJ = 0.0;
  double engineHealth = 100.0;
  int sectorIndex = 0;
  int racePosition = 0;
  bool inPit = false;
  bool retired = false;
  double currentLapTime = 0.0;
  double currentSectorTime = 0.0;
  double lastLapTime = 0.0;
  double bestLapTime = 0.0;
  double gapToLeader = 0.0;
  std::vector<double> currentLapSectorTimes;
  std::vector<LapTimingSnapshot> lapHistory;
  Vec3 position;
  Vec3 tangent;
};

class Car {
public:
  Car(std::string entryId, std::string teamName, RaceClass raceClass,
      CarConfig car, int gridPosition, int carNumber = 0);

  const std::string &entryId() const { return entryId_; }
  const std::string &teamName() const { return teamName_; }
  int carNumber() const { return carNumber_; }
  const RaceClass &raceClass() const { return raceClass_; }
  const CarConfig &config() const { return config_; }
  const SimulationState &state() const { return state_; }
  SimulationState &state() { return state_; }
  const TelemetryLog &telemetry() const { return telemetry_; }
  int gridPosition() const { return gridPosition_; }
  bool isRetired() const { return retired_; }
  const std::string &retireReason() const { return retireReason_; }

  void placeOnGrid(int gridPosition);
  void resetForRestart();

  CarTickResult tick(const TrackDefinition &track, const PhysicsConfig &physics,
                     double deltaTime, TelemetryLog *telemetry = nullptr,
                     const CarInteractionContext *interaction = nullptr);

  CarSnapshot snapshot(const TrackDefinition &track, int racePosition,
                       bool inPit) const;

  bool isAheadOf(const Car &other) const;

  void markRetired(const std::string &reason);

private:
  std::string entryId_;
  std::string teamName_;
  int carNumber_ = 0;
  RaceClass raceClass_;
  CarConfig config_;
  SimulationState state_;
  int gridPosition_ = 0;
  bool retired_ = false;
  std::string retireReason_;
  TelemetryLog telemetry_;
  double bestLapTime_ = 0.0;
};

double ComputeGapToLeader(const Car &car, const Car &leader, double lapLength);

// Reserved for future traffic, drafting, and collision modelling.
struct CarInteractionContext {
  const Car *self = nullptr;
  const std::vector<Car> *field = nullptr;
  double raceTime = 0.0;
};

struct CarTickResult {
  bool sectorCrossed = false;
  bool lapCompleted = false;
  bool retired = false;
  int completedSectorIndex = 0;
  int completedLap = 0;
};

#endif
