#include "sim_bridge.hpp"
#include "sim_checkpoint.hpp"
#include "race_control_common.hpp"
#include <napi.h>

namespace {

SimBridge g_bridge;

const char *EventTypeName(SimEventType type) {
  switch (type) {
  case SimEventType::SectorCross:
    return "sector_cross";
  case SimEventType::LapComplete:
    return "lap_complete";
  case SimEventType::PitEnter:
    return "pit_enter";
  case SimEventType::PitExit:
    return "pit_exit";
  case SimEventType::Retirement:
    return "retirement";
  case SimEventType::RaceComplete:
    return "race_complete";
  case SimEventType::Overtake:
    return "overtake";
  case SimEventType::Collision:
    return "collision";
  case SimEventType::Blocked:
    return "blocked";
  case SimEventType::CommandAck:
    return "command_ack";
  case SimEventType::Stranded:
    return "stranded";
  case SimEventType::RecoveryDispatched:
    return "recovery_dispatched";
  case SimEventType::TrackClear:
    return "track_clear";
  case SimEventType::SurfaceHazard:
    return "surface_hazard";
  case SimEventType::SurfaceCleared:
    return "surface_cleared";
  case SimEventType::BlueFlag:
    return "blue_flag";
  case SimEventType::PenaltyIssued:
    return "penalty_issued";
  case SimEventType::PenaltyWarning:
    return "penalty_warning";
  case SimEventType::RacingIncident:
    return "racing_incident";
  case SimEventType::DriveThroughServed:
    return "drive_through_served";
  case SimEventType::StopGoServed:
    return "stop_go_served";
  case SimEventType::MeatballFlag:
    return "meatball_flag";
  case SimEventType::BlackFlag:
    return "black_flag";
  case SimEventType::Disqualified:
    return "disqualified";
  case SimEventType::SlowZone:
    return "slow_zone";
  case SimEventType::FcyDeploy:
    return "fcy_deploy";
  case SimEventType::FcyEnd:
    return "fcy_end";
  case SimEventType::SafetyCarDeploy:
    return "safety_car_deploy";
  case SimEventType::SafetyCarInThisLap:
    return "safety_car_in_this_lap";
  case SimEventType::GreenFlag:
    return "green_flag";
  case SimEventType::WhiteFlag:
    return "white_flag";
  case SimEventType::RedFlagDeploy:
    return "red_flag_deploy";
  case SimEventType::RedFlagExtended:
    return "red_flag_extended";
  case SimEventType::RedFlagEnd:
    return "red_flag_end";
  }
  return "unknown";
}

Napi::Object Vec3ToObject(Napi::Env env, const Vec3 &v) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("x", v.x);
  obj.Set("y", v.y);
  obj.Set("z", v.z);
  return obj;
}

Napi::Array DoubleArray(Napi::Env env, const std::vector<double> &values) {
  Napi::Array array = Napi::Array::New(env, values.size());
  for (size_t i = 0; i < values.size(); ++i)
    array.Set(static_cast<uint32_t>(i), values[i]);
  return array;
}

