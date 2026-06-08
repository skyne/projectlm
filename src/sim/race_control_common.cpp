#include "race_control_common.hpp"

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
  case TrackStatus::Stranded:
    return "stranded";
  case TrackStatus::Recovering:
    return "recovering";
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
