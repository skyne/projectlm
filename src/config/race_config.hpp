#ifndef RACE_CONFIG_HPP
#define RACE_CONFIG_HPP

#include <string>

struct RaceConfig {
  std::string partCatalogPath = "configs/part_catalog.txt";
  std::string physicsConfigPath = "configs/physics_config.txt";
  std::string trackConfigPath = "tracks/lemans_la_sarthe.json";
  int targetLaps = 0;
  double targetDurationSeconds = 0.0;
  double simTimestep = 0.1;
  std::string telemetryOutputPath;
  std::string carConfigPath = "configs/car_config.txt";
  std::string entriesPath;
  std::string classRulesPath = "configs/class_rules.txt";
  std::string staffConfigPath;
  std::string driverConfigPath = "configs/drivers/lemans2026_drivers.txt";
  std::string weatherProfile = "changeable";
  double trackWetness = 0.0;
  double ambientTempC = 0.0;
  unsigned int rngSeed = 20260306;

  bool weatherResolved = false;
  std::string weatherTrackId;
  int weatherMonth = 6;
  std::string weatherBiome;
  std::string weatherLabel;
  double weatherRainWeight = 0.0;
  double wxBaseTempC = 21.0;
  double wxTempDriftPerHour = -1.2;
  double wxBaseWetness = 0.05;
  double wxRainChancePerHour = 0.45;
  double wxMaxRainIntensity = 0.85;
  double wxWetRatePerSecond = 0.0015;
  double wxDryRatePerSecond = 0.00008;
  double wxBaseWindSpeedMs = 4.0;
  double wxBaseVisibilityKm = 10.0;
  double wxTrackSolarGainC = 10.0;
  /** race | practice | qualifying */
  std::string sessionMode = "race";
};

bool LoadRaceConfig(const std::string &filename, RaceConfig &config);

#endif
