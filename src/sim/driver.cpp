#include "driver.hpp"
#include <algorithm>
#include <cmath>
#include <sstream>

namespace {
const DriverProfile kFallbackDriver{
    "Driver", "—", "Silver", 70, 65, 70, 68, 68, 68, 70, 68, 68, 70, 70, 68, 72, 70, 70, 5400};

double clamp01(double v) { return std::clamp(v, 0.0, 1.0); }
} // namespace

const DriverProfile &DriverState::active() const {
  if (roster.empty())
    return kFallbackDriver;
  return roster[static_cast<size_t>(
      std::clamp(activeIndex, 0, static_cast<int>(roster.size()) - 1))];
}

DriverProfile &DriverState::active() {
  if (roster.empty()) {
    roster.push_back(kFallbackDriver);
    activeIndex = 0;
  }
  return roster[static_cast<size_t>(
      std::clamp(activeIndex, 0, static_cast<int>(roster.size()) - 1))];
}

void DriverState::tickStint(double deltaTime) {
  stintTimeSeconds += deltaTime;
  const DriverProfile &d = active();
  const double staminaFactor = 0.72 + d.stamina / 100.0 * 0.28;
  const double effectiveMax =
      std::max(d.maxStintSeconds * staminaFactor, 600.0);
  fatigue = std::min(1.0, stintTimeSeconds / effectiveMax);
}

bool DriverState::swapDriver(int index) {
  if (index < 0 || index >= static_cast<int>(roster.size()) ||
      index == activeIndex)
    return false;
  activeIndex = index;
  stintTimeSeconds = 0.0;
  fatigue = 0.0;
  pressure = 0.0;
  return true;
}

void DriverState::setPressure(double level) {
  pressure = clamp01(level);
}

double DriverState::paceFactor(double trackWetness, bool isNight) const {
  const DriverProfile &d = active();
  const double dry = d.dryPace / 100.0;
  const double wet = d.wetPace / 100.0;
  const double w = clamp01(trackWetness);
  const double base = dry * (1.0 - w) + wet * w;

  double nightBonus = 0.0;
  if (isNight)
    nightBonus = (d.nightPace / 100.0 - 0.72) * 0.08;

  const double fatiguePenalty = fatigue * (0.14 - d.stamina / 100.0 * 0.06);
  const double pressurePenalty =
      pressure * (0.10 - d.composure / 100.0 * 0.06);

  return std::clamp(0.82 + base * 0.16 + nightBonus - fatiguePenalty -
                        pressurePenalty,
                    0.78, 1.06);
}

double DriverState::consistencyFactor() const {
  const DriverProfile &d = active();
  const double base = 0.80 + d.consistency / 100.0 * 0.18;
  const double fatiguePenalty = fatigue * 0.14;
  const double pressurePenalty = pressure * (0.16 - d.composure / 100.0 * 0.10);
  return std::clamp(base - fatiguePenalty - pressurePenalty, 0.55, 1.0);
}

double DriverState::overtakingFactor() const {
  const DriverProfile &d = active();
  return std::clamp(0.78 + d.overtaking / 100.0 * 0.22 - fatigue * 0.08, 0.72,
                    1.08);
}

double DriverState::defendingFactor() const {
  const DriverProfile &d = active();
  const double composureBoost = d.composure / 100.0 * 0.06;
  return std::clamp(0.76 + d.defending / 100.0 * 0.20 + composureBoost -
                        fatigue * 0.10 - pressure * 0.08,
                    0.68, 1.06);
}

double DriverState::mistakeRiskMultiplier() const {
  const DriverProfile &d = active();
  double risk = 1.0;
  risk += (1.0 - consistencyFactor()) * 1.0;
  risk += fatigue * (0.85 - d.stamina / 100.0 * 0.35);
  risk += pressure * (1.1 - d.composure / 100.0 * 0.65);
  if (mode == DriverMode::Push)
    risk *= 1.35;
  else if (mode == DriverMode::Conserve)
    risk *= 0.82;
  return std::max(0.2, risk);
}

double DriverState::modeThrottleMultiplier() const {
  switch (mode) {
  case DriverMode::Push:
    return 1.03;
  case DriverMode::Conserve:
    return 0.95;
  default:
    return 1.0;
  }
}

