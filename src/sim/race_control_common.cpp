#include "race_control_common.hpp"

FlagPhase ParseFlagPhase(const std::string &name) {
  if (name == "slow_zone")
    return FlagPhase::SlowZone;
  if (name == "fcy")
    return FlagPhase::FCY;
  if (name == "sc")
    return FlagPhase::SC;
  if (name == "sc_in_lap")
    return FlagPhase::SCInLap;
  if (name == "red_flag")
    return FlagPhase::RedFlag;
  return FlagPhase::Green;
}

const char *FlagPhaseName(FlagPhase phase) {
  switch (phase) {
  case FlagPhase::SlowZone:
    return "slow_zone";
  case FlagPhase::FCY:
    return "fcy";
  case FlagPhase::SC:
    return "sc";
  case FlagPhase::SCInLap:
    return "sc_in_lap";
  case FlagPhase::RedFlag:
    return "red_flag";
  case FlagPhase::Green:
  default:
    return "green";
  }
}

const char *TrackStatusName(TrackStatus status) {
  switch (status) {
  case TrackStatus::Stalled:
    return "stalled";
  case TrackStatus::Stranded:
    return "stranded";
  case TrackStatus::Recovering:
    return "recovering";
  case TrackStatus::ReturningToGarage:
    return "returning_to_garage";
  case TrackStatus::Cleared:
    return "cleared";
  case TrackStatus::Racing:
  default:
    return "racing";
  }
}

const char *PendingPenaltyName(PendingPenalty penalty) {
  switch (penalty) {
  case PendingPenalty::DriveThrough:
    return "drive_through";
  case PendingPenalty::StopGo:
    return "stop_go";
  case PendingPenalty::Black:
    return "black";
  case PendingPenalty::None:
  default:
    return "none";
  }
}

HazardKind ParseHazardKind(const std::string &name) {
  if (name == "oil")
    return HazardKind::Oil;
  if (name == "coolant")
    return HazardKind::Coolant;
  if (name == "fuel")
    return HazardKind::Fuel;
  if (name == "fire")
    return HazardKind::Fire;
  return HazardKind::Debris;
}

const char *HazardKindName(HazardKind kind) {
  switch (kind) {
  case HazardKind::Oil:
    return "oil";
  case HazardKind::Coolant:
    return "coolant";
  case HazardKind::Fuel:
    return "fuel";
  case HazardKind::Fire:
    return "fire";
  case HazardKind::Debris:
  default:
    return "debris";
  }
}

double HazardNaturalClearSec(HazardKind kind) {
  switch (kind) {
  case HazardKind::Debris:
    return 240.0;
  case HazardKind::Fuel:
    return 360.0;
  case HazardKind::Oil:
    return 600.0;
  case HazardKind::Fire:
    return 120.0;
  case HazardKind::Coolant:
    return 720.0;
  }
  return 240.0;
}
