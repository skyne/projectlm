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

static std::string WheelPackageToString(EWheelPackage type) {
  switch (type) {
  case EWheelPackage::Hypercar18WideRear:
    return "Hypercar18WideRear";
  case EWheelPackage::Hypercar18LowDrag:
    return "Hypercar18LowDrag";
  case EWheelPackage::LMP2Oreca18:
    return "LMP2Oreca18";
  case EWheelPackage::GT3Front20Rear21:
    return "GT3Front20Rear21";
  case EWheelPackage::GT3WideRear21:
    return "GT3WideRear21";
  default:
    return "Hypercar18Standard";
  }
}

static std::string SuspensionLayoutToString(ESuspensionLayout type) {
  switch (type) {
  case ESuspensionLayout::PullrodDoubleWishbone:
    return "PullrodDoubleWishbone";
  case ESuspensionLayout::DoubleWishboneHeaveSpring:
    return "DoubleWishboneHeaveSpring";
  case ESuspensionLayout::MultilinkRearHypercar:
    return "MultilinkRearHypercar";
  case ESuspensionLayout::MacPhersonStrutGT3:
    return "MacPhersonStrutGT3";
  case ESuspensionLayout::DoubleWishboneGT3:
    return "DoubleWishboneGT3";
  case ESuspensionLayout::OrecaLMP2Spec:
    return "OrecaLMP2Spec";
  default:
    return "PushrodDoubleWishbone";
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

static ECoolingPack CoolingFromName(const std::string &name) {
  if (name == "SprintSlimline")
    return ECoolingPack::SprintSlimline;
  if (name == "DuctedRacing")
    return ECoolingPack::DuctedRacing;
  if (name == "MaxFlowEndurance")
    return ECoolingPack::MaxFlowEndurance;
  if (name == "Custom")
    return ECoolingPack::EnduranceHeavyDuty;
  return ECoolingPack::EnduranceHeavyDuty;
}

static EChassis ChassisFromName(const std::string &name) {
  if (name == "LMHInHouse")
    return EChassis::LMHInHouse;
  if (name == "LMHDallaraBuilt")
    return EChassis::LMHDallaraBuilt;
  if (name == "LMDhDallara")
    return EChassis::LMDhDallara;
  if (name == "Oreca07")
    return EChassis::Oreca07;
  if (name == "GT3PrattMiller")
    return EChassis::GT3PrattMiller;
  if (name == "GT3McLaren")
    return EChassis::GT3McLaren;
  if (name == "GT3Oreca")
    return EChassis::GT3Oreca;
  if (name == "GT3Multimatic")
    return EChassis::GT3Multimatic;
  if (name == "GT3Spaceframe")
    return EChassis::GT3Spaceframe;
  return EChassis::CarbonMonocoque;
}

static EBrakeSystem BrakesFromName(const std::string &name) {
  if (name == "CarbonCeramic")
    return EBrakeSystem::CarbonCeramic;
  if (name == "BremboHypercar")
    return EBrakeSystem::BremboHypercar;
  if (name == "AkebonoHypercar")
    return EBrakeSystem::AkebonoHypercar;
  if (name == "APRacingPrototype")
    return EBrakeSystem::APRacingPrototype;
  return EBrakeSystem::StandardCaliper;
}

static ETransmission TransmissionFromName(const std::string &name) {
  if (name == "XtracP1359")
    return ETransmission::XtracP1359;
  if (name == "XtracP529")
    return ETransmission::XtracP529;
  if (name == "SevenSpeedSequential")
    return ETransmission::SevenSpeedSequential;
  return ETransmission::SixSpeedSequential;
}

static EHybridSystem HybridFromName(const std::string &name) {
  if (name == "HypercarHV")
    return EHybridSystem::HypercarHV;
  if (name == "LMDh50kW")
    return EHybridSystem::LMDh50kW;
  if (name == "LMDh500kW")
    return EHybridSystem::LMDh500kW;
  return EHybridSystem::None;
}

static EWheelPackage WheelPackageFromName(const std::string &name) {
  if (name == "Hypercar18WideRear")
    return EWheelPackage::Hypercar18WideRear;
  if (name == "Hypercar18LowDrag")
    return EWheelPackage::Hypercar18LowDrag;
  if (name == "LMP2Oreca18")
    return EWheelPackage::LMP2Oreca18;
  if (name == "GT3WideRear21")
    return EWheelPackage::GT3WideRear21;
  return EWheelPackage::Hypercar18Standard;
}

static ESuspensionLayout SuspensionFromName(const std::string &name) {
  if (name == "PullrodDoubleWishbone")
    return ESuspensionLayout::PullrodDoubleWishbone;
  if (name == "DoubleWishboneHeaveSpring")
    return ESuspensionLayout::DoubleWishboneHeaveSpring;
  if (name == "MultilinkRearHypercar")
    return ESuspensionLayout::MultilinkRearHypercar;
  if (name == "MacPhersonStrutGT3")
    return ESuspensionLayout::MacPhersonStrutGT3;
  if (name == "DoubleWishboneGT3")
    return ESuspensionLayout::DoubleWishboneGT3;
  if (name == "OrecaLMP2Spec")
    return ESuspensionLayout::OrecaLMP2Spec;
  return ESuspensionLayout::PushrodDoubleWishbone;
}

static EFrontAero FrontAeroFromName(const std::string &name) {
  if (name == "HighDownforceSplitter")
    return EFrontAero::HighDownforceSplitter;
  return EFrontAero::LowDragNose;
}

static ERearAero RearAeroFromName(const std::string &name) {
  if (name == "HighDownforceWing")
    return ERearAero::HighDownforceWing;
  if (name == "WinglessGroundEffect")
    return ERearAero::WinglessGroundEffect;
  return ERearAero::StandardWing;
}

bool SanitizeCarForClassRules(CarConfig &car, const ClassRule &rule) {
  if (IsCarLegal(car, rule))
    return false;

  bool changed = false;
  const auto pick = [&](const std::vector<std::string> &legal) -> std::string {
    return legal.empty() ? std::string{} : legal.front();
  };

  if (!ListPermits(rule.legalChassis, ChassisToString(car.chassisChoice))) {
    const std::string choice = pick(rule.legalChassis);
    if (!choice.empty()) {
      car.chassisChoice = ChassisFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalFrontAero,
                   FrontAeroToString(car.frontAeroChoice))) {
    const std::string choice = pick(rule.legalFrontAero);
    if (!choice.empty()) {
      car.frontAeroChoice = FrontAeroFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalRearAero, RearAeroToString(car.rearAeroChoice))) {
    const std::string choice = pick(rule.legalRearAero);
    if (!choice.empty()) {
      car.rearAeroChoice = RearAeroFromName(choice);
      changed = true;
    }
  }
  if (car.hasCustomCoolingLayout) {
    if (!ListPermits(rule.legalCooling, "Custom")) {
      car.hasCustomCoolingLayout = false;
      const std::string choice = pick(rule.legalCooling);
      if (!choice.empty()) {
        car.coolingChoice = CoolingFromName(choice);
        changed = true;
      }
    }
  } else if (!ListPermits(rule.legalCooling,
                          CoolingToString(car.coolingChoice))) {
    const std::string choice = pick(rule.legalCooling);
    if (!choice.empty()) {
      car.coolingChoice = CoolingFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalBrakes, BrakeSystemToString(car.brakeSystemChoice))) {
    const std::string choice = pick(rule.legalBrakes);
    if (!choice.empty()) {
      car.brakeSystemChoice = BrakesFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalTransmission,
                   TransmissionToString(car.transmissionChoice))) {
    const std::string choice = pick(rule.legalTransmission);
    if (!choice.empty()) {
      car.transmissionChoice = TransmissionFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalHybrid,
                   HybridSystemToString(car.hybridSystemChoice))) {
    const std::string choice = pick(rule.legalHybrid);
    if (!choice.empty()) {
      car.hybridSystemChoice = HybridFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalWheelPackage,
                   WheelPackageToString(car.wheelPackageChoice))) {
    const std::string choice = pick(rule.legalWheelPackage);
    if (!choice.empty()) {
      car.wheelPackageChoice = WheelPackageFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalSuspension,
                   SuspensionLayoutToString(car.frontSuspensionChoice))) {
    const std::string choice = pick(rule.legalSuspension);
    if (!choice.empty()) {
      car.frontSuspensionChoice = SuspensionFromName(choice);
      changed = true;
    }
  }
  if (!ListPermits(rule.legalSuspension,
                   SuspensionLayoutToString(car.rearSuspensionChoice))) {
    const std::string choice = pick(rule.legalSuspension);
    if (!choice.empty()) {
      car.rearSuspensionChoice = SuspensionFromName(choice);
      changed = true;
    }
  }

  return changed;
}

bool IsCarLegal(const CarConfig &car, const ClassRule &rule) {
  if (!ListPermits(rule.legalChassis, ChassisToString(car.chassisChoice)))
    return false;
  if (!ListPermits(rule.legalFrontAero, FrontAeroToString(car.frontAeroChoice)))
    return false;
  if (!ListPermits(rule.legalRearAero, RearAeroToString(car.rearAeroChoice)))
    return false;
  if (car.hasCustomCoolingLayout) {
    if (!ListPermits(rule.legalCooling, "Custom"))
      return false;
  } else if (!ListPermits(rule.legalCooling,
                          CoolingToString(car.coolingChoice))) {
    return false;
  }
  if (!ListPermits(rule.legalBrakes, BrakeSystemToString(car.brakeSystemChoice)))
    return false;
  if (!ListPermits(rule.legalTransmission,
                   TransmissionToString(car.transmissionChoice)))
    return false;
  if (!ListPermits(rule.legalHybrid,
                   HybridSystemToString(car.hybridSystemChoice)))
    return false;
  if (!ListPermits(rule.legalWheelPackage,
                   WheelPackageToString(car.wheelPackageChoice)))
    return false;
  if (!ListPermits(rule.legalSuspension,
                   SuspensionLayoutToString(car.frontSuspensionChoice)))
    return false;
  if (!ListPermits(rule.legalSuspension,
                   SuspensionLayoutToString(car.rearSuspensionChoice)))
    return false;
  return true;
}
