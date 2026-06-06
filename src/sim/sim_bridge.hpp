#ifndef SIM_BRIDGE_HPP
#define SIM_BRIDGE_HPP

#include "car_entity.hpp"
#include "class_rules.hpp"
#include "race.hpp"
#include "track_sampler.hpp"
#include <cstdint>
#include <map>
#include <string>
#include <vector>

enum class SimEventType {
  SectorCross,
  LapComplete,
  PitEnter,
  PitExit,
  Retirement,
  RaceComplete
};

struct SimEvent {
  SimEventType type = SimEventType::SectorCross;
  std::string entryId;
  int lap = 0;
  int sectorIndex = 0;
  double timestamp = 0.0;
  std::string message;
};

struct RaceControlState {
  bool fcyActive = false;
  bool scActive = false;
  double trackWetness = 0.0;
  double ambientTempC = 22.0;
  double trackGripEvolution = 1.0;
  double rainIntensity = 0.0;
  std::string weatherPhase = "Dry";
  double forecastRainInSeconds = -1.0;
};

struct ReplayCommand {
  double timestamp = 0.0;
  std::string entryId;
  std::string command;
};

class SimBridge {
public:
  bool initFromRaceConfig(const std::string &raceConfigPath);
  bool initSession(const RaceSession &session);
  bool reloadDefinitions();
  bool restartRace();

  void tick(double deltaTime);

  std::vector<CarSnapshot> getSnapshots() const;
  std::vector<SimEvent> drainEvents();
  TrackGeometry getTrackGeometry() const;
  bool isRaceComplete() const;
  double getRaceTime() const;
  RaceControlState getRaceControl() const;
  std::vector<ReplayCommand> getReplayLog() const;
  uint32_t getRngSeed() const;

  void submitCommand(const std::string &entryId, const std::string &command);

private:
  RaceSession session_;
  std::map<std::string, ClassRule> classRules_;
  std::string raceConfigPath_;
  std::string trackConfigPath_;
  std::vector<SimEvent> pendingEvents_;
  std::vector<ReplayCommand> replayLog_;
  bool raceCompleteEmitted_ = false;

  struct PendingCommand {
    std::string entryId;
    std::string command;
  };
  std::vector<PendingCommand> pendingCommands_;

  struct PitState {
    bool inPit = false;
    bool pitQueued = false;
    bool pendingEnter = false;
    double pitElapsed = 0.0;
    int pitCount = 0;
    double driverStintSeconds = 0.0;
    double maxDriverStintSeconds = 2700.0;
    double requestedFuelLiters = 0.0;
    bool changeTires = false;
    bool repairEngine = false;
    bool driverSwap = false;
    bool wetTyres = false;
    bool hasCompound = false;
    ETireCompound compound = ETireCompound::Medium;
    double serviceRemaining = 0.0;
  };
  std::vector<PitState> pitStates_;

  void processCommands();
  void processPitStubs(double deltaTime);
  void enforceRegulatoryStints();
  void ensurePitStates();
  double maxStintSecondsForCar(const Car &car) const;
};

extern std::vector<SimEvent> *g_raceEventOut;
void SetRaceEventOut(std::vector<SimEvent> *events);

#endif
