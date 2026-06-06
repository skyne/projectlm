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
  SetupChange,
  DriverSwap,
  CancelPit
};

struct PitStopPlan {
  double fuelLiters = 0.0;
  std::vector<std::string> tiresToChange;
  ETireCompound tireCompound = ETireCompound::Medium;
  std::vector<std::string> repairs;
  bool changeDriver = false;
  int swapToDriverIndex = -1;
  double wingAngleDelta = 0.0;
  double brakeBiasDelta = 0.0;
  double rideHeightDelta = 0.0;
};

struct SimCommand {
  SimCommandType type = SimCommandType::Unknown;
  PitStopPlan pit;
  DriverMode driverMode = DriverMode::Normal;
  double wingAngleDelta = 0.0;
  double brakeBiasDelta = 0.0;
  double rideHeightDelta = 0.0;
  int swapToDriverIndex = -1;
};

SimCommand ParseSimCommand(const std::string &raw);

#endif
