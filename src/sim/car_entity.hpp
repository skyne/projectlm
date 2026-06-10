#ifndef CAR_ENTITY_HPP
#define CAR_ENTITY_HPP

#include "car_parts.hpp"
#include "commands.hpp"
#include "driver.hpp"
#include "race_control_common.hpp"
#include "pit_stop.hpp"
#include "simulation.hpp"
#include "telemetry.hpp"
#include "track.hpp"
#include "track_corridor.hpp"
#include "traffic.hpp"
#include "weather.hpp"
#include <map>
#include <string>
#include <vector>

struct RaceClass {
  std::string id;
  std::string displayName;
};

struct CarTickResult;

struct LapTimingSnapshot {
  int lapNumber = 0;
  double lapTime = 0.0;
  std::vector<double> sectorTimes;
};

struct DriverSnapshot {
  std::string name;
  std::string tier;
  std::string nationality;
  double dryPace = 0.0;
  double wetPace = 0.0;
  double consistency = 0.0;
  double overtaking = 0.0;
  double defending = 0.0;
  double setupFeedback = 0.0;
  double stamina = 0.0;
  double composure = 0.0;
  bool active = false;
};

struct CarSnapshot {
  std::string entryId;
  std::string teamName;
  std::string carNumber;
  std::string classId;
  int lap = 0;
  double distance = 0.0;
  double normalizedT = 0.0;
  double speed = 0.0;
  double rpm = 0.0;
  double fuel = 0.0;
  double tireWear = 0.0;
  double tireWearFL = 0.0;
  double tireWearFR = 0.0;
  double tireWearRL = 0.0;
  double tireWearRR = 0.0;
  std::string tireCompound = "medium";
  double tireTempC = 85.0;
  double tireTempFL = 85.0;
  double tireTempFR = 85.0;
  double tireTempRL = 85.0;
  double tireTempRR = 85.0;
  double coolantTempC = 70.0;
  double hybridDeployMJ = 0.0;
  double hybridBudgetMJ = 0.0;
  std::string hybridStrategy = "balanced";
  double engineHealth = 100.0;
  int sectorIndex = 0;
  int racePosition = 0;
  int classPosition = 0;
  bool inGarage = false;
  bool inPit = false;
  bool pitQueued = false;
  bool retired = false;
  std::string retireReason;
  double currentLapTime = 0.0;
  double currentSectorTime = 0.0;
  double lastLapTime = 0.0;
  double bestLapTime = 0.0;
  double gapToLeader = 0.0;
  std::vector<double> currentLapSectorTimes;
  std::vector<LapTimingSnapshot> lapHistory;
  Vec3 position;
  Vec3 tangent;
  double lateralOffset = 0.0;
  /** Lateral offset from centreline in metres (left positive). */
  double lateralOffsetM = 0.0;
  /** Heading error relative to path tangent (radians). */
  double headingError = 0.0;
  /** When true, position/tangent already include lateral offset. */
  bool poseIncludesLateral = false;
  double carLengthM = 5.0;
  double carWidthM = 2.0;
  std::string driverName;
  std::string driverMode = "normal";
  double driverStamina = 100.0;
  double driverPressure = 0.0;
  double driverMistakeRisk = 0.0;
  int activeDriverIndex = 0;
  std::vector<DriverSnapshot> driverRoster;
  std::string lastMistakeKind;
  double lastMistakeRemainingSec = 0.0;
  double lastMistakeWearPct = 0.0;
  std::string lastMistakeWheel;
  double wearBoostRemainingSec = 0.0;
  double wearBoostMultiplier = 1.0;
  bool overtaking = false;
  bool blocked = false;
  double pitRemainingSec = 0.0;
  double pitLaneDistance = 0.0;
  std::string setupFeedback;
  double wingAngle = 0.0;
  double brakeBias = 0.5;
  double frontRideHeightMm = 0.0;
  double rearRideHeightMm = 0.0;
  double frontSpringNm = 0.0;
  double rearSpringNm = 0.0;
  double frontArbStiffness = 1.0;
  double rearArbStiffness = 1.0;
  double frontCamberDeg = 0.0;
  double rearCamberDeg = 0.0;
  double serviceabilityFactor = 1.0;
  double driverChangeFactor = 1.0;
  int pitCount = 0;
  double totalPitSeconds = 0.0;
  double fuelTankCapacity = 100.0;
  double driverStintSeconds = 0.0;
  double maxDriverStintSeconds = 0.0;
  std::map<std::string, double> partHealth;
  /** Parts below critical health — need garage-tier rebuild (legacy name). */
  std::vector<std::string> partIrreparable;
  std::map<std::string, double> partRepairSec;
  bool physicallyRepairable = true;
  bool sessionRepairable = true;
  double totalRepairSec = 0.0;
  double remainingSessionSec = 0.0;
  bool garageRebuildActive = false;
  double garageRebuildRemainingSec = 0.0;
  bool onFire = false;
  std::map<std::string, std::string> tyreDeflation;
  std::string limpMode = "none";
  std::string limpReason;
  double structuralSeverity = 0.0;
  bool suspectedIssues = false;
  struct HiddenFaultSnapshot {
    std::string id;
    std::string kind;
    std::string linkedPart;
    double severity = 0.0;
    bool revealed = false;
  };
  std::vector<HiddenFaultSnapshot> hiddenFaults;
  std::string trackStatus = "racing";
  double recoveryProgress = 0.0;
  bool blueFlag = false;
  int blueFlagStrikes = 0;
  std::string pendingPenalty = "none";
  std::string penaltyReason;
  int lapsToComply = 0;
  bool meatballFlag = false;
  bool blackFlag = false;
  int collisionWarnings = 0;
  double penaltyStopSeconds = 0.0;
};

