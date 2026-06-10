#include "race_control.hpp"
#include "part_damage.hpp"
#include "pit_stop.hpp"
#include "sim_bridge.hpp"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <unordered_map>

void UpdateScPitRelease(RaceSession &session);

namespace {

constexpr double kFcySpeedCapMs = 22.0;
/** Safety-car train pace (~60 km/h) — SC and bunched field. */
constexpr double kScTrainSpeedMs = 60.0 / 3.6;
/** Post–red-flag formation catch-up (~90 km/h), reduced in hazard sectors. */
constexpr double kFormationCatchUpSpeedMs = 90.0 / 3.6;
constexpr double kScWaitGapM = 20.0;
/** SC pace correction: m/s per metre of gap vs target lead distance. */
constexpr double kScGapSpeedGain = 0.12;
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
/** Minimum SC laps after red flag before "SC in this lap" — SC must lead on track. */
constexpr int kScPostRedFlagMinLaps = 1;
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
/** Target gap from train leader to the SC (~realistic SC train spacing). */
constexpr double kScLeadGapM = 75.0;
/** Minimum on-track gap from the SC to the car directly behind it. */
constexpr double kScTrainFollowGapM = 30.0;
constexpr double kScAccelMs2 = 7.0;
constexpr double kScMergeApproachM = 25.0;
constexpr const char *kSafetyCarEntryId = "safety-car";
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
                      const std::string &entryId = "",
                      const std::string &otherEntryId = "") {
  if (g_raceEventOut == nullptr)
    return;
  SimEvent ev;
  ev.type = type;
  ev.timestamp = timestamp;
  ev.message = message;
  if (!entryId.empty())
    ev.entryId = entryId;
  if (!otherEntryId.empty())
    ev.otherEntryId = otherEntryId;
  g_raceEventOut->push_back(std::move(ev));
}

void EnsureSectorFlags(RaceSession &session) {
  const size_t n = session.track.sectors.size();
  if (session.raceControl.sectorFlags.size() != n)
    session.raceControl.sectorFlags.assign(n, static_cast<int>(SectorFlagLevel::Green));
}

void RefreshIncidentSectorFlags(RaceSession &session) {
  EnsureSectorFlags(session);
  std::fill(session.raceControl.sectorFlags.begin(),
            session.raceControl.sectorFlags.end(),
            static_cast<int>(SectorFlagLevel::Green));
  for (const Car &car : session.cars) {
    const TrackStatus st = car.rcState().trackStatus;
    if (st != TrackStatus::Stranded && st != TrackStatus::Recovering)
      continue;
    const int si = car.rcState().obstructionSectorIndex;
    if (si >= 0 &&
        si < static_cast<int>(session.raceControl.sectorFlags.size())) {
      session.raceControl.sectorFlags[si] =
          static_cast<int>(SectorFlagLevel::DoubleYellow);
    }
  }
  for (const TrackSurfaceHazard &hz : session.raceControl.hazards) {
    if (hz.sectorIndex < 0 ||
        hz.sectorIndex >= static_cast<int>(session.raceControl.sectorFlags.size()))
      continue;
    session.raceControl.sectorFlags[hz.sectorIndex] = std::max(
        session.raceControl.sectorFlags[hz.sectorIndex],
        static_cast<int>(SectorFlagLevel::Yellow));
  }
}