double DriverState::modeWearMultiplier() const {
  const DriverProfile &d = active();
  const double tireSkill = 0.88 + d.tireManagement / 100.0 * 0.12;
  switch (mode) {
  case DriverMode::Push:
    return 1.18 / tireSkill;
  case DriverMode::Conserve:
    return 0.85 * (1.0 + (d.fuelSaving / 100.0 - 0.7) * 0.08);
  default:
    return 1.0;
  }
}

double DriverState::modeFuelMultiplier() const {
  const DriverProfile &d = active();
  const double saveSkill = d.fuelSaving / 100.0;
  switch (mode) {
  case DriverMode::Push:
    return 1.18;
  case DriverMode::Conserve:
    return 0.82 - saveSkill * 0.03;
  default:
    return 1.0;
  }
}

std::string DriverState::setupFeedbackForChange(double wingDelta,
                                                double brakeDelta) const {
  const DriverProfile &d = active();
  const double quality = d.setupFeedback / 100.0;

  std::ostringstream out;
  if (wingDelta > 0.02) {
    if (quality > 0.88)
      out << d.name << ": More rear wing — stable under braking, slight drag "
             "penalty on Mulsanne";
    else if (quality > 0.72)
      out << d.name << ": Feels planted in fast corners, loses a bit on straights";
    else if (quality > 0.58)
      out << d.name << ": Rear feels heavier — might help traction";
    else
      out << d.name << ": Car feels different… hard to say if it's better";
  } else if (wingDelta < -0.02) {
    if (quality > 0.88)
      out << d.name << ": Less wing — faster on straights, watch Porsche curves";
    else if (quality > 0.72)
      out << d.name << ": Top speed up, a bit nervous through Indianapolis";
    else
      out << d.name << ": Straights feel quicker, corners less confidence";
  } else if (std::abs(brakeDelta) > 0.02) {
    if (quality > 0.80)
      out << d.name << ": Brake balance shift noted — " <<
             (brakeDelta > 0 ? "more stable into Arnage" : "rotation improved");
    else
      out << d.name << ": Brakes feel " <<
             (brakeDelta > 0 ? "safer" : "livelier") << " now";
  } else {
    out << d.name << ": Subtle change — needs more laps to judge";
  }
  return out.str();
}

bool DriverState::rollMistake(double deltaTime, double raceTime,
                              bool underAttack) {
  if (raceTime - lastMistakeTime < 20.0)
    return false;

  double mistakeRate =
      (1.0 - consistencyFactor()) * 0.0003 * std::max(1.0, deltaTime * 20.0);
  mistakeRate *= mistakeRiskMultiplier();

  if (underAttack) {
    const double defendWeakness =
        1.0 - defendingFactor() / 1.06;
    mistakeRate *= 1.0 + defendWeakness * 1.6;
  }

  std::uniform_real_distribution<double> dist(0.0, 1.0);
  if (dist(rng) < mistakeRate) {
    lastMistakeTime = raceTime;
    return true;
  }
  return false;
}

const char *DriverMistakeKindLabel(DriverMistakeKind kind) {
  switch (kind) {
  case DriverMistakeKind::Lockup:
    return "lockup";
  case DriverMistakeKind::Overdrive:
    return "overdrive";
  default:
    return "ran_wide";
  }
}

DriverState MakeDefaultDrivers(const std::string &teamName, int count,
                               uint32_t seed) {
  DriverState state;
  state.rng.seed(seed);
  count = std::max(1, std::min(count, 3));
  for (int i = 0; i < count; ++i) {
    DriverProfile d;
    d.name = teamName + " Driver " + std::to_string(i + 1);
    d.tier = i == 0 ? "Gold" : "Silver";
    d.dryPace = 74.0 + i * 5.0;
    d.wetPace = 66.0 + i * 3.0;
    d.consistency = 70.0 + i * 4.0;
    d.overtaking = 68.0 + i * 3.0;
    d.defending = 67.0 + i * 3.0;
    d.trafficManagement = 70.0 + i * 2.0;
    d.rollingStart = 68.0 + i * 2.0;
    d.standingStart = 69.0 + i * 2.0;
    d.setupFeedback = 65.0 + i * 4.0;
    d.tireManagement = 70.0 + i * 2.0;
    d.fuelSaving = 68.0 + i * 2.0;
    d.composure = 70.0 + i * 3.0;
    d.nightPace = 68.0 + i * 2.0;
    d.rainRadar = 64.0 + i * 2.0;
    d.stamina = 72.0 + i * 3.0;
    d.maxStintSeconds = 5400.0 + i * 900.0;
    state.roster.push_back(std::move(d));
  }
  state.activeIndex = 0;
  return state;
}
