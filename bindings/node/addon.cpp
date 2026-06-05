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
  obj.Set("hybridDeployMJ", snapshot.hybridDeployMJ);
  obj.Set("engineHealth", snapshot.engineHealth);
  obj.Set("sectorIndex", snapshot.sectorIndex);
  obj.Set("racePosition", snapshot.racePosition);
  obj.Set("inPit", snapshot.inPit);
  obj.Set("retired", snapshot.retired);
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
  return exports;
}

} // namespace

NODE_API_MODULE(projectlm_native, Init)
