#include "race.hpp"
#include "class_rules.hpp"
#include "config_loader.hpp"
#include "driver_catalog.hpp"
#include "part_compatibility.hpp"
#include "race_control.hpp"
#include "sim_bridge.hpp"
#include "traffic.hpp"
#include "weather.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <iostream>
#include <sstream>

static std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

static std::string MakeEntryId(int gridPosition) {
  return "entry-" + std::to_string(gridPosition);
}

SessionMode ParseSessionMode(const std::string &value) {
  const std::string lower = Trim(value);
  if (lower == "practice")
    return SessionMode::Practice;
  if (lower == "qualifying")
    return SessionMode::Qualifying;
  return SessionMode::Race;
}

void ApplyOpenSessionPlacement(RaceSession &session) {
  if (session.sessionMode == SessionMode::Race)
    return;
  for (Car &car : session.cars)
    car.placeInGarageHold(session.track);
}

void ApplyGridTyresForWeather(RaceSession &session) {
  if (session.trackWetness < 0.15)
    return;
  for (Car &car : session.cars) {
    car.config().tyreTread =
        session.trackWetness >= 0.35 ? ETyreTread::Wet : ETyreTread::Intermediate;
  }
}

void AddCar(RaceSession &session, CarConfig car, RaceClass raceClass,
            const std::string &teamName, int gridPosition,
            const std::string &carNumber, const std::string &entryId) {
  session.cars.emplace_back(entryId, teamName, std::move(raceClass),
                            std::move(car), gridPosition, carNumber);
}

static void EmitRaceEvent(SimEventType type, const Car &car, int lap,
                          int sectorIndex, double timestamp,
                          const std::string &message) {
  if (g_raceEventOut == nullptr)
    return;

  SimEvent event;
  event.type = type;
  event.entryId = car.entryId();
  event.lap = lap;
  event.sectorIndex = sectorIndex;
  event.timestamp = timestamp;
  event.message = message;
  g_raceEventOut->push_back(std::move(event));
}

static void EmitWeatherEvent(double timestamp, const std::string &message) {
  if (g_raceEventOut == nullptr)
    return;

  SimEvent event;
  event.type = SimEventType::Blocked;
  event.timestamp = timestamp;
  event.message = message;
  g_raceEventOut->push_back(std::move(event));
}

bool IsNightSession(double raceTimeSeconds) {
  const double hour = std::fmod(raceTimeSeconds / 3600.0, 24.0);
  return hour >= 22.0 || hour < 6.0;
}

double ComputeTrackWetness(double raceTimeSeconds,
                           double targetDurationSeconds) {
  if (targetDurationSeconds < 4.0 * 3600.0)
    return 0.0;

  const double hours = raceTimeSeconds / 3600.0;
  auto rainBand = [](double h, double start, double peak, double end) {
    if (h < start || h > end)
      return 0.0;
    if (h < peak)
      return (h - start) / std::max(peak - start, 0.01);
    return (end - h) / std::max(end - peak, 0.01);
  };

  const double dawn = rainBand(hours, 7.0, 9.0, 11.0) * 0.55;
  const double dusk = rainBand(hours, 19.0, 21.0, 23.0) * 0.40;
  return std::clamp(std::max(dawn, dusk), 0.0, 1.0);
}

