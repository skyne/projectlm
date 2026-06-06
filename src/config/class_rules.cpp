#include "class_rules.hpp"
#include <algorithm>
#include <fstream>
#include <sstream>

static std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && (s[start] == ' ' || s[start] == '\t'))
    start++;
  size_t end = s.size();
  while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t'))
    end--;
  return s.substr(start, end - start);
}

static void SplitCommaList(const std::string &value,
                           std::vector<std::string> &out) {
  out.clear();
  std::istringstream fields(value);
  std::string item;
  while (std::getline(fields, item, ',')) {
    item = Trim(item);
    if (!item.empty())
      out.push_back(item);
  }
}

static std::string ChassisToString(EChassis type) {
  switch (type) {
  case EChassis::Spaceframe:
    return "Spaceframe";
  default:
    return "CarbonMonocoque";
  }
}

static std::string FrontAeroToString(EFrontAero type) {
  switch (type) {
  case EFrontAero::HighDownforceSplitter:
    return "HighDownforceSplitter";
  default:
    return "LowDragNose";
  }
}

static std::string RearAeroToString(ERearAero type) {
  switch (type) {
  case ERearAero::HighDownforceWing:
    return "HighDownforceWing";
  case ERearAero::WinglessGroundEffect:
    return "WinglessGroundEffect";
  default:
    return "StandardWing";
  }
}

static std::string CoolingToString(ECoolingPack type) {
  switch (type) {
  case ECoolingPack::SprintSlimline:
    return "SprintSlimline";
  default:
    return "EnduranceHeavyDuty";
  }
}

static std::string BrakeSystemToString(EBrakeSystem type) {
  switch (type) {
  case EBrakeSystem::CarbonCeramic:
    return "CarbonCeramic";
  case EBrakeSystem::HeavyDutyEndurance:
    return "HeavyDutyEndurance";
  default:
    return "StandardCaliper";
  }
}

static std::string TransmissionToString(ETransmission type) {
  switch (type) {
  case ETransmission::SevenSpeedSequential:
    return "SevenSpeedSequential";
  case ETransmission::EightSpeedPaddle:
    return "EightSpeedPaddle";
  default:
    return "SixSpeedSequential";
  }
}

static std::string HybridSystemToString(EHybridSystem type) {
  switch (type) {
  case EHybridSystem::LMDh500kW:
    return "LMDh500kW";
  case EHybridSystem::HypercarHV:
    return "HypercarHV";
  default:
    return "None";
  }
}

static bool ListPermits(const std::vector<std::string> &legal,
                        const std::string &choice) {
  if (legal.empty())
    return true;
  return std::find(legal.begin(), legal.end(), choice) != legal.end();
}

static void FinalizeRule(ClassRule &rule,
                         std::map<std::string, ClassRule> &rules) {
  if (rule.id.empty())
    return;
  if (rule.displayName.empty())
    rule.displayName = rule.id;
  rules[rule.id] = rule;
}

std::map<std::string, ClassRule> LoadClassRules(const std::string &filename) {
  std::map<std::string, ClassRule> rules;
  std::ifstream file(filename);
  if (!file.is_open())
    return rules;

  ClassRule current;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#')
      continue;

    auto eq = line.find('=');
    if (eq == std::string::npos)
      continue;

    std::string key = Trim(line.substr(0, eq));
    std::string value = Trim(line.substr(eq + 1));

    if (key == "class") {
      FinalizeRule(current, rules);
      current = ClassRule{};
      current.id = value;
      continue;
    }

    if (current.id.empty())
      continue;

    if (key == "display_name")
      current.displayName = value;
    else if (key == "power_cap_hp")
      current.powerCapHP = std::stod(value);
    else if (key == "min_weight_kg")
      current.minWeightKg = std::stod(value);
    else if (key == "max_weight_kg")
      current.maxWeightKg = std::stod(value);
    else if (key == "aero_balance_modifier")
      current.aeroBalanceModifier = std::stod(value);
    else if (key == "drag_modifier")
      current.dragModifier = std::stod(value);
    else if (key == "max_driver_stint_hours")
      current.maxDriverStintHours = std::stod(value);
    else if (key == "legal_chassis")
      SplitCommaList(value, current.legalChassis);
    else if (key == "legal_front_aero")
      SplitCommaList(value, current.legalFrontAero);
    else if (key == "legal_rear_aero")
      SplitCommaList(value, current.legalRearAero);
    else if (key == "legal_cooling")
      SplitCommaList(value, current.legalCooling);
    else if (key == "legal_brakes")
      SplitCommaList(value, current.legalBrakes);
    else if (key == "legal_transmission")
      SplitCommaList(value, current.legalTransmission);
    else if (key == "legal_hybrid")
      SplitCommaList(value, current.legalHybrid);
  }

  FinalizeRule(current, rules);
  return rules;
}

