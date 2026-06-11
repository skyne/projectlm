#include "sim_bridge.hpp"
#include "sim_checkpoint.hpp"
#include "race_control.hpp"
#include "car_condition_io.hpp"
#include "class_rules.hpp"
#include "commands.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "part_damage.hpp"
#include "race_config.hpp"
#include "weather.hpp"
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
  session.sessionMode = ParseSessionMode(config.sessionMode);
  session.targetLaps = config.targetLaps;
  session.targetDurationSeconds = config.targetDurationSeconds;

  if (!LoadTrack(config.trackConfigPath, session.track))
    return false;
  InitSessionCorridor(session);
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
    AddCar(session, std::move(car), std::move(raceClass), "Solo Entry", 1, "1",
           "solo-1");
  }

  loadTeamConfig(config.staffConfigPath);
  session.staff = teamConfig_.staffModifiers();
  initWeatherOnSession(session, config);
  ApplyGridTyresForWeather(session);
  ApplyOpenSessionPlacement(session);
  if (!initSession(std::move(session)))
    return false;
  applyCarConditions(config.carConditionsPath);
  return true;
}

bool SimBridge::initSession(RaceSession &&session) {
  if (session.cars.empty() || session.track.sectors.empty())
    return false;

  session_ = std::move(session);
  // Corridor holds a raw pointer into session_.track — rebuild after move.
  InitSessionCorridor(session_);
  InitSessionRaceControl(session_);
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
  InitSessionRaceControl(session_);
  resetWeatherState();
  for (Car &car : session_.cars)
    car.resetForRestart();
  ApplyGridTyresForWeather(session_);
  if (session_.sessionMode != SessionMode::Race)
    ApplyOpenSessionPlacement(session_);

  pendingEvents_.clear();
  pendingCommands_.clear();
  raceCompleteEmitted_ = false;
  return true;
}


void SimBridge::applyCarConditions(const std::string &conditionsPath) {
  if (conditionsPath.empty())
    return;
  std::unordered_map<std::string, std::string> byEntry;
  if (!LoadCarConditionsFile(conditionsPath, byEntry))
    return;
  for (Car &car : session_.cars) {
    auto it = byEntry.find(car.entryId());
    if (it == byEntry.end())
      continue;
    ApplyCarConditionLine(car.state(), car.config(), it->second);
  }
}

bool SimBridge::debugRaceControl(const DebugRaceControlRequest &req,
                                 std::string *errorOut) {
  if (session_.cars.empty()) {
    if (errorOut)
      *errorOut = "no cars in session";
    return false;
  }
  SetRaceEventOut(&pendingEvents_);
  const bool ok = ApplyDebugRaceControl(session_, req, errorOut);
  SetRaceEventOut(nullptr);
  return ok;
}