Napi::Object SnapshotToObject(Napi::Env env, const CarSnapshot &snapshot) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("entryId", snapshot.entryId);
  obj.Set("teamName", snapshot.teamName);
  obj.Set("carNumber", snapshot.carNumber);
  obj.Set("classId", snapshot.classId);
  obj.Set("lap", snapshot.lap);
  obj.Set("distance", snapshot.distance);
  obj.Set("normalizedT", snapshot.normalizedT);
  obj.Set("speed", snapshot.speed);
  obj.Set("rpm", snapshot.rpm);
  obj.Set("fuel", snapshot.fuel);
  obj.Set("tireWear", snapshot.tireWear);
  obj.Set("tireWearFL", snapshot.tireWearFL);
  obj.Set("tireWearFR", snapshot.tireWearFR);
  obj.Set("tireWearRL", snapshot.tireWearRL);
  obj.Set("tireWearRR", snapshot.tireWearRR);
  obj.Set("tireCompound", snapshot.tireCompound);
  obj.Set("tireTempC", snapshot.tireTempC);
  obj.Set("tireTempFL", snapshot.tireTempFL);
  obj.Set("tireTempFR", snapshot.tireTempFR);
  obj.Set("tireTempRL", snapshot.tireTempRL);
  obj.Set("tireTempRR", snapshot.tireTempRR);
  obj.Set("coolantTempC", snapshot.coolantTempC);
  obj.Set("hybridDeployMJ", snapshot.hybridDeployMJ);
  obj.Set("hybridBudgetMJ", snapshot.hybridBudgetMJ);
  obj.Set("hybridStrategy", snapshot.hybridStrategy);
  obj.Set("engineHealth", snapshot.engineHealth);
  obj.Set("sectorIndex", snapshot.sectorIndex);
  obj.Set("racePosition", snapshot.racePosition);
  obj.Set("classPosition", snapshot.classPosition);
  obj.Set("inGarage", snapshot.inGarage);
  obj.Set("inPit", snapshot.inPit);
  obj.Set("pitQueued", snapshot.pitQueued);
  obj.Set("retired", snapshot.retired);
  obj.Set("retireReason", snapshot.retireReason);
  obj.Set("currentLapTime", snapshot.currentLapTime);
  obj.Set("currentSectorTime", snapshot.currentSectorTime);
  obj.Set("lastLapTime", snapshot.lastLapTime);
  obj.Set("bestLapTime", snapshot.bestLapTime);
  obj.Set("gapToLeader", snapshot.gapToLeader);
  obj.Set("currentLapSectorTimes",
          DoubleArray(env, snapshot.currentLapSectorTimes));

  Napi::Array lapHistory = Napi::Array::New(env, snapshot.lapHistory.size());
  for (size_t i = 0; i < snapshot.lapHistory.size(); ++i) {
    Napi::Object lap = Napi::Object::New(env);
    lap.Set("lapNumber", snapshot.lapHistory[i].lapNumber);
    lap.Set("lapTime", snapshot.lapHistory[i].lapTime);
    lap.Set("sectorTimes", DoubleArray(env, snapshot.lapHistory[i].sectorTimes));
    lapHistory.Set(static_cast<uint32_t>(i), lap);
  }
  obj.Set("lapHistory", lapHistory);

  obj.Set("position", Vec3ToObject(env, snapshot.position));
  obj.Set("tangent", Vec3ToObject(env, snapshot.tangent));
  obj.Set("lateralOffset", snapshot.lateralOffset);
  obj.Set("lateralOffsetM", snapshot.lateralOffsetM);
  obj.Set("headingError", snapshot.headingError);
  obj.Set("poseIncludesLateral", snapshot.poseIncludesLateral);
  obj.Set("carLengthM", snapshot.carLengthM);
  obj.Set("carWidthM", snapshot.carWidthM);
  obj.Set("driverName", snapshot.driverName);
  obj.Set("driverMode", snapshot.driverMode);
  obj.Set("driverStamina", snapshot.driverStamina);
  obj.Set("driverPressure", snapshot.driverPressure);
  obj.Set("driverMistakeRisk", snapshot.driverMistakeRisk);
  obj.Set("activeDriverIndex", snapshot.activeDriverIndex);
  if (!snapshot.lastMistakeKind.empty()) {
    obj.Set("lastMistakeKind", snapshot.lastMistakeKind);
    obj.Set("lastMistakeRemainingSec", snapshot.lastMistakeRemainingSec);
    obj.Set("lastMistakeWearPct", snapshot.lastMistakeWearPct);
    if (!snapshot.lastMistakeWheel.empty())
      obj.Set("lastMistakeWheel", snapshot.lastMistakeWheel);
  }
  if (snapshot.wearBoostRemainingSec > 0.0) {
    obj.Set("wearBoostRemainingSec", snapshot.wearBoostRemainingSec);
    obj.Set("wearBoostMultiplier", snapshot.wearBoostMultiplier);
  }

  Napi::Array roster = Napi::Array::New(env, snapshot.driverRoster.size());
  for (size_t i = 0; i < snapshot.driverRoster.size(); ++i) {
    const DriverSnapshot &d = snapshot.driverRoster[i];
    Napi::Object row = Napi::Object::New(env);
    row.Set("name", d.name);
    row.Set("tier", d.tier);
    row.Set("nationality", d.nationality);
    row.Set("dryPace", d.dryPace);
    row.Set("wetPace", d.wetPace);
    row.Set("consistency", d.consistency);
    row.Set("overtaking", d.overtaking);
    row.Set("defending", d.defending);
    row.Set("setupFeedback", d.setupFeedback);
    row.Set("adaptability", d.adaptability);
    row.Set("stamina", d.stamina);
    row.Set("composure", d.composure);
    row.Set("active", d.active);
    roster.Set(static_cast<uint32_t>(i), row);
  }
  obj.Set("driverRoster", roster);

  obj.Set("overtaking", snapshot.overtaking);
  obj.Set("blocked", snapshot.blocked);
  obj.Set("pitRemainingSec", snapshot.pitRemainingSec);
  obj.Set("pitLaneDistance", snapshot.pitLaneDistance);
  obj.Set("setupFeedback", snapshot.setupFeedback);
  obj.Set("wingAngle", snapshot.wingAngle);
  obj.Set("brakeBias", snapshot.brakeBias);
  obj.Set("frontRideHeightMm", snapshot.frontRideHeightMm);
  obj.Set("rearRideHeightMm", snapshot.rearRideHeightMm);
  obj.Set("frontSpringNm", snapshot.frontSpringNm);
  obj.Set("rearSpringNm", snapshot.rearSpringNm);
  obj.Set("frontArbStiffness", snapshot.frontArbStiffness);
  obj.Set("rearArbStiffness", snapshot.rearArbStiffness);
  obj.Set("frontCamberDeg", snapshot.frontCamberDeg);
  obj.Set("rearCamberDeg", snapshot.rearCamberDeg);
  obj.Set("serviceabilityFactor", snapshot.serviceabilityFactor);
  obj.Set("driverChangeFactor", snapshot.driverChangeFactor);
  obj.Set("pitCount", snapshot.pitCount);
  obj.Set("totalPitSeconds", snapshot.totalPitSeconds);
  obj.Set("fuelTankCapacity", snapshot.fuelTankCapacity);
  obj.Set("driverStintSeconds", snapshot.driverStintSeconds);
  obj.Set("maxDriverStintSeconds", snapshot.maxDriverStintSeconds);
  if (!snapshot.partHealth.empty()) {
    Napi::Object ph = Napi::Object::New(env);
    for (const auto &kv : snapshot.partHealth)
      ph.Set(kv.first, kv.second);
    obj.Set("partHealth", ph);
  }
  if (!snapshot.partIrreparable.empty()) {
    Napi::Array ir = Napi::Array::New(env, snapshot.partIrreparable.size());
    for (size_t i = 0; i < snapshot.partIrreparable.size(); ++i)
      ir.Set(static_cast<uint32_t>(i), snapshot.partIrreparable[i]);
    obj.Set("partIrreparable", ir);
  }
  if (!snapshot.partRepairSec.empty()) {
    Napi::Object pr = Napi::Object::New(env);
    for (const auto &kv : snapshot.partRepairSec)
      pr.Set(kv.first, kv.second);
    obj.Set("partRepairSec", pr);
  }
  obj.Set("physicallyRepairable", snapshot.physicallyRepairable);
  obj.Set("sessionRepairable", snapshot.sessionRepairable);
  if (snapshot.totalRepairSec > 0.0)
    obj.Set("totalRepairSec", snapshot.totalRepairSec);
  if (snapshot.remainingSessionSec > 0.0)
    obj.Set("remainingSessionSec", snapshot.remainingSessionSec);
  if (snapshot.garageRebuildActive)
    obj.Set("garageRebuildActive", true);
  if (snapshot.garageRebuildRemainingSec > 0.0)
    obj.Set("garageRebuildRemainingSec", snapshot.garageRebuildRemainingSec);
  if (snapshot.onFire)
    obj.Set("onFire", true);
  if (!snapshot.tyreDeflation.empty()) {
    Napi::Object td = Napi::Object::New(env);
    for (const auto &kv : snapshot.tyreDeflation)
      td.Set(kv.first, kv.second);
    obj.Set("tyreDeflation", td);
  }
  if (!snapshot.limpMode.empty() && snapshot.limpMode != "none")
    obj.Set("limpMode", snapshot.limpMode);
  if (!snapshot.limpReason.empty())
    obj.Set("limpReason", snapshot.limpReason);
  if (snapshot.structuralSeverity > 0.0)
    obj.Set("structuralSeverity", snapshot.structuralSeverity);
  if (snapshot.suspectedIssues)
    obj.Set("suspectedIssues", true);
  if (!snapshot.hiddenFaults.empty()) {
    Napi::Array hf = Napi::Array::New(env, snapshot.hiddenFaults.size());
    for (size_t i = 0; i < snapshot.hiddenFaults.size(); ++i) {
      const auto &fault = snapshot.hiddenFaults[i];
      Napi::Object fo = Napi::Object::New(env);
      fo.Set("id", fault.id);
      fo.Set("kind", fault.kind);
      fo.Set("linkedPart", fault.linkedPart);
      fo.Set("severity", fault.severity);
      fo.Set("revealed", fault.revealed);
      hf.Set(static_cast<uint32_t>(i), fo);
    }
    obj.Set("hiddenFaults", hf);
  }
  if (!snapshot.trackStatus.empty() && snapshot.trackStatus != "racing")
    obj.Set("trackStatus", snapshot.trackStatus);
  if (snapshot.recoveryProgress > 0.0)
    obj.Set("recoveryProgress", snapshot.recoveryProgress);
  if (snapshot.blueFlag)
    obj.Set("blueFlag", true);
  if (snapshot.blueFlagStrikes > 0)
    obj.Set("blueFlagStrikes", snapshot.blueFlagStrikes);
  if (!snapshot.pendingPenalty.empty() && snapshot.pendingPenalty != "none") {
    obj.Set("pendingPenalty", snapshot.pendingPenalty);
    if (!snapshot.penaltyReason.empty())
      obj.Set("penaltyReason", snapshot.penaltyReason);
    if (snapshot.lapsToComply > 0)
      obj.Set("lapsToComply", snapshot.lapsToComply);
  }
  if (snapshot.meatballFlag)
    obj.Set("meatballFlag", true);
  if (snapshot.blackFlag)
    obj.Set("blackFlag", true);
  if (snapshot.collisionWarnings > 0)
    obj.Set("collisionWarnings", snapshot.collisionWarnings);
  if (snapshot.penaltyStopSeconds > 0.0)
    obj.Set("penaltyStopSeconds", snapshot.penaltyStopSeconds);
  if (snapshot.unstableOnTrack)
    obj.Set("unstableOnTrack", true);
  if (snapshot.riskyRejoinSec > 0.0)
    obj.Set("riskyRejoinSec", snapshot.riskyRejoinSec);
  if (snapshot.lastContactSeverity > 0.0)
    obj.Set("lastContactSeverity", snapshot.lastContactSeverity);
  if (!snapshot.surfaceZone.empty())
    obj.Set("surfaceZone", snapshot.surfaceZone);
  return obj;
}

