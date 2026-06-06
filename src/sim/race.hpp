#ifndef RACE_HPP
#define RACE_HPP

#include "car_entity.hpp"
#include "pit_stop.hpp"
#include "track.hpp"
#include <string>
#include <unordered_map>
#include <vector>

struct RaceSession {
  TrackDefinition track;
  PhysicsConfig physics;
  std::vector<Car> cars;
  double elapsedRaceTime = 0.0;
  int targetLaps = 0;
  double targetDurationSeconds = 0.0;
  StaffModifiers staff;
  double trackWidthM = 12.0;
  double trackWetness = 0.0;
  std::unordered_map<std::string, double> trafficEventCooldowns;
  bool fcyActive = false;
  double fcyEndTime = 0.0;
  double nextFcyScheduleTime = 0.0;
};

bool IsNightSession(double raceTimeSeconds);
double ComputeTrackWetness(double raceTimeSeconds, double targetDurationSeconds);

void AddCar(RaceSession &session, CarConfig car, RaceClass raceClass,
            const std::string &teamName, int gridPosition,
            const std::string &carNumber = "");

void TickRace(RaceSession &session, double deltaTime);

std::vector<Car *> GetLeaderboard(RaceSession &session);

bool IsRaceComplete(const RaceSession &session);

bool LoadEntriesFromConfig(RaceSession &session, const std::string &filename,
                           const PartCatalog &catalog,
                           const AssemblyConfig &assembly,
                           const std::string &classRulesPath =
                               "configs/class_rules.txt",
                           const std::string &driverConfigPath = "");

#endif
