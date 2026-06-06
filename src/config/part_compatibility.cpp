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

static std::string ChassisToString(EChassis type) {
  switch (type) {
  case EChassis::Spaceframe:
    return "Spaceframe";
  case EChassis::LMHInHouse:
    return "LMHInHouse";
  case EChassis::LMHDallaraBuilt:
    return "LMHDallaraBuilt";
  case EChassis::LMHMultimaticBuilt:
    return "LMHMultimaticBuilt";
  case EChassis::LMHMonocoque:
    return "LMHMonocoque";
  case EChassis::LMDhDallara:
    return "LMDhDallara";
  case EChassis::LMDhOreca:
    return "LMDhOreca";
  case EChassis::LMDhMultimatic:
    return "LMDhMultimatic";
  case EChassis::LMDhLigier:
    return "LMDhLigier";
  case EChassis::Oreca07:
    return "Oreca07";
  case EChassis::GT3Oreca:
    return "GT3Oreca";
  case EChassis::GT3PrattMiller:
    return "GT3PrattMiller";
  case EChassis::GT3McLaren:
    return "GT3McLaren";
  case EChassis::GT3Multimatic:
    return "GT3Multimatic";
  case EChassis::GT3Spaceframe:
    return "GT3Spaceframe";
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
  case ECoolingPack::DuctedRacing:
    return "DuctedRacing";
  case ECoolingPack::MaxFlowEndurance:
    return "MaxFlowEndurance";
  default:
    return "EnduranceHeavyDuty";
  }
}

static std::string FuelSystemToString(EFuelSystem type) {
  switch (type) {
  case EFuelSystem::LargeTank:
    return "LargeTank";
  case EFuelSystem::LeMans90L:
    return "LeMans90L";
  case EFuelSystem::LeMans110L:
    return "LeMans110L";
  case EFuelSystem::HydrogenTank:
    return "HydrogenTank";
  default:
    return "StandardTank";
  }
}

static std::string BrakeSystemToString(EBrakeSystem type) {
  switch (type) {
  case EBrakeSystem::CarbonCeramic:
    return "CarbonCeramic";
  case EBrakeSystem::HeavyDutyEndurance:
    return "HeavyDutyEndurance";
  case EBrakeSystem::BremboHypercar:
    return "BremboHypercar";
  case EBrakeSystem::AkebonoHypercar:
    return "AkebonoHypercar";
  case EBrakeSystem::APRacingPrototype:
    return "APRacingPrototype";
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
  case ETransmission::XtracP1359:
    return "XtracP1359";
  case ETransmission::XtracP529:
    return "XtracP529";
  case ETransmission::SingleSpeedEDrive:
    return "SingleSpeedEDrive";
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
  case EHybridSystem::LMDh50kW:
    return "LMDh50kW";
  default:
    return "None";
  }
}

static std::string PartChoiceForSlot(const CarConfig &car,
                                     const std::string &slot) {
  if (slot == "chassis")
    return ChassisToString(car.chassisChoice);
  if (slot == "front_aero")
    return FrontAeroToString(car.frontAeroChoice);
  if (slot == "rear_aero")
    return RearAeroToString(car.rearAeroChoice);
  if (slot == "cooling")
    return CoolingToString(car.coolingChoice);
  if (slot == "fuel_system")
    return FuelSystemToString(car.fuelSystemChoice);
  if (slot == "brake_system")
    return BrakeSystemToString(car.brakeSystemChoice);
  if (slot == "transmission")
    return TransmissionToString(car.transmissionChoice);
  if (slot == "hybrid_system")
    return HybridSystemToString(car.hybridSystemChoice);
  return "";
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
    }     else if (key == "requires_part")
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
  if (car.fuelSystemChoice == EFuelSystem::HydrogenTank &&
      car.engine.fuelType != "Hydrogen") {
    if (errorOut) {
      *errorOut =
          "fuel_system.HydrogenTank requires Hydrogen fuel in the powertrain";
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
