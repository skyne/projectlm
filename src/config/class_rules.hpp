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
  double powerTargetHP = 0.0;
  double minWeightKg = 0.0;
  double maxWeightKg = 0.0;
  /** Added at compile before BoP min-weight floor (per-class calibration). */
  double assemblyMassOffsetKg = 0.0;
  double aeroBalanceModifier = 1.0;
  double dragModifier = 1.0;
  /** Scales compiled fuelBurnRate after architecture build (1.0 = unchanged). */
  double fuelBurnModifier = 1.0;
  double maxDriverStintSeconds = 0.0;
  std::string templateCarPath;
  std::vector<std::string> legalChassis;
  std::vector<std::string> legalFrontAero;
  std::vector<std::string> legalRearAero;
  std::vector<std::string> legalCooling;
  std::vector<std::string> legalBrakes;
  std::vector<std::string> legalTransmission;
  std::vector<std::string> legalHybrid;
  std::vector<std::string> legalWheelPackage;
  std::vector<std::string> legalSuspension;
};

std::map<std::string, ClassRule> LoadClassRules(const std::string &filename);
bool IsCarLegal(const CarConfig &car, const ClassRule &rule);
/** Replace illegal part choices with the first legal option for the class. */
bool SanitizeCarForClassRules(CarConfig &car, const ClassRule &rule);

#endif
