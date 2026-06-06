#ifndef PART_COMPATIBILITY_HPP
#define PART_COMPATIBILITY_HPP

#include "car_parts.hpp"
#include <string>
#include <vector>

struct CompatibilityRule {
  enum class Kind { Requires, Forbids, RequiresAny };
  std::string ifSlot;
  std::string ifPart;
  Kind kind = Kind::Requires;
  std::string otherSlot;
  std::string otherPart;
  std::vector<std::string> otherPartsAny;
};

std::vector<CompatibilityRule>
LoadPartCompatibility(const std::string &filename);
bool ValidatePartCompatibility(const CarConfig &car,
                               const std::vector<CompatibilityRule> &rules,
                               std::string *errorOut = nullptr);

#endif
