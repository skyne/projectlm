#ifndef DRIVER_HPP
#define DRIVER_HPP

#include "car_parts.hpp"
#include <cstdint>
#include <random>
#include <string>
#include <vector>

enum class DriverMode { Push, Normal, Conserve };

/** Pit-wall hybrid energy instruction (WEC-style deploy / harvest). */
enum class HybridStrategy { Balanced, Deploy, Harvest, Hold };

enum class DriverMistakeKind { Lockup, Overdrive, RanWide };

enum class DriverTier { Platinum, Gold, Silver, Bronze };

struct DriverProfile {
  std::string name;
  std::string nationality = "—";
  std::string tier = "Silver";

  // Pace
  double dryPace = 80.0;
  double wetPace = 70.0;
  double consistency = 75.0;
  double nightPace = 72.0;

  // Racecraft
  double overtaking = 72.0;
  double defending = 72.0;
  double trafficManagement = 72.0;
  double rollingStart = 70.0;
  double standingStart = 70.0;

  // Technical / endurance
  double setupFeedback = 70.0;
  double tireManagement = 72.0;
  double fuelSaving = 70.0;
  double rainRadar = 68.0;
  double stamina = 78.0;
  double composure = 75.0;

  double maxStintSeconds = 7200.0;
};

struct DriverState {
  std::vector<DriverProfile> roster;
  int activeIndex = 0;
  DriverMode mode = DriverMode::Normal;
  HybridStrategy hybridStrategy = HybridStrategy::Balanced;
  double stintTimeSeconds = 0.0;
  double fatigue = 0.0;
  double pressure = 0.0;
  double lastMistakeTime = -1000.0;
  std::mt19937 rng{42};

  const DriverProfile &active() const;
  DriverProfile &active();

  void tickStint(double deltaTime);
  bool swapDriver(int index);
  void setPressure(double level);

  double paceFactor(double trackWetness, bool isNight) const;
  double consistencyFactor() const;
  double overtakingFactor() const;
  double defendingFactor() const;
  double mistakeRiskMultiplier() const;
  double modeThrottleMultiplier() const;
  double modeWearMultiplier() const;
  double modeFuelMultiplier() const;
  std::string setupFeedbackForChange(double wingDelta, double brakeDelta,
                                     const SuspensionSetupDelta &suspension =
                                         SuspensionSetupDelta{}) const;
  bool rollMistake(double deltaTime, double raceTime, bool underAttack);
};

const char *DriverMistakeKindLabel(DriverMistakeKind kind);
const char *HybridStrategyLabel(HybridStrategy strategy);
void HybridStrategyModifiers(HybridStrategy strategy, double &deployScale,
                             double &regenScale);

DriverState MakeDefaultDrivers(const std::string &teamName, int count = 2,
                               uint32_t seed = 42);

#endif
