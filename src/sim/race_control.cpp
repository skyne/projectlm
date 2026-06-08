#include "race_control.hpp"
#include "part_damage.hpp"
#include "pit_stop.hpp"
#include "sim_bridge.hpp"
#include <algorithm>
#include <cmath>
#include <unordered_map>

void UpdateScPitRelease(RaceSession &session);

namespace {

constexpr double kFcySpeedCapMs = 22.0;
constexpr double kSlowZoneSpeedCapMs = 20.0;
constexpr double kStoppedSpeedThresholdMs = 0.5;
constexpr double kStoppedStrandSeconds = 3.0;
constexpr double kMarshalResponseBaseSec = 15.0;
constexpr double kMarshalResponseRainSec = 30.0;
constexpr double kTowBaseSec = 90.0;
constexpr double kTowStructuralExtraSec = 30.0;
constexpr double kFireExtinguishBaseSec = 2.0;
constexpr double kFireExtinguishRainSec = 3.0;
constexpr double kFireExtinguishUnderScSec = 1.5;
constexpr double kFcyMinHoldSec = 60.0;
constexpr double kSlowZoneMinHoldSec = 30.0;
constexpr int kScMinLaps = 2;
constexpr double kHazardNaturalClearSec = 1200.0;
constexpr double kRedFlagWeatherPeriodSec = 120.0;
constexpr double kRedFlagObstructionPeriodSec = 60.0;
constexpr double kRedFlagExtendWeatherSec = 90.0;
constexpr double kRedFlagExtendObstructionSec = 45.0;
constexpr double kRedFlagReviewLeadMinSec = 15.0;
constexpr double kRedFlagReviewLeadMaxSec = 30.0;
constexpr double kRedFlagDeployVisibilityKm = 1.5;
constexpr double kRedFlagDeployHeavyRainVisibilityKm = 2.5;
constexpr double kRedFlagResumeVisibilityKm = 2.0;
constexpr double kRedFlagResumeHeavyRainVisibilityKm = 3.0;
constexpr double kScPitReleaseGapSec = 2.0;
constexpr double kRedFlagOnTrackSpeedCapMs = 60.0 / 3.6;
constexpr double kRedFlagFireDurationSec = 120.0;
constexpr int kRedFlagFireCountThreshold = 2;

double RedFlagReviewLeadSec(double periodSec) {
  return std::clamp(periodSec * 0.25, kRedFlagReviewLeadMinSec,
                    kRedFlagReviewLeadMaxSec);
}

void SetRedFlagPeriod(SessionRaceControl &rc, double now, double periodSec,
                      bool weatherCause) {
  rc.redFlagUntil = now + periodSec;
  rc.redFlagReviewAt = rc.redFlagUntil - RedFlagReviewLeadSec(periodSec);
  rc.redFlagWeatherCause = weatherCause;
}

struct RedFlagTrigger {
  bool deploy = false;
  bool weatherCause = false;
  std::string reason;
};

bool ShouldRedFlagForWeather(const WeatherState &weather) {
  if (weather.visibilityKm < kRedFlagDeployVisibilityKm)
    return true;
  if (weather.phase == WeatherPhase::HeavyRain &&
      weather.visibilityKm < kRedFlagDeployHeavyRainVisibilityKm)
    return true;
  return false;
}

int ObstructionRedFlagThreshold(double lapLengthM) {
  const double lapKm = lapLengthM / 1000.0;
  if (lapKm < 4.0)
    return 2;
  if (lapKm < 6.0)
    return 3;
  return 4;
}

int MaxObstructionsInSingleSector(const RaceSession &session) {
  std::unordered_map<int, int> bySector;
  for (const Car &car : session.cars) {
    const TrackStatus st = car.rcState().trackStatus;
    if (st != TrackStatus::Stranded && st != TrackStatus::Recovering)
      continue;
    ++bySector[car.rcState().obstructionSectorIndex];
  }
  int maxInSector = 0;
  for (const auto &[sector, count] : bySector)
    maxInSector = std::max(maxInSector, count);
  return maxInSector;
}

void EmitControlEvent(SimEventType type, double timestamp,
                      const std::string &message,
                      const std::string &entryId = "") {
  if (g_raceEventOut == nullptr)
    return;
  SimEvent ev;
  ev.type = type;
  ev.timestamp = timestamp;
  ev.message = message;
  if (!entryId.empty())
    ev.entryId = entryId;
  g_raceEventOut->push_back(std::move(ev));
}

void EnsureSectorFlags(RaceSession &session) {
  const size_t n = session.track.sectors.size();
  if (session.raceControl.sectorFlags.size() != n)
    session.raceControl.sectorFlags.assign(n, static_cast<int>(SectorFlagLevel::Green));
}

double MarshalResponseDelay(const WeatherState &weather) {
  const bool heavy =
      weather.phase == WeatherPhase::HeavyRain || weather.visibilityKm < 4.0;
  return heavy ? kMarshalResponseRainSec : kMarshalResponseBaseSec;
}

double TowDuration(const Car &car, bool underSc) {
  const double structural =
      ComputeStructuralSeverity(car.state().partDamage, car.state().tyreDeflation);
  double duration = kTowBaseSec;
  if (structural >= 55.0)
    duration += kTowStructuralExtraSec;
  if (underSc)
    duration *= 0.6;
  return duration;
}

double FireExtinguishDuration(const Car &car, bool underSc,
                              const WeatherState &weather) {
  if (underSc)
    return kFireExtinguishUnderScSec;
  const bool heavy =
      weather.phase == WeatherPhase::HeavyRain || weather.visibilityKm < 4.0;
  double duration = heavy ? kFireExtinguishRainSec : kFireExtinguishBaseSec;
  const double structural =
      ComputeStructuralSeverity(car.state().partDamage, car.state().tyreDeflation);
  if (structural >= 70.0)
    duration += 1.0;
  return duration;
}

void BeginRecoveryTow(Car &car, RaceSession &session, bool underSc) {
  CarRaceControlState &rc = car.rcState();
  rc.trackStatus = TrackStatus::Recovering;
  rc.recoveryStartTime = session.elapsedRaceTime;
  rc.recoveryEndTime =
      session.elapsedRaceTime + TowDuration(car, underSc);
  rc.recoveryProgress = 0.0;
  EmitControlEvent(SimEventType::RecoveryDispatched, session.elapsedRaceTime,
                   car.teamName() + " — recovery vehicle dispatched",
                   car.entryId());
}

void IssuePenalty(Car &car, PendingPenalty penalty, const std::string &reason,
                  int lapsToComply, double raceTime, double stopGoSeconds = 0.0) {
  CarRaceControlState &rc = car.rcState();
  rc.pendingPenalty = penalty;
  rc.penaltyReason = reason;
  rc.penaltyIssuedLap = car.state().currentLap;
  rc.lapsToComply = lapsToComply;
  if (penalty == PendingPenalty::StopGo && stopGoSeconds > 0.0)
    rc.penaltyStopSeconds = stopGoSeconds;
  EmitControlEvent(SimEventType::PenaltyIssued, raceTime,
                   car.teamName() + ": " + reason + " (" +
                       PendingPenaltyName(penalty) + ")",
                   car.entryId());
}

void IssueCollisionWarning(Car &car, const std::string &reason,
                           double raceTime) {
  CarRaceControlState &rc = car.rcState();
  rc.collisionWarnings++;
  EmitControlEvent(SimEventType::PenaltyWarning, raceTime,
                   car.teamName() + ": " + reason, car.entryId());
}

Car *FindCarByEntryId(RaceSession &session, const std::string &entryId) {
  for (Car &car : session.cars) {
    if (car.entryId() == entryId)
      return &car;
  }
  return nullptr;
}

std::string CollisionPairKey(const std::string &a, const std::string &b) {
  return a < b ? a + "|" + b : b + "|" + a;
}

constexpr double kMinorCollisionImpact = 2.5;
constexpr double kSevereCollisionImpact = 5.0;
constexpr double kWideLineOffset = 0.30;
constexpr double kStopGoMinSec = 30.0;
constexpr double kStopGoMaxSec = 60.0;

double StopGoSecondsForCollision(double impact, const Car *victim) {
  double seconds =
      kStopGoMinSec + (impact / 10.0) * (kStopGoMaxSec - kStopGoMinSec);
  if (victim != nullptr &&
      (victim->state().engineHealth <= 0.0 ||
       victim->rcState().trackStatus == TrackStatus::Stranded))
    seconds = kStopGoMaxSec;
  return std::clamp(seconds, kStopGoMinSec, kStopGoMaxSec);
}

bool IsSideBySideRacingIncident(const TrafficEvent &ev) {
  return !ev.closingFromRear && ev.impact < 4.0 && ev.lateralSepM < 1.6;
}

void EmitRacingIncident(const RaceSession &session, const Car &a,
                        const Car &b) {
  EmitControlEvent(
      SimEventType::RacingIncident, session.elapsedRaceTime,
      "Racing incident — no penalty: " + a.teamName() + " / " + b.teamName(),
      a.entryId());
}

bool ObstructionRecoveryIsForceRetire(const Car &car) {
  if (car.isRetired())
    return true;
  const std::string &reason = car.rcState().obstructionReason;
  return reason.find("Out of fuel") != std::string::npos;
}

void ClearObstructionCar(Car &car, RaceSession &session) {
  CarRaceControlState &rc = car.rcState();
  rc.trackStatus = TrackStatus::Cleared;
  car.state().currentSpeed = 0.0;
  EmitControlEvent(SimEventType::TrackClear, session.elapsedRaceTime,
                   car.teamName() + " cleared from track", car.entryId());

  if (ObstructionRecoveryIsForceRetire(car)) {
    if (!car.isRetired()) {
      car.markRetired(rc.obstructionReason.empty() ? "Retired on track"
                                                   : rc.obstructionReason);
      EmitControlEvent(SimEventType::Retirement, session.elapsedRaceTime,
                       car.teamName() + " retired: " + car.retireReason(),
                       car.entryId());
    }
    return;
  }

  const double remaining = RemainingSessionSec(session, car);
  if (car.deliverTowedToGarage(session.track, session.elapsedRaceTime,
                               remaining)) {
    EmitControlEvent(SimEventType::RecoveryDispatched, session.elapsedRaceTime,
                     car.teamName() + " towed to garage for rebuild",
                     car.entryId());
    return;
  }

  if (!car.isRetired()) {
    static const PartCatalog kCatalog{};
    CarDamageProfiles profiles;
    BuildCarDamageProfiles(car.config(), kCatalog, profiles);
    const CarRepairAssessment assessment = ComputeCarRepairAssessment(
        car.state().partDamage, car.config(), car.state().tyreDeflation,
        profiles, remaining);
    const std::string reason =
        IsMonocoqueBreached(car.state().partDamage)
            ? "Monocoque breached"
            : !assessment.physicallyRepairable
                  ? "Beyond repair"
                  : "Insufficient session time for repair";
    car.markRetired(reason);
    EmitControlEvent(SimEventType::Retirement, session.elapsedRaceTime,
                     car.teamName() + " retired: " + car.retireReason(),
                     car.entryId());
  }
}

} // namespace

