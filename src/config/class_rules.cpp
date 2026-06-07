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
    else if (key == "power_target_hp")
      current.powerTargetHP = std::stod(value);
    else if (key == "min_weight_kg")
      current.minWeightKg = std::stod(value);
    else if (key == "max_weight_kg")
      current.maxWeightKg = std::stod(value);
    else if (key == "aero_balance_modifier")
      current.aeroBalanceModifier = std::stod(value);
    else if (key == "drag_modifier")
      current.dragModifier = std::stod(value);
    else if (key == "fuel_burn_modifier")
      current.fuelBurnModifier = std::stod(value);
    else if (key == "max_driver_stint_hours")
      current.maxDriverStintSeconds = std::stod(value) * 3600.0;
    else if (key == "max_driver_stint_seconds")
      current.maxDriverStintSeconds = std::stod(value);
    else if (key == "template_car")
      current.templateCarPath = value;
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
    else if (key == "legal_wheel_package")
      SplitCommaList(value, current.legalWheelPackage);
    else if (key == "legal_suspension")
      SplitCommaList(value, current.legalSuspension);
  }

  FinalizeRule(current, rules);
  return rules;
}

bool SanitizeCarForClassRules(CarConfig &car, const ClassRule &rule) {
  if (IsCarLegal(car, rule))
    return false;

  bool changed = false;
  const auto pick = [&](const std::vector<std::string> &legal) -> std::string {
    return legal.empty() ? std::string{} : legal.front();
  };

  if (!ListPermits(rule.legalChassis, car.chassisId)) {
    const std::string choice = pick(rule.legalChassis);
    if (!choice.empty()) {
      car.chassisId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalFrontAero, car.frontAeroId)) {
    const std::string choice = pick(rule.legalFrontAero);
    if (!choice.empty()) {
      car.frontAeroId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalRearAero, car.rearAeroId)) {
    const std::string choice = pick(rule.legalRearAero);
    if (!choice.empty()) {
      car.rearAeroId = choice;
      changed = true;
    }
  }
  if (car.hasCustomCoolingLayout) {
    if (!ListPermits(rule.legalCooling, "Custom")) {
      car.hasCustomCoolingLayout = false;
      const std::string choice = pick(rule.legalCooling);
      if (!choice.empty() && choice != "Custom") {
        car.coolingId = choice;
        changed = true;
      }
    }
  } else if (!ListPermits(rule.legalCooling, car.coolingId)) {
    const std::string choice = pick(rule.legalCooling);
    if (!choice.empty() && choice != "Custom") {
      car.coolingId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalBrakes, car.brakeSystemId)) {
    const std::string choice = pick(rule.legalBrakes);
    if (!choice.empty()) {
      car.brakeSystemId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalTransmission, car.transmissionId)) {
    const std::string choice = pick(rule.legalTransmission);
    if (!choice.empty()) {
      car.transmissionId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalHybrid, car.hybridSystemId)) {
    const std::string choice = pick(rule.legalHybrid);
    if (!choice.empty()) {
      car.hybridSystemId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalWheelPackage, car.wheelPackageId)) {
    const std::string choice = pick(rule.legalWheelPackage);
    if (!choice.empty()) {
      car.wheelPackageId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalSuspension, car.frontSuspensionId)) {
    const std::string choice = pick(rule.legalSuspension);
    if (!choice.empty()) {
      car.frontSuspensionId = choice;
      car.suspensionId = choice;
      changed = true;
    }
  }
  if (!ListPermits(rule.legalSuspension, car.rearSuspensionId)) {
    const std::string choice = pick(rule.legalSuspension);
    if (!choice.empty()) {
      car.rearSuspensionId = choice;
      changed = true;
    }
  }

  return changed;
}

bool IsCarLegal(const CarConfig &car, const ClassRule &rule) {
  if (!ListPermits(rule.legalChassis, car.chassisId))
    return false;
  if (!ListPermits(rule.legalFrontAero, car.frontAeroId))
    return false;
  if (!ListPermits(rule.legalRearAero, car.rearAeroId))
    return false;
  if (car.hasCustomCoolingLayout) {
    if (!ListPermits(rule.legalCooling, "Custom"))
      return false;
  } else if (!ListPermits(rule.legalCooling, car.coolingId)) {
    return false;
  }
  if (!ListPermits(rule.legalBrakes, car.brakeSystemId))
    return false;
  if (!ListPermits(rule.legalTransmission, car.transmissionId))
    return false;
  if (!ListPermits(rule.legalHybrid, car.hybridSystemId))
    return false;
  if (!ListPermits(rule.legalWheelPackage, car.wheelPackageId))
    return false;
  if (!ListPermits(rule.legalSuspension, car.frontSuspensionId))
    return false;
  if (!ListPermits(rule.legalSuspension, car.rearSuspensionId))
    return false;
  return true;
}
