#ifndef SIM_CHECKPOINT_HPP
#define SIM_CHECKPOINT_HPP

#include "car_entity.hpp"
#include "race.hpp"
#include "race_control_common.hpp"
#include "weather.hpp"
#include <string>
#include <unordered_map>
#include <vector>

struct SimCheckpointV1 {
  static constexpr int kVersion = 1;
  int version = kVersion;
  std::string raceConfigPath;
  double elapsedRaceTime = 0.0;
  unsigned rngSeed = 0;
  SessionMode sessionMode = SessionMode::Race;
  int targetLaps = 0;
  double targetDurationSeconds = 0.0;
  double trackWetness = 0.0;
  WeatherState weather;
  WeatherProfile weatherProfile;
  std::string weatherProfileId;
  std::string weatherLabel;
  std::string weatherBiome;
  unsigned bridgeRngSeed = 0;
  double initialTrackWetness = 0.0;
  double initialAmbientTempC = 0.0;
  SessionRaceControl raceControl;
  std::unordered_map<std::string, double> trafficEventCooldowns;
  std::vector<CarSnapshot> cars;
  bool raceCompleteEmitted = false;
};

class SimBridge;

SimCheckpointV1 CaptureCheckpoint(const SimBridge &bridge);
bool RestoreCheckpoint(SimBridge &bridge, const SimCheckpointV1 &checkpoint,
                       std::string *errorOut);

void RestoreCarFromSnapshot(Car &car, const CarSnapshot &snapshot);

#endif