void TickRace(RaceSession &session, double deltaTime) {
  const WeatherPhase prevPhase = session.weather.phase;
  const double prevForecast = session.weather.forecastRainInSeconds;

  session.elapsedRaceTime += deltaTime;

  TickWeatherState(session.weather, session.weatherProfile,
                   session.elapsedRaceTime, deltaTime, session.rng);
  session.trackWetness = session.weather.trackWetness;

  if (prevForecast < 0.0 && session.weather.forecastRainInSeconds > 0.0) {
    const int mins = static_cast<int>(
        std::ceil(session.weather.forecastRainInSeconds / 60.0));
    EmitWeatherEvent(session.elapsedRaceTime,
                     "Weather: rain forecast in " + std::to_string(mins) +
                         " min");
  }

  const bool wasRaining =
      prevPhase == WeatherPhase::LightRain ||
      prevPhase == WeatherPhase::HeavyRain;
  const bool isRaining =
      session.weather.phase == WeatherPhase::LightRain ||
      session.weather.phase == WeatherPhase::HeavyRain;
  if (!wasRaining && isRaining) {
    EmitWeatherEvent(
        session.elapsedRaceTime,
        session.weather.phase == WeatherPhase::HeavyRain
            ? "Weather: heavy rain on track"
            : "Weather: light rain begins");
  } else if (wasRaining && !isRaining &&
             session.weather.phase == WeatherPhase::Drying) {
    EmitWeatherEvent(session.elapsedRaceTime, "Weather: track drying");
  }

  const bool night = IsNightSession(session.elapsedRaceTime);

  if (session.raceControl.sectorFlags.empty())
    InitSessionRaceControl(session);

  UpdateTrackObstructions(session, deltaTime);
  UpdateTrackHazards(session, deltaTime);

  std::vector<TrafficModifiers> trafficMods;
  std::vector<TrafficEvent> trafficEvents;
  ResolveTraffic(session.cars, session.track.lapLength(), session.trackWidthM,
                 session.elapsedRaceTime, session.trafficEventCooldowns,
                 trafficMods, trafficEvents, session.raceControl,
                 GetLeaderboard(session));

  UpdateRaceControl(session, trafficEvents);
  UpdatePenalties(session, deltaTime, trafficMods);
  ApplyFlagModifiers(session, trafficMods);

  const double lapLength = session.track.lapLength();
  for (size_t i = 0; i < session.cars.size() && i < trafficMods.size(); ++i) {
    trafficMods[i].localGripScale =
        LocalGripMultiplierAt(session, session.cars[i].state().currentDistance,
                              lapLength);
  }

  for (const TrafficEvent &ev : trafficEvents) {
    if (g_raceEventOut == nullptr)
      continue;
    SimEvent event;
    event.entryId = ev.entryId;
    event.timestamp = session.elapsedRaceTime;
    event.message = ev.message;
    if (ev.type == TrafficEvent::Type::Overtake)
      event.type = SimEventType::Overtake;
    else if (ev.type == TrafficEvent::Type::Collision)
      event.type = SimEventType::Collision;
    else
      event.type = SimEventType::Blocked;
    g_raceEventOut->push_back(std::move(event));
  }

  for (size_t i = 0; i < session.cars.size(); ++i) {
    Car &car = session.cars[i];
    if (car.isRetired())
      continue;

    const TrackStatus ts = car.rcState().trackStatus;
    if (ts == TrackStatus::Stranded || ts == TrackStatus::Recovering)
      continue;

    const TrackPose pose =
        session.track.poseAtRaceDistance(car.state().currentDistance);

    if (car.processPitEntry(pose.normalizedT, false)) {
      EmitRaceEvent(SimEventType::PitEnter, car, car.state().currentLap,
                    static_cast<int>(car.state().currentTrackNodeIndex),
                    session.elapsedRaceTime,
                    car.teamName() + " entered pit lane");
    }

    if (car.inPitLane()) {
      if (car.processPitLaneTick(session.track, deltaTime, session.staff)) {
        EmitRaceEvent(SimEventType::PitExit, car, car.state().currentLap,
                      static_cast<int>(car.state().currentTrackNodeIndex),
                      session.elapsedRaceTime,
                      car.teamName() + " exited pit lane");
      }
      continue;
    }

    const TrafficModifiers *traffic =
        i < trafficMods.size() ? &trafficMods[i] : nullptr;

    const CarTickResult result = car.tick(
        session.track, session.physics, deltaTime, session.elapsedRaceTime,
        nullptr, traffic, session.weather, night);

    if (result.lapCompleted && car.pit().pendingEnter) {
      if (car.processPitEntry(0.0, true)) {
        EmitRaceEvent(SimEventType::PitEnter, car, car.state().currentLap,
                      static_cast<int>(car.state().currentTrackNodeIndex),
                      session.elapsedRaceTime,
                      car.teamName() + " entered pit lane at lap end");
      }
    }

    if (result.sectorCrossed) {
      EmitRaceEvent(SimEventType::SectorCross, car, car.state().currentLap,
                    result.completedSectorIndex, session.elapsedRaceTime,
                    car.teamName() + " crossed sector " +
                        std::to_string(result.completedSectorIndex));
    }

    if (result.lapCompleted) {
      EmitRaceEvent(SimEventType::LapComplete, car, result.completedLap,
                    result.completedSectorIndex, session.elapsedRaceTime,
                    car.teamName() + " completed lap " +
                        std::to_string(result.completedLap));
      NotifyCarLapComplete(car, session);
    }

    if (result.retired) {
      EmitRaceEvent(SimEventType::Retirement, car, car.state().currentLap,
                    static_cast<int>(car.state().currentTrackNodeIndex),
                    session.elapsedRaceTime,
                    car.teamName() + " retired: " + car.retireReason());
    }
  }
}