Napi::Object EventToObject(Napi::Env env, const SimEvent &event) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("type", EventTypeName(event.type));
  obj.Set("entryId", event.entryId);
  if (!event.otherEntryId.empty())
    obj.Set("otherEntryId", event.otherEntryId);
  obj.Set("lap", event.lap);
  obj.Set("sectorIndex", event.sectorIndex);
  obj.Set("timestamp", event.timestamp);
  obj.Set("message", event.message);
  if (event.collisionImpact > 0.0)
    obj.Set("collisionImpact", event.collisionImpact);
  if (event.collisionBaseImpact > 0.0)
    obj.Set("collisionBaseImpact", event.collisionBaseImpact);
  if (event.collisionContactSide != 0)
    obj.Set("collisionContactSide", event.collisionContactSide);
  return obj;
}

Napi::Value InitFromRaceConfig(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected race config path string")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  const std::string path = info[0].As<Napi::String>().Utf8Value();
  return Napi::Boolean::New(env, g_bridge.initFromRaceConfig(path));
}

Napi::Value Tick(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected deltaTime number")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_bridge.tick(info[0].As<Napi::Number>().DoubleValue());
  return env.Undefined();
}

Napi::Value GetSnapshots(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  const std::vector<CarSnapshot> snapshots = g_bridge.getSnapshots();
  Napi::Array array = Napi::Array::New(env, snapshots.size());
  for (size_t i = 0; i < snapshots.size(); ++i)
    array.Set(static_cast<uint32_t>(i), SnapshotToObject(env, snapshots[i]));
  return array;
}

Napi::Value DrainEvents(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  const std::vector<SimEvent> events = g_bridge.drainEvents();
  Napi::Array array = Napi::Array::New(env, events.size());
  for (size_t i = 0; i < events.size(); ++i)
    array.Set(static_cast<uint32_t>(i), EventToObject(env, events[i]));
  return array;
}

Napi::Value GetTrackGeometry(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  const TrackGeometry geometry = g_bridge.getTrackGeometry();

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("name", geometry.name);
  obj.Set("lapLength", geometry.lapLength);

  Napi::Array points = Napi::Array::New(env, geometry.points.size());
  for (size_t i = 0; i < geometry.points.size(); ++i) {
    Napi::Object point = Napi::Object::New(env);
    point.Set("x", geometry.points[i].x);
    point.Set("z", geometry.points[i].z);
    points.Set(static_cast<uint32_t>(i), point);
  }
  obj.Set("points", points);

  Napi::Array sectors = Napi::Array::New(env, geometry.sectors.size());
  for (size_t i = 0; i < geometry.sectors.size(); ++i) {
    Napi::Object sector = Napi::Object::New(env);
    sector.Set("name", geometry.sectors[i].name);
    sector.Set("startT", geometry.sectors[i].startT);
    sector.Set("endT", geometry.sectors[i].endT);
    sectors.Set(static_cast<uint32_t>(i), sector);
  }
  obj.Set("sectors", sectors);

  return obj;
}

Napi::Value IsRaceComplete(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, g_bridge.isRaceComplete());
}

Napi::Value ReloadDefinitions(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, g_bridge.reloadDefinitions());
}

Napi::Value RestartRace(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, g_bridge.restartRace());
}

Napi::Value SubmitCommand(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected entryId and command strings")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  const std::string entryId = info[0].As<Napi::String>().Utf8Value();
  const std::string command = info[1].As<Napi::String>().Utf8Value();
  return Napi::Boolean::New(env, g_bridge.submitCommand(entryId, command));
}

Napi::Object TeamConfigToObject(Napi::Env env) {
  const TeamConfig &team = g_bridge.teamConfig();
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("teamName", team.teamName);
  obj.Set("budget", team.budget);
  obj.Set("rdPoints", team.rdPoints);
  obj.Set("playerEntryId", team.playerEntryId);
  obj.Set("seasonYear", team.seasonYear);
  obj.Set("currentRound", team.currentRound);

  Napi::Array staff = Napi::Array::New(env, team.staff.size());
  for (size_t i = 0; i < team.staff.size(); ++i) {
    Napi::Object member = Napi::Object::New(env);
    member.Set("role", team.staff[i].role);
    member.Set("name", team.staff[i].name);
    member.Set("skill", team.staff[i].skill);
    staff.Set(static_cast<uint32_t>(i), member);
  }
  obj.Set("staff", staff);

  Napi::Array parts = Napi::Array::New(env, team.unlockedParts.size());
  for (size_t i = 0; i < team.unlockedParts.size(); ++i)
    parts.Set(static_cast<uint32_t>(i), team.unlockedParts[i]);
  obj.Set("unlockedParts", parts);

  Napi::Array calendar = Napi::Array::New(env, team.calendar.size());
  for (size_t i = 0; i < team.calendar.size(); ++i) {
    Napi::Object event = Napi::Object::New(env);
    event.Set("round", team.calendar[i].round);
    event.Set("trackId", team.calendar[i].trackId);
    event.Set("format", team.calendar[i].format);
    event.Set("completed", team.calendar[i].completed);
    event.Set("championshipPoints", team.calendar[i].championshipPoints);
    calendar.Set(static_cast<uint32_t>(i), event);
  }
  obj.Set("calendar", calendar);
  return obj;
}

