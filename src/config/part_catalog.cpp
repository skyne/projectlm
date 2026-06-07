#include "part_catalog.hpp"
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

const PartStats *PartCatalog::FindStats(const std::string &slot,
                                        const std::string &partId) const {
  auto slotIt = parts.find(slot);
  if (slotIt == parts.end())
    return nullptr;
  auto partIt = slotIt->second.find(partId);
  if (partIt == slotIt->second.end())
    return nullptr;
  return &partIt->second;
}

bool PartCatalog::HasPart(const std::string &slot,
                          const std::string &partId) const {
  return FindStats(slot, partId) != nullptr;
}

double PartStatD(const PartStats &stats, const std::string &key,
                 double defaultValue) {
  auto it = stats.find(key);
  if (it == stats.end())
    return defaultValue;
  return it->second;
}

int PartStatI(const PartStats &stats, const std::string &key,
              int defaultValue) {
  auto it = stats.find(key);
  if (it == stats.end())
    return defaultValue;
  return static_cast<int>(it->second);
}

bool PartStatB(const PartStats &stats, const std::string &key,
               bool defaultValue) {
  auto it = stats.find(key);
  if (it == stats.end())
    return defaultValue;
  return it->second >= 0.5;
}

bool LoadPartCatalog(const std::string &filename, PartCatalog &catalog) {
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

    const std::string key = Trim(line.substr(0, eq));
    const std::string val = Trim(line.substr(eq + 1));
    if (key.empty() || val.empty())
      continue;

    if (key.rfind("attach.", 0) == 0) {
      catalog.attachmentPoints[key.substr(7)] = val;
      continue;
    }

    const auto firstDot = key.find('.');
    if (firstDot == std::string::npos)
      continue;
    const auto secondDot = key.find('.', firstDot + 1);
    if (secondDot == std::string::npos)
      continue;

    const std::string slot = key.substr(0, firstDot);
    const std::string partId = key.substr(firstDot + 1, secondDot - firstDot - 1);
    const std::string statKey = key.substr(secondDot + 1);
    if (slot.empty() || partId.empty() || statKey.empty())
      continue;

    try {
      catalog.parts[slot][partId][statKey] = std::stod(val);
    } catch (...) {
      continue;
    }
  }
  return true;
}
