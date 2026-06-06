#include "sim_bridge.hpp"
#include "class_rules.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "race_config.hpp"
#include "weather.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <sstream>

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
         normalized == "requestpit" || normalized.rfind("pit|", 0) == 0;
}

bool IsDriverModeCommand(const std::string &command) {
  return ToLower(command).rfind("driver_mode=", 0) == 0;
}

double MaxStintSecondsForClass(const std::string &classId) {
  if (classId == "LMP2")
    return 3000.0;
  if (classId == "LMGT3")
    return 2100.0;
  return 2700.0;
}

std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

struct ParsedPitRequest {
  double fuelLiters = 0.0;
  bool changeTires = false;
  bool repairEngine = false;
  bool driverSwap = false;
  bool wetTyres = false;
  bool hasCompound = false;
  ETireCompound compound = ETireCompound::Medium;
};

ParsedPitRequest ParsePitCommand(const std::string &command) {
  ParsedPitRequest request;
  std::istringstream stream(command);
  std::string token;
  while (std::getline(stream, token, '|')) {
    const std::string part = ToLower(Trim(token));
    if (part.empty() || part == "pit" || part == "request_pit" ||
        part == "requestpit")
      continue;
    const size_t eq = part.find('=');
    if (eq == std::string::npos)
      continue;
    const std::string key = part.substr(0, eq);
    const std::string value = part.substr(eq + 1);
    if (key == "fuel")
      request.fuelLiters = std::max(0.0, std::stod(value));
    else if (key == "tires" && !value.empty())
      request.changeTires = true;
    else if (key == "repairs" && value.find("engine") != std::string::npos)
      request.repairEngine = true;
    else if (key == "driver" && !value.empty())
      request.driverSwap = true;
    else if (key == "compound") {
      request.hasCompound = true;
      if (value == "wet")
        request.wetTyres = true;
      else if (value == "soft")
        request.compound = ETireCompound::Soft;
      else if (value == "hard")
        request.compound = ETireCompound::Hard;
      else
        request.compound = ETireCompound::Medium;
    }
  }
  return request;
}

double ServiceDurationSeconds(const ParsedPitRequest &request) {
  double duration = 2.0;
  if (request.fuelLiters > 0.0)
    duration += std::min(8.0, request.fuelLiters * 0.04);
  if (request.changeTires)
    duration += 4.0;
  if (request.repairEngine)
    duration += 6.0;
  if (request.driverSwap)
    duration += 3.0;
  return duration;
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
  if (config.targetDurationHours > 0.0)
    session.targetDurationSeconds = config.targetDurationHours * 3600.0;
  else if (config.targetDurationMinutes > 0.0)
    session.targetDurationSeconds = config.targetDurationMinutes * 60.0;

  if (!LoadTrack(config.trackConfigPath, session.track))
    return false;
  trackConfigPath_ = config.trackConfigPath;
  session.weatherProfileId =
      config.weatherProfile.empty() ? "dry" : config.weatherProfile;
  session.weatherProfile = WeatherProfileForId(session.weatherProfileId);
  session.initialTrackWetness = config.trackWetness;
  session.initialAmbientTempC = config.ambientTempC;
  InitWeatherState(session.weather, session.weatherProfileId,
                   config.trackWetness, config.ambientTempC);
  session.rngSeed = config.rngSeed != 0 ? config.rngSeed : 20260306u;
  session.rng.seed(session.rngSeed);
  classRules_ = LoadClassRules("configs/class_rules.txt");

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
  pitStates_.clear();
  pitStates_.resize(session_.cars.size());
  for (size_t i = 0; i < session_.cars.size(); ++i) {
    pitStates_[i].maxDriverStintSeconds =
        maxStintSecondsForCar(session_.cars[i]);
  }
  replayLog_.clear();
  raceCompleteEmitted_ = false;
  return true;
}

double SimBridge::maxStintSecondsForCar(const Car &car) const {
  const double profile = MaxStintSecondsForClass(car.raceClass().id);
  auto it = classRules_.find(car.raceClass().id);
  if (it == classRules_.end())
    return profile;
  const double regulatory = it->second.maxDriverStintHours * 3600.0;
  return std::min(profile, regulatory);
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
  session_.fcyRemainingSeconds = 0.0;
  session_.scRemainingSeconds = 0.0;
  InitWeatherState(session_.weather, session_.weatherProfileId,
                   session_.initialTrackWetness, session_.initialAmbientTempC);
  for (Car &car : session_.cars)
    car.resetForRestart();

  pendingEvents_.clear();
  pendingCommands_.clear();
  pitStates_.assign(session_.cars.size(), PitState{});
  for (size_t i = 0; i < session_.cars.size(); ++i) {
    pitStates_[i].maxDriverStintSeconds =
        maxStintSecondsForCar(session_.cars[i]);
  }
  session_.rng.seed(session_.rngSeed);
  replayLog_.clear();
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
  replayLog_.push_back(
      {session_.elapsedRaceTime, entryId, command});
}

void SimBridge::enforceRegulatoryStints() {
  ensurePitStates();
  for (size_t i = 0; i < session_.cars.size(); ++i) {
    Car &car = session_.cars[i];
    PitState &pit = pitStates_[i];
    if (car.isRetired() || pit.inPit || pit.pitQueued || pit.pendingEnter)
      continue;
    if (pit.driverStintSeconds < pit.maxDriverStintSeconds * 0.98)
      continue;

    pit.pitQueued = true;
    pit.pendingEnter = true;
    pit.driverSwap = true;
    pit.requestedFuelLiters =
        std::max(0.0, car.config().fuelTankCapacity - car.state().fuelRemaining);
    pit.changeTires = false;
    pit.repairEngine = false;
    pit.serviceRemaining = ServiceDurationSeconds(
        {pit.requestedFuelLiters, false, false, true});
  }
}