bool IsCarLegal(const CarConfig &car, const ClassRule &rule) {
  if (!ListPermits(rule.legalChassis, ChassisToString(car.chassisChoice)))
    return false;
  if (!ListPermits(rule.legalFrontAero, FrontAeroToString(car.frontAeroChoice)))
    return false;
  if (!ListPermits(rule.legalRearAero, RearAeroToString(car.rearAeroChoice)))
    return false;
  if (!ListPermits(rule.legalCooling, CoolingToString(car.coolingChoice)))
    return false;
  if (!ListPermits(rule.legalBrakes, BrakeSystemToString(car.brakeSystemChoice)))
    return false;
  if (!ListPermits(rule.legalTransmission,
                   TransmissionToString(car.transmissionChoice)))
    return false;
  if (!ListPermits(rule.legalHybrid,
                   HybridSystemToString(car.hybridSystemChoice)))
    return false;
  return true;
}

static ECoolingPack FirstLegalCooling(const ClassRule &rule) {
  if (rule.legalCooling.empty())
    return ECoolingPack::EnduranceHeavyDuty;
  if (rule.legalCooling[0] == "SprintSlimline")
    return ECoolingPack::SprintSlimline;
  return ECoolingPack::EnduranceHeavyDuty;
}

static EFrontAero FirstLegalFrontAero(const ClassRule &rule) {
  if (rule.legalFrontAero.empty())
    return EFrontAero::LowDragNose;
  if (rule.legalFrontAero[0] == "HighDownforceSplitter")
    return EFrontAero::HighDownforceSplitter;
  return EFrontAero::LowDragNose;
}

static ERearAero FirstLegalRearAero(const ClassRule &rule) {
  if (rule.legalRearAero.empty())
    return ERearAero::StandardWing;
  if (rule.legalRearAero[0] == "HighDownforceWing")
    return ERearAero::HighDownforceWing;
  if (rule.legalRearAero[0] == "WinglessGroundEffect")
    return ERearAero::WinglessGroundEffect;
  return ERearAero::StandardWing;
}

bool SanitizeCarForClassRules(CarConfig &car, const ClassRule &rule) {
  bool changed = false;
  if (!ListPermits(rule.legalCooling, CoolingToString(car.coolingChoice))) {
    car.coolingChoice = FirstLegalCooling(rule);
    changed = true;
  }
  if (!ListPermits(rule.legalFrontAero, FrontAeroToString(car.frontAeroChoice))) {
    car.frontAeroChoice = FirstLegalFrontAero(rule);
    changed = true;
  }
  if (!ListPermits(rule.legalRearAero, RearAeroToString(car.rearAeroChoice))) {
    car.rearAeroChoice = FirstLegalRearAero(rule);
    changed = true;
  }
  if (!ListPermits(rule.legalChassis, ChassisToString(car.chassisChoice))) {
    car.chassisChoice = EChassis::CarbonMonocoque;
    changed = true;
  }
  if (!ListPermits(rule.legalBrakes, BrakeSystemToString(car.brakeSystemChoice))) {
    car.brakeSystemChoice = EBrakeSystem::StandardCaliper;
    changed = true;
  }
  if (!ListPermits(rule.legalTransmission,
                   TransmissionToString(car.transmissionChoice))) {
    car.transmissionChoice = ETransmission::SixSpeedSequential;
    changed = true;
  }
  if (!ListPermits(rule.legalHybrid,
                   HybridSystemToString(car.hybridSystemChoice))) {
    car.hybridSystemChoice = EHybridSystem::None;
    changed = true;
  }
  return changed;
}
