#include "sim_bridge.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "race_config.hpp"
#include <algorithm>
#include <cctype>

namespace {
std::string ToLower(std::string value) {
  for (char &ch : value) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return value;
}

bool IsPitRequestCommand(const std::string &command) {
  const std::string normalized = ToLower(command);
  return normalized == "pit" || normalized == "request_pit" ||
         normalized == "requestpit";
}
} // namespace

std::vector<SimEvent> *g_raceEventOut = nullptr;

void SetRaceEventOut(std::vector<SimEvent> *events) { g_raceEventOut = events; }

bool SimBridge::initFromRaceConfig(const std::string &raceConfigPath) {
  raceConfigPath_ = raceConfigPath;

  RaceConfig config;
  if (!LoadRaceConfig(raceConfigPath, config))
    return false;

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

  if (!LoadTrack(config.trackConfigPath, session.track))
    return false;
  trackConfigPath_ = config.trackConfigPath;

  if (!config.entriesPath.empty()) {
    if (!LoadEntriesFromConfig(session, config.entriesPath, catalog, assembly))
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

    RaceClass raceClass;
    raceClass.id = "solo";
    raceClass.displayName = "Solo";
    AddCar(session, std::move(car), std::move(raceClass), "Solo Entry", 1);
  }

  return initSession(session);
}

bool SimBridge::initSession(const RaceSession &session) {
  if (session.cars.empty() || session.track.sectors.empty())
    return false;

  session_ = session;
  pendingEvents_.clear();
  pendingCommands_.clear();
  pitStates_.assign(session_.cars.size(), PitState{});
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
  for (Car &car : session_.cars)
    car.resetForRestart();

  pendingEvents_.clear();
  pendingCommands_.clear();
  pitStates_.assign(session_.cars.size(), PitState{});
  raceCompleteEmitted_ = false;
  return true;
}

void SimBridge::ensurePitStates() {
  if (pitStates_.size() != session_.cars.size())
    pitStates_.assign(session_.cars.size(), PitState{});
}

void SimBridge::submitCommand(const std::string &entryId,
                              const std::string &command) {
  pendingCommands_.push_back({entryId, command});
}

void SimBridge::processCommands() {
  ensurePitStates();

  for (const PendingCommand &command : pendingCommands_) {
    for (size_t i = 0; i < session_.cars.size(); ++i) {
      if (session_.cars[i].entryId() != command.entryId)
        continue;

      if (IsPitRequestCommand(command.command) && !session_.cars[i].isRetired() &&
          !pitStates_[i].inPit) {
        pitStates_[i].pendingEnter = true;
      }
      break;
    }
  }

  pendingCommands_.clear();
}

void SimBridge::processPitStubs(double deltaTime) {
  ensurePitStates();

  for (size_t i = 0; i < session_.cars.size(); ++i) {
    Car &car = session_.cars[i];
    PitState &pit = pitStates_[i];

    if (car.isRetired())
      continue;

    if (pit.pendingEnter && !pit.inPit) {
      pit.inPit = true;
      pit.pendingEnter = false;
      pit.pitElapsed = 0.0;

      SimEvent event;
      event.type = SimEventType::PitEnter;
      event.entryId = car.entryId();
      event.lap = car.state().currentLap;
      event.sectorIndex = static_cast<int>(car.state().currentTrackNodeIndex);
      event.timestamp = session_.elapsedRaceTime;
      event.message = car.teamName() + " entered pit lane";
      pendingEvents_.push_back(std::move(event));
      continue;
    }

    if (!pit.inPit)
      continue;

    pit.pitElapsed += deltaTime;
    if (pit.pitElapsed < 5.0)
      continue;

    pit.inPit = false;
    pit.pitElapsed = 0.0;

    SimEvent event;
    event.type = SimEventType::PitExit;
    event.entryId = car.entryId();
    event.lap = car.state().currentLap;
    event.sectorIndex = static_cast<int>(car.state().currentTrackNodeIndex);
    event.timestamp = session_.elapsedRaceTime;
    event.message = car.teamName() + " exited pit lane";
    pendingEvents_.push_back(std::move(event));
  }
}

void SimBridge::tick(double deltaTime) {
  if (session_.cars.empty())
    return;

  processCommands();

  SetRaceEventOut(&pendingEvents_);
  TickRace(session_, deltaTime);
  SetRaceEventOut(nullptr);

  processPitStubs(deltaTime);

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

  for (size_t rank = 0; rank < board.size(); ++rank) {
    const Car &car = *board[rank];
    bool inPit = false;
    for (size_t i = 0; i < session_.cars.size(); ++i) {
      if (session_.cars[i].entryId() != car.entryId())
        continue;
      if (i < pitStates_.size())
        inPit = pitStates_[i].inPit;
      break;
    }

    CarSnapshot snap =
        car.snapshot(session_.track, static_cast<int>(rank + 1), inPit);
    if (leader != nullptr)
      snap.gapToLeader = ComputeGapToLeader(car, *leader, lapLength);
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
