#ifndef COMMANDS_HPP
#define COMMANDS_HPP

#include "driver.hpp"
#include "car_parts.hpp"
#include <string>
#include <vector>

enum class SimCommandType {
  Unknown,
  PitRequest,
  DriverMode,
  HybridStrategy,
  SetupChange,
  DriverSwap,
  CancelPit,
  StartingCompound,
  WetTyresFit,
  ReleaseGarage
};

struct PitStopPlan {
  double fuelLiters = 0.0;
  std::vector<std::string> tiresToChange;
  ETireCompound tireCompound = ETireCompound::Medium;
  ETyreTread tyreTread = ETyreTread::Slick;
  std::vector<std::string> repairs;
  bool changeDriver = false;
  bool driveThrough = false;
  bool stopGo = false;
  int swapToDriverIndex = -1;
  double wingAngleDelta = 0.0;
  double brakeBiasDelta = 0.0;
  /** Legacy: equal delta applied to both axles. */
  double rideHeightDelta = 0.0;
  SuspensionSetupDelta suspension;
  /** After pit services, tow to garage for full damage rebuild (restores to 100%). */
  bool garageRebuild = false;
};

struct SimCommand {
  SimCommandType type = SimCommandType::Unknown;
  PitStopPlan pit;
  DriverMode driverMode = DriverMode::Normal;
  HybridStrategy hybridStrategy = HybridStrategy::Balanced;
  ETireCompound tireCompound = ETireCompound::Medium;
  ETyreTread tyreTread = ETyreTread::Slick;
  double wingAngleDelta = 0.0;
  double brakeBiasDelta = 0.0;
  /** Legacy: equal delta applied to both axles. */
  double rideHeightDelta = 0.0;
  SuspensionSetupDelta suspension;
  int swapToDriverIndex = -1;
};

SimCommand ParseSimCommand(const std::string &raw);

#endif
