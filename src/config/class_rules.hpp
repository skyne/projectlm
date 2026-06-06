#ifndef CLASS_RULES_HPP
#define CLASS_RULES_HPP

#include "car_parts.hpp"
#include <map>
#include <string>
#include <vector>

struct ClassRule {
  std::string id;
  std::string displayName;
  double powerCapHP = 0.0;
  double minWeightKg = 0.0;
  double maxWeightKg = 0.0;
  double aeroBalanceModifier = 1.0;
  double dragModifier = 1.0;
  double maxDriverStintHours = 4.5;
  std::vector<std::string> legalChassis;
  std::vector<std::string> legalFrontAero;
  std::vector<std::string> legalRearAero;
  std::vector<std::string> legalCooling;
  std::vector<std::string> legalBrakes;
  std::vector<std::string> legalTransmission;
  std::vector<std::string> legalHybrid;
};

std::map<std::string, ClassRule> LoadClassRules(const std::string &filename);
bool IsCarLegal(const CarConfig &car, const ClassRule &rule);
bool SanitizeCarForClassRules(CarConfig &car, const ClassRule &rule);

#endif