Napi::Value GetRaceTime(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, g_bridge.getRaceTime());
}

Napi::Object RaceControlToObject(Napi::Env env, const RaceControlState &rc) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("fcyActive", rc.fcyActive);
  obj.Set("scActive", rc.scActive);
  obj.Set("flagPhase", rc.flagPhase);
  obj.Set("scLapsRemaining", rc.scLapsRemaining);
  obj.Set("obstructionsOnTrack", rc.obstructionsOnTrack);
  obj.Set("whiteFlagActive", rc.whiteFlagActive);
  obj.Set("redFlagActive", rc.redFlagActive);
  obj.Set("redFlagSecondsRemaining", rc.redFlagSecondsRemaining);
  if (!rc.redFlagReason.empty())
    obj.Set("redFlagReason", rc.redFlagReason);
  if (!rc.activeIncidentEntryId.empty())
    obj.Set("activeIncidentEntryId", rc.activeIncidentEntryId);

  Napi::Array sectorFlags =
      Napi::Array::New(env, rc.sectorFlags.size());
  for (size_t i = 0; i < rc.sectorFlags.size(); ++i)
    sectorFlags.Set(static_cast<uint32_t>(i), rc.sectorFlags[i]);
  obj.Set("sectorFlags", sectorFlags);

  Napi::Array hazards = Napi::Array::New(env, rc.surfaceHazards.size());
  for (size_t i = 0; i < rc.surfaceHazards.size(); ++i) {
    Napi::Object hz = Napi::Object::New(env);
    hz.Set("sectorIndex", rc.surfaceHazards[i].sectorIndex);
    hz.Set("kind", rc.surfaceHazards[i].kind);
    hz.Set("gripMultiplier", rc.surfaceHazards[i].gripMultiplier);
    hz.Set("centerDistance", rc.surfaceHazards[i].centerDistance);
    hz.Set("centerLateralM", rc.surfaceHazards[i].centerLateralM);
    hz.Set("spanMeters", rc.surfaceHazards[i].spanMeters);
    hz.Set("lateralSpanM", rc.surfaceHazards[i].lateralSpanM);
    hazards.Set(static_cast<uint32_t>(i), hz);
  }
  obj.Set("surfaceHazards", hazards);

  obj.Set("trackWetness", rc.trackWetness);
  obj.Set("ambientTempC", rc.ambientTempC);
  obj.Set("trackTempC", rc.trackTempC);
  obj.Set("trackGripEvolution", rc.trackGripEvolution);
  obj.Set("rainIntensity", rc.rainIntensity);
  obj.Set("windSpeedMs", rc.windSpeedMs);
  obj.Set("windDirectionDeg", rc.windDirectionDeg);
  obj.Set("visibilityKm", rc.visibilityKm);
  obj.Set("weatherPhase", rc.weatherPhase);
  obj.Set("forecastRainInSeconds", rc.forecastRainInSeconds);
  if (!rc.weatherLabel.empty())
    obj.Set("weatherLabel", rc.weatherLabel);
  if (!rc.weatherBiome.empty())
    obj.Set("weatherBiome", rc.weatherBiome);

  Napi::Array forecast = Napi::Array::New(env, rc.forecast.size());
  for (size_t i = 0; i < rc.forecast.size(); ++i) {
    Napi::Object step = Napi::Object::New(env);
    step.Set("offsetMinutes", rc.forecast[i].offsetMinutes);
    step.Set("phase", rc.forecast[i].phase);
    step.Set("trackWetness", rc.forecast[i].trackWetness);
    step.Set("rainIntensity", rc.forecast[i].rainIntensity);
    step.Set("ambientTempC", rc.forecast[i].ambientTempC);
    step.Set("trackTempC", rc.forecast[i].trackTempC);
    step.Set("windSpeedMs", rc.forecast[i].windSpeedMs);
    step.Set("windDirectionDeg", rc.forecast[i].windDirectionDeg);
    step.Set("visibilityKm", rc.forecast[i].visibilityKm);
    forecast.Set(static_cast<uint32_t>(i), step);
  }
  obj.Set("forecast", forecast);
  return obj;
}

Napi::Value GetRaceControl(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return RaceControlToObject(env, g_bridge.getRaceControl());
}

Napi::Value DebugRaceControl(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject())
    return Napi::String::New(env, "payload object required");

  Napi::Object obj = info[0].As<Napi::Object>();
  DebugRaceControlRequest req;
  if (obj.Has("action"))
    req.action = obj.Get("action").As<Napi::String>().Utf8Value();
  if (obj.Has("phase"))
    req.phase = obj.Get("phase").As<Napi::String>().Utf8Value();
  if (obj.Has("sectorIndex"))
    req.sectorIndex = obj.Get("sectorIndex").As<Napi::Number>().Int32Value();
  if (obj.Has("level"))
    req.level = obj.Get("level").As<Napi::Number>().Int32Value();
  if (obj.Has("entryId"))
    req.entryId = obj.Get("entryId").As<Napi::String>().Utf8Value();
  if (obj.Has("reason"))
    req.reason = obj.Get("reason").As<Napi::String>().Utf8Value();
  if (obj.Has("kind"))
    req.kind = obj.Get("kind").As<Napi::String>().Utf8Value();
  if (obj.Has("gripMultiplier"))
    req.gripMultiplier =
        obj.Get("gripMultiplier").As<Napi::Number>().DoubleValue();
  if (obj.Has("active"))
    req.active = obj.Get("active").As<Napi::Boolean>().Value();

  std::string error;
  if (g_bridge.debugRaceControl(req, &error))
    return env.Null();
  return Napi::String::New(env, error.empty() ? "debug race control failed" : error);
}

Napi::Value GetTeamConfig(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return TeamConfigToObject(env);
}

