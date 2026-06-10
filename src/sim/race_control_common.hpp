#ifndef RACE_CONTROL_COMMON_HPP
#define RACE_CONTROL_COMMON_HPP

#include <string>
#include <vector>

enum class FlagPhase { Green, SlowZone, FCY, SC, SCInLap, RedFlag };

enum class SectorFlagLevel : int { Green = 0, Yellow = 1, DoubleYellow = 2 };

enum class TrackStatus {
  Racing,
  Stranded,
  Recovering,
  ReturningToGarage,
  Cleared
};

enum class PendingPenalty { None, DriveThrough, StopGo, Black };

enum class HazardKind { Oil, Coolant, Debris, Fuel, Fire };

enum class SafetyCarPhase { Parked, ExitingPit, OnTrack, EnteringPit };

struct SafetyCarState {
  SafetyCarPhase phase = SafetyCarPhase::Parked;
  bool inPit = true;
  double pitLaneDistance = 0.0;
  double trackDistance = 0.0;
  int currentLap = 0;
  double currentSpeed = 0.0;
};

struct TrackSurfaceHazard {
  std::string id;
  double centerDistance = 0.0;
  /** Lateral centre from centreline (metres, left positive). */
  double centerLateralM = 0.0;
  int sectorIndex = 0;
  double spanMeters = 20.0;
  /** Across-track span (metres). 0 = full track width at centerDistance. */
  double lateralSpanM = 0.0;
  double gripMultiplier = 0.7;
  HazardKind kind = HazardKind::Debris;
  double createdAt = 0.0;
  double clearAt = -1.0;
  std::string sourceEntryId;
};

struct SessionRaceControl {
  FlagPhase flagPhase = FlagPhase::Green;
  std::vector<int> sectorFlags;
  bool fcyActive = false;
  bool scActive = false;
  double fcyHoldUntil = 0.0;
  double scDeployedAt = 0.0;
  int scDeployedAtLap = 0;
  int scLapsRemaining = 0;
  std::string scReferenceEntryId;
  std::string activeIncidentEntryId;
  double slowZoneHoldUntil = 0.0;
  double scRestartUntil = 0.0;
  /** After SC peels off: train rules until race leader crosses start/finish. */
  bool scAwaitingLeaderSfCross = false;
  bool whiteFlagActive = false;
  bool redFlagActive = false;
  double redFlagUntil = 0.0;
  double redFlagReviewAt = -1.0;
  int redFlagExtensions = 0;
  bool redFlagWeatherCause = false;
  /** Race order snapshot when red flag deploys — SC pit release uses this. */
  std::vector<std::string> redFlagPitOrder;
  std::vector<std::string> scPitReleaseQueue;
  double scPitReleaseNextAt = 0.0;
  /** After red flag: restore race order on track before SC peels off. */
  bool scFormationRestore = false;
  std::vector<std::string> scFormationOrder;
  SafetyCarState safetyCar;
  std::vector<TrackSurfaceHazard> hazards;
};

struct CarRaceControlState {
  TrackStatus trackStatus = TrackStatus::Racing;
  double obstructionSinceTime = -1.0;
  double marshalDispatchTime = -1.0;
  double fireExtinguishEndTime = -1.0;
  double fireStartedAt = -1.0;
  double recoveryStartTime = -1.0;
  double recoveryEndTime = -1.0;
  /** Sim time when tow truck delivers the car to the team in garage. */
  double garageHandoverTime = -1.0;
  int obstructionSectorIndex = 0;
  double stoppedTimer = 0.0;
  std::string obstructionReason;

  int blueFlagStrikes = 0;
  int cleanLapsSinceStrike = 0;
  PendingPenalty pendingPenalty = PendingPenalty::None;
  std::string penaltyReason;
  int penaltyIssuedLap = 0;
  int lapsToComply = 0;
  int meatballDeadlineLap = 0;
  bool meatballActive = false;
  bool blueFlagActive = false;
  double blueBlockTimer = 0.0;
  int collisionWarnings = 0;
  double penaltyStopSeconds = 0.0;
  double recoveryProgress = 0.0;
};

const char *FlagPhaseName(FlagPhase phase);
FlagPhase ParseFlagPhase(const std::string &name);
const char *TrackStatusName(TrackStatus status);
const char *PendingPenaltyName(PendingPenalty penalty);
const char *HazardKindName(HazardKind kind);
HazardKind ParseHazardKind(const std::string &name);

/** Natural surface-hazard lifetime before marshals sweep (race seconds). */
double HazardNaturalClearSec(HazardKind kind);

#endif