void BeginStrand(Car &car, RaceSession &session, const std::string &reason,
                 HazardKind hazardKind, double hazardGrip, double hazardSpan) {
  if (car.rcState().trackStatus != TrackStatus::Racing)
    return;
  if (car.inPitLane() || car.inGarageHold())
    return;

  CarRaceControlState &rc = car.rcState();
  rc.trackStatus = TrackStatus::Stranded;
  rc.obstructionSinceTime = session.elapsedRaceTime;
  rc.marshalDispatchTime =
      session.elapsedRaceTime + MarshalResponseDelay(session.weather);
  rc.fireExtinguishEndTime = -1.0;
  rc.recoveryStartTime = -1.0;
  rc.recoveryEndTime = -1.0;
  rc.obstructionReason = reason;
  rc.obstructionSectorIndex = static_cast<int>(
      session.track.sectorIndexAtDistance(car.state().currentDistance));
  car.state().currentSpeed = 0.0;

  SpawnSurfaceHazard(session, car.state().currentDistance, hazardKind,
                     car.entryId(), hazardGrip, hazardSpan);
  EnsureSectorFlags(session);
  session.raceControl.sectorFlags[rc.obstructionSectorIndex] =
      static_cast<int>(SectorFlagLevel::DoubleYellow);
  session.raceControl.activeIncidentEntryId = car.entryId();
  session.raceControl.slowZoneHoldUntil =
      session.elapsedRaceTime + kSlowZoneMinHoldSec;

  EmitControlEvent(SimEventType::Stranded, session.elapsedRaceTime,
                   car.teamName() + " stopped on track — " + reason,
                   car.entryId());
}

