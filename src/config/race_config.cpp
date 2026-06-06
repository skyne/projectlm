#include "race_config.hpp"
#include <fstream>

static std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

bool LoadRaceConfig(const std::string &filename, RaceConfig &config) {
  std::ifstream file(filename);
  if (!file.is_open())
    return false;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#')
      continue;
    auto eq = line.find('=');
    if (eq == std::string::npos)
      continue;
    std::string key = Trim(line.substr(0, eq));
    std::string val = Trim(line.substr(eq + 1));
    if (key == "part_catalog")
      config.partCatalogPath = val;
    else if (key == "physics_config")
      config.physicsConfigPath = val;
    else if (key == "track_config")
      config.trackConfigPath = val;
    else if (key == "car_config")
      config.carConfigPath = val;
    else if (key == "target_laps")
      config.targetLaps = std::stoi(val);
    else if (key == "target_duration_hours")
      config.targetDurationSeconds = std::stod(val) * 3600.0;
    else if (key == "target_duration_seconds")
      config.targetDurationSeconds = std::stod(val);
    else if (key == "sim_timestep")
      config.simTimestep = std::stod(val);
    else if (key == "telemetry_output")
      config.telemetryOutputPath = val;
    else if (key == "entries")
      config.entriesPath = val;
    else if (key == "class_rules")
      config.classRulesPath = val;
    else if (key == "staff_config")
      config.staffConfigPath = val;
    else if (key == "driver_config")
      config.driverConfigPath = val;
  }
  return true;
}
