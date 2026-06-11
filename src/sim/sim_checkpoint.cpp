#include "sim_checkpoint.hpp"
#include "sim_bridge.hpp"
#include <unordered_map>

void RestoreCarFromSnapshot(Car &car, const CarSnapshot &snapshot) {
  car.restoreFromSnapshot(snapshot);
}

SimCheckpointV1 CaptureCheckpoint(const SimBridge &bridge) {
  SimCheckpointV1 cp;
  cp.version = SimCheckpointV1::kVersion;
  cp.raceConfigPath = bridge.raceConfigPath_;
  cp.elapsedRaceTime = bridge.session_.elapsedRaceTime;
  cp.rngSeed = bridge.rngSeed_;
  cp.sessionMode = bridge.session_.sessionMode;
  cp.targetLaps = bridge.session_.targetLaps;
  cp.targetDurationSeconds = bridge.session_.targetDurationSeconds;
  cp.trackWetness = bridge.session_.trackWetness;
  cp.weather = bridge.session_.weather;
  cp.weatherProfile = bridge.session_.weatherProfile;
  cp.weatherProfileId = bridge.session_.weatherProfileId;
  cp.weatherLabel = bridge.weatherLabel_;
  cp.weatherBiome = bridge.weatherBiome_;
  cp.bridgeRngSeed = bridge.rngSeed_;
  cp.initialTrackWetness = bridge.initialTrackWetness_;
  cp.initialAmbientTempC = bridge.initialAmbientTempC_;
  cp.raceControl = bridge.session_.raceControl;
  cp.trafficEventCooldowns = bridge.session_.trafficEventCooldowns;
  cp.cars = bridge.getSnapshots();
  cp.raceCompleteEmitted = bridge.raceCompleteEmitted_;
  return cp;
}

bool RestoreCheckpoint(SimBridge &bridge, const SimCheckpointV1 &checkpoint,
                       std::string *errorOut) {
  if (checkpoint.version != SimCheckpointV1::kVersion) {
    if (errorOut)
      *errorOut = "unsupported checkpoint version";
    return false;
  }
  if (bridge.session_.cars.empty()) {
    if (errorOut)
      *errorOut = "session has no cars — init race config first";
    return false;
  }

  std::unordered_map<std::string, const CarSnapshot *> byEntry;
  for (const CarSnapshot &snap : checkpoint.cars) {
    if (!snap.entryId.empty())
      byEntry[snap.entryId] = &snap;
  }

  for (Car &car : bridge.session_.cars) {
    const auto it = byEntry.find(car.entryId());
    if (it == byEntry.end()) {
      if (errorOut)
        *errorOut = "missing car in checkpoint: " + car.entryId();
      return false;
    }
    RestoreCarFromSnapshot(car, *it->second);
  }

  bridge.session_.elapsedRaceTime = checkpoint.elapsedRaceTime;
  bridge.session_.sessionMode = checkpoint.sessionMode;
  bridge.session_.targetLaps = checkpoint.targetLaps;
  bridge.session_.targetDurationSeconds = checkpoint.targetDurationSeconds;
  bridge.session_.trackWetness = checkpoint.trackWetness;
  bridge.session_.weather = checkpoint.weather;
  bridge.session_.weatherProfile = checkpoint.weatherProfile;
  bridge.session_.weatherProfileId = checkpoint.weatherProfileId;
  bridge.session_.rng = std::mt19937(checkpoint.bridgeRngSeed);
  bridge.session_.raceControl = checkpoint.raceControl;
  bridge.session_.trafficEventCooldowns = checkpoint.trafficEventCooldowns;
  bridge.weatherProfileId_ = checkpoint.weatherProfileId;
  bridge.weatherProfile_ = checkpoint.weatherProfile;
  bridge.weatherLabel_ = checkpoint.weatherLabel;
  bridge.weatherBiome_ = checkpoint.weatherBiome;
  bridge.rngSeed_ = checkpoint.bridgeRngSeed;
  bridge.initialTrackWetness_ = checkpoint.initialTrackWetness;
  bridge.initialAmbientTempC_ = checkpoint.initialAmbientTempC;
  bridge.raceCompleteEmitted_ = checkpoint.raceCompleteEmitted;
  bridge.pendingEvents_.clear();
  bridge.pendingCommands_.clear();
  return true;
}

SimCheckpointV1 SimBridge::captureCheckpoint() const {
  return CaptureCheckpoint(*this);
}

bool SimBridge::restoreCheckpoint(const SimCheckpointV1 &checkpoint,
                                  std::string *errorOut) {
  return RestoreCheckpoint(*this, checkpoint, errorOut);
}