void StrandStoppedCar(Car &car, RaceSession &session, const std::string &reason,
                      HazardKind hazardKind, double hazardGrip,
                      double hazardSpan) {
  BeginStrand(car, session, reason, hazardKind, hazardGrip, hazardSpan);
}

void InitSessionRaceControl(RaceSession &session) {
  session.raceControl = SessionRaceControl{};
  EnsureSectorFlags(session);
  SyncRaceControlFlags(session.raceControl);
}

void SyncRaceControlFlags(SessionRaceControl &rc) {
  rc.fcyActive = rc.flagPhase == FlagPhase::FCY;
  rc.scActive = rc.flagPhase == FlagPhase::SC || rc.flagPhase == FlagPhase::SCInLap;
  rc.redFlagActive = rc.flagPhase == FlagPhase::RedFlag;
}

void SpawnSurfaceHazard(RaceSession &session, double distance,
                        HazardKind kind, const std::string &sourceEntryId,
                        double gripMultiplier, double spanMeters) {
  TrackSurfaceHazard hz;
  hz.id = sourceEntryId + "-" + std::to_string(static_cast<int>(distance));
  hz.centerDistance = distance;
  hz.sectorIndex =
      static_cast<int>(session.track.sectorIndexAtDistance(distance));
  hz.spanMeters = spanMeters;
  hz.gripMultiplier = gripMultiplier;
  hz.kind = kind;
  hz.createdAt = session.elapsedRaceTime;
  hz.clearAt = session.elapsedRaceTime + kHazardNaturalClearSec;
  hz.sourceEntryId = sourceEntryId;
  session.raceControl.hazards.push_back(std::move(hz));
  EnsureSectorFlags(session);
  if (hz.sectorIndex >= 0 &&
      hz.sectorIndex < static_cast<int>(session.raceControl.sectorFlags.size())) {
    session.raceControl.sectorFlags[hz.sectorIndex] = std::max(
        session.raceControl.sectorFlags[hz.sectorIndex],
        static_cast<int>(SectorFlagLevel::Yellow));
  }
  EmitControlEvent(SimEventType::SurfaceHazard, session.elapsedRaceTime,
                   "Slippery surface (" + std::string(HazardKindName(kind)) +
                       ") in sector " + std::to_string(hz.sectorIndex + 1),
                   sourceEntryId);
}

void UpdateTrackHazards(RaceSession &session, double deltaTime) {
  (void)deltaTime;
  const bool sweeping =
      session.raceControl.flagPhase == FlagPhase::FCY ||
      session.raceControl.flagPhase == FlagPhase::SC ||
      session.raceControl.flagPhase == FlagPhase::SCInLap ||
      session.raceControl.flagPhase == FlagPhase::RedFlag;
  if (sweeping) {
    for (TrackSurfaceHazard &hz : session.raceControl.hazards) {
      if (hz.clearAt < 0.0)
        continue;
      hz.clearAt -= deltaTime * 2.0;
    }
  }

  session.raceControl.hazards.erase(
      std::remove_if(session.raceControl.hazards.begin(),
                     session.raceControl.hazards.end(),
                     [&](const TrackSurfaceHazard &hz) {
                       if (hz.clearAt >= 0.0 &&
                           session.elapsedRaceTime >= hz.clearAt) {
                         EmitControlEvent(
                             SimEventType::SurfaceCleared,
                             session.elapsedRaceTime,
                             "Surface cleared in sector " +
                                 std::to_string(hz.sectorIndex + 1));
                         return true;
                       }
                       return false;
                     }),
      session.raceControl.hazards.end());
}

double LocalGripMultiplierAt(const RaceSession &session, double distance,
                             double lapLength) {
  if (lapLength <= 0.0)
    return 1.0;
  double best = 1.0;
  const double wrapped = std::fmod(distance, lapLength);
  for (const TrackSurfaceHazard &hz : session.raceControl.hazards) {
    const double center = std::fmod(hz.centerDistance, lapLength);
    double delta = std::abs(wrapped - center);
    if (delta > lapLength * 0.5)
      delta = lapLength - delta;
    if (delta <= hz.spanMeters * 0.5)
      best = std::min(best, hz.gripMultiplier);
  }
  return best;
}

