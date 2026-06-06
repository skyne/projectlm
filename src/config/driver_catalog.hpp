#ifndef DRIVER_CATALOG_HPP
#define DRIVER_CATALOG_HPP

#include "driver.hpp"
#include <string>
#include <unordered_map>
#include <vector>

struct DriverEntryKey {
  std::string teamName;
  std::string carNumber;

  bool operator==(const DriverEntryKey &other) const {
    return teamName == other.teamName && carNumber == other.carNumber;
  }
};

struct DriverEntryKeyHash {
  size_t operator()(const DriverEntryKey &key) const {
    return std::hash<std::string>{}(key.teamName + "\0" + key.carNumber);
  }
};

using DriverCatalog = std::unordered_map<DriverEntryKey, std::vector<DriverProfile>,
                                         DriverEntryKeyHash>;

bool LoadDriverCatalog(const std::string &filename, DriverCatalog &catalog);

DriverState BuildDriverState(const DriverCatalog &catalog,
                             const std::string &teamName,
                             const std::string &carNumber, uint32_t seed);

#endif