void RefreshActiveIncidentEntry(RaceSession &session) {
  for (const Car &car : session.cars) {
    const TrackStatus st = car.rcState().trackStatus;
    if (st == TrackStatus::Stranded || st == TrackStatus::Recovering) {
      session.raceControl.activeIncidentEntryId = car.entryId();
      return;
    }
  }
  session.raceControl.activeIncidentEntryId.clear();
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

bool CooldownReady(std::unordered_map<std::string, double> &cooldowns,
                   const std::string &key, double raceTime, double cooldownSec) {
  const auto it = cooldowns.find(key);
  if (it != cooldowns.end() && raceTime - it->second < cooldownSec)
    return false;
  cooldowns[key] = raceTime;
  return true;
}

void IssuePenalty(Car &car, PendingPenalty penalty, const std::string &reason,
                  int lapsToComply, double raceTime, double stopGoSeconds = 0.0) {
  CarRaceControlState &rc = car.rcState();
  if (rc.pendingPenalty == penalty && rc.penaltyReason == reason)
    return;
  rc.pendingPenalty = penalty;
  rc.penaltyReason = reason;
  rc.penaltyIssuedLap = car.state().currentLap;
  rc.lapsToComply = lapsToComply;
  if (penalty == PendingPenalty::StopGo && stopGoSeconds > 0.0)
    rc.penaltyStopSeconds = stopGoSeconds;
  EmitControlEvent(SimEventType::PenaltyIssued, raceTime,
                   EntryDisplayLabel(car) + ": " + reason + " (" +
                       PendingPenaltyName(penalty) + ")",
                   car.entryId());
}

void IssueCollisionWarning(Car &car, const std::string &reason,
                           double raceTime) {
  CarRaceControlState &rc = car.rcState();
  rc.collisionWarnings++;
  EmitControlEvent(SimEventType::PenaltyWarning, raceTime,
                   EntryDisplayLabel(car) + ": " + reason, car.entryId());
}

Car *FindCarByEntryId(RaceSession &session, const std::string &entryId) {
  for (Car &car : session.cars) {
    if (car.entryId() == entryId)
      return &car;
  }
  return nullptr;
}

bool CanReleaseFromScPitHold(const Car &car) {
  if (car.isRetired() || car.inGarageRebuild())
    return false;
  if (!car.inPitLane() && !car.redFlagHold() && !car.inGarageHold())
    return true;
  if (car.inGarageHold())
    return true;
  return car.inPitLane();
}

Car *PickScReferenceCar(RaceSession &session,
                        const std::vector<std::string> &releaseOrder) {
  for (const std::string &entryId : releaseOrder) {
    Car *car = FindCarByEntryId(session, entryId);
    if (car != nullptr && !car->isRetired() && !car->inGarageRebuild())
      return car;
  }
  const std::vector<Car *> board = GetLeaderboard(session);
  for (Car *car : board) {
    if (car != nullptr && !car->isRetired() && !car->inGarageRebuild())
      return car;
  }
  return board.empty() ? nullptr : board.front();
}

Car *EffectiveScReferenceCar(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  if (rc.scFormationRestore && !rc.scFormationOrder.empty()) {
    for (const std::string &entryId : rc.scFormationOrder) {
      Car *car = FindCarByEntryId(session, entryId);
      if (car != nullptr && !car->isRetired() && !car->inGarageRebuild() &&
          !car->inPitLane())
        return car;
    }
  }
  if (!rc.scReferenceEntryId.empty()) {
    Car *ref = FindCarByEntryId(session, rc.scReferenceEntryId);
    if (ref != nullptr && !ref->isRetired() && !ref->inGarageRebuild() &&
        !ref->inPitLane())
      return ref;
  }
  const std::vector<Car *> board = GetLeaderboard(session);
  for (Car *car : board) {
    if (car != nullptr && !car->isRetired() && !car->inGarageRebuild() &&
        !car->inPitLane())
      return car;
  }
  return nullptr;
}

double RaceDistanceAt(const Car &car, double lapLength) {
  return car.state().currentDistance +
         static_cast<double>(car.state().currentLap) * lapLength;
}

double TrackPositionOnLap(double distance, double lapLength) {
  if (lapLength <= 0.0)
    return 0.0;
  double onLap = std::fmod(distance, lapLength);
  if (onLap < 0.0)
    onLap += lapLength;
  return onLap;
}

double CarTrackPositionOnLap(const Car &car, double lapLength) {
  return TrackPositionOnLap(RaceDistanceAt(car, lapLength), lapLength);
}

double ScTrackPositionOnLap(const SafetyCarState &sc, double lapLength) {
  return TrackPositionOnLap(sc.trackDistance, lapLength);
}

double ForwardOnLapGap(double fromOnLap, double toOnLap, double lapLength) {
  if (lapLength <= 0.0)
    return 0.0;
  double gap = toOnLap - fromOnLap;
  while (gap < 0.0)
    gap += lapLength;
  while (gap >= lapLength)
    gap -= lapLength;
  return gap;
}

struct CarVsScGap {
  bool carAhead = false;
  double metres = 0.0;
};

CarVsScGap GapCarVsScOnLap(double scOnLap, double carOnLap, double lapLength) {
  CarVsScGap out;
  if (lapLength <= 0.0)
    return out;
  const double raw = carOnLap - scOnLap;
  if (raw > lapLength * 0.5) {
    out.carAhead = true;
    out.metres = raw;
    return out;
  }
  if (raw > 0.0) {
    out.carAhead = true;
    out.metres = raw;
    return out;
  }
  if (raw >= -lapLength * 0.5) {
    out.carAhead = false;
    out.metres = -raw;
    return out;
  }
  out.carAhead = false;
  out.metres = lapLength + raw;
  return out;
}

constexpr double kScNoPassBufferM = 15.0;

int FormationOrderIndex(const SessionRaceControl &rc,
                        const std::string &entryId) {
  for (size_t i = 0; i < rc.scFormationOrder.size(); ++i) {
    if (rc.scFormationOrder[i] == entryId)
      return static_cast<int>(i);
  }
  return -1;
}

bool CarCountsForFormation(const Car &car) {
  if (car.isRetired() || car.inGarageRebuild())
    return false;
  const TrackStatus st = car.rcState().trackStatus;
  return st != TrackStatus::Stranded && st != TrackStatus::Recovering;
}

bool CarNeedsFormationCatchUp(const RaceSession &session, const Car &self,
                              double lapLength) {
  const SessionRaceControl &rc = session.raceControl;
  if (!rc.scFormationRestore || rc.scFormationOrder.empty())
    return false;
  const int selfIdx = FormationOrderIndex(rc, self.entryId());
  if (selfIdx < 0 || self.inPitLane() || !CarCountsForFormation(self))
    return false;

  const double selfOnLap = CarTrackPositionOnLap(self, lapLength);
  for (const Car &other : session.cars) {
    if (other.entryId() == self.entryId())
      continue;
    if (!CarCountsForFormation(other) || other.inPitLane())
      continue;
    const int otherIdx = FormationOrderIndex(rc, other.entryId());
    if (otherIdx < 0 || otherIdx <= selfIdx)
      continue;
    const double gap = ForwardOnLapGap(selfOnLap, CarTrackPositionOnLap(other, lapLength),
                                       lapLength);
    if (gap > 0.0 && gap < lapLength * 0.5)
      return true;
  }
  return false;
}

bool SafetyCarLeadingOnTrack(const RaceSession &session) {
  const SafetyCarState &sc = session.raceControl.safetyCar;
  return sc.phase == SafetyCarPhase::OnTrack && !sc.inPit;
}

/** SC is on the racing line (pace car or driving to pit entrance on peel-off). */
bool SafetyCarOnRacingLine(const SafetyCarState &sc) {
  if (sc.inPit)
    return false;
  return sc.phase == SafetyCarPhase::OnTrack ||
         sc.phase == SafetyCarPhase::EnteringPit;
}

bool IsScFormationOrderRestored(const RaceSession &session) {
  const SessionRaceControl &rc = session.raceControl;
  if (!rc.scFormationRestore || rc.scFormationOrder.empty())
    return true;
  if (!rc.scPitReleaseQueue.empty())
    return false;

  const double lapLength = session.track.lapLength();
  std::vector<const Car *> onTrack;
  std::vector<std::string> expected;
  onTrack.reserve(session.cars.size());
  expected.reserve(rc.scFormationOrder.size());

  for (const std::string &entryId : rc.scFormationOrder) {
    const Car *car = nullptr;
    for (const Car &candidate : session.cars) {
      if (candidate.entryId() == entryId) {
        car = &candidate;
        break;
      }
    }
    if (car == nullptr || !CarCountsForFormation(*car))
      continue;
    expected.push_back(entryId);
    if (car->inPitLane())
      return false;
    onTrack.push_back(car);
  }

  if (onTrack.empty() || onTrack.size() != expected.size())
    return false;

  std::sort(onTrack.begin(), onTrack.end(),
            [lapLength](const Car *a, const Car *b) {
              return RaceDistanceAt(*a, lapLength) >
                     RaceDistanceAt(*b, lapLength);
            });

  for (size_t i = 0; i < onTrack.size(); ++i) {
    if (onTrack[i]->entryId() != expected[i])
      return false;
  }
  return true;
}

void InitSafetyCarParked(RaceSession &session) {
  SafetyCarState &sc = session.raceControl.safetyCar;
  sc.phase = SafetyCarPhase::Parked;
  sc.inPit = true;
  sc.currentSpeed = 0.0;
  sc.trackDistance = 0.0;
  sc.currentLap = 0;
  if (session.track.pitLane.valid()) {
    sc.pitLaneDistance = session.track.pitLane.boxDistance;
  } else {
    sc.pitLaneDistance = 0.0;
  }
}

bool CarCountsForScTrainPace(const Car &car) {
  if (car.isRetired() || car.inPitLane())
    return false;
  return car.rcState().trackStatus == TrackStatus::Racing;
}

/** Wrapped on-lap delta: + = SC is ahead of the reference car. */
double DeltaScAheadOnLap(double leaderOnLap, double scOnLap, double lapLength) {
  if (lapLength <= 0.0)
    return 0.0;
  leaderOnLap = TrackPositionOnLap(leaderOnLap, lapLength);
  scOnLap = TrackPositionOnLap(scOnLap, lapLength);
  double delta = scOnLap - leaderOnLap;
  while (delta > lapLength * 0.5)
    delta -= lapLength;
  while (delta < -lapLength * 0.5)
    delta += lapLength;
  return delta;
}

Car *FindScPaceLeader(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  if (!rc.scReferenceEntryId.empty()) {
    Car *ref = FindCarByEntryId(session, rc.scReferenceEntryId);
    if (ref != nullptr && !ref->isRetired() && CarCountsForFormation(*ref))
      return ref;
  }
  return EffectiveScReferenceCar(session);
}

double CarOnLapForScPacing(const Car &car, double lapLength) {
  if (car.inPitLane() || car.inGarageHold())
    return 0.0;
  return CarTrackPositionOnLap(car, lapLength);
}

double ScTrainLeaderOnLap(RaceSession &session) {
  const double lapLength = session.track.lapLength();
  if (lapLength <= 0.0)
    return 0.0;
  if (Car *leader = FindScPaceLeader(session))
    return CarOnLapForScPacing(*leader, lapLength);
  return 0.0;
}

double ScTrainPackSpeed(RaceSession &session) {
  if (Car *leader = FindScPaceLeader(session)) {
    if (CarCountsForScTrainPace(*leader))
      return std::max(4.0, leader->state().currentSpeed);
  }
  return kScTrainSpeedMs * 0.85;
}

double SectorSpeedCapMs(const SessionRaceControl &rc, const RaceSession &session,
                        const Car &car) {
  if (rc.sectorFlags.empty() || car.rcState().trackStatus != TrackStatus::Racing)
    return 0.0;
  const size_t si =
      session.track.sectorIndexAtDistance(car.state().currentDistance);
  if (si >= rc.sectorFlags.size() ||
      rc.sectorFlags[si] < static_cast<int>(SectorFlagLevel::Yellow))
    return 0.0;
  return rc.sectorFlags[si] >= static_cast<int>(SectorFlagLevel::DoubleYellow)
             ? kSlowZoneSpeedCapMs - 2.0
             : kSlowZoneSpeedCapMs;
}

void AdvanceSafetyCarOnTrack(SafetyCarState &sc, RaceSession &session,
                             double deltaTime) {
  const double lapLength = session.track.lapLength();
  if (lapLength <= 0.0)
    return;

  const double leaderOnLap = ScTrainLeaderOnLap(session);
  const double scOnLap = ScTrackPositionOnLap(sc, lapLength);
  const double spacingError =
      DeltaScAheadOnLap(leaderOnLap, scOnLap, lapLength) - kScLeadGapM;

  const double leaderSpeed = ScTrainPackSpeed(session);
  // spacingError > 0 => SC too far ahead — slow (down to 0). < 0 => catch up.
  double desired = leaderSpeed - spacingError * kScGapSpeedGain;
  if (Car *paceLeader = FindScPaceLeader(session)) {
    if ((paceLeader->inPitLane() || paceLeader->inGarageHold()) &&
        DeltaScAheadOnLap(0.0, scOnLap, lapLength) > 1.0) {
      desired = std::min(desired, kScTrainSpeedMs * 0.35);
    }
  }
  desired = std::clamp(desired, 0.0, kScTrainSpeedMs);
  sc.currentSpeed += std::clamp(desired - sc.currentSpeed, -kScAccelMs2 * deltaTime,
                                kScAccelMs2 * deltaTime);

  sc.trackDistance += sc.currentSpeed * deltaTime;
  while (sc.trackDistance >= lapLength) {
    sc.trackDistance -= lapLength;
    sc.currentLap += 1;
  }
}

void ApplyScFormationOvertaking(const RaceSession &session,
                                std::vector<TrafficModifiers> &trafficMods) {
  const SessionRaceControl &rc = session.raceControl;
  if (!rc.scFormationRestore || rc.flagPhase != FlagPhase::SC ||
      rc.scFormationOrder.empty())
    return;

  const double lapLength = session.track.lapLength();

  for (size_t i = 0; i < session.cars.size() && i < trafficMods.size(); ++i) {
    const Car &self = session.cars[i];
    if (!CarCountsForFormation(self) || self.inPitLane())
      continue;
    if (FormationOrderIndex(rc, self.entryId()) < 0)
      continue;

    TrafficModifiers &selfMod = trafficMods[i];
    if (!CarNeedsFormationCatchUp(session, self, lapLength))
      continue;

    double catchUpCap = kFormationCatchUpSpeedMs;
    const double hazardCap = SectorSpeedCapMs(rc, session, self);
    if (hazardCap > 0.0)
      catchUpCap = std::min(catchUpCap, hazardCap);

    selfMod.overtaking = true;
    selfMod.speedCapMs = catchUpCap;
  }
}

void ApplySafetyCarTrainLimits(const RaceSession &session,
                               std::vector<TrafficModifiers> &trafficMods) {
  const SessionRaceControl &rc = session.raceControl;
  if (rc.flagPhase != FlagPhase::SC && rc.flagPhase != FlagPhase::SCInLap)
    return;

  const SafetyCarState &sc = rc.safetyCar;
  if (!SafetyCarOnRacingLine(sc))
    return;

  const double lapLength = session.track.lapLength();
  if (lapLength <= 0.0)
    return;

  const double scOnLap = ScTrackPositionOnLap(sc, lapLength);
  const double scSpeed = std::max(0.0, sc.currentSpeed);
  const bool formationRestore = rc.scFormationRestore;

  for (size_t i = 0; i < session.cars.size() && i < trafficMods.size(); ++i) {
    const Car &car = session.cars[i];
    if (car.isRetired() || car.inPitLane())
      continue;
    if (!CarCountsForFormation(car))
      continue;
    if (formationRestore && CarNeedsFormationCatchUp(session, car, lapLength))
      continue;

    const double carOnLap = CarTrackPositionOnLap(car, lapLength);
    const CarVsScGap gap = GapCarVsScOnLap(scOnLap, carOnLap, lapLength);

    TrafficModifiers &mod = trafficMods[i];
    mod.overtaking = false;

    if (gap.carAhead && gap.metres > 2.0) {
      mod.blocked = true;
      const double capAhead = scSpeed > 1.0 ? scSpeed * 0.97 : 0.0;
      mod.speedCapMs = mod.speedCapMs > 0.0
                           ? std::min(mod.speedCapMs, capAhead)
                           : capAhead;
    } else if (!gap.carAhead) {
      double capBehind = kScTrainSpeedMs;
      if (gap.metres < kScNoPassBufferM * 4.0) {
        capBehind = scSpeed > 1.0 ? std::max(4.0, scSpeed * 1.01) : kScTrainSpeedMs;
      }
      mod.speedCapMs = mod.speedCapMs > 0.0
                           ? std::min(mod.speedCapMs, capBehind)
                           : capBehind;
    }
  }
}

void EnforceSafetyCarTrainPositionsInternal(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  if (rc.flagPhase != FlagPhase::SC && rc.flagPhase != FlagPhase::SCInLap)
    return;
  if (rc.scFormationRestore)
    return;

  const SafetyCarState &sc = rc.safetyCar;
  if (!SafetyCarOnRacingLine(sc))
    return;

  const double lapLength = session.track.lapLength();
  if (lapLength <= 0.0)
    return;

  const double scOnLap = ScTrackPositionOnLap(sc, lapLength);
  const double scSpeed = std::max(0.0, sc.currentSpeed);

  for (Car &car : session.cars) {
    if (car.isRetired() || car.inPitLane() || !CarCountsForFormation(car))
      continue;

    const CarVsScGap gap = GapCarVsScOnLap(
        scOnLap, CarTrackPositionOnLap(car, lapLength), lapLength);
    if (!gap.carAhead || gap.metres <= 1.0)
      continue;

    double hold = scOnLap - kScTrainFollowGapM;
    while (hold < 0.0)
      hold += lapLength;
    while (hold >= lapLength)
      hold -= lapLength;
    car.state().currentDistance = hold;
    car.state().currentSpeed = std::min(car.state().currentSpeed, scSpeed);
  }
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
      "Racing incident — no penalty: " + EntryDisplayLabel(a) + " / " +
          EntryDisplayLabel(b),
      a.entryId());
}