int CountTrackObstructions(const RaceSession &session) {
  int count = 0;
  for (const Car &car : session.cars) {
    const TrackStatus st = car.rcState().trackStatus;
    if (st == TrackStatus::Stranded || st == TrackStatus::Recovering)
      ++count;
  }
  return count;
}

int CountBurningCarsOnTrack(const RaceSession &session) {
  int count = 0;
  for (const Car &car : session.cars) {
    if (car.isRetired() || car.inPitLane() || car.inGarageHold())
      continue;
    if (car.onFire())
      ++count;
  }
  return count;
}

bool ShouldRedFlagForFire(const RaceSession &session) {
  const int count = CountBurningCarsOnTrack(session);
  if (count >= kRedFlagFireCountThreshold)
    return true;
  if (count <= 0)
    return false;
  for (const Car &car : session.cars) {
    if (car.isRetired() || car.inPitLane() || car.inGarageHold() || !car.onFire())
      continue;
    const double started = car.rcState().fireStartedAt;
    if (started >= 0.0 &&
        session.elapsedRaceTime - started >= kRedFlagFireDurationSec)
      return true;
  }
  return false;
}

bool ShouldRedFlagForObstructions(const RaceSession &session) {
  const int count = CountTrackObstructions(session);
  if (count <= 0)
    return false;
  const double lapKm = session.track.lapLength() / 1000.0;
  const int threshold = ObstructionRedFlagThreshold(session.track.lapLength());
  const int maxInSector = MaxObstructionsInSingleSector(session);
  const bool clustered = maxInSector == count;
  if (lapKm < 4.0 && maxInSector >= 2)
    return true;
  if (clustered && count >= 2 && count >= threshold - 1)
    return true;
  if (count >= threshold && (clustered || lapKm >= 6.0))
    return true;
  return false;
}

bool SectorFlagsAllGreen(const SessionRaceControl &rc) {
  for (int flag : rc.sectorFlags) {
    if (flag > static_cast<int>(SectorFlagLevel::Green))
      return false;
  }
  return true;
}

bool WeatherSafeForRacing(const WeatherState &weather) {
  if (weather.visibilityKm < kRedFlagResumeVisibilityKm)
    return false;
  if (weather.phase == WeatherPhase::HeavyRain &&
      weather.visibilityKm < kRedFlagResumeHeavyRainVisibilityKm)
    return false;
  return true;
}

bool AllNonRetiredCarsInPit(const RaceSession &session) {
  for (const Car &car : session.cars) {
    if (car.isRetired())
      continue;
    if (!car.inPitLane())
      return false;
  }
  return true;
}

RedFlagTrigger EvaluateRedFlagTrigger(const RaceSession &session) {
  RedFlagTrigger trigger;
  const WeatherState &weather = session.weather;
  if (ShouldRedFlagForWeather(weather)) {
    trigger.deploy = true;
    trigger.weatherCause = true;
    if (weather.visibilityKm < kRedFlagDeployVisibilityKm)
      trigger.reason = "Race control: Red flag — visibility too low";
    else
      trigger.reason = "Race control: Red flag — heavy rain";
    return trigger;
  }
  if (ShouldRedFlagForFire(session)) {
    const int burning = CountBurningCarsOnTrack(session);
    trigger.deploy = true;
    trigger.weatherCause = false;
    if (burning >= kRedFlagFireCountThreshold)
      trigger.reason = "Race control: Red flag — multiple car fires (" +
                       std::to_string(burning) + ")";
    else
      trigger.reason = "Race control: Red flag — car fire on track";
    return trigger;
  }
  if (ShouldRedFlagForObstructions(session)) {
    trigger.deploy = true;
    trigger.weatherCause = false;
    trigger.reason = "Race control: Red flag — track blocked (" +
                     std::to_string(CountTrackObstructions(session)) +
                     " obstructions)";
  }
  return trigger;
}

bool RacingConditionsMet(const RaceSession &session) {
  if (CountTrackObstructions(session) > 0)
    return false;
  if (CountBurningCarsOnTrack(session) > 0)
    return false;
  if (!SectorFlagsAllGreen(session.raceControl))
    return false;
  if (!WeatherSafeForRacing(session.weather))
    return false;
  if (!AllNonRetiredCarsInPit(session))
    return false;
  return true;
}

void DeployRedFlag(RaceSession &session, const RedFlagTrigger &trigger) {
  SessionRaceControl &rc = session.raceControl;
  rc.flagPhase = FlagPhase::RedFlag;
  const double period = trigger.weatherCause ? kRedFlagWeatherPeriodSec
                                             : kRedFlagObstructionPeriodSec;
  SetRedFlagPeriod(rc, session.elapsedRaceTime, period, trigger.weatherCause);
  rc.redFlagExtensions = 0;
  rc.redFlagReviewAt = rc.redFlagUntil - RedFlagReviewLeadSec(period);
  SyncRaceControlFlags(rc);
  EmitControlEvent(SimEventType::RedFlagDeploy, session.elapsedRaceTime,
                   trigger.reason);
}

void ExtendRedFlag(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  rc.redFlagExtensions++;
  const double period = rc.redFlagWeatherCause ? kRedFlagExtendWeatherSec
                                               : kRedFlagExtendObstructionSec;
  SetRedFlagPeriod(rc, session.elapsedRaceTime, period, rc.redFlagWeatherCause);
  EmitControlEvent(SimEventType::RedFlagExtended, session.elapsedRaceTime,
                   "Race control: Red flag extended (" +
                       std::to_string(rc.redFlagExtensions) + ")");
}

