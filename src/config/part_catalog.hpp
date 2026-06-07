#ifndef PART_CATALOG_HPP
#define PART_CATALOG_HPP

#include <map>
#include <string>

using PartStats = std::map<std::string, double>;

struct PartCatalog {
  /// slot → partId → statKey → value (from part_catalog.txt)
  std::map<std::string, std::map<std::string, PartStats>> parts;
  std::map<std::string, std::string> attachmentPoints;

  const PartStats *FindStats(const std::string &slot,
                             const std::string &partId) const;
  bool HasPart(const std::string &slot, const std::string &partId) const;
};

bool LoadPartCatalog(const std::string &filename, PartCatalog &catalog);

double PartStatD(const PartStats &stats, const std::string &key,
                 double defaultValue = 0.0);
int PartStatI(const PartStats &stats, const std::string &key,
              int defaultValue = 0);
bool PartStatB(const PartStats &stats, const std::string &key,
               bool defaultValue = false);

#endif
