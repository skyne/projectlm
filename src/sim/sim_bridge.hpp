#ifndef SIM_BRIDGE_HPP
#define SIM_BRIDGE_HPP

#include "car_entity.hpp"
#include "race.hpp"
#include "team_config.hpp"
#include "track_sampler.hpp"
#include <string>
#include <vector>

enum class SimEventType {
  SectorCross,
  LapComplete,
  PitEnter,
  PitExit,
  Retirement,
  RaceComplete,
  Overtake,
  Collision,
  Blocked,
  CommandAck
};

struct SimEvent {
  SimEventType type = SimEventType::SectorCross;
  std::string entryId;
  int lap = 0;
  int sectorIndex = 0;
  double timestamp = 0.0;
  std::string message;
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
  double getRaceTime() const { return session_.elapsedRaceTime; }

  bool submitCommand(const std::string &entryId, const std::string &command);
  const TeamConfig &teamConfig() const { return teamConfig_; }

private:
  RaceSession session_;
  TeamConfig teamConfig_;
  std::string raceConfigPath_;
  std::string trackConfigPath_;
  std::string classRulesPath_;
  std::vector<SimEvent> pendingEvents_;
  bool raceCompleteEmitted_ = false;

  struct PendingCommand {
    std::string entryId;
    std::string command;
  };
  std::vector<PendingCommand> pendingCommands_;

  void processCommands();
  void loadTeamConfig(const std::string &staffConfigPath = "");
};

extern std::vector<SimEvent> *g_raceEventOut;
void SetRaceEventOut(std::vector<SimEvent> *events);

#endif
