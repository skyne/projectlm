#ifndef RACE_HPP
#define RACE_HPP

#include "car_entity.hpp"
#include "pit_stop.hpp"
#include "track.hpp"
#include "weather.hpp"
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

enum class SessionMode { Race, Practice, Qualifying };

SessionMode ParseSessionMode(const std::string &value);

struct RaceSession {
  TrackDefinition track;
  PhysicsConfig physics;
  SessionMode sessionMode = SessionMode::Race;
  std::vector<Car> cars;
  double elapsedRaceTime = 0.0;
  int targetLaps = 0;
  double targetDurationSeconds = 0.0;
  StaffModifiers staff;
  double trackWidthM = 12.0;
  double trackWetness = 0.0;
  WeatherState weather;
  WeatherProfile weatherProfile;
  std::string weatherProfileId = "changeable";
  std::mt19937 rng{20260306};
  std::unordered_map<std::string, double> trafficEventCooldowns;
  bool fcyActive = false;
  double fcyEndTime = 0.0;
  double nextFcyScheduleTime = 0.0;
};

bool IsNightSession(double raceTimeSeconds);
double ComputeTrackWetness(double raceTimeSeconds, double targetDurationSeconds);

void AddCar(RaceSession &session, CarConfig car, RaceClass raceClass,
            const std::string &teamName, int gridPosition,
            const std::string &carNumber, const std::string &entryId);

void TickRace(RaceSession &session, double deltaTime);

std::vector<Car *> GetLeaderboard(RaceSession &session);

std::vector<Car *> GetTimingLeaderboard(RaceSession &session);

void ApplyOpenSessionPlacement(RaceSession &session);

/** Fit wet tyres on the grid when the track is already soaked. */
void ApplyGridTyresForWeather(RaceSession &session);

bool IsRaceComplete(const RaceSession &session);

bool LoadEntriesFromConfig(RaceSession &session, const std::string &filename,
                           const PartCatalog &catalog,
                           const AssemblyConfig &assembly,
                           const std::string &classRulesPath =
                               "configs/class_rules.txt",
                           const std::string &driverConfigPath = "");

#endif
