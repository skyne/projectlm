#include "sim_bridge.hpp"
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
  return obj;
}

Napi::Object EventToObject(Napi::Env env, const SimEvent &event) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("type", EventTypeName(event.type));
  obj.Set("entryId", event.entryId);
  obj.Set("lap", event.lap);
  obj.Set("sectorIndex", event.sectorIndex);
  obj.Set("timestamp", event.timestamp);
  obj.Set("message", event.message);
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
  obj.Set("trackWetness", rc.trackWetness);
  obj.Set("ambientTempC", rc.ambientTempC);
  obj.Set("trackGripEvolution", rc.trackGripEvolution);
  obj.Set("rainIntensity", rc.rainIntensity);
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
    forecast.Set(static_cast<uint32_t>(i), step);
  }
  obj.Set("forecast", forecast);
  return obj;
}

Napi::Value GetRaceControl(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return RaceControlToObject(env, g_bridge.getRaceControl());
}

Napi::Value GetTeamConfig(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return TeamConfigToObject(env);
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
  exports.Set("getTeamConfig", Napi::Function::New(env, GetTeamConfig));
  return exports;
}

} // namespace

NODE_API_MODULE(projectlm_native, Init)