void TransitionRedFlagToSc(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  rc.flagPhase = FlagPhase::SC;
  rc.redFlagReviewAt = -1.0;
  SyncRaceControlFlags(rc);
  EmitControlEvent(SimEventType::RedFlagEnd, session.elapsedRaceTime,
                   "Race control: Red flag ended — safety car deployed");

  rc.scDeployedAt = session.elapsedRaceTime;
  rc.scDeployedAtLap =
      session.cars.empty() ? 0 : session.cars[0].state().currentLap;
  const std::vector<Car *> board = GetLeaderboard(session);
  if (!board.empty()) {
    rc.scReferenceEntryId = board.front()->entryId();
    rc.scDeployedAtLap = board.front()->state().currentLap;
  }
  rc.scLapsRemaining = kScMinLaps;
  rc.scPitReleaseQueue.clear();
  for (const Car *car : board) {
    if (car->redFlagHold())
      rc.scPitReleaseQueue.push_back(car->entryId());
  }
  rc.scPitReleaseNextAt = session.elapsedRaceTime;
  EmitControlEvent(SimEventType::SafetyCarDeploy, session.elapsedRaceTime,
                   "Race control: Safety car deployed");
  UpdateScPitRelease(session);
}

void UpdateTrackObstructions(RaceSession &session, double deltaTime) {
  const bool underSc = session.raceControl.scActive;

  for (Car &car : session.cars) {
    if (car.inPitLane() || car.inGarageHold())
      continue;

    CarRaceControlState &rc = car.rcState();
    if (rc.trackStatus == TrackStatus::Stranded) {
      car.state().currentSpeed = 0.0;

      if (rc.fireExtinguishEndTime >= 0.0) {
        if (session.elapsedRaceTime >= rc.fireExtinguishEndTime) {
          car.extinguishFire();
          rc.fireExtinguishEndTime = -1.0;
          BeginRecoveryTow(car, session, underSc);
        }
        continue;
      }

      if (session.elapsedRaceTime >= rc.marshalDispatchTime &&
          rc.recoveryEndTime < 0.0) {
        if (car.onFire()) {
          rc.fireExtinguishEndTime =
              session.elapsedRaceTime +
              FireExtinguishDuration(car, underSc, session.weather);
          EmitControlEvent(
              SimEventType::RecoveryDispatched, session.elapsedRaceTime,
              car.teamName() + " — marshals extinguishing fire", car.entryId());
        } else {
          BeginRecoveryTow(car, session, underSc);
        }
      }
      continue;
    }

    if (rc.trackStatus == TrackStatus::Recovering) {
      car.state().currentSpeed = 0.0;
      const double towStart =
          rc.recoveryStartTime >= 0.0 ? rc.recoveryStartTime
                                      : rc.marshalDispatchTime;
      const double span = rc.recoveryEndTime - towStart;
      if (span > 0.0) {
        rc.recoveryProgress = std::clamp(
            (session.elapsedRaceTime - towStart) / span, 0.0, 1.0);
      }
      if (session.elapsedRaceTime >= rc.recoveryEndTime)
        ClearObstructionCar(car, session);
      continue;
    }

    if (car.isRetired())
      continue;

    if (rc.trackStatus != TrackStatus::Racing)
      continue;

    const LimpMode limp = EvaluateLimpMode(
        car.state().partDamage, car.config(), car.state().tyreDeflation,
        car.state().batteryChargeMJ > 0.0 ? car.state().batteryChargeMJ
                                          : car.state().hybridDeployRemainingMJ);

    bool shouldStrand = false;
    std::string reason;
    HazardKind kind = HazardKind::Debris;
    double grip = 0.7;
    double span = 25.0;

    if (car.onFire() && car.state().currentSpeed < kStoppedSpeedThresholdMs) {
      shouldStrand = true;
      reason = "Fire";
      kind = HazardKind::Fire;
      grip = 0.58;
      span = 40.0;
    } else if (IsMonocoqueBreached(car.state().partDamage) &&
               car.state().currentSpeed < kStoppedSpeedThresholdMs) {
      shouldStrand = true;
      reason = "Monocoque breached";
      kind = HazardKind::Debris;
      grip = 0.55;
      span = 40.0;
    } else if (car.state().engineHealth <= 0.0) {
      shouldStrand = true;
      reason = "Engine failure";
      kind = HazardKind::Oil;
      grip = 0.68;
    } else if (limp == LimpMode::Immobilized) {
      shouldStrand = true;
      reason = "Immobilized";
      kind = HazardKind::Debris;
      grip = 0.6;
      span = 35.0;
    } else if (car.state().fuelRemaining <= 0.0 &&
               car.state().currentSpeed < kStoppedSpeedThresholdMs) {
      rc.stoppedTimer += deltaTime;
      if (rc.stoppedTimer >= kStoppedStrandSeconds) {
        shouldStrand = true;
        reason = "Out of fuel";
        kind = HazardKind::Fuel;
        grip = 0.72;
        span = 15.0;
      }
    } else {
      rc.stoppedTimer = 0.0;
    }

    if (shouldStrand)
      BeginStrand(car, session, reason, kind, grip, span);
  }
}