std::vector<Car *> GetLeaderboard(RaceSession &session) {
  std::vector<Car *> board;
  board.reserve(session.cars.size());
  for (Car &car : session.cars)
    board.push_back(&car);

  std::sort(board.begin(), board.end(),
            [](const Car *a, const Car *b) { return a->isAheadOf(*b); });
  return board;
}

std::vector<Car *> GetTimingLeaderboard(RaceSession &session) {
  std::vector<Car *> board;
  board.reserve(session.cars.size());
  for (Car &car : session.cars)
    board.push_back(&car);

  std::sort(board.begin(), board.end(), [](const Car *a, const Car *b) {
    const double aBest = a->bestLapTime();
    const double bBest = b->bestLapTime();
    const bool aHas = aBest > 0.0;
    const bool bHas = bBest > 0.0;
    if (aHas != bHas)
      return aHas;
    if (aHas && bHas && aBest != bBest)
      return aBest < bBest;
    if (a->lastLapTime() != b->lastLapTime())
      return a->lastLapTime() < b->lastLapTime();
    return a->gridPosition() < b->gridPosition();
  });
  return board;
}

bool IsRaceComplete(const RaceSession &session) {
  if (session.targetDurationSeconds > 0.0 &&
      session.elapsedRaceTime >= session.targetDurationSeconds)
    return true;

  if (session.targetLaps <= 0)
    return false;

  bool anyRacing = false;
  for (const Car &car : session.cars) {
    if (car.isRetired())
      continue;
    anyRacing = true;
    if (car.state().currentLap > session.targetLaps)
      return true;
  }
  return !anyRacing && !session.cars.empty();
}

static bool IsValidCarNumber(const std::string &number) {
  if (number.empty())
    return false;
  for (char c : number) {
    if (!std::isdigit(static_cast<unsigned char>(c)))
      return false;
  }
  return number != "0";
}

static bool ParseEntryLine(const std::string &line, std::string &teamName,
                           std::string &carConfigPath, std::string &classId,
                           int &gridPosition, std::string &carNumber,
                           std::string &entryId) {
  if (line.empty() || line[0] == '#')
    return false;

  std::istringstream is_line(line);
  std::string key, value;
  if (!std::getline(is_line, key, '=') || !std::getline(is_line, value))
    return false;

  key = Trim(key);
  value = Trim(value);
  if (key != "entry")
    return false;

  std::istringstream fields(value);
  std::string team, carPath, cls;
  std::string gridStr;
  std::string numberStr;
  if (!std::getline(fields, team, ',') || !std::getline(fields, carPath, ',') ||
      !std::getline(fields, cls, ',') || !std::getline(fields, gridStr, ','))
    return false;

  teamName = Trim(team);
  carConfigPath = Trim(carPath);
  classId = Trim(cls);
  gridPosition = std::stoi(Trim(gridStr));
  if (std::getline(fields, numberStr, ','))
    carNumber = Trim(numberStr);
  else
    carNumber = std::to_string(gridPosition);
  std::string idStr;
  if (std::getline(fields, idStr, ',') && !Trim(idStr).empty())
    entryId = Trim(idStr);
  else
    entryId = MakeEntryId(gridPosition);
  return !teamName.empty() && !carConfigPath.empty() && !classId.empty() &&
         IsValidCarNumber(carNumber);
}

