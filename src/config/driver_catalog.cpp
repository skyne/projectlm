#include "driver_catalog.hpp"
#include <algorithm>
#include <cctype>
#include <fstream>
#include <iostream>
#include <sstream>

namespace {
std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

bool ParseDouble(const std::string &text, double &out) {
  try {
    out = std::stod(text);
    return true;
  } catch (...) {
    return false;
  }
}

bool ParseDriverLine(const std::string &value, DriverProfile &profile) {
  std::istringstream fields(value);
  std::string token;
  std::vector<std::string> parts;
  while (std::getline(fields, token, '|')) {
    parts.push_back(Trim(token));
  }
  if (parts.size() < 18)
    return false;

  profile = DriverProfile{};
  profile.name = parts[0];
  profile.nationality = parts[1];
  profile.tier = parts[2];

  double v = 0.0;
  if (!ParseDouble(parts[3], v))
    return false;
  profile.dryPace = v;
  if (!ParseDouble(parts[4], v))
    return false;
  profile.wetPace = v;
  if (!ParseDouble(parts[5], v))
    return false;
  profile.consistency = v;
  if (!ParseDouble(parts[6], v))
    return false;
  profile.overtaking = v;
  if (!ParseDouble(parts[7], v))
    return false;
  profile.defending = v;
  if (!ParseDouble(parts[8], v))
    return false;
  profile.trafficManagement = v;
  if (!ParseDouble(parts[9], v))
    return false;
  profile.rollingStart = v;
  if (!ParseDouble(parts[10], v))
    return false;
  profile.standingStart = v;
  if (!ParseDouble(parts[11], v))
    return false;
  profile.setupFeedback = v;
  if (!ParseDouble(parts[12], v))
    return false;
  profile.tireManagement = v;
  if (!ParseDouble(parts[13], v))
    return false;
  profile.fuelSaving = v;
  if (!ParseDouble(parts[14], v))
    return false;
  profile.composure = v;
  if (!ParseDouble(parts[15], v))
    return false;
  profile.nightPace = v;
  if (!ParseDouble(parts[16], v))
    return false;
  profile.rainRadar = v;
  if (!ParseDouble(parts[17], v))
    return false;
  profile.stamina = v;

  if (parts.size() >= 20) {
    if (ParseDouble(parts[18], v))
      profile.adaptability = v;
    if (parts.size() >= 21 && ParseDouble(parts[19], v))
      profile.maxStintSeconds = v * 3600.0;
  } else if (parts.size() >= 19) {
    if (ParseDouble(parts[18], v))
      profile.maxStintSeconds = v * 3600.0;
  }

  return !profile.name.empty();
}
} // namespace

bool LoadDriverCatalog(const std::string &filename, DriverCatalog &catalog) {
  catalog.clear();
  std::ifstream file(filename);
  if (!file.is_open())
    return false;

  DriverEntryKey currentKey;
  bool hasKey = false;

  std::string line;
  while (std::getline(file, line)) {
    line = Trim(line);
    if (line.empty() || line[0] == '#')
      continue;

    const size_t eq = line.find('=');
    if (eq == std::string::npos)
      continue;

    const std::string key = Trim(line.substr(0, eq));
    const std::string value = Trim(line.substr(eq + 1));

    if (key == "entry") {
      std::istringstream fields(value);
      std::string team;
      std::string numberStr;
      if (!std::getline(fields, team, ',') || !std::getline(fields, numberStr, ','))
        continue;
      currentKey.teamName = Trim(team);
      currentKey.carNumber = Trim(numberStr);
      if (currentKey.carNumber.empty())
        continue;
      hasKey = true;
      catalog[currentKey] = {};
      continue;
    }

    if (key == "driver" && hasKey) {
      DriverProfile profile;
      if (ParseDriverLine(value, profile))
        catalog[currentKey].push_back(std::move(profile));
    }
  }

  return !catalog.empty();
}

DriverState BuildDriverState(const DriverCatalog &catalog,
                             const std::string &teamName,
                             const std::string &carNumber, uint32_t seed) {
  const DriverEntryKey key{teamName, carNumber};
  const auto it = catalog.find(key);
  if (it == catalog.end() || it->second.empty())
    return MakeDefaultDrivers(teamName, 2, seed);

  DriverState state;
  state.rng.seed(seed);
  state.roster = it->second;
  state.activeIndex = 0;
  return state;
}