WeatherPhase ParseWeatherPhaseLocal(const std::string &name) {
  if (name == "Cloudy")
    return WeatherPhase::Cloudy;
  if (name == "LightRain")
    return WeatherPhase::LightRain;
  if (name == "HeavyRain")
    return WeatherPhase::HeavyRain;
  if (name == "Drying")
    return WeatherPhase::Drying;
  return WeatherPhase::Dry;
}

Napi::Object WeatherStateToCheckpointObject(Napi::Env env,
                                            const WeatherState &w) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("trackWetness", w.trackWetness);
  obj.Set("ambientTempC", w.ambientTempC);
  obj.Set("trackTempC", w.trackTempC);
  obj.Set("rainIntensity", w.rainIntensity);
  obj.Set("trackGripEvolution", w.trackGripEvolution);
  obj.Set("windSpeedMs", w.windSpeedMs);
  obj.Set("windDirectionDeg", w.windDirectionDeg);
  obj.Set("visibilityKm", w.visibilityKm);
  obj.Set("phase", WeatherPhaseName(w.phase));
  obj.Set("forecastRainInSeconds", w.forecastRainInSeconds);
  obj.Set("rainEpisodeEndTime", w.rainEpisodeEndTime);
  obj.Set("profileId", w.profileId);
  return obj;
}

WeatherState WeatherStateFromCheckpointObject(const Napi::Object &obj) {
  WeatherState w;
  if (obj.Has("trackWetness"))
    w.trackWetness = obj.Get("trackWetness").As<Napi::Number>().DoubleValue();
  if (obj.Has("ambientTempC"))
    w.ambientTempC = obj.Get("ambientTempC").As<Napi::Number>().DoubleValue();
  if (obj.Has("trackTempC"))
    w.trackTempC = obj.Get("trackTempC").As<Napi::Number>().DoubleValue();
  if (obj.Has("rainIntensity"))
    w.rainIntensity = obj.Get("rainIntensity").As<Napi::Number>().DoubleValue();
  if (obj.Has("trackGripEvolution"))
    w.trackGripEvolution =
        obj.Get("trackGripEvolution").As<Napi::Number>().DoubleValue();
  if (obj.Has("windSpeedMs"))
    w.windSpeedMs = obj.Get("windSpeedMs").As<Napi::Number>().DoubleValue();
  if (obj.Has("windDirectionDeg"))
    w.windDirectionDeg =
        obj.Get("windDirectionDeg").As<Napi::Number>().DoubleValue();
  if (obj.Has("visibilityKm"))
    w.visibilityKm = obj.Get("visibilityKm").As<Napi::Number>().DoubleValue();
  if (obj.Has("phase"))
    w.phase = ParseWeatherPhaseLocal(
        obj.Get("phase").As<Napi::String>().Utf8Value());
  if (obj.Has("forecastRainInSeconds"))
    w.forecastRainInSeconds =
        obj.Get("forecastRainInSeconds").As<Napi::Number>().DoubleValue();
  if (obj.Has("rainEpisodeEndTime"))
    w.rainEpisodeEndTime =
        obj.Get("rainEpisodeEndTime").As<Napi::Number>().DoubleValue();
  if (obj.Has("profileId"))
    w.profileId = obj.Get("profileId").As<Napi::String>().Utf8Value();
  return w;
}

Napi::Object SessionRaceControlToCheckpointObject(Napi::Env env,
                                                  const SessionRaceControl &rc) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("flagPhase", FlagPhaseName(rc.flagPhase));
  obj.Set("fcyActive", rc.fcyActive);
  obj.Set("scActive", rc.scActive);
  obj.Set("fcyHoldUntil", rc.fcyHoldUntil);
  obj.Set("scDeployedAt", rc.scDeployedAt);
  obj.Set("scDeployedAtLap", rc.scDeployedAtLap);
  obj.Set("scLapsRemaining", rc.scLapsRemaining);
  obj.Set("scReferenceEntryId", rc.scReferenceEntryId);
  obj.Set("activeIncidentEntryId", rc.activeIncidentEntryId);
  obj.Set("slowZoneHoldUntil", rc.slowZoneHoldUntil);
  obj.Set("scRestartUntil", rc.scRestartUntil);
  obj.Set("scAwaitingLeaderSfCross", rc.scAwaitingLeaderSfCross);
  obj.Set("whiteFlagActive", rc.whiteFlagActive);
  obj.Set("redFlagActive", rc.redFlagActive);
  obj.Set("redFlagUntil", rc.redFlagUntil);
  obj.Set("redFlagReviewAt", rc.redFlagReviewAt);
  obj.Set("redFlagExtensions", rc.redFlagExtensions);
  obj.Set("redFlagWeatherCause", rc.redFlagWeatherCause);
  obj.Set("redFlagReason", rc.redFlagReason);
  obj.Set("scFormationRestore", rc.scFormationRestore);
  obj.Set("scPitReleaseNextAt", rc.scPitReleaseNextAt);
  Napi::Array sectorFlags = Napi::Array::New(env, rc.sectorFlags.size());
  for (size_t i = 0; i < rc.sectorFlags.size(); ++i)
    sectorFlags.Set(static_cast<uint32_t>(i), rc.sectorFlags[i]);
  obj.Set("sectorFlags", sectorFlags);
  auto stringArray = [&](const std::vector<std::string> &values) {
    Napi::Array arr = Napi::Array::New(env, values.size());
    for (size_t i = 0; i < values.size(); ++i)
      arr.Set(static_cast<uint32_t>(i), values[i]);
    return arr;
  };
  obj.Set("redFlagPitOrder", stringArray(rc.redFlagPitOrder));
  obj.Set("scPitReleaseQueue", stringArray(rc.scPitReleaseQueue));
  obj.Set("scFormationOrder", stringArray(rc.scFormationOrder));
  return obj;
}