void ProcessCollisionPenalties(RaceSession &session,
                               const std::vector<TrafficEvent> &trafficEvents) {
  std::unordered_map<std::string, std::vector<const TrafficEvent *>> byPair;
  for (const TrafficEvent &ev : trafficEvents) {
    if (ev.type != TrafficEvent::Type::Collision)
      continue;
    byPair[CollisionPairKey(ev.entryId, ev.otherEntryId)].push_back(&ev);
  }

  for (const auto &[pairKey, events] : byPair) {
    (void)pairKey;
    if (events.empty())
      continue;

    const TrafficEvent *primary = events[0];
    for (const TrafficEvent *ev : events) {
      if (ev->impact > primary->impact)
        primary = ev;
    }

    Car *carA = FindCarByEntryId(session, primary->entryId);
    Car *carB = FindCarByEntryId(session, primary->otherEntryId);
    if (carA == nullptr || carB == nullptr)
      continue;

    SpawnSurfaceHazard(session, carA->state().currentDistance,
                       HazardKind::Debris, carA->entryId(), 0.62, 35.0);

    const bool dualFault = events.size() >= 2;
    if (dualFault) {
      EmitRacingIncident(session, *carA, *carB);
      continue;
    }

    const TrafficEvent &ev = *primary;
    Car *aggressor = carA;
    Car *victim = carB;

    if (IsSideBySideRacingIncident(ev)) {
      EmitRacingIncident(session, *aggressor, *victim);
      continue;
    }

    if (ev.impact < kMinorCollisionImpact &&
        std::abs(victim->lateralOffset()) > kWideLineOffset) {
      IssueCollisionWarning(*victim, "Warning — ran wide causing contact",
                            session.elapsedRaceTime);
      continue;
    }

    if (ev.impact >= kSevereCollisionImpact) {
      const double stopSec = StopGoSecondsForCollision(ev.impact, victim);
      IssuePenalty(*aggressor, PendingPenalty::StopGo,
                   "Caused a serious collision", 2, session.elapsedRaceTime,
                   stopSec);
      continue;
    }

    if (ev.closingFromRear && ev.relativeSpeedMs > 6.0) {
      if (aggressor->rcState().collisionWarnings > 0 || ev.impact >= 4.5) {
        IssuePenalty(*aggressor, PendingPenalty::DriveThrough,
                     "Caused collision — drive through", 3,
                     session.elapsedRaceTime);
      } else {
        IssueCollisionWarning(*aggressor,
                              "Warning — caused contact from behind",
                              session.elapsedRaceTime);
      }
      continue;
    }

    if (ev.impact >= kMinorCollisionImpact) {
      IssueCollisionWarning(*aggressor, "Warning — caused avoidable contact",
                            session.elapsedRaceTime);
      continue;
    }

    EmitRacingIncident(session, *aggressor, *victim);
  }
}

void UpdateRaceControl(RaceSession &session,
                       const std::vector<TrafficEvent> &trafficEvents) {
  EnsureSectorFlags(session);
  ProcessCollisionPenalties(session, trafficEvents);

  const int obstructions = CountTrackObstructions(session);
  SessionRaceControl &rc = session.raceControl;

  if (rc.flagPhase == FlagPhase::RedFlag) {
    if (rc.redFlagReviewAt >= 0.0 &&
        session.elapsedRaceTime >= rc.redFlagReviewAt) {
      if (RacingConditionsMet(session))
        TransitionRedFlagToSc(session);
      else
        ExtendRedFlag(session);
      rc.redFlagReviewAt = -1.0;
    }
  } else {
    const RedFlagTrigger trigger = EvaluateRedFlagTrigger(session);
    if (trigger.deploy)
      DeployRedFlag(session, trigger);
  }

  if ((rc.flagPhase == FlagPhase::SC || rc.flagPhase == FlagPhase::SCInLap) &&
      !rc.scPitReleaseQueue.empty())
    UpdateScPitRelease(session);

  if (obstructions == 0 && rc.flagPhase != FlagPhase::Green &&
      rc.flagPhase != FlagPhase::RedFlag) {
    bool hazardsInSector = false;
    for (size_t i = 0; i < rc.sectorFlags.size(); ++i) {
      if (rc.sectorFlags[i] > static_cast<int>(SectorFlagLevel::Green))
        hazardsInSector = true;
    }
    if (!hazardsInSector &&
        session.elapsedRaceTime >= rc.fcyHoldUntil &&
        session.elapsedRaceTime >= rc.slowZoneHoldUntil) {
      if (rc.flagPhase == FlagPhase::SCInLap) {
        rc.flagPhase = FlagPhase::Green;
        rc.scRestartUntil = session.elapsedRaceTime + 8.0;
        EmitControlEvent(SimEventType::GreenFlag, session.elapsedRaceTime,
                         "Race control: Green flag");
      } else if (rc.flagPhase == FlagPhase::SC && rc.scLapsRemaining <= 0) {
        rc.flagPhase = FlagPhase::SCInLap;
        EmitControlEvent(SimEventType::SafetyCarInThisLap,
                         session.elapsedRaceTime,
                         "Race control: Safety car in this lap");
      } else if (rc.flagPhase == FlagPhase::FCY) {
        rc.flagPhase = FlagPhase::Green;
        EmitControlEvent(SimEventType::FcyEnd, session.elapsedRaceTime,
                         "Race control: FCY ended");
      } else if (rc.flagPhase == FlagPhase::SlowZone) {
        rc.flagPhase = FlagPhase::Green;
        std::fill(rc.sectorFlags.begin(), rc.sectorFlags.end(),
                  static_cast<int>(SectorFlagLevel::Green));
      }
    }
  }

  if (obstructions > 0 && rc.flagPhase != FlagPhase::RedFlag) {
    if (rc.flagPhase == FlagPhase::Green || rc.flagPhase == FlagPhase::SlowZone) {
      rc.flagPhase = FlagPhase::SlowZone;
      rc.slowZoneHoldUntil =
          std::max(rc.slowZoneHoldUntil,
                   session.elapsedRaceTime + kSlowZoneMinHoldSec);
    }
    if (obstructions >= 1 &&
        (rc.flagPhase == FlagPhase::SlowZone ||
         rc.flagPhase == FlagPhase::Green)) {
      for (Car &car : session.cars) {
        const TrackStatus st = car.rcState().trackStatus;
        if (st != TrackStatus::Stranded && st != TrackStatus::Recovering)
          continue;
        const double structural = ComputeStructuralSeverity(
            car.state().partDamage, car.state().tyreDeflation);
        if (structural >= 70.0 || rc.flagPhase == FlagPhase::SlowZone) {
          if (rc.flagPhase != FlagPhase::FCY && rc.flagPhase != FlagPhase::SC &&
              rc.flagPhase != FlagPhase::SCInLap &&
              rc.flagPhase != FlagPhase::RedFlag) {
            rc.flagPhase = FlagPhase::FCY;
            rc.fcyHoldUntil =
                session.elapsedRaceTime + kFcyMinHoldSec;
            EmitControlEvent(SimEventType::FcyDeploy, session.elapsedRaceTime,
                             "Race control: Full course yellow");
          }
        }
        if (structural >= 85.0 || obstructions >= 2) {
          if (rc.flagPhase != FlagPhase::SC &&
              rc.flagPhase != FlagPhase::SCInLap &&
              rc.flagPhase != FlagPhase::RedFlag) {
            rc.flagPhase = FlagPhase::SC;
            rc.scDeployedAt = session.elapsedRaceTime;
            rc.scDeployedAtLap = session.cars.empty()
                                     ? 0
                                     : session.cars[0].state().currentLap;
            const std::vector<Car *> board = GetLeaderboard(session);
            if (!board.empty()) {
              rc.scReferenceEntryId = board.front()->entryId();
              rc.scDeployedAtLap = board.front()->state().currentLap;
            }
            rc.scLapsRemaining = kScMinLaps;
            EmitControlEvent(SimEventType::SafetyCarDeploy,
                             session.elapsedRaceTime,
                             "Race control: Safety car deployed");
          }
        }
      }
    }
  }

  if (rc.flagPhase == FlagPhase::SC && obstructions == 0 &&
      rc.scLapsRemaining > 0) {
    for (const Car &car : session.cars) {
      if (car.entryId() == rc.scReferenceEntryId &&
          car.state().currentLap > rc.scDeployedAtLap) {
        rc.scLapsRemaining--;
        rc.scDeployedAtLap = car.state().currentLap;
        break;
      }
    }
  }

  if (session.targetDurationSeconds > 3600.0) {
    const double remaining =
        session.targetDurationSeconds - session.elapsedRaceTime;
    rc.whiteFlagActive = remaining > 0.0 && remaining <= 3600.0;
  }

  SyncRaceControlFlags(rc);
}