void EmitCollisionLog(RaceSession &session, const Car &a, const Car &b,
                      double impact) {
  const std::string key =
      "collision-log:" + CollisionPairKey(a.entryId(), b.entryId());
  if (!CooldownReady(session.trafficEventCooldowns, key,
                     session.elapsedRaceTime, 5.0))
    return;
  std::ostringstream oss;
  oss << EntryDisplayLabel(a) << " collided with " << EntryDisplayLabel(b)
      << " (impact " << std::fixed << std::setprecision(1) << impact << ")";
  EmitControlEvent(SimEventType::Collision, session.elapsedRaceTime, oss.str(),
                   a.entryId(), b.entryId());
}

bool IsEnergyDepletionReason(const std::string &reason) {
  return reason.find("Out of fuel") != std::string::npos ||
         reason.find("Battery depleted") != std::string::npos;
}

bool ObstructionRecoveryIsForceRetire(const Car &car,
                                      const RaceSession &session) {
  if (car.isRetired())
    return true;
  if (session.sessionMode != SessionMode::Race)
    return false;
  return IsEnergyDepletionReason(car.rcState().obstructionReason);
}

void ClearObstructionCar(Car &car, RaceSession &session) {
  CarRaceControlState &rc = car.rcState();
  rc.trackStatus = TrackStatus::Cleared;
  car.state().currentSpeed = 0.0;
  EmitControlEvent(SimEventType::TrackClear, session.elapsedRaceTime,
                   car.teamName() + " cleared from track", car.entryId());

  if (ObstructionRecoveryIsForceRetire(car, session)) {
    if (!car.isRetired()) {
      car.markRetired(rc.obstructionReason.empty() ? "Retired on track"
                                                   : rc.obstructionReason);
      EmitControlEvent(SimEventType::Retirement, session.elapsedRaceTime,
                       car.teamName() + " retired: " + car.retireReason(),
                       car.entryId());
    }
  } else if (session.sessionMode != SessionMode::Race &&
             IsEnergyDepletionReason(rc.obstructionReason)) {
    car.beginOpenSessionEnergyRecovery(session.track, session.elapsedRaceTime);
    EmitControlEvent(SimEventType::RecoveryDispatched, session.elapsedRaceTime,
                     car.teamName() + " towed to garage for refuel",
                     car.entryId());
  } else {
    const double remaining = RemainingSessionSec(session, car);
    if (car.deliverTowedToGarage(session.track, session.elapsedRaceTime,
                                 remaining)) {
      EmitControlEvent(SimEventType::RecoveryDispatched, session.elapsedRaceTime,
                       car.teamName() + " towed to garage for rebuild",
                       car.entryId());
    } else if (!car.isRetired()) {
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

  session.raceControl.hazards.erase(
      std::remove_if(session.raceControl.hazards.begin(),
                     session.raceControl.hazards.end(),
                     [&](const TrackSurfaceHazard &hz) {
                       return hz.sourceEntryId == car.entryId();
                     }),
      session.raceControl.hazards.end());

  RefreshIncidentSectorFlags(session);
  RefreshActiveIncidentEntry(session);
}

bool ScTrainRulesActive(const SessionRaceControl &rc) {
  return rc.flagPhase == FlagPhase::SC ||
         (rc.flagPhase == FlagPhase::SCInLap && rc.scAwaitingLeaderSfCross);
}

void BeginScRestartAwaitingLeaderSfCross(RaceSession &session) {
  session.raceControl.scAwaitingLeaderSfCross = true;
}

void MaybeCompleteScRestartAtLeaderSfCross(Car &car, RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  if (!rc.scAwaitingLeaderSfCross)
    return;

  const std::vector<Car *> board = GetLeaderboard(session);
  if (board.empty() || board.front()->entryId() != car.entryId())
    return;

  rc.scAwaitingLeaderSfCross = false;
  rc.flagPhase = FlagPhase::Green;
  rc.scRestartUntil = session.elapsedRaceTime + 8.0;
  SyncRaceControlFlags(rc);
  EmitControlEvent(SimEventType::GreenFlag, session.elapsedRaceTime,
                   "Race control: Green flag");
}

} // namespace

void EnforceSafetyCarTrainPositions(RaceSession &session) {
  EnforceSafetyCarTrainPositionsInternal(session);
}

namespace {

double DefaultHazardLateralSpan(HazardKind kind) {
  switch (kind) {
  case HazardKind::Oil:
    return 2.5;
  case HazardKind::Coolant:
    return 3.0;
  case HazardKind::Debris:
    return 3.5;
  case HazardKind::Fuel:
    return 2.5;
  case HazardKind::Fire:
    return 5.0;
  }
  return 3.0;
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

  const double lateralNM =
      car.lateralNM(session.trackWidthM, session.physics.useFrenetDynamics,
                    &session.corridor);
  SpawnSurfaceHazard(session, car.state().currentDistance, hazardKind,
                     car.entryId(), hazardGrip, hazardSpan, lateralNM,
                     DefaultHazardLateralSpan(hazardKind));
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
  InitSafetyCarParked(session);
  SyncRaceControlFlags(session.raceControl);
}

void SyncRaceControlFlags(SessionRaceControl &rc) {
  rc.fcyActive = rc.flagPhase == FlagPhase::FCY;
  rc.scActive = rc.flagPhase == FlagPhase::SC || rc.flagPhase == FlagPhase::SCInLap;
  rc.redFlagActive = rc.flagPhase == FlagPhase::RedFlag;
}

void SpawnSurfaceHazard(RaceSession &session, double distance,
                        HazardKind kind, const std::string &sourceEntryId,
                        double gripMultiplier, double spanMeters,
                        double centerLateralM, double lateralSpanM) {
  for (const TrackSurfaceHazard &existing : session.raceControl.hazards) {
    if (existing.sourceEntryId == sourceEntryId &&
        session.elapsedRaceTime - existing.createdAt < 30.0 &&
        std::abs(existing.centerDistance - distance) < 50.0) {
      return;
    }
  }
  TrackSurfaceHazard hz;
  hz.id = sourceEntryId + "-" + std::to_string(static_cast<int>(distance));
  hz.centerDistance = distance;
  hz.centerLateralM = centerLateralM;
  hz.sectorIndex =
      static_cast<int>(session.track.sectorIndexAtDistance(distance));
  hz.spanMeters = spanMeters;
  hz.lateralSpanM = lateralSpanM;
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

  const size_t hazardsBefore = session.raceControl.hazards.size();
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
  if (session.raceControl.hazards.size() != hazardsBefore)
    RefreshIncidentSectorFlags(session);
}

double LocalGripMultiplierAt(const RaceSession &session, double distance,
                             double lateralNM, double lapLength) {
  if (lapLength <= 0.0)
    return 1.0;
  double best = 1.0;
  const double wrapped = std::fmod(distance, lapLength);
  for (const TrackSurfaceHazard &hz : session.raceControl.hazards) {
    const double center = std::fmod(hz.centerDistance, lapLength);
    double delta = std::abs(wrapped - center);
    if (delta > lapLength * 0.5)
      delta = lapLength - delta;
    if (delta > hz.spanMeters * 0.5)
      continue;

    if (hz.lateralSpanM > 0.0) {
      const double halfLateral = hz.lateralSpanM * 0.5;
      if (std::abs(lateralNM - hz.centerLateralM) > halfLateral)
        continue;
    }

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

int CountFireHazardsOnTrack(const RaceSession &session) {
  int count = 0;
  for (const TrackSurfaceHazard &hz : session.raceControl.hazards) {
    if (hz.kind == HazardKind::Fire)
      ++count;
  }
  return count;
}

bool ShouldRedFlagForFire(const RaceSession &session) {
  const int burningCars = CountBurningCarsOnTrack(session);
  const int fireHazards = CountFireHazardsOnTrack(session);
  if (burningCars >= kRedFlagFireCountThreshold ||
      fireHazards >= kRedFlagFireCountThreshold)
    return true;
  if (burningCars <= 0)
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
    const int fireHazards = CountFireHazardsOnTrack(session);
    trigger.deploy = true;
    trigger.weatherCause = false;
    if (burning >= kRedFlagFireCountThreshold)
      trigger.reason = "Race control: Red flag — multiple car fires (" +
                       std::to_string(burning) + ")";
    else if (fireHazards >= kRedFlagFireCountThreshold)
      trigger.reason = "Race control: Red flag — multiple track fires (" +
                       std::to_string(fireHazards) + ")";
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

bool TrackSafeForRacing(const RaceSession &session) {
  if (CountTrackObstructions(session) > 0)
    return false;
  if (CountBurningCarsOnTrack(session) > 0)
    return false;
  if (CountFireHazardsOnTrack(session) > 0)
    return false;
  if (!SectorFlagsAllGreen(session.raceControl))
    return false;
  if (!WeatherSafeForRacing(session.weather))
    return false;
  return true;
}

bool RacingConditionsMet(const RaceSession &session) {
  if (!TrackSafeForRacing(session))
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
  rc.redFlagPitOrder.clear();
  for (const Car *car : GetLeaderboard(session))
    rc.redFlagPitOrder.push_back(car->entryId());
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
  std::vector<std::string> releaseOrder = rc.redFlagPitOrder;
  if (releaseOrder.empty()) {
    for (const Car *car : board)
      releaseOrder.push_back(car->entryId());
  }
  if (Car *scRef = PickScReferenceCar(session, releaseOrder)) {
    rc.scReferenceEntryId = scRef->entryId();
    rc.scDeployedAtLap = scRef->state().currentLap;
  }
  rc.fcyHoldUntil = session.elapsedRaceTime;
  rc.slowZoneHoldUntil = session.elapsedRaceTime;
  rc.scFormationRestore = true;
  rc.scFormationOrder = releaseOrder;
  rc.scLapsRemaining = kScPostRedFlagMinLaps;
  rc.scPitReleaseQueue.clear();

  for (Car &car : session.cars) {
    if (car.isRetired() || car.inPitLane())
      continue;
    car.pit().pendingEnter = false;
  }
  const auto queueHeldCar = [&](const std::string &entryId) {
    Car *car = FindCarByEntryId(session, entryId);
    if (car == nullptr || car->isRetired())
      return;
    if (!car->inPitLane() && !car->redFlagHold() && !car->inGarageHold())
      return;
    rc.scPitReleaseQueue.push_back(entryId);
  };
  for (const std::string &entryId : releaseOrder) {
    Car *car = FindCarByEntryId(session, entryId);
    if (car == nullptr || car->isRetired())
      continue;
    if (!car->inPitLane() && !car->redFlagHold() && !car->inGarageHold())
      continue;
    if (!car->redFlagEmergencyWorked())
      queueHeldCar(entryId);
  }
  for (const std::string &entryId : releaseOrder) {
    Car *car = FindCarByEntryId(session, entryId);
    if (car == nullptr || car->isRetired())
      continue;
    if (!car->inPitLane() && !car->redFlagHold() && !car->inGarageHold())
      continue;
    if (car->redFlagEmergencyWorked())
      queueHeldCar(entryId);
  }
  rc.redFlagPitOrder.clear();
  rc.scPitReleaseNextAt = session.elapsedRaceTime;
  EmitControlEvent(SimEventType::SafetyCarDeploy, session.elapsedRaceTime,
                   "Race control: Safety car deployed");
  OnSafetyCarDeploy(session);
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
    } else if (!HasDrivableEnergy(car.config(), car.state().fuelRemaining,
                                  car.state().batteryChargeMJ,
                                  car.state().hybridDeployRemainingMJ) &&
               car.state().currentSpeed < kStoppedSpeedThresholdMs) {
      rc.stoppedTimer += deltaTime;
      if (rc.stoppedTimer >= kStoppedStrandSeconds) {
        shouldStrand = true;
        reason = car.config().isBatteryPrimaryEv ? "Battery depleted"
                                                 : "Out of fuel";
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

    const TrafficEvent &ev = *primary;
    EmitCollisionLog(session, *carA, *carB, ev.impact);

    const double debrisN =
        carA->lateralNM(session.trackWidthM, session.physics.useFrenetDynamics,
                        &session.corridor);
    SpawnSurfaceHazard(session, carA->state().currentDistance,
                       HazardKind::Debris, carA->entryId(), 0.62, 35.0,
                       debrisN, DefaultHazardLateralSpan(HazardKind::Debris));

    const bool dualFault = events.size() >= 2;
    if (dualFault) {
      EmitRacingIncident(session, *carA, *carB);
      continue;
    }

    Car *aggressor = carA;
    Car *victim = carB;

    if (IsSideBySideRacingIncident(ev)) {
      EmitRacingIncident(session, *aggressor, *victim);
      continue;
    }

    if (ev.impact < kMinorCollisionImpact &&
        std::abs(victim->lateralOffset()) > kWideLineOffset) {
      IssueCollisionWarning(
          *victim,
          "Warning — ran wide causing contact with " + EntryDisplayLabel(*aggressor),
          session.elapsedRaceTime);
      continue;
    }

    if (ev.impact >= kSevereCollisionImpact) {
      const double stopSec = StopGoSecondsForCollision(ev.impact, victim);
      IssuePenalty(*aggressor, PendingPenalty::StopGo,
                   "Caused a serious collision with " +
                       EntryDisplayLabel(*victim),
                   2, session.elapsedRaceTime, stopSec);
      continue;
    }

    if (ev.closingFromRear && ev.relativeSpeedMs > 6.0) {
      if (aggressor->rcState().collisionWarnings > 0 || ev.impact >= 4.5) {
        IssuePenalty(*aggressor, PendingPenalty::DriveThrough,
                     "Caused collision with " + EntryDisplayLabel(*victim) +
                         " — drive through",
                     3, session.elapsedRaceTime);
      } else {
        IssueCollisionWarning(
            *aggressor,
            "Warning — caused contact from behind with " +
                EntryDisplayLabel(*victim),
            session.elapsedRaceTime);
      }
      continue;
    }

    if (ev.impact >= kMinorCollisionImpact) {
      IssueCollisionWarning(
          *aggressor,
          "Warning — caused avoidable contact with " + EntryDisplayLabel(*victim),
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
      if (TrackSafeForRacing(session)) {
        TransitionRedFlagToSc(session);
      } else {
        ExtendRedFlag(session);
      }
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
      if (rc.flagPhase == FlagPhase::SC && rc.scLapsRemaining <= 0 &&
                 SafetyCarLeadingOnTrack(session) &&
                 (!rc.scFormationRestore ||
                  IsScFormationOrderRestored(session))) {
        rc.scFormationRestore = false;
        rc.scFormationOrder.clear();
        rc.flagPhase = FlagPhase::SCInLap;
        EmitControlEvent(SimEventType::SafetyCarInThisLap,
                         session.elapsedRaceTime,
                         "Race control: Safety car in this lap");
        OnSafetyCarPeelOff(session);
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
            OnSafetyCarDeploy(session);
          }
        }
      }
    }
  }

  if (rc.flagPhase == FlagPhase::SC && obstructions == 0 &&
      rc.scLapsRemaining > 0) {
    if (Car *scRef = EffectiveScReferenceCar(session)) {
      if (scRef->entryId() != rc.scReferenceEntryId)
        rc.scReferenceEntryId = scRef->entryId();
      if (scRef->state().currentLap > rc.scDeployedAtLap) {
        rc.scLapsRemaining--;
        rc.scDeployedAtLap = scRef->state().currentLap;
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
  MaybeCompleteScRestartAtLeaderSfCross(car, session);
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
  const std::vector<Car *> board = GetLeaderboard(session);
  if (!board.empty())
    leader = board.front();

  for (size_t i = 0; i < session.cars.size() && i < trafficMods.size(); ++i) {
    const Car &car = session.cars[i];
    TrafficModifiers &mod = trafficMods[i];
    if (car.isRetired() || car.inPitLane())
      continue;

    if (rc.flagPhase == FlagPhase::RedFlag) {
      mod.overtaking = false;
      mod.speedCapMs = mod.speedCapMs > 0.0
                           ? std::min(mod.speedCapMs, kFcySpeedCapMs)
                           : kFcySpeedCapMs;
    }

    if (rc.flagPhase == FlagPhase::FCY) {
      mod.overtaking = false;
      mod.speedCapMs = mod.speedCapMs > 0.0
                           ? std::min(mod.speedCapMs, kFcySpeedCapMs)
                           : kFcySpeedCapMs;
    }

    if (ScTrainRulesActive(rc)) {
      mod.overtaking = false;
      mod.speedCapMs = mod.speedCapMs > 0.0
                           ? std::min(mod.speedCapMs, kScTrainSpeedMs)
                           : kScTrainSpeedMs;
    }

    const double hazardCap = SectorSpeedCapMs(rc, session, car);
    if (hazardCap > 0.0) {
      mod.speedCapMs =
          mod.speedCapMs > 0.0 ? std::min(mod.speedCapMs, hazardCap) : hazardCap;
      if (!(rc.scFormationRestore && rc.flagPhase == FlagPhase::SC &&
            CarNeedsFormationCatchUp(session, car, lapLength)))
        mod.overtaking = false;
    }

    if (!rc.scAwaitingLeaderSfCross &&
        session.elapsedRaceTime < rc.scRestartUntil) {
      const double skill = car.driver().active().rollingStart / 100.0;
      mod.scRestartThrottleBoost = 0.015 + skill * 0.035;
    }

    (void)leader;
    (void)lapLength;
  }

  ApplyScFormationOvertaking(session, trafficMods);
  ApplySafetyCarTrainLimits(session, trafficMods);
}

void UpdateRedFlagPitProcedure(RaceSession &session) {
  if (session.raceControl.flagPhase != FlagPhase::RedFlag)
    return;

  for (Car &car : session.cars) {
    if (car.isRetired())
      continue;

    PitStopState &pit = car.pit();
    const bool penaltyStop = pit.plan.driveThrough || pit.plan.stopGo;

    if (!car.inPitLane()) {
      pit.pendingEnter = true;
      if (!penaltyStop) {
        SanitizeRedFlagEmergencyPlan(pit.plan, car.config(), car.state(),
                                     car.rcState());
        if (!PitPlanHasActiveService(pit.plan))
          pit.plan = PitStopPlan{};
      }
      continue;
    }

    if (penaltyStop)
      continue;

    SanitizeRedFlagEmergencyPlan(pit.plan, car.config(), car.state(),
                                 car.rcState());
    const bool emergencyService = PitPlanHasActiveService(pit.plan);
    const bool servicing = pit.phase == PitPhase::AtBox && pit.pitDuration > 0.0 &&
                           pit.pitElapsed < pit.pitDuration;

    if (!emergencyService && !servicing) {
      pit.plan = PitStopPlan{};
      pit.pitDuration = 0.0;
      pit.pitElapsed = 0.0;
      pit.skipBoxService = false;
    }

    if (pit.phase == PitPhase::DrivingOut) {
      pit.phase = PitPhase::AtBox;
      if (session.track.pitLane.valid())
        pit.pitLaneDistance = session.track.pitLane.boxDistance;
      car.applyRedFlagHold();
    }
  }
}

static void ReleaseAllCarsFromRaceControlHold(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  rc.scPitReleaseQueue.clear();
  rc.scLapsRemaining = 0;
  rc.redFlagReviewAt = -1.0;
  rc.redFlagUntil = 0.0;
  SyncRaceControlFlags(rc);

  for (Car &car : session.cars) {
    if (car.isRetired() || car.inGarageRebuild())
      continue;
    car.clearRedFlagHold();
    car.pit().pendingEnter = false;
    if (car.inGarageHold())
      car.releaseFromGarage(session.track);
  }
}

void UpdateScPitRelease(RaceSession &session) {
  SessionRaceControl &rc = session.raceControl;
  if (rc.scPitReleaseQueue.empty())
    return;
  if (session.elapsedRaceTime < rc.scPitReleaseNextAt)
    return;

  auto next = std::find_if(
      rc.scPitReleaseQueue.begin(), rc.scPitReleaseQueue.end(),
      [&](const std::string &entryId) {
        Car *car = FindCarByEntryId(session, entryId);
        return car != nullptr && CanReleaseFromScPitHold(*car);
      });
  if (next == rc.scPitReleaseQueue.end()) {
    rc.scPitReleaseNextAt = session.elapsedRaceTime + kScPitReleaseGapSec;
    return;
  }

  Car *target = FindCarByEntryId(session, *next);
  if (target == nullptr || target->isRetired()) {
    rc.scPitReleaseQueue.erase(next);
    return;
  }

  target->clearRedFlagHold();
  bool released = true;
  if (target->inGarageHold())
    released = target->releaseFromGarage(session.track);
  if (!released) {
    rc.scPitReleaseNextAt = session.elapsedRaceTime + kScPitReleaseGapSec;
    return;
  }

  rc.scPitReleaseQueue.erase(next);
  if (!rc.scPitReleaseQueue.empty())
    rc.scPitReleaseNextAt = session.elapsedRaceTime + kScPitReleaseGapSec;
}

void OnSafetyCarDeploy(RaceSession &session) {
  SafetyCarState &sc = session.raceControl.safetyCar;
  if (sc.phase == SafetyCarPhase::OnTrack ||
      sc.phase == SafetyCarPhase::ExitingPit)
    return;

  const PitLaneDefinition &lane = session.track.pitLane;
  sc.phase = SafetyCarPhase::ExitingPit;
  sc.inPit = true;
  sc.currentSpeed = 0.0;
  if (lane.valid()) {
    sc.pitLaneDistance = lane.boxDistance;
  } else {
    sc.phase = SafetyCarPhase::OnTrack;
    sc.inPit = false;
    sc.trackDistance = 0.0;
    sc.currentSpeed = kScTrainSpeedMs * 0.5;
  }
}

void OnSafetyCarPeelOff(RaceSession &session) {
  SafetyCarState &sc = session.raceControl.safetyCar;
  if (sc.phase == SafetyCarPhase::Parked ||
      sc.phase == SafetyCarPhase::EnteringPit)
    return;
  sc.phase = SafetyCarPhase::EnteringPit;
  BeginScRestartAwaitingLeaderSfCross(session);
}

void TickSafetyCar(RaceSession &session, double deltaTime) {
  if (deltaTime <= 0.0)
    return;

  SafetyCarState &sc = session.raceControl.safetyCar;
  const PitLaneDefinition &lane = session.track.pitLane;
  const double lapLength = session.track.lapLength();

  switch (sc.phase) {
  case SafetyCarPhase::Parked:
    sc.inPit = true;
    sc.currentSpeed = 0.0;
    if (lane.valid())
      sc.pitLaneDistance = lane.boxDistance;
    return;

  case SafetyCarPhase::ExitingPit:
    if (!lane.valid()) {
      sc.phase = SafetyCarPhase::OnTrack;
      sc.inPit = false;
      sc.currentSpeed = kScTrainSpeedMs * 0.85;
      return;
    }
    sc.inPit = true;
    sc.currentSpeed = lane.speedLimitMs;
    sc.pitLaneDistance += sc.currentSpeed * deltaTime;
    if (sc.pitLaneDistance < lane.totalLength())
      return;
    sc.pitLaneDistance = lane.totalLength();
    sc.inPit = false;
    sc.trackDistance = lane.mergeTrackDistance;
    sc.currentSpeed = kScTrainSpeedMs * 0.85;
    sc.phase = SafetyCarPhase::OnTrack;
    return;

  case SafetyCarPhase::OnTrack:
    sc.inPit = false;
    AdvanceSafetyCarOnTrack(sc, session, deltaTime);
    return;

  case SafetyCarPhase::EnteringPit:
    if (!lane.valid()) {
      InitSafetyCarParked(session);
      return;
    }
    if (!sc.inPit) {
      // Pit entrance is at track distance 0 (same as car pit entry).
      const double entranceDist = 0.0;
      double forward = entranceDist - sc.trackDistance;
      if (forward < 0.0)
        forward += lapLength;
      if (forward > kScMergeApproachM) {
        sc.currentSpeed = std::min(kScTrainSpeedMs, lane.speedLimitMs);
        sc.trackDistance += sc.currentSpeed * deltaTime;
        if (sc.trackDistance >= lapLength) {
          sc.trackDistance -= lapLength;
          sc.currentLap += 1;
        }
        return;
      }
      sc.inPit = true;
      sc.trackDistance = entranceDist;
      sc.pitLaneDistance = 0.0;
      sc.currentSpeed = lane.speedLimitMs;
      return;
    }
    sc.currentSpeed = lane.speedLimitMs;
    sc.pitLaneDistance += sc.currentSpeed * deltaTime;
    if (sc.pitLaneDistance < lane.boxDistance)
      return;
    sc.pitLaneDistance = lane.boxDistance;
    sc.currentSpeed = 0.0;
    sc.phase = SafetyCarPhase::Parked;
    return;
  }
}

CarSnapshot MakeSafetyCarSnapshot(const RaceSession &session) {
  CarSnapshot snap;
  const SafetyCarState &sc = session.raceControl.safetyCar;
  if (sc.phase == SafetyCarPhase::Parked)
    return snap;

  snap.entryId = kSafetyCarEntryId;
  snap.teamName = "Race Control";
  snap.carNumber = "SC";
  snap.classId = "SafetyCar";
  snap.inPit = sc.inPit;
  snap.pitLaneDistance = sc.inPit ? sc.pitLaneDistance : 0.0;
  snap.lap = sc.currentLap;
  snap.distance = sc.trackDistance;
  snap.speed = sc.currentSpeed;
  snap.carLengthM = 4.8;
  snap.carWidthM = 1.95;

  TrackPose pose;
  if (sc.inPit && session.track.pitLane.valid()) {
    pose = session.track.pitLane.poseAtDistance(sc.pitLaneDistance);
  } else {
    const double lapLength = session.track.lapLength();
    pose = session.track.poseAtRaceDistance(
        sc.trackDistance + static_cast<double>(sc.currentLap) * lapLength);
  }
  snap.position = pose.position;
  snap.tangent = pose.tangent;
  snap.normalizedT = pose.normalizedT;
  snap.sectorIndex =
      static_cast<int>(session.track.sectorIndexAtDistance(sc.trackDistance));
  return snap;
}

bool ApplyDebugRaceControl(RaceSession &session,
                           const DebugRaceControlRequest &req,
                           std::string *errorOut) {
  auto fail = [&](const std::string &msg) {
    if (errorOut)
      *errorOut = msg;
    return false;
  };

  SessionRaceControl &rc = session.raceControl;
  EnsureSectorFlags(session);

  if (req.action == "flag_phase") {
    const FlagPhase phase = ParseFlagPhase(req.phase);
    rc.flagPhase = phase;
    if (phase == FlagPhase::SC)
      rc.scLapsRemaining = std::max(rc.scLapsRemaining, kScMinLaps);
    if (phase == FlagPhase::RedFlag) {
      SetRedFlagPeriod(rc, session.elapsedRaceTime, kRedFlagObstructionPeriodSec,
                       false);
    }
    SyncRaceControlFlags(rc);
    switch (phase) {
    case FlagPhase::Green:
      rc.scAwaitingLeaderSfCross = false;
      ReleaseAllCarsFromRaceControlHold(session);
      InitSafetyCarParked(session);
      EmitControlEvent(SimEventType::GreenFlag, session.elapsedRaceTime,
                       "Debug race control: green flag");
      break;
    case FlagPhase::SlowZone:
      EmitControlEvent(SimEventType::SlowZone, session.elapsedRaceTime,
                       "Debug race control: slow zone");
      break;
    case FlagPhase::FCY:
      rc.fcyHoldUntil = session.elapsedRaceTime + kFcyMinHoldSec;
      EmitControlEvent(SimEventType::FcyDeploy, session.elapsedRaceTime,
                       "Debug race control: full course yellow");
      break;
    case FlagPhase::SC:
      rc.scDeployedAt = session.elapsedRaceTime;
      rc.scDeployedAtLap =
          session.cars.empty() ? 0 : session.cars[0].state().currentLap;
      {
        const std::vector<Car *> board = GetLeaderboard(session);
        if (!board.empty()) {
          rc.scReferenceEntryId = board.front()->entryId();
          rc.scDeployedAtLap = board.front()->state().currentLap;
        }
      }
      EmitControlEvent(SimEventType::SafetyCarDeploy, session.elapsedRaceTime,
                       "Debug race control: safety car deployed");
      OnSafetyCarDeploy(session);
      break;
    case FlagPhase::SCInLap:
      EmitControlEvent(SimEventType::SafetyCarInThisLap,
                       session.elapsedRaceTime,
                       "Debug race control: safety car in this lap");
      OnSafetyCarPeelOff(session);
      break;
    case FlagPhase::RedFlag:
      EmitControlEvent(SimEventType::RedFlagDeploy, session.elapsedRaceTime,
                       "Debug race control: red flag");
      break;
    }
    return true;
  }

  if (req.action == "sector_flag") {
    if (req.sectorIndex < 0 ||
        req.sectorIndex >= static_cast<int>(rc.sectorFlags.size()))
      return fail("invalid sector");
    rc.sectorFlags[req.sectorIndex] =
        std::clamp(req.level, 0, static_cast<int>(SectorFlagLevel::DoubleYellow));
    return true;
  }

  if (req.action == "strand_car") {
    if (req.entryId.empty())
      return fail("entryId required");
    for (Car &car : session.cars) {
      if (car.entryId() != req.entryId)
        continue;
      if (car.isRetired())
        return fail("car retired");
      if (car.inPitLane() || car.inGarageHold())
        return fail("car not on track");
      StrandStoppedCar(
          car, session,
          req.reason.empty() ? "Debug incident" : req.reason);
      return true;
    }
    return fail("entry not found");
  }

  if (req.action == "clear_track") {
    for (Car &car : session.cars) {
      const TrackStatus st = car.rcState().trackStatus;
      if (st == TrackStatus::Stranded || st == TrackStatus::Recovering)
        ClearObstructionCar(car, session);
    }
    rc.hazards.clear();
    std::fill(rc.sectorFlags.begin(), rc.sectorFlags.end(),
              static_cast<int>(SectorFlagLevel::Green));
    rc.activeIncidentEntryId.clear();
    if (rc.flagPhase != FlagPhase::RedFlag) {
      rc.flagPhase = FlagPhase::Green;
      SyncRaceControlFlags(rc);
      ReleaseAllCarsFromRaceControlHold(session);
      EmitControlEvent(SimEventType::GreenFlag, session.elapsedRaceTime,
                       "Debug race control: track cleared");
    }
    return true;
  }

  if (req.action == "spawn_hazard") {
    if (req.sectorIndex < 0 ||
        req.sectorIndex >= static_cast<int>(session.track.sectors.size()))
      return fail("invalid sector");
    const double sectorStart =
        session.track.sectors[static_cast<size_t>(req.sectorIndex)].startDistance;
    const double sectorEnd =
        session.track.sectors[static_cast<size_t>(req.sectorIndex)].endDistance;
    const double distance = (sectorStart + sectorEnd) * 0.5;
    const double debugSpan =
        req.lateralSpanM > 0.0 ? req.lateralSpanM
                               : (req.lateralNM != 0.0 ? 3.0 : 0.0);
    SpawnSurfaceHazard(session, distance, ParseHazardKind(req.kind), "debug",
                       req.gripMultiplier > 0.0 ? req.gripMultiplier : 0.7,
                       35.0, req.lateralNM, debugSpan);
    return true;
  }

  if (req.action == "clear_hazards") {
    rc.hazards.clear();
    RefreshIncidentSectorFlags(session);
    EmitControlEvent(SimEventType::SurfaceCleared, session.elapsedRaceTime,
                     "Debug race control: surface hazards cleared");
    return true;
  }

  if (req.action == "white_flag") {
    rc.whiteFlagActive = req.active;
    if (req.active)
      EmitControlEvent(SimEventType::WhiteFlag, session.elapsedRaceTime,
                       "Debug race control: white flag");
    return true;
  }

  return fail("unknown action: " + req.action);
}