SessionRaceControl SessionRaceControlFromCheckpointObject(const Napi::Object &obj) {
  SessionRaceControl rc;
  if (obj.Has("flagPhase"))
    rc.flagPhase =
        ParseFlagPhase(obj.Get("flagPhase").As<Napi::String>().Utf8Value());
  if (obj.Has("fcyActive"))
    rc.fcyActive = obj.Get("fcyActive").As<Napi::Boolean>().Value();
  if (obj.Has("scActive"))
    rc.scActive = obj.Get("scActive").As<Napi::Boolean>().Value();
  if (obj.Has("fcyHoldUntil"))
    rc.fcyHoldUntil = obj.Get("fcyHoldUntil").As<Napi::Number>().DoubleValue();
  if (obj.Has("scDeployedAt"))
    rc.scDeployedAt = obj.Get("scDeployedAt").As<Napi::Number>().DoubleValue();
  if (obj.Has("scDeployedAtLap"))
    rc.scDeployedAtLap =
        obj.Get("scDeployedAtLap").As<Napi::Number>().Int32Value();
  if (obj.Has("scLapsRemaining"))
    rc.scLapsRemaining =
        obj.Get("scLapsRemaining").As<Napi::Number>().Int32Value();
  if (obj.Has("scReferenceEntryId"))
    rc.scReferenceEntryId =
        obj.Get("scReferenceEntryId").As<Napi::String>().Utf8Value();
  if (obj.Has("activeIncidentEntryId"))
    rc.activeIncidentEntryId =
        obj.Get("activeIncidentEntryId").As<Napi::String>().Utf8Value();
  if (obj.Has("slowZoneHoldUntil"))
    rc.slowZoneHoldUntil =
        obj.Get("slowZoneHoldUntil").As<Napi::Number>().DoubleValue();
  if (obj.Has("scRestartUntil"))
    rc.scRestartUntil = obj.Get("scRestartUntil").As<Napi::Number>().DoubleValue();
  if (obj.Has("scAwaitingLeaderSfCross"))
    rc.scAwaitingLeaderSfCross =
        obj.Get("scAwaitingLeaderSfCross").As<Napi::Boolean>().Value();
  if (obj.Has("whiteFlagActive"))
    rc.whiteFlagActive = obj.Get("whiteFlagActive").As<Napi::Boolean>().Value();
  if (obj.Has("redFlagActive"))
    rc.redFlagActive = obj.Get("redFlagActive").As<Napi::Boolean>().Value();
  if (obj.Has("redFlagUntil"))
    rc.redFlagUntil = obj.Get("redFlagUntil").As<Napi::Number>().DoubleValue();
  if (obj.Has("redFlagReviewAt"))
    rc.redFlagReviewAt =
        obj.Get("redFlagReviewAt").As<Napi::Number>().DoubleValue();
  if (obj.Has("redFlagExtensions"))
    rc.redFlagExtensions =
        obj.Get("redFlagExtensions").As<Napi::Number>().Int32Value();
  if (obj.Has("redFlagWeatherCause"))
    rc.redFlagWeatherCause =
        obj.Get("redFlagWeatherCause").As<Napi::Boolean>().Value();
  if (obj.Has("redFlagReason"))
    rc.redFlagReason = obj.Get("redFlagReason").As<Napi::String>().Utf8Value();
  if (obj.Has("scFormationRestore"))
    rc.scFormationRestore =
        obj.Get("scFormationRestore").As<Napi::Boolean>().Value();
  if (obj.Has("scPitReleaseNextAt"))
    rc.scPitReleaseNextAt =
        obj.Get("scPitReleaseNextAt").As<Napi::Number>().DoubleValue();
  if (obj.Has("sectorFlags") && obj.Get("sectorFlags").IsArray()) {
    const Napi::Array arr = obj.Get("sectorFlags").As<Napi::Array>();
    rc.sectorFlags.resize(arr.Length());
    for (uint32_t i = 0; i < arr.Length(); ++i)
      rc.sectorFlags[i] = arr.Get(i).As<Napi::Number>().Int32Value();
  }
  return rc;
}