void UpdatePenalties(RaceSession &session, double deltaTime,
                     const std::vector<TrafficModifiers> &trafficMods) {
  (void)deltaTime;
  const bool noOvertaking =
      session.raceControl.flagPhase == FlagPhase::FCY ||
      session.raceControl.flagPhase == FlagPhase::SC ||
      session.raceControl.flagPhase == FlagPhase::SCInLap ||
      session.raceControl.flagPhase == FlagPhase::RedFlag;

  for (size_t i = 0; i < session.cars.size(); ++i) {
    Car &car = session.cars[i];
    if (car.isRetired() || car.inPitLane())
      continue;

    CarRaceControlState &rc = car.rcState();
    if (i < trafficMods.size())
      rc.blueFlagActive = trafficMods[i].blueFlag;

    if (!noOvertaking && trafficMods[i].blueFlag && trafficMods[i].blocked)
      rc.blueBlockTimer += 0.1;
    else if (rc.blueBlockTimer > 0.0)
      rc.blueBlockTimer = std::max(0.0, rc.blueBlockTimer - 0.2);

    if (rc.blueBlockTimer >= 3.0) {
      rc.blueBlockTimer = 0.0;
      rc.blueFlagStrikes++;
      rc.cleanLapsSinceStrike = 0;
      EmitControlEvent(SimEventType::BlueFlag, session.elapsedRaceTime,
                       car.teamName() + " blue flag strike " +
                           std::to_string(rc.blueFlagStrikes),
                       car.entryId());
      if (rc.blueFlagStrikes == 1) {
        // warning only
      } else if (rc.blueFlagStrikes == 2 &&
                 rc.pendingPenalty == PendingPenalty::None) {
        IssuePenalty(car, PendingPenalty::DriveThrough,
                     "Ignored blue flags", 3, session.elapsedRaceTime);
      } else if (rc.blueFlagStrikes == 3) {
        IssuePenalty(car, PendingPenalty::StopGo, "Repeated blue flags", 2,
                     session.elapsedRaceTime);
      } else if (rc.blueFlagStrikes >= 4) {
        IssuePenalty(car, PendingPenalty::Black, "Excessive blue flags", 2,
                     session.elapsedRaceTime);
      }
    }

    const double structural = ComputeStructuralSeverity(
        car.state().partDamage, car.state().tyreDeflation);
    const double engineHp = PartHealth(car.state().partDamage, DamagePart::Engine);
    const double coolingHp =
        PartHealth(car.state().partDamage, DamagePart::Cooling);
    const bool leaking =
        (engineHp < 25.0 || coolingHp < 25.0) &&
        car.rcState().trackStatus == TrackStatus::Racing;
    if ((structural >= 55.0 || leaking) &&
        car.rcState().trackStatus == TrackStatus::Racing) {
      if (!rc.meatballActive) {
        rc.meatballActive = true;
        rc.meatballDeadlineLap = car.state().currentLap + 3;
        EmitControlEvent(SimEventType::MeatballFlag, session.elapsedRaceTime,
                         car.teamName() + " meatball — pit immediately",
                         car.entryId());
      }
    } else if (rc.meatballActive && structural < 45.0 && !leaking) {
      rc.meatballActive = false;
      rc.meatballDeadlineLap = 0;
    }

    if (rc.meatballActive && rc.meatballDeadlineLap > 0 &&
        car.state().currentLap > rc.meatballDeadlineLap &&
        rc.pendingPenalty == PendingPenalty::None) {
      IssuePenalty(car, PendingPenalty::StopGo, "Ignored meatball flag", 2,
                   session.elapsedRaceTime);
      rc.meatballActive = false;
    }

    if (rc.pendingPenalty != PendingPenalty::None && rc.lapsToComply > 0 &&
        car.state().currentLap > rc.penaltyIssuedLap + rc.lapsToComply) {
      if (rc.pendingPenalty == PendingPenalty::Black) {
        car.markRetired("Disqualified");
        EmitControlEvent(SimEventType::Disqualified, session.elapsedRaceTime,
                         car.teamName() + " disqualified", car.entryId());
      } else {
        IssuePenalty(car, PendingPenalty::Black, "Unserved penalty", 2,
                     session.elapsedRaceTime);
      }
    }
  }
}