bool LoadEntriesFromConfig(RaceSession &session, const std::string &filename,
                           const PartCatalog &catalog,
                           const AssemblyConfig &assembly,
                           const std::string &classRulesPath,
                           const std::string &driverConfigPath) {
  auto classRules = LoadClassRules(classRulesPath);
  DriverCatalog driverCatalog;
  if (!driverConfigPath.empty())
    LoadDriverCatalog(driverConfigPath, driverCatalog);
  if (classRules.empty()) {
    std::cerr << "Warning: no class rules loaded from " << classRulesPath
              << std::endl;
  }

  std::ifstream file(filename);
  if (!file.is_open())
    return false;

  std::string line;
  while (std::getline(file, line)) {
    std::string teamName, carConfigPath, classId;
    int gridPosition = 0;
    std::string carNumber;
    std::string entryId;
    if (!ParseEntryLine(line, teamName, carConfigPath, classId, gridPosition,
                        carNumber, entryId))
      continue;

    CarConfig car;
    if (!LoadCarConfig(carConfigPath, car))
      return false;

    static const std::vector<CompatibilityRule> compatRules =
        LoadPartCompatibility("configs/part_compatibility.txt");
    std::string compatError;
    if (!ValidatePartCompatibility(car, compatRules, &compatError)) {
      std::cerr << "Warning: entry \"" << teamName
                << "\" has incompatible parts: " << compatError
                << " (regulatory penalties TBD)" << std::endl;
    }

    RaceClass raceClass;
    raceClass.id = classId;

    auto ruleIt = classRules.find(classId);
    if (ruleIt != classRules.end()) {
      raceClass.displayName = ruleIt->second.displayName;
      if (SanitizeCarForClassRules(car, ruleIt->second)) {
        std::cerr << "Note: auto-fixed illegal parts for \"" << teamName
                  << "\" [" << classId << "]" << std::endl;
      }
    } else {
      raceClass.displayName = classId;
      std::cerr << "Warning: unknown class \"" << classId << "\" for entry \""
                << teamName << "\" — BoP not applied" << std::endl;
    }

    CompileCarArchitecture(car, catalog, assembly);

    if (ruleIt != classRules.end()) {
      ApplyClassBoP(car, ruleIt->second);
      if (!IsCarLegal(car, ruleIt->second)) {
        std::cerr << "Warning: entry \"" << teamName << "\" [" << classId
                  << "] still has illegal parts after auto-fix (added anyway)"
                  << std::endl;
      }
    }

    AddCar(session, std::move(car), std::move(raceClass), teamName,
           gridPosition, carNumber, entryId);
    Car &added = session.cars.back();
    if (!driverCatalog.empty()) {
      const uint32_t seed = static_cast<uint32_t>(
          std::hash<std::string>{}(added.entryId()) & 0xFFFFFFFFu);
      added.setDrivers(
          BuildDriverState(driverCatalog, teamName, carNumber, seed));
    }
    if (ruleIt != classRules.end() &&
        ruleIt->second.maxDriverStintSeconds > 0.0) {
      added.applyClassStintLimit(ruleIt->second.maxDriverStintSeconds);
    }
  }

  return !session.cars.empty();
}