CarSnapshot SnapshotFromObject(const Napi::Object &obj) {
  CarSnapshot snap;
  if (obj.Has("entryId"))
    snap.entryId = obj.Get("entryId").As<Napi::String>().Utf8Value();
  if (obj.Has("teamName"))
    snap.teamName = obj.Get("teamName").As<Napi::String>().Utf8Value();
  if (obj.Has("carNumber"))
    snap.carNumber = obj.Get("carNumber").As<Napi::String>().Utf8Value();
  if (obj.Has("classId"))
    snap.classId = obj.Get("classId").As<Napi::String>().Utf8Value();
  if (obj.Has("lap"))
    snap.lap = obj.Get("lap").As<Napi::Number>().Int32Value();
  if (obj.Has("distance"))
    snap.distance = obj.Get("distance").As<Napi::Number>().DoubleValue();
  if (obj.Has("normalizedT"))
    snap.normalizedT = obj.Get("normalizedT").As<Napi::Number>().DoubleValue();
  if (obj.Has("speed"))
    snap.speed = obj.Get("speed").As<Napi::Number>().DoubleValue();
  if (obj.Has("rpm"))
    snap.rpm = obj.Get("rpm").As<Napi::Number>().DoubleValue();
  if (obj.Has("fuel"))
    snap.fuel = obj.Get("fuel").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireWear"))
    snap.tireWear = obj.Get("tireWear").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireWearFL"))
    snap.tireWearFL = obj.Get("tireWearFL").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireWearFR"))
    snap.tireWearFR = obj.Get("tireWearFR").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireWearRL"))
    snap.tireWearRL = obj.Get("tireWearRL").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireWearRR"))
    snap.tireWearRR = obj.Get("tireWearRR").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireTempC"))
    snap.tireTempC = obj.Get("tireTempC").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireTempFL"))
    snap.tireTempFL = obj.Get("tireTempFL").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireTempFR"))
    snap.tireTempFR = obj.Get("tireTempFR").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireTempRL"))
    snap.tireTempRL = obj.Get("tireTempRL").As<Napi::Number>().DoubleValue();
  if (obj.Has("tireTempRR"))
    snap.tireTempRR = obj.Get("tireTempRR").As<Napi::Number>().DoubleValue();
  if (obj.Has("coolantTempC"))
    snap.coolantTempC = obj.Get("coolantTempC").As<Napi::Number>().DoubleValue();
  if (obj.Has("hybridDeployMJ"))
    snap.hybridDeployMJ = obj.Get("hybridDeployMJ").As<Napi::Number>().DoubleValue();
  if (obj.Has("engineHealth"))
    snap.engineHealth = obj.Get("engineHealth").As<Napi::Number>().DoubleValue();
  if (obj.Has("sectorIndex"))
    snap.sectorIndex = obj.Get("sectorIndex").As<Napi::Number>().Int32Value();
  if (obj.Has("racePosition"))
    snap.racePosition = obj.Get("racePosition").As<Napi::Number>().Int32Value();
  if (obj.Has("inGarage"))
    snap.inGarage = obj.Get("inGarage").As<Napi::Boolean>().Value();
  if (obj.Has("inPit"))
    snap.inPit = obj.Get("inPit").As<Napi::Boolean>().Value();
  if (obj.Has("pitQueued"))
    snap.pitQueued = obj.Get("pitQueued").As<Napi::Boolean>().Value();
  if (obj.Has("retired"))
    snap.retired = obj.Get("retired").As<Napi::Boolean>().Value();
  if (obj.Has("retireReason"))
    snap.retireReason = obj.Get("retireReason").As<Napi::String>().Utf8Value();
  if (obj.Has("currentLapTime"))
    snap.currentLapTime =
        obj.Get("currentLapTime").As<Napi::Number>().DoubleValue();
  if (obj.Has("currentSectorTime"))
    snap.currentSectorTime =
        obj.Get("currentSectorTime").As<Napi::Number>().DoubleValue();
  if (obj.Has("bestLapTime"))
    snap.bestLapTime = obj.Get("bestLapTime").As<Napi::Number>().DoubleValue();
  if (obj.Has("lateralOffset"))
    snap.lateralOffset = obj.Get("lateralOffset").As<Napi::Number>().DoubleValue();
  if (obj.Has("lateralOffsetM"))
    snap.lateralOffsetM =
        obj.Get("lateralOffsetM").As<Napi::Number>().DoubleValue();
  if (obj.Has("headingError"))
    snap.headingError = obj.Get("headingError").As<Napi::Number>().DoubleValue();
  if (obj.Has("driverMode"))
    snap.driverMode = obj.Get("driverMode").As<Napi::String>().Utf8Value();
  if (obj.Has("driverStamina"))
    snap.driverStamina = obj.Get("driverStamina").As<Napi::Number>().DoubleValue();
  if (obj.Has("driverPressure"))
    snap.driverPressure =
        obj.Get("driverPressure").As<Napi::Number>().DoubleValue();
  if (obj.Has("activeDriverIndex"))
    snap.activeDriverIndex =
        obj.Get("activeDriverIndex").As<Napi::Number>().Int32Value();
  if (obj.Has("overtaking"))
    snap.overtaking = obj.Get("overtaking").As<Napi::Boolean>().Value();
  if (obj.Has("blocked"))
    snap.blocked = obj.Get("blocked").As<Napi::Boolean>().Value();
  if (obj.Has("pitRemainingSec"))
    snap.pitRemainingSec =
        obj.Get("pitRemainingSec").As<Napi::Number>().DoubleValue();
  if (obj.Has("pitLaneDistance"))
    snap.pitLaneDistance =
        obj.Get("pitLaneDistance").As<Napi::Number>().DoubleValue();
  if (obj.Has("wingAngle"))
    snap.wingAngle = obj.Get("wingAngle").As<Napi::Number>().DoubleValue();
  if (obj.Has("brakeBias"))
    snap.brakeBias = obj.Get("brakeBias").As<Napi::Number>().DoubleValue();
  if (obj.Has("pitCount"))
    snap.pitCount = obj.Get("pitCount").As<Napi::Number>().Int32Value();
  if (obj.Has("totalPitSeconds"))
    snap.totalPitSeconds =
        obj.Get("totalPitSeconds").As<Napi::Number>().DoubleValue();
  if (obj.Has("driverStintSeconds"))
    snap.driverStintSeconds =
        obj.Get("driverStintSeconds").As<Napi::Number>().DoubleValue();
  if (obj.Has("maxDriverStintSeconds"))
    snap.maxDriverStintSeconds =
        obj.Get("maxDriverStintSeconds").As<Napi::Number>().DoubleValue();
  if (obj.Has("garageRebuildActive"))
    snap.garageRebuildActive =
        obj.Get("garageRebuildActive").As<Napi::Boolean>().Value();
  if (obj.Has("onFire"))
    snap.onFire = obj.Get("onFire").As<Napi::Boolean>().Value();
  if (obj.Has("trackStatus"))
    snap.trackStatus = obj.Get("trackStatus").As<Napi::String>().Utf8Value();
  if (obj.Has("blueFlag"))
    snap.blueFlag = obj.Get("blueFlag").As<Napi::Boolean>().Value();
  if (obj.Has("blueFlagStrikes"))
    snap.blueFlagStrikes =
        obj.Get("blueFlagStrikes").As<Napi::Number>().Int32Value();
  if (obj.Has("pendingPenalty"))
    snap.pendingPenalty =
        obj.Get("pendingPenalty").As<Napi::String>().Utf8Value();
  if (obj.Has("penaltyReason"))
    snap.penaltyReason = obj.Get("penaltyReason").As<Napi::String>().Utf8Value();
  if (obj.Has("lapsToComply"))
    snap.lapsToComply = obj.Get("lapsToComply").As<Napi::Number>().Int32Value();
  if (obj.Has("meatballFlag"))
    snap.meatballFlag = obj.Get("meatballFlag").As<Napi::Boolean>().Value();
  if (obj.Has("collisionWarnings"))
    snap.collisionWarnings =
        obj.Get("collisionWarnings").As<Napi::Number>().Int32Value();
  if (obj.Has("penaltyStopSeconds"))
    snap.penaltyStopSeconds =
        obj.Get("penaltyStopSeconds").As<Napi::Number>().DoubleValue();
  if (obj.Has("recoveryProgress"))
    snap.recoveryProgress =
        obj.Get("recoveryProgress").As<Napi::Number>().DoubleValue();
  if (obj.Has("unstableOnTrack"))
    snap.unstableOnTrack = obj.Get("unstableOnTrack").As<Napi::Boolean>().Value();
  if (obj.Has("riskyRejoinSec"))
    snap.riskyRejoinSec =
        obj.Get("riskyRejoinSec").As<Napi::Number>().DoubleValue();
  if (obj.Has("lastContactSeverity"))
    snap.lastContactSeverity =
        obj.Get("lastContactSeverity").As<Napi::Number>().DoubleValue();
  if (obj.Has("lastMistakeRemainingSec"))
    snap.lastMistakeRemainingSec =
        obj.Get("lastMistakeRemainingSec").As<Napi::Number>().DoubleValue();
  if (obj.Has("lastMistakeWearPct"))
    snap.lastMistakeWearPct =
        obj.Get("lastMistakeWearPct").As<Napi::Number>().DoubleValue();
  if (obj.Has("wearBoostRemainingSec"))
    snap.wearBoostRemainingSec =
        obj.Get("wearBoostRemainingSec").As<Napi::Number>().DoubleValue();
  if (obj.Has("wearBoostMultiplier"))
    snap.wearBoostMultiplier =
        obj.Get("wearBoostMultiplier").As<Napi::Number>().DoubleValue();
  return snap;
}

