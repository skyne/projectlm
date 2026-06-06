#ifndef RACE_CONFIG_HPP
#define RACE_CONFIG_HPP

#include <cstdint>
#include <string>

struct RaceConfig {
  std::string partCatalogPath = "configs/part_catalog.txt";
  std::string physicsConfigPath = "configs/physics_config.txt";
  std::string trackConfigPath = "tracks/lemans_la_sarthe.json";
  int targetLaps = 2;
  double targetDurationMinutes = 0.0;
  double targetDurationHours = 0.0;
  std::string sessionType = "race";
  double simTimestep = 0.1;
  double trackWetness = 0.0;
  double ambientTempC = 22.0;
  std::string weatherProfile = "dry";
  uint32_t rngSeed = 0;
  std::string telemetryOutputPath;
  std::string carConfigPath = "configs/car_config.txt";
  std::string entriesPath;
};

bool LoadRaceConfig(const std::string &filename, RaceConfig &config);

#endif
