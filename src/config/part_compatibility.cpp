#include "part_compatibility.hpp"
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

static void FinalizeRule(CompatibilityRule &rule,
                         std::vector<CompatibilityRule> &rules) {
  if (rule.ifSlot.empty() || rule.ifPart.empty())
    return;
  rules.push_back(rule);
}

std::vector<CompatibilityRule>
LoadPartCompatibility(const std::string &filename) {
  std::vector<CompatibilityRule> rules;
  std::ifstream file(filename);
  if (!file.is_open())
    return rules;

  CompatibilityRule current;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#')
      continue;

    auto eq = line.find('=');
    if (eq == std::string::npos)
      continue;

    std::string key = Trim(line.substr(0, eq));
    std::string value = Trim(line.substr(eq + 1));

    if (key == "rule") {
      FinalizeRule(current, rules);
      current = CompatibilityRule{};
      continue;
    }

    if (key == "if_slot")
      current.ifSlot = value;
    else if (key == "if_part")
      current.ifPart = value;
    else if (key == "requires_slot") {
      current.kind = CompatibilityRule::Kind::Requires;
      current.otherSlot = value;
    } else if (key == "requires_part")
      current.otherPart = value;
    else if (key == "requires_any_parts") {
      current.kind = CompatibilityRule::Kind::RequiresAny;
      std::istringstream fields(value);
      std::string item;
      while (std::getline(fields, item, ',')) {
        item = Trim(item);
        if (!item.empty())
          current.otherPartsAny.push_back(item);
      }
    } else if (key == "forbids_slot") {
      current.kind = CompatibilityRule::Kind::Forbids;
      current.otherSlot = value;
    } else if (key == "forbids_part")
      current.otherPart = value;
  }

  FinalizeRule(current, rules);
  return rules;
}

bool ValidatePartCompatibility(const CarConfig &car,
                               const std::vector<CompatibilityRule> &rules,
                               std::string *errorOut) {
  if (car.fuelSystemId == "HydrogenTank" && car.engine.fuelType != "Hydrogen") {
    if (errorOut) {
      *errorOut =
          "fuel_system.HydrogenTank requires Hydrogen fuel in the powertrain";
    }
    return false;
  }

  if (car.engine.fuelType == "Hydrogen" &&
      car.engine.energyConverter == "FuelCell") {
    if (car.engine.drivetrain != "FullEV") {
      if (errorOut) {
        *errorOut =
            "Hydrogen fuel cell requires FullEV drivetrain (SingleSpeedEDrive)";
      }
      return false;
    }
    if (car.hybridSystemId != "None" && !car.hybridSystemId.empty()) {
      if (errorOut) {
        *errorOut = "Fuel cell powertrain cannot use a separate hybrid system";
      }
      return false;
    }
    if (car.transmissionId != "SingleSpeedEDrive") {
      if (errorOut) {
        *errorOut =
            "Hydrogen fuel cell requires SingleSpeedEDrive transmission";
      }
      return false;
    }
  }

  if (car.engine.fuelType == "Hydrogen" &&
      car.engine.drivetrain == "RangeExtender") {
    if (errorOut) {
      *errorOut =
          "Hydrogen range-extender is not supported; use Fuel cell instead";
    }
    return false;
  }

  for (const CompatibilityRule &rule : rules) {
    if (PartChoiceForSlot(car, rule.ifSlot) != rule.ifPart)
      continue;

    const std::string otherChoice = PartChoiceForSlot(car, rule.otherSlot);
    if (rule.kind == CompatibilityRule::Kind::Requires) {
      if (otherChoice != rule.otherPart) {
        if (errorOut) {
          *errorOut = rule.ifSlot + "." + rule.ifPart + " requires " +
                      rule.otherSlot + "." + rule.otherPart + " (got " +
                      otherChoice + ")";
        }
        return false;
      }
    } else if (rule.kind == CompatibilityRule::Kind::RequiresAny) {
      bool matched = false;
      for (const std::string &allowed : rule.otherPartsAny) {
        if (otherChoice == allowed) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (errorOut) {
          *errorOut = rule.ifSlot + "." + rule.ifPart + " requires one of " +
                      rule.otherSlot + " carbon-class options (got " +
                      otherChoice + ")";
        }
        return false;
      }
    } else if (otherChoice == rule.otherPart) {
      if (errorOut) {
        *errorOut = rule.ifSlot + "." + rule.ifPart + " forbids " +
                    rule.otherSlot + "." + rule.otherPart;
      }
      return false;
    }
  }
  return true;
}