void SimBridge::processCommands() {
  ensurePitStates();

  for (const PendingCommand &command : pendingCommands_) {
    for (size_t i = 0; i < session_.cars.size(); ++i) {
      if (session_.cars[i].entryId() != command.entryId)
        continue;

      Car &car = session_.cars[i];
      PitState &pit = pitStates_[i];
      if (car.isRetired() || pit.inPit)
        break;

      if (IsDriverModeCommand(command.command)) {
        const std::string mode =
            ToLower(command.command.substr(command.command.find('=') + 1));
        if (mode == "conserve")
          car.setDriverModeScale(0.82);
        else if (mode == "push")
          car.setDriverModeScale(1.05);
        else
          car.setDriverModeScale(1.0);
        break;
      }

      if (IsPitRequestCommand(command.command)) {
        const ParsedPitRequest request = ParsePitCommand(command.command);
        pit.pitQueued = true;
        pit.pendingEnter = true;
        pit.requestedFuelLiters = request.fuelLiters;
        pit.changeTires = request.changeTires || request.hasCompound;
        pit.repairEngine = request.repairEngine;
        pit.driverSwap = request.driverSwap;
        pit.wetTyres = request.wetTyres;
        pit.hasCompound = request.hasCompound;
        pit.compound = request.compound;
        if (request.fuelLiters <= 0.0 && !request.changeTires &&
            !request.repairEngine && !request.driverSwap) {
          pit.requestedFuelLiters =
              std::max(0.0, car.config().fuelTankCapacity -
                                car.state().fuelRemaining);
        }
        pit.serviceRemaining = ServiceDurationSeconds(request);
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
      pit.pitQueued = false;
      pit.pitElapsed = 0.0;
      car.state().currentSpeed = 0.0;

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
    pit.serviceRemaining = std::max(0.0, pit.serviceRemaining - deltaTime);
    if (pit.serviceRemaining > 0.0)
      continue;

    auto &state = car.state();
    if (pit.requestedFuelLiters > 0.0) {
      state.fuelRemaining =
          std::min(car.config().fuelTankCapacity,
                   state.fuelRemaining + pit.requestedFuelLiters);
    }
    if (pit.changeTires) {
      state.tireWear = 0.05;
      if (pit.hasCompound)
        car.setTireCompound(pit.compound, pit.wetTyres);
    }
    if (pit.repairEngine)
      state.engineHealth = std::min(100.0, state.engineHealth + 18.0);
    if (pit.driverSwap || pit.changeTires || pit.requestedFuelLiters > 0.0)
      pit.driverStintSeconds = 0.0;

    pit.inPit = false;
    pit.pitElapsed = 0.0;
    pit.pitCount += 1;
    pit.requestedFuelLiters = 0.0;
    pit.changeTires = false;
    pit.repairEngine = false;
    pit.driverSwap = false;
    pit.wetTyres = false;
    pit.hasCompound = false;
    car.setDriverModeScale(1.0);

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

  enforceRegulatoryStints();
  processCommands();

  ensurePitStates();
  std::vector<bool> skipCars(session_.cars.size(), false);
  for (size_t i = 0; i < session_.cars.size(); ++i) {
    if (pitStates_[i].inPit || pitStates_[i].pendingEnter)
      skipCars[i] = true;
    else if (!session_.cars[i].isRetired())
      pitStates_[i].driverStintSeconds += deltaTime;
  }

  SetRaceEventOut(&pendingEvents_);
  TickRace(session_, deltaTime, &skipCars);
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
    PitState pit{};
    for (size_t i = 0; i < session_.cars.size(); ++i) {
      if (session_.cars[i].entryId() != car.entryId())
        continue;
      if (i < pitStates_.size())
        pit = pitStates_[i];
      break;
    }

    CarSnapshot snap =
        car.snapshot(session_.track, static_cast<int>(rank + 1), pit.inPit);
    snap.pitQueued = pit.pitQueued;
    snap.pitCount = pit.pitCount;
    snap.driverStintSeconds = pit.driverStintSeconds;
    snap.maxDriverStintSeconds = pit.maxDriverStintSeconds;
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

double SimBridge::getRaceTime() const { return session_.elapsedRaceTime; }

RaceControlState SimBridge::getRaceControl() const {
  RaceControlState state;
  state.fcyActive = session_.fcyRemainingSeconds > 0.0;
  state.scActive = session_.scRemainingSeconds > 0.0;
  state.trackWetness = session_.weather.trackWetness;
  state.ambientTempC = session_.weather.ambientTempC;
  state.trackGripEvolution = session_.weather.trackGripEvolution;
  state.rainIntensity = session_.weather.rainIntensity;
  state.weatherPhase = WeatherPhaseName(session_.weather.phase);
  state.forecastRainInSeconds = session_.weather.forecastRainInSeconds;
  return state;
}

std::vector<ReplayCommand> SimBridge::getReplayLog() const {
  return replayLog_;
}

uint32_t SimBridge::getRngSeed() const { return session_.rngSeed; }
