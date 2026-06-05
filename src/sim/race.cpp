#include "race.hpp"
#include "class_rules.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "sim_bridge.hpp"
#include <algorithm>
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

void TickRace(RaceSession &session, double deltaTime) {
  session.elapsedRaceTime += deltaTime;

  CarInteractionContext interaction;
  interaction.field = &session.cars;
  interaction.raceTime = session.elapsedRaceTime;

  for (Car &car : session.cars) {
    if (car.isRetired())
      continue;

    interaction.self = &car;
    const CarTickResult result =
        car.tick(session.track, session.physics, deltaTime, nullptr, &interaction);

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

bool IsRaceComplete(const RaceSession &session) {
  if (session.targetDurationSeconds > 0.0 &&
      session.elapsedRaceTime >= session.targetDurationSeconds)
    return true;

  if (session.targetLaps <= 0)
    return false;

  for (const Car &car : session.cars) {
    if (car.isRetired())
      continue;
    if (car.state().currentLap > session.targetLaps)
      return true;
  }
  return false;
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
      if (!IsCarLegal(car, ruleIt->second)) {
        std::cerr << "Warning: entry \"" << teamName << "\" [" << classId
                  << "] has illegal part choices for class rules (added anyway)"
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