void NotifyCarLapComplete(Car &car, RaceSession &session) {
  (void)session;
  CarRaceControlState &rc = car.rcState();
  rc.cleanLapsSinceStrike++;
  const int decayLaps = 5;
  if (rc.cleanLapsSinceStrike >= decayLaps && rc.blueFlagStrikes > 0) {
    rc.blueFlagStrikes--;
    rc.cleanLapsSinceStrike = 0;
  }
}

void ApplyFlagModifiers(RaceSession &session,
                        std::vector<TrafficModifiers> &trafficMods) {
  const SessionRaceControl &rc = session.raceControl;
  const double lapLength = session.track.lapLength();

  const Car *leader = nullptr;
  const Car *scRef = nullptr;
  if (rc.flagPhase == FlagPhase::SC || rc.flagPhase == FlagPhase::SCInLap) {
    for (const Car &car : session.cars) {
      if (car.entryId() == rc.scReferenceEntryId) {
        scRef = &car;
        break;
      }
    }
  }
  const std::vector<Car *> board = GetLeaderboard(session);
  if (!board.empty())
    leader = board.front();

  for (size_t i = 0; i < session.cars.size() && i < trafficMods.size(); ++i) {
    const Car &car = session.cars[i];
    TrafficModifiers &mod = trafficMods[i];
    if (car.isRetired() || car.inPitLane())
      continue;

    if (rc.flagPhase == FlagPhase::RedFlag) {
      const double cap = session.track.pitLane.valid()
                             ? session.track.pitLane.speedLimitMs
                             : kRedFlagOnTrackSpeedCapMs;
      mod.overtaking = false;
      mod.speedCapMs =
          mod.speedCapMs > 0.0 ? std::min(mod.speedCapMs, cap) : cap;
    }

    if (rc.flagPhase == FlagPhase::FCY || rc.flagPhase == FlagPhase::SC ||
        rc.flagPhase == FlagPhase::SCInLap) {
      mod.overtaking = false;
      mod.speedCapMs = mod.speedCapMs > 0.0
                           ? std::min(mod.speedCapMs, kFcySpeedCapMs)
                           : kFcySpeedCapMs;
    }

    if (!rc.sectorFlags.empty() && car.rcState().trackStatus == TrackStatus::Racing) {
      const size_t si = session.track.sectorIndexAtDistance(car.state().currentDistance);
      if (si < rc.sectorFlags.size() &&
          rc.sectorFlags[si] >= static_cast<int>(SectorFlagLevel::Yellow)) {
        const double cap = rc.sectorFlags[si] >=
                                   static_cast<int>(SectorFlagLevel::DoubleYellow)
                               ? kSlowZoneSpeedCapMs - 2.0
                               : kSlowZoneSpeedCapMs;
        mod.speedCapMs =
            mod.speedCapMs > 0.0 ? std::min(mod.speedCapMs, cap) : cap;
        mod.overtaking = false;
      }
    }

    if (rc.flagPhase == FlagPhase::SC && scRef != nullptr &&
        &car != scRef) {
      const double refSpeed = std::max(8.0, scRef->state().currentSpeed);
      mod.speedCapMs = mod.speedCapMs > 0.0
                           ? std::min(mod.speedCapMs, refSpeed * 1.02)
                           : refSpeed * 1.02;
    }

    if (session.elapsedRaceTime < rc.scRestartUntil) {
      const double skill = car.driver().active().rollingStart / 100.0;
      mod.scRestartThrottleBoost = 0.015 + skill * 0.035;
    }

    (void)leader;
    (void)lapLength;
  }
}

void UpdateRedFlagPitProcedure(RaceSession &session) {
  if (session.raceControl.flagPhase != FlagPhase::RedFlag)
    return;

  for (Car &car : session.cars) {
    if (car.isRetired() || car.inPitLane())
      continue;
    car.pit().pendingEnter = true;
    if (!PitPlanHasActiveService(car.pit().plan))
      car.pit().plan = PitStopPlan{};
  }
}

void UpdateScPitRelease(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  if (rc.scPitReleaseQueue.empty())
    return;
  if (session.elapsedRaceTime < rc.scPitReleaseNextAt)
    return;

  const std::string entryId = rc.scPitReleaseQueue.front();
  rc.scPitReleaseQueue.erase(rc.scPitReleaseQueue.begin());

  for (Car &car : session.cars) {
    if (car.entryId() != entryId)
      continue;
    car.clearRedFlagHold();
    if (car.inGarageHold())
      car.releaseFromGarage(session.track);
    break;
  }

  if (!rc.scPitReleaseQueue.empty())
    rc.scPitReleaseNextAt = session.elapsedRaceTime + kScPitReleaseGapSec;
}
