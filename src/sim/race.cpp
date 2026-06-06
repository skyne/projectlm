#include "race.hpp"
#include "class_rules.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "sim_bridge.hpp"
#include "weather.hpp"
#include <algorithm>
#include <fstream>
#include <iostream>
#include <random>
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

void AddCar(RaceSession &session, CarConfig car, RaceClass raceClass,
            const std::string &teamName, int gridPosition, int carNumber) {
  session.cars.emplace_back(MakeEntryId(gridPosition), teamName,
                            std::move(raceClass), std::move(car), gridPosition,
                            carNumber);
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

void TickRace(RaceSession &session, double deltaTime,
              const std::vector<bool> *skipCars) {
  session.elapsedRaceTime += deltaTime;

  if (session.fcyRemainingSeconds > 0.0) {
    session.fcyRemainingSeconds =
        std::max(0.0, session.fcyRemainingSeconds - deltaTime);
  }
  if (session.scRemainingSeconds > 0.0) {
    session.scRemainingSeconds =
        std::max(0.0, session.scRemainingSeconds - deltaTime);
  }
  if (session.retirementWindowSeconds > 0.0) {
    session.retirementWindowSeconds =
        std::max(0.0, session.retirementWindowSeconds - deltaTime);
    if (session.retirementWindowSeconds <= 0.0)
      session.recentRetirements = 0;
  }

  TickWeatherState(session.weather, session.weatherProfile,
                   session.elapsedRaceTime, deltaTime, session.rng);

  CarInteractionContext interaction;
  interaction.field = &session.cars;
  interaction.raceTime = session.elapsedRaceTime;
  interaction.lapLength = session.track.lapLength();
  interaction.trackWetness = session.weather.trackWetness;
  interaction.ambientTempC = session.weather.ambientTempC;
  interaction.trackGripEvolution = session.weather.trackGripEvolution;
  interaction.weather = &session.weather;
  interaction.rng = &session.rng;
  if (session.fcyRemainingSeconds > 0.0)
    interaction.fcySpeedLimitMps = 60.0;
  if (session.scRemainingSeconds > 0.0)
    interaction.scSpeedLimitMps = 45.0;

  for (size_t carIndex = 0; carIndex < session.cars.size(); ++carIndex) {
    Car &car = session.cars[carIndex];
    if (car.isRetired())
      continue;
    if (skipCars != nullptr && carIndex < skipCars->size() &&
        (*skipCars)[carIndex])
      continue;

    interaction.self = &car;
    const CarTickResult result =
        car.tick(session.track, session.physics, deltaTime, nullptr, &interaction);

    if (result.sectorCrossed) {
      EmitRaceEvent(SimEventType::SectorCross, car, car.state().currentLap,
                    result.completedSectorIndex, session.elapsedRaceTime,
                    car.teamName() + " crossed sector " +
                        std::to_string(result.completedSectorIndex));
      if (car.trackLimitsWarnings() >= 3) {
        EmitRaceEvent(SimEventType::Retirement, car, car.state().currentLap,
                      result.completedSectorIndex, session.elapsedRaceTime,
                      car.teamName() + " track limits — drive-through required");
        car.clearTrackLimitsWarnings();
      }
    }

    if (result.lapCompleted) {
      EmitRaceEvent(SimEventType::LapComplete, car, result.completedLap,
                    result.completedSectorIndex, session.elapsedRaceTime,
                    car.teamName() + " completed lap " +
                        std::to_string(result.completedLap));
    }

    if (result.retired) {
      session.fcyRemainingSeconds =
          std::max(session.fcyRemainingSeconds, 60.0);
      if (session.retirementWindowSeconds <= 0.0)
        session.recentRetirements = 0;
      session.retirementWindowSeconds = 120.0;
      session.recentRetirements += 1;
      if (session.recentRetirements >= 2)
        session.scRemainingSeconds =
            std::max(session.scRemainingSeconds, 180.0);

      EmitRaceEvent(SimEventType::Retirement, car, car.state().currentLap,
                    static_cast<int>(car.state().currentTrackNodeIndex),
                    session.elapsedRaceTime,
                    car.teamName() + " retired: " + car.retireReason());
    }
  }

  if (session.scRemainingSeconds <= 0.0 && session.fcyRemainingSeconds <= 0.0 &&
      session.elapsedRaceTime > 600.0) {
    std::uniform_real_distribution<double> roll(0.0, 1.0);
    if (roll(session.rng) < 0.00002 * deltaTime) {
      session.fcyRemainingSeconds = 90.0;
      if (g_raceEventOut != nullptr) {
        SimEvent event;
        event.type = SimEventType::SectorCross;
        event.timestamp = session.elapsedRaceTime;
        event.message = "Race control: full course yellow";
        g_raceEventOut->push_back(std::move(event));
      }
    }
  }

  if (session.weather.phase == WeatherPhase::HeavyRain &&
      session.scRemainingSeconds <= 0.0) {
    const bool fcyWasInactive = session.fcyRemainingSeconds <= 0.0;
    session.fcyRemainingSeconds =
        std::max(session.fcyRemainingSeconds, 120.0);
    if (fcyWasInactive && g_raceEventOut != nullptr) {
      SimEvent event;
      event.type = SimEventType::SectorCross;
      event.timestamp = session.elapsedRaceTime;
      event.message = "Race control: full course yellow — heavy rain";
      g_raceEventOut->push_back(std::move(event));
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

bool IsRaceComplete(const RaceSession &session) {
  if (session.targetDurationSeconds > 0.0 &&
      session.elapsedRaceTime >= session.targetDurationSeconds)
    return true;

  if (session.targetLaps <= 0)
    return false;

  bool anyActive = false;
  for (const Car &car : session.cars) {
    if (car.isRetired())
      continue;
    anyActive = true;
    if (car.state().currentLap > session.targetLaps)
      return true;
  }

  return !anyActive && !session.cars.empty();
}

static bool ParseEntryLine(const std::string &line, std::string &teamName,
                           std::string &carConfigPath, std::string &classId,
                           int &gridPosition, int &carNumber) {
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
  if (std::getline(fields, numberStr))
    carNumber = std::stoi(Trim(numberStr));
  else
    carNumber = gridPosition;
  return !teamName.empty() && !carConfigPath.empty() && !classId.empty() &&
         carNumber > 0;
}

bool LoadEntriesFromConfig(RaceSession &session, const std::string &filename,
                           const PartCatalog &catalog,
                           const AssemblyConfig &assembly,
                           const std::string &classRulesPath) {
  auto classRules = LoadClassRules(classRulesPath);
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
    int carNumber = 0;
    if (!ParseEntryLine(line, teamName, carConfigPath, classId, gridPosition,
                        carNumber))
      continue;

    CarConfig car;
    if (!LoadCarConfig(carConfigPath, car))
      return false;

    static const std::vector<CompatibilityRule> compatRules =
        LoadPartCompatibility("configs/part_compatibility.txt");
    std::string compatError;
    if (!ValidatePartCompatibility(car, compatRules, &compatError)) {
      std::cerr << "Error: entry \"" << teamName
                << "\" has incompatible parts: " << compatError << std::endl;
      return false;
    }

    CompileCarArchitecture(car, catalog, assembly);

    RaceClass raceClass;
    raceClass.id = classId;

    auto ruleIt = classRules.find(classId);
    if (ruleIt != classRules.end()) {
      raceClass.displayName = ruleIt->second.displayName;
      ApplyClassBoP(car, ruleIt->second);
      if (SanitizeCarForClassRules(car, ruleIt->second)) {
        CompileCarArchitecture(car, catalog, assembly);
        ApplyClassBoP(car, ruleIt->second);
        std::cerr << "Info: auto-fixed illegal parts for entry \"" << teamName
                  << "\" [" << classId << "]" << std::endl;
      }
      if (!IsCarLegal(car, ruleIt->second)) {
        std::cerr << "Warning: entry \"" << teamName << "\" [" << classId
                  << "] still has illegal part choices after sanitize"
                  << std::endl;
      }
    } else {
      raceClass.displayName = classId;
      std::cerr << "Warning: unknown class \"" << classId << "\" for entry \""
                << teamName << "\" — BoP not applied" << std::endl;
    }

    AddCar(session, std::move(car), std::move(raceClass), teamName,
           gridPosition, carNumber);
  }

  return !session.cars.empty();
}