class Car {
public:
  Car(std::string entryId, std::string teamName, RaceClass raceClass,
      CarConfig car, int gridPosition, std::string carNumber = "");

  const std::string &entryId() const { return entryId_; }
  const std::string &teamName() const { return teamName_; }
  const std::string &carNumber() const { return carNumber_; }
  const RaceClass &raceClass() const { return raceClass_; }
  const CarConfig &config() const { return config_; }
  CarConfig &config() { return config_; }
  const SimulationState &state() const { return state_; }
  SimulationState &state() { return state_; }
  const TelemetryLog &telemetry() const { return telemetry_; }
  int gridPosition() const { return gridPosition_; }
  bool isRetired() const { return retired_; }
  bool isOnTrackObstruction() const;
  const CarRaceControlState &rcState() const { return rc_; }
  CarRaceControlState &rcState() { return rc_; }
  const std::string &retireReason() const { return retireReason_; }
  DriverState &driver() { return driver_; }
  const DriverState &driver() const { return driver_; }
  PitStopState &pit() { return pit_; }
  const PitStopState &pit() const { return pit_; }
  bool inPitLane() const { return pit_.inPit; }
  double lateralOffset() const { return lateralOffset_; }
  void setLateralOffset(double offset) {
    lateralOffset_ = std::clamp(offset, -1.0, 1.0);
  }
  /** Lateral offset from centreline in metres (left positive). */
  double lateralNM(double trackWidthM, bool useFrenetDynamics,
                   const TrackCorridor *corridor = nullptr,
                   double arcLengthM = -1.0) const;
  CarBodyDimensions bodyDimensions() const { return body_; }
  double wingAngleDelta() const { return wingAngleDelta_; }
  double brakeBias() const { return brakeBias_; }

  void placeOnGrid(int gridPosition);
  void placeInGarageHold(const TrackDefinition &track);
  bool releaseFromGarage(const TrackDefinition &track);
  bool inGarageHold() const { return garageHold_; }
  bool redFlagHold() const { return redFlagHold_; }
  bool redFlagEmergencyWorked() const { return redFlagEmergencyWorked_; }
  bool isUnderPitService() const;
  void applyRedFlagHold();
  void clearRedFlagHold();
  void beginGarageRebuild(const TrackDefinition &track, double raceTime,
                          double durationSec, const std::string &status,
                          bool damageRebuild = true,
                          double restoreTargetHealth = 70.0);
  void tickGarageRebuild(const TrackDefinition &track, double raceTime,
                         double remainingSessionSec);
  bool deliverTowedToGarage(const TrackDefinition &track, double raceTime,
                            double remainingSessionSec);
  /** Practice / qualifying: tow off track for refuel (not a damage rebuild). */
  void beginOpenSessionEnergyRecovery(const TrackDefinition &track,
                                      double raceTime);
  bool inGarageRebuild() const { return garageRebuildActive_; }
  double garageRebuildRemainingSec(double raceTime) const;
  bool onFire() const { return onFire_; }
  void igniteFire();
  void extinguishFire();
  double bestLapTime() const { return bestLapTime_; }
  double lastLapTime() const;
  void applyClassStintLimit(double maxStintSeconds);
  double maxDriverStintSeconds() const { return maxDriverStintSeconds_; }
  int pitCount() const { return pitCount_; }

  void setDrivers(DriverState drivers);
  void resetForRestart();