SimCheckpointV1 CheckpointFromObject(const Napi::Object &obj) {
  SimCheckpointV1 cp;
  if (obj.Has("version"))
    cp.version = obj.Get("version").As<Napi::Number>().Int32Value();
  if (obj.Has("raceConfigPath"))
    cp.raceConfigPath = obj.Get("raceConfigPath").As<Napi::String>().Utf8Value();
  if (obj.Has("elapsedRaceTime"))
    cp.elapsedRaceTime =
        obj.Get("elapsedRaceTime").As<Napi::Number>().DoubleValue();
  if (obj.Has("rngSeed"))
    cp.rngSeed = obj.Get("rngSeed").As<Napi::Number>().Uint32Value();
  if (obj.Has("sessionMode")) {
    const std::string mode =
        obj.Get("sessionMode").As<Napi::String>().Utf8Value();
    if (mode == "practice")
      cp.sessionMode = SessionMode::Practice;
    else if (mode == "qualifying")
      cp.sessionMode = SessionMode::Qualifying;
    else
      cp.sessionMode = SessionMode::Race;
  }
  if (obj.Has("targetLaps"))
    cp.targetLaps = obj.Get("targetLaps").As<Napi::Number>().Int32Value();
  if (obj.Has("targetDurationSeconds"))
    cp.targetDurationSeconds =
        obj.Get("targetDurationSeconds").As<Napi::Number>().DoubleValue();
  if (obj.Has("trackWetness"))
    cp.trackWetness = obj.Get("trackWetness").As<Napi::Number>().DoubleValue();
  if (obj.Has("weather") && obj.Get("weather").IsObject())
    cp.weather = WeatherStateFromCheckpointObject(obj.Get("weather").As<Napi::Object>());
  if (obj.Has("weatherProfileId"))
    cp.weatherProfileId =
        obj.Get("weatherProfileId").As<Napi::String>().Utf8Value();
  if (obj.Has("weatherLabel"))
    cp.weatherLabel = obj.Get("weatherLabel").As<Napi::String>().Utf8Value();
  if (obj.Has("weatherBiome"))
    cp.weatherBiome = obj.Get("weatherBiome").As<Napi::String>().Utf8Value();
  if (obj.Has("bridgeRngSeed"))
    cp.bridgeRngSeed = obj.Get("bridgeRngSeed").As<Napi::Number>().Uint32Value();
  if (obj.Has("initialTrackWetness"))
    cp.initialTrackWetness =
        obj.Get("initialTrackWetness").As<Napi::Number>().DoubleValue();
  if (obj.Has("initialAmbientTempC"))
    cp.initialAmbientTempC =
        obj.Get("initialAmbientTempC").As<Napi::Number>().DoubleValue();
  if (obj.Has("raceControl") && obj.Get("raceControl").IsObject())
    cp.raceControl = SessionRaceControlFromCheckpointObject(
        obj.Get("raceControl").As<Napi::Object>());
  if (obj.Has("raceCompleteEmitted"))
    cp.raceCompleteEmitted =
        obj.Get("raceCompleteEmitted").As<Napi::Boolean>().Value();
  if (obj.Has("cars") && obj.Get("cars").IsArray()) {
    const Napi::Array arr = obj.Get("cars").As<Napi::Array>();
    cp.cars.reserve(arr.Length());
    for (uint32_t i = 0; i < arr.Length(); ++i)
      cp.cars.push_back(SnapshotFromObject(arr.Get(i).As<Napi::Object>()));
  }
  return cp;
}

Napi::Object CheckpointToObject(Napi::Env env, const SimCheckpointV1 &cp) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("version", cp.version);
  obj.Set("raceConfigPath", cp.raceConfigPath);
  obj.Set("elapsedRaceTime", cp.elapsedRaceTime);
  obj.Set("rngSeed", cp.rngSeed);
  obj.Set("sessionMode",
          cp.sessionMode == SessionMode::Practice
              ? "practice"
              : cp.sessionMode == SessionMode::Qualifying ? "qualifying"
                                                            : "race");
  obj.Set("targetLaps", cp.targetLaps);
  obj.Set("targetDurationSeconds", cp.targetDurationSeconds);
  obj.Set("trackWetness", cp.trackWetness);
  obj.Set("weather", WeatherStateToCheckpointObject(env, cp.weather));
  obj.Set("weatherProfileId", cp.weatherProfileId);
  obj.Set("weatherLabel", cp.weatherLabel);
  obj.Set("weatherBiome", cp.weatherBiome);
  obj.Set("bridgeRngSeed", cp.bridgeRngSeed);
  obj.Set("initialTrackWetness", cp.initialTrackWetness);
  obj.Set("initialAmbientTempC", cp.initialAmbientTempC);
  obj.Set("raceControl", SessionRaceControlToCheckpointObject(env, cp.raceControl));
  obj.Set("raceCompleteEmitted", cp.raceCompleteEmitted);
  Napi::Array cars = Napi::Array::New(env, cp.cars.size());
  for (size_t i = 0; i < cp.cars.size(); ++i)
    cars.Set(static_cast<uint32_t>(i), SnapshotToObject(env, cp.cars[i]));
  obj.Set("cars", cars);
  return obj;
}

Napi::Value ExportCheckpoint(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return CheckpointToObject(env, g_bridge.captureCheckpoint());
}

Napi::Value ImportCheckpoint(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected checkpoint object")
        .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
  std::string error;
  if (!g_bridge.restoreCheckpoint(
          CheckpointFromObject(info[0].As<Napi::Object>()), &error)) {
    Napi::Error::New(env, error.empty() ? "import failed" : error)
        .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
  return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("initFromRaceConfig",
              Napi::Function::New(env, InitFromRaceConfig));
  exports.Set("tick", Napi::Function::New(env, Tick));
  exports.Set("getSnapshots", Napi::Function::New(env, GetSnapshots));
  exports.Set("drainEvents", Napi::Function::New(env, DrainEvents));
  exports.Set("getTrackGeometry", Napi::Function::New(env, GetTrackGeometry));
  exports.Set("isRaceComplete", Napi::Function::New(env, IsRaceComplete));
  exports.Set("reloadDefinitions",
              Napi::Function::New(env, ReloadDefinitions));
  exports.Set("restartRace", Napi::Function::New(env, RestartRace));
  exports.Set("submitCommand", Napi::Function::New(env, SubmitCommand));
  exports.Set("getRaceTime", Napi::Function::New(env, GetRaceTime));
  exports.Set("getRaceControl", Napi::Function::New(env, GetRaceControl));
  exports.Set("debugRaceControl", Napi::Function::New(env, DebugRaceControl));
  exports.Set("getTeamConfig", Napi::Function::New(env, GetTeamConfig));
  exports.Set("exportCheckpoint", Napi::Function::New(env, ExportCheckpoint));
  exports.Set("importCheckpoint", Napi::Function::New(env, ImportCheckpoint));
  return exports;
}

} // namespace

NODE_API_MODULE(projectlm_native, Init)