bool SimBridge::submitCommand(const std::string &entryId,
                              const std::string &command) {
  pendingCommands_.push_back({entryId, command});
  // Apply immediately so pit-queue state is visible while the session is paused.
  if (!session_.cars.empty())
    processCommands();
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

      if (cmd.type == SimCommandType::ReleaseGarage) {
        applied = car.releaseFromGarage(session_.track);
        SimEvent ack;
        ack.type = SimEventType::CommandAck;
        ack.entryId = pending.entryId;
        ack.timestamp = session_.elapsedRaceTime;
        ack.message = applied ? "Released to track"
                              : "Cannot release (not in garage)";
        pendingEvents_.push_back(std::move(ack));
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

  const bool timingMode = session_.sessionMode != SessionMode::Race;
  std::vector<Car *> board = timingMode
                                 ? GetTimingLeaderboard(
                                       const_cast<RaceSession &>(session_))
                                 : GetLeaderboard(
                                       const_cast<RaceSession &>(session_));
  const Car *leader = board.empty() ? nullptr : board.front();
  const double lapLength = session_.track.lapLength();
  std::unordered_map<std::string, int> classRank;
  std::unordered_map<std::string, const Car *> classLeader;

  for (size_t rank = 0; rank < board.size(); ++rank) {
    const Car &car = *board[rank];
    const double remaining = RemainingSessionSec(session_, car);
    CarSnapshot snap =
        car.snapshot(session_.track, static_cast<int>(rank + 1), remaining,
                     &session_.corridor, &session_.physics,
                     session_.trackWidthM);
    if (timingMode) {
      const std::string &classId = car.raceClass().id;
      const Car *classLead = classLeader[classId];
      if (classLead == nullptr) {
        classLeader[classId] = &car;
        classLead = &car;
      }
      if (classLead != nullptr)
        snap.gapToLeader = ComputeTimingGap(car, *classLead);
    } else if (leader != nullptr) {
      snap.gapToLeader = ComputeGapToLeader(car, *leader, lapLength);
    }
    snap.classPosition = ++classRank[car.raceClass().id];
    snapshots.push_back(std::move(snap));
  }

  CarSnapshot safetyCar = MakeSafetyCarSnapshot(session_);
  if (!safetyCar.entryId.empty())
    snapshots.push_back(std::move(safetyCar));

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

namespace {

WeatherProfile WeatherProfileFromConfig(const RaceConfig &config) {
  if (!config.weatherResolved)
    return WeatherProfileForId(config.weatherProfile);

  WeatherProfile profile;
  profile.baseTempC = config.wxBaseTempC;
  profile.tempDriftPerHour = config.wxTempDriftPerHour;
  profile.baseWetness = config.wxBaseWetness;
  profile.rainChancePerHour = config.wxRainChancePerHour;
  profile.maxRainIntensity = config.wxMaxRainIntensity;
  profile.wetRatePerSecond = config.wxWetRatePerSecond;
  profile.dryRatePerSecond = config.wxDryRatePerSecond;
  profile.baseWindSpeedMs = config.wxBaseWindSpeedMs;
  profile.baseVisibilityKm = config.wxBaseVisibilityKm;
  profile.trackSolarGainC = config.wxTrackSolarGainC;
  return profile;
}

std::string WeatherProfileIdFromConfig(const RaceConfig &config) {
  if (config.weatherResolved && !config.weatherTrackId.empty())
    return config.weatherTrackId + ":" + std::to_string(config.weatherMonth);
  return config.weatherProfile;
}

} // namespace

void SimBridge::initWeatherOnSession(RaceSession &session,
                                     const RaceConfig &config) {
  weatherProfileId_ = WeatherProfileIdFromConfig(config);
  weatherProfile_ = WeatherProfileFromConfig(config);
  weatherLabel_ = config.weatherLabel;
  weatherBiome_ = config.weatherBiome;
  initialTrackWetness_ = config.trackWetness;
  initialAmbientTempC_ = config.ambientTempC;
  rngSeed_ = config.rngSeed;

  session.weatherProfileId = weatherProfileId_;
  session.weatherProfile = weatherProfile_;
  session.rng = std::mt19937(rngSeed_);
  InitWeatherStateFromProfile(session.weather, weatherProfile_, weatherProfileId_,
                              initialTrackWetness_, initialAmbientTempC_,
                              &session.rng);
  session.trackWetness = session.weather.trackWetness;
}

void SimBridge::resetWeatherState() {
  session_.weatherProfileId = weatherProfileId_;
  session_.weatherProfile = weatherProfile_;
  session_.rng = std::mt19937(rngSeed_);
  InitWeatherStateFromProfile(session_.weather, weatherProfile_, weatherProfileId_,
                              initialTrackWetness_, initialAmbientTempC_,
                              &session_.rng);
  session_.trackWetness = session_.weather.trackWetness;
}

RaceControlState SimBridge::getRaceControl() const {
  RaceControlState state;
  const SessionRaceControl &rc = session_.raceControl;
  state.fcyActive = rc.fcyActive;
  state.scActive = rc.scActive;
  state.flagPhase = FlagPhaseName(rc.flagPhase);
  state.sectorFlags = rc.sectorFlags;
  state.activeIncidentEntryId = rc.activeIncidentEntryId;
  state.scLapsRemaining = rc.scLapsRemaining;
  state.obstructionsOnTrack = CountTrackObstructions(session_);
  state.whiteFlagActive = rc.whiteFlagActive;
  state.redFlagActive = rc.redFlagActive;
  state.redFlagSecondsRemaining =
      rc.redFlagActive
          ? std::max(0.0, rc.redFlagUntil - session_.elapsedRaceTime)
          : 0.0;
  state.redFlagReason = rc.redFlagReason;
  state.surfaceHazards.reserve(rc.hazards.size());
  for (const TrackSurfaceHazard &hz : rc.hazards) {
    state.surfaceHazards.push_back({hz.sectorIndex, HazardKindName(hz.kind),
                                    hz.gripMultiplier, hz.centerDistance,
                                    hz.centerLateralM, hz.spanMeters,
                                    hz.lateralSpanM});
  }
  state.trackWetness = session_.weather.trackWetness;
  state.ambientTempC = session_.weather.ambientTempC;
  state.trackTempC = session_.weather.trackTempC;
  state.trackGripEvolution = session_.weather.trackGripEvolution;
  state.rainIntensity = session_.weather.rainIntensity;
  state.windSpeedMs = session_.weather.windSpeedMs;
  state.windDirectionDeg = session_.weather.windDirectionDeg;
  state.visibilityKm = session_.weather.visibilityKm;
  state.weatherPhase = WeatherPhaseName(session_.weather.phase);
  state.forecastRainInSeconds = session_.weather.forecastRainInSeconds;
  state.weatherLabel = weatherLabel_;
  state.weatherBiome = weatherBiome_;

  const std::vector<WeatherForecastStep> built = BuildWeatherForecast(
      session_.weather, session_.weatherProfile, session_.elapsedRaceTime);
  state.forecast.reserve(built.size());
  for (const WeatherForecastStep &step : built) {
    state.forecast.push_back(
        {step.offsetMinutes, WeatherPhaseName(step.phase), step.trackWetness,
         step.rainIntensity, step.ambientTempC, step.trackTempC,
         step.windSpeedMs, step.windDirectionDeg, step.visibilityKm});
  }
  return state;
}
