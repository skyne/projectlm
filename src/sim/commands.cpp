#include "commands.hpp"
#include <algorithm>
#include <cctype>
#include <sstream>

namespace {

std::string Trim(const std::string &s) {
  size_t start = 0;
  while (start < s.size() && std::isspace(static_cast<unsigned char>(s[start])))
    start++;
  size_t end = s.size();
  while (end > start &&
         std::isspace(static_cast<unsigned char>(s[end - 1])))
    end--;
  return s.substr(start, end - start);
}

std::string ToLower(std::string value) {
  for (char &ch : value)
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  return value;
}

ETireCompound ParseCompound(const std::string &value) {
  const std::string v = ToLower(value);
  if (v == "soft")
    return ETireCompound::Soft;
  if (v == "hard")
    return ETireCompound::Hard;
  return ETireCompound::Medium;
}

void ParseTireList(const std::string &value, std::vector<std::string> &out) {
  out.clear();
  const std::string v = ToLower(value);
  if (v == "all" || v == "full") {
    out = {"FL", "FR", "RL", "RR"};
    return;
  }
  std::istringstream is(value);
  std::string token;
  while (std::getline(is, token, ',')) {
    token = Trim(token);
    if (!token.empty())
      out.push_back(token);
  }
}

void ParseRepairList(const std::string &value, std::vector<std::string> &out) {
  out.clear();
  std::istringstream is(value);
  std::string token;
  while (std::getline(is, token, ',')) {
    token = Trim(ToLower(token));
    if (!token.empty())
      out.push_back(token);
  }
}

} // namespace

SimCommand ParseSimCommand(const std::string &raw) {
  SimCommand cmd;
  const std::string trimmed = Trim(raw);
  if (trimmed.empty())
    return cmd;

  const std::string lower = ToLower(trimmed);
  if (lower == "pit" || lower == "request_pit" || lower == "requestpit") {
    cmd.type = SimCommandType::PitRequest;
    return cmd;
  }
  if (lower == "cancel_pit" || lower == "cancelpit") {
    cmd.type = SimCommandType::CancelPit;
    return cmd;
  }
  if (lower.rfind("driver_mode=", 0) == 0) {
    cmd.type = SimCommandType::DriverMode;
    const std::string mode = ToLower(Trim(trimmed.substr(12)));
    if (mode == "push")
      cmd.driverMode = DriverMode::Push;
    else if (mode == "conserve")
      cmd.driverMode = DriverMode::Conserve;
    else
      cmd.driverMode = DriverMode::Normal;
    return cmd;
  }

  std::istringstream is(trimmed);
  std::string segment;
  std::getline(is, segment, '|');
  const std::string verb = ToLower(Trim(segment));

  if (verb == "pit") {
    cmd.type = SimCommandType::PitRequest;
    while (std::getline(is, segment, '|')) {
      const size_t eq = segment.find('=');
      if (eq == std::string::npos)
        continue;
      const std::string key = ToLower(Trim(segment.substr(0, eq)));
      const std::string val = Trim(segment.substr(eq + 1));
      if (key == "fuel")
        cmd.pit.fuelLiters = std::stod(val);
      else if (key == "tires")
        ParseTireList(val, cmd.pit.tiresToChange);
      else if (key == "compound")
        cmd.pit.tireCompound = ParseCompound(val);
      else if (key == "repairs")
        ParseRepairList(val, cmd.pit.repairs);
      else if (key == "driver_change" || key == "driver")
        cmd.pit.changeDriver = val == "1" || ToLower(val) == "true";
      else if (key == "driver_index")
        cmd.pit.swapToDriverIndex = std::stoi(val);
      else if (key == "wing")
        cmd.pit.wingAngleDelta = std::stod(val);
      else if (key == "brake_bias")
        cmd.pit.brakeBiasDelta = std::stod(val);
      else if (key == "ride_height")
        cmd.pit.rideHeightDelta = std::stod(val);
    }
    return cmd;
  }

  if (verb == "driver_mode") {
    cmd.type = SimCommandType::DriverMode;
    const std::string mode = ToLower(Trim(trimmed.substr(trimmed.find('=') + 1)));
    if (mode == "push")
      cmd.driverMode = DriverMode::Push;
    else if (mode == "conserve")
      cmd.driverMode = DriverMode::Conserve;
    else
      cmd.driverMode = DriverMode::Normal;
    return cmd;
  }

  if (verb == "setup") {
    cmd.type = SimCommandType::SetupChange;
    while (std::getline(is, segment, '|')) {
      const size_t eq = segment.find('=');
      if (eq == std::string::npos)
        continue;
      const std::string key = ToLower(Trim(segment.substr(0, eq)));
      const std::string val = Trim(segment.substr(eq + 1));
      if (key == "wing")
        cmd.wingAngleDelta = std::stod(val);
      else if (key == "brake_bias")
        cmd.brakeBiasDelta = std::stod(val);
      else if (key == "ride_height")
        cmd.rideHeightDelta = std::stod(val);
    }
    return cmd;
  }

  if (verb == "driver_swap") {
    cmd.type = SimCommandType::DriverSwap;
    const size_t eq = trimmed.find('=');
    if (eq != std::string::npos)
      cmd.swapToDriverIndex = std::stoi(Trim(trimmed.substr(eq + 1)));
    return cmd;
  }

  return cmd;
}