  CarTickResult tick(const TrackDefinition &track,
                     const TrackCorridor &corridor,
                     const PhysicsConfig &physics, double deltaTime,
                     double raceTime, TelemetryLog *telemetry = nullptr,
                     const TrafficModifiers *traffic = nullptr,
                     const WeatherState &weather = WeatherState{},
                     bool isNight = false,
                     double remainingSessionSec = 86400.0 * 7.0,
                     bool pauseDriverStint = false);

  bool processPitEntry(double normalizedT, bool lapJustCompleted,
                       bool redFlagActive = false);
  bool processPitLaneTick(const TrackDefinition &track, double deltaTime,
                          const StaffModifiers &staff,
                          double remainingSessionSec = 86400.0 * 7.0,
                          bool redFlagActive = false,
                          const std::vector<Car> *peerCars = nullptr,
                          bool requireMergeGap = false,
                          const TrafficLateralContext *lateral = nullptr);
  void beginRejoinYield(double seconds = kPitRejoinYieldSec);
  bool isRejoiningYield() const { return rejoinYieldSec_ > 0.0; }
  void applyCommand(const SimCommand &command);
  void applyTrafficVisuals(const TrafficModifiers &traffic, double deltaTime,
                           const TrackCorridor &corridor, bool useFrenet);

  CarSnapshot snapshot(const TrackDefinition &track, int racePosition,
                       double remainingSessionSec = 86400.0 * 7.0,
                       const TrackCorridor *corridor = nullptr,
                       const PhysicsConfig *physics = nullptr,
                       double trackWidthM = 12.0) const;

  bool isAheadOf(const Car &other) const;
  void markRetired(const std::string &reason);

private:
  void tryIgniteFire(double chance, double raceTime);
  void tickFireDamage(double deltaTime);
  bool handlePostPitRepairDecision(const TrackDefinition &track, double raceTime,
                                   double remainingSessionSec);
  bool startGarageRebuildAfterPit(const TrackDefinition &track, double raceTime,
                                  double remainingSessionSec,
                                  double restoreTargetHealth,
                                  bool evenIfRaceable,
                                  const std::string &status);
  void restoreFullStintEnergy();
  std::string entryId_;
  std::string teamName_;
  std::string carNumber_;
  RaceClass raceClass_;
  CarConfig config_;
  SimulationState state_;
  DriverState driver_;
  PitStopState pit_;
  CarBodyDimensions body_;
  int gridPosition_ = 0;
  bool retired_ = false;
  std::string retireReason_;
  TelemetryLog telemetry_;
  double bestLapTime_ = 0.0;
  double lateralOffset_ = 0.0;
  double pathTargetNM_ = 0.0;
  double rejoinYieldSec_ = 0.0;
  double wingAngleDelta_ = 0.0;
  double brakeBias_ = 0.5;
  double collisionCooldown_ = 0.0;
  double setupFeedbackTimer_ = 0.0;
  double outOfFuelTimer_ = 0.0;
  bool overtakingVisual_ = false;
  bool blockedVisual_ = false;
  std::string setupFeedback_;
  DriverMistakeKind lastMistakeKind_ = DriverMistakeKind::RanWide;
  double lastMistakeTimer_ = 0.0;
  double lastMistakeWearAdded_ = 0.0;
  std::string lastMistakeWheel_;
  double mistakeWearBoostTimer_ = 0.0;
  double mistakeWearBoostMultiplier_ = 1.0;
  double mistakePenaltyTimer_ = 0.0;
  double mistakePenaltyDuration_ = 0.0;
  double mistakePenaltyPeak_ = 0.0;
  int pitCount_ = 0;
  double totalPitSeconds_ = 0.0;
  double maxDriverStintSeconds_ = 0.0;
  bool garageHold_ = false;
  bool redFlagHold_ = false;
  bool redFlagEmergencyWorked_ = false;
  bool garageRebuildActive_ = false;
  double garageRebuildEndTime_ = 0.0;
  double garageRestoreTargetHealth_ = 70.0;
  bool onFire_ = false;
  CarRaceControlState rc_;
};

double ComputeGapToLeader(const Car &car, const Car &leader, double lapLength);
double ComputeTimingGap(const Car &car, const Car &leader);

struct CarTickResult {
  bool sectorCrossed = false;
  bool lapCompleted = false;
  bool retired = false;
  /** Catastrophic same-side loss — car stopped on racing line; strand for FCY/SC. */
  bool stoppedOnTrack = false;
  int completedSectorIndex = 0;
  int completedLap = 0;
};

/** Race log / race control label: "#42 Team Name" when a car number is set. */
inline std::string EntryDisplayLabel(const Car &car) {
  if (!car.carNumber().empty())
    return "#" + car.carNumber() + " " + car.teamName();
  return car.teamName();
}

#endif
