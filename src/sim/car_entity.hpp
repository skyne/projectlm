#ifndef CAR_ENTITY_HPP
#define CAR_ENTITY_HPP

#include "car_parts.hpp"
#include "simulation.hpp"
#include "telemetry.hpp"
#include "track.hpp"
#include <random>
#include <string>
#include <vector>

struct RaceClass {
  std::string id;
  std::string displayName;
};

struct CarInteractionContext;
struct CarTickResult;
struct WeatherState;

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
  bool pitQueued = false;
  bool retired = false;
  double fuelTankCapacity = 0.0;
  int pitCount = 0;
  double driverStintSeconds = 0.0;
  double maxDriverStintSeconds = 0.0;
  double coolantTempC = 0.0;
  bool blueFlag = false;
  bool limpMode = false;
  int trackLimitsWarnings = 0;
  std::string tireCompound = "Medium";
  bool wetTyres = false;
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

  int trackLimitsWarnings() const { return trackLimitsWarnings_; }
  void clearTrackLimitsWarnings() { trackLimitsWarnings_ = 0; }

  CarTickResult tick(const TrackDefinition &track, const PhysicsConfig &physics,
                     double deltaTime, TelemetryLog *telemetry = nullptr,
                     const CarInteractionContext *interaction = nullptr);

  CarSnapshot snapshot(const TrackDefinition &track, int racePosition,
                       bool inPit) const;

  bool isAheadOf(const Car &other) const;

  void markRetired(const std::string &reason);
  void setDriverModeScale(double scale) { driverModeScale_ = scale; }
  void setTireCompound(ETireCompound compound, bool wetTyres);

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
  double driverModeScale_ = 1.0;
  bool blueFlagActive_ = false;
  int trackLimitsWarnings_ = 0;
};

double ComputeGapToLeader(const Car &car, const Car &leader, double lapLength);

struct CarInteractionContext {
  const Car *self = nullptr;
  const std::vector<Car> *field = nullptr;
  double raceTime = 0.0;
  double lapLength = 0.0;
  double fcySpeedLimitMps = 0.0;
  double scSpeedLimitMps = 0.0;
  double trackWetness = 0.0;
  double ambientTempC = 22.0;
  double trackGripEvolution = 1.0;
  const WeatherState *weather = nullptr;
  std::mt19937 *rng = nullptr;
};

struct CarTickResult {
  bool sectorCrossed = false;
  bool lapCompleted = false;
  bool retired = false;
  int completedSectorIndex = 0;
  int completedLap = 0;
};

#endif
