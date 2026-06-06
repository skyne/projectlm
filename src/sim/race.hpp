#ifndef RACE_HPP
#define RACE_HPP

#include "car_entity.hpp"
#include "track.hpp"
#include "weather.hpp"
#include <random>
#include <string>
#include <vector>

struct RaceSession {
  TrackDefinition track;
  PhysicsConfig physics;
  std::vector<Car> cars;
  double elapsedRaceTime = 0.0;
  int targetLaps = 0;
  double targetDurationSeconds = 0.0;
  double fcyRemainingSeconds = 0.0;
  double scRemainingSeconds = 0.0;
  WeatherState weather;
  WeatherProfile weatherProfile;
  std::string weatherProfileId = "dry";
  double initialTrackWetness = 0.0;
  double initialAmbientTempC = 22.0;
  uint32_t rngSeed = 1;
  std::mt19937 rng{1};
  int recentRetirements = 0;
  double retirementWindowSeconds = 0.0;
};

void AddCar(RaceSession &session, CarConfig car, RaceClass raceClass,
            const std::string &teamName, int gridPosition, int carNumber = 0);

void TickRace(RaceSession &session, double deltaTime,
              const std::vector<bool> *skipCars = nullptr);

std::vector<Car *> GetLeaderboard(RaceSession &session);

bool IsRaceComplete(const RaceSession &session);

bool LoadEntriesFromConfig(RaceSession &session, const std::string &filename,
                           const PartCatalog &catalog,
                           const AssemblyConfig &assembly,
                           const std::string &classRulesPath =
                               "configs/class_rules.txt");

#endif
