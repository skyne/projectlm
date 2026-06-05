#ifndef RACE_HPP
#define RACE_HPP

#include "car_entity.hpp"
#include "track.hpp"
#include <string>
#include <vector>

struct RaceSession {
  TrackDefinition track;
  PhysicsConfig physics;
  std::vector<Car> cars;
  double elapsedRaceTime = 0.0;
  int targetLaps = 0;
  double targetDurationSeconds = 0.0;
};

void AddCar(RaceSession &session, CarConfig car, RaceClass raceClass,
            const std::string &teamName, int gridPosition, int carNumber = 0);

void TickRace(RaceSession &session, double deltaTime);

std::vector<Car *> GetLeaderboard(RaceSession &session);

bool IsRaceComplete(const RaceSession &session);

bool LoadEntriesFromConfig(RaceSession &session, const std::string &filename,
                           const PartCatalog &catalog,
                           const AssemblyConfig &assembly,
                           const std::string &classRulesPath =
                               "configs/class_rules.txt");

#endif
