#include "sim_bridge.hpp"
#include "class_rules.hpp"
#include "commands.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "race_config.hpp"
#include <algorithm>
#include <unordered_map>

std::vector<SimEvent> *g_raceEventOut = nullptr;

void SetRaceEventOut(std::vector<SimEvent> *events) { g_raceEventOut = events; }

void SimBridge::loadTeamConfig(const std::string &staffConfigPath) {
  const std::string path =
      staffConfigPath.empty() ? "configs/team_config.txt" : staffConfigPath;
  if (!LoadTeamConfig(path, teamConfig_))
    teamConfig_ = TeamConfig{};
  session_.staff = teamConfig_.staffModifiers();
}

bool SimBridge::initFromRaceConfig(const std::string &raceConfigPath) {
  raceConfigPath_ = raceConfigPath;

  RaceConfig config;
  if (!LoadRaceConfig(raceConfigPath, config))
    return false;

  classRulesPath_ = config.classRulesPath;

  PartCatalog catalog;
  if (!LoadPartCatalog(config.partCatalogPath, catalog))
    return false;

  PhysicsConfig physics;
  if (!LoadPhysicsConfig(config.physicsConfigPath, physics))
    return false;

  AssemblyConfig assembly;
  if (!LoadAssemblyConfig(config.physicsConfigPath, assembly))
    return false;

  RaceSession session;
  session.physics = physics;
  session.targetLaps = config.targetLaps;
  session.targetDurationSeconds = config.targetDurationSeconds;

  if (!LoadTrack(config.trackConfigPath, session.track))
    return false;
  trackConfigPath_ = config.trackConfigPath;

  if (!config.entriesPath.empty()) {
    if (!LoadEntriesFromConfig(session, config.entriesPath, catalog, assembly,
                               config.classRulesPath, config.driverConfigPath))
      return false;
  } else {
    CarConfig car;
    if (!LoadCarConfig(config.carConfigPath, car))
      return false;

    const std::vector<CompatibilityRule> compatRules =
        LoadPartCompatibility("configs/part_compatibility.txt");
    if (!ValidatePartCompatibility(car, compatRules))
      return false;

    CompileCarArchitecture(car, catalog, assembly);

    const auto classRules = LoadClassRules(config.classRulesPath);
    RaceClass raceClass;
    raceClass.id = "Hypercar";
    auto ruleIt = classRules.find("Hypercar");
    if (ruleIt != classRules.end()) {
      raceClass.displayName = ruleIt->second.displayName;
      ApplyClassBoP(car, ruleIt->second);
    } else {
      raceClass.displayName = "Solo";
    }
    AddCar(session, std::move(car), std::move(raceClass), "Solo Entry", 1);
  }

  loadTeamConfig(config.staffConfigPath);
  session.staff = teamConfig_.staffModifiers();
  return initSession(session);
}

bool SimBridge::initSession(const RaceSession &session) {
  if (session.cars.empty() || session.track.sectors.empty())
    return false;

  session_ = session;
  pendingEvents_.clear();
  pendingCommands_.clear();
  raceCompleteEmitted_ = false;
  return true;
}

bool SimBridge::reloadDefinitions() {
  if (raceConfigPath_.empty())
    return false;
  return initFromRaceConfig(raceConfigPath_);
}

bool SimBridge::restartRace() {
  if (session_.cars.empty() || session_.track.sectors.empty())
    return false;

  session_.elapsedRaceTime = 0.0;
  session_.trafficEventCooldowns.clear();
  session_.fcyActive = false;
  session_.fcyEndTime = 0.0;
  session_.nextFcyScheduleTime = 0.0;
  for (Car &car : session_.cars)
    car.resetForRestart();

  pendingEvents_.clear();
  pendingCommands_.clear();
  raceCompleteEmitted_ = false;
  return true;
}

bool SimBridge::submitCommand(const std::string &entryId,
                              const std::string &command) {
  pendingCommands_.push_back({entryId, command});
  return true;
}

void SimBridge::processCommands() {
  for (const PendingCommand &pending : pendingCommands_) {
    const SimCommand cmd = ParseSimCommand(pending.command);
    if (cmd.type == SimCommandType::Unknown) {
      SimEvent ack;
      ack.type = SimEventType::CommandAck;
      ack.entryId = pending.entryId;
      ack.timestamp = session_.elapsedRaceTime;
      ack.message = "Unknown command: " + pending.command;
      pendingEvents_.push_back(std::move(ack));
      continue;
    }

    bool applied = false;
    for (Car &car : session_.cars) {
      if (car.entryId() != pending.entryId)
        continue;
      if (car.isRetired()) {
        SimEvent ack;
        ack.type = SimEventType::CommandAck;
        ack.entryId = pending.entryId;
        ack.timestamp = session_.elapsedRaceTime;
        ack.message = "Car retired — command rejected";
        pendingEvents_.push_back(std::move(ack));
        applied = true;
        break;
      }

      car.applyCommand(cmd);
      SimEvent ack;
      ack.type = SimEventType::CommandAck;
      ack.entryId = pending.entryId;
      ack.timestamp = session_.elapsedRaceTime;
      ack.message = "Command accepted: " + pending.command;
      pendingEvents_.push_back(std::move(ack));
      applied = true;
      break;
    }

    if (!applied) {
      SimEvent ack;
      ack.type = SimEventType::CommandAck;
      ack.entryId = pending.entryId;
      ack.timestamp = session_.elapsedRaceTime;
      ack.message = "Entry not found: " + pending.entryId;
      pendingEvents_.push_back(std::move(ack));
    }
  }

  pendingCommands_.clear();
}

void SimBridge::tick(double deltaTime) {
  if (session_.cars.empty())
    return;

  processCommands();

  SetRaceEventOut(&pendingEvents_);
  TickRace(session_, deltaTime);
  SetRaceEventOut(nullptr);

  if (!raceCompleteEmitted_ && IsRaceComplete(session_)) {
    raceCompleteEmitted_ = true;

    SimEvent event;
    event.type = SimEventType::RaceComplete;
    event.timestamp = session_.elapsedRaceTime;
    event.message = "Race complete";
    pendingEvents_.push_back(std::move(event));
  }
}

std::vector<CarSnapshot> SimBridge::getSnapshots() const {
  std::vector<CarSnapshot> snapshots;
  snapshots.reserve(session_.cars.size());
  if (session_.cars.empty())
    return snapshots;

  std::vector<Car *> board =
      GetLeaderboard(const_cast<RaceSession &>(session_));
  const Car *leader = board.empty() ? nullptr : board.front();
  const double lapLength = session_.track.lapLength();
  std::unordered_map<std::string, int> classRank;

  for (size_t rank = 0; rank < board.size(); ++rank) {
    const Car &car = *board[rank];
    CarSnapshot snap =
        car.snapshot(session_.track, static_cast<int>(rank + 1));
    if (leader != nullptr)
      snap.gapToLeader = ComputeGapToLeader(car, *leader, lapLength);
    snap.classPosition = ++classRank[car.raceClass().id];
    snapshots.push_back(std::move(snap));
  }

  return snapshots;
}

std::vector<SimEvent> SimBridge::drainEvents() {
  std::vector<SimEvent> drained = std::move(pendingEvents_);
  pendingEvents_.clear();
  return drained;
}

TrackGeometry SimBridge::getTrackGeometry() const {
  return SampleTrackXZ(session_.track);
}

bool SimBridge::isRaceComplete() const { return IsRaceComplete(session_); }
