#ifndef RACE_CONTROL_FIXTURE_HPP
#define RACE_CONTROL_FIXTURE_HPP

#include "car_entity.hpp"
#include "part_damage.hpp"
#include "race.hpp"
#include "race_control.hpp"
#include "traffic.hpp"
#include <functional>
#include <stdexcept>
#include <vector>

inline RaceSession MakeMinimalRaceSession(double targetDurationSeconds = 3600.0) {
  RaceSession session;
  session.track.spline.setControlPoints(
      {{0, 0, 0}, {500, 0, 0}, {500, 500, 0}, {0, 500, 0}}, true);
  session.track.spline.build(5.0);
  session.track.sectors.push_back(
      {"S1", 0.0, session.track.lapLength() * 0.5, 0.0, 0.5, 80.0, true});
  session.track.sectors.push_back(
      {"S2", session.track.lapLength() * 0.5, session.track.lapLength(), 0.5,
       1.0, 80.0, true});
  session.physics.minSpeed = 1.0;
  session.targetDurationSeconds = targetDurationSeconds;
  InitSessionCorridor(session);
  InitSessionRaceControl(session);
  return session;
}

/** ~7 km lap — spread obstructions should not trigger red flag at count 2. */
inline RaceSession MakeLongRaceSession(double targetDurationSeconds = 3600.0) {
  RaceSession session;
  session.track.spline.setControlPoints(
      {{0, 0, 0}, {1750, 0, 0}, {1750, 1750, 0}, {0, 1750, 0}}, true);
  session.track.spline.build(5.0);
  session.track.sectors.push_back(
      {"S1", 0.0, session.track.lapLength() * 0.5, 0.0, 0.5, 80.0, true});
  session.track.sectors.push_back(
      {"S2", session.track.lapLength() * 0.5, session.track.lapLength(), 0.5,
       1.0, 80.0, true});
  session.physics.minSpeed = 1.0;
  session.targetDurationSeconds = targetDurationSeconds;
  InitSessionCorridor(session);
  InitSessionRaceControl(session);
  return session;
}

inline void AddMinimalPitLane(RaceSession &session) {
  session.track.pitLane.spline.setControlPoints(
      {{100, -20, 0}, {200, -20, 0}, {300, -20, 0}}, false);
  session.track.pitLane.spline.build(2.0);
  session.track.pitLane.boxDistance = 150.0;
  session.track.pitLane.mergeTrackDistance = 50.0;
  session.track.pitLane.speedLimitMs = 60.0 / 3.6;
}

inline Car &FindCar(RaceSession &session, const std::string &entryId) {
  for (Car &car : session.cars) {
    if (car.entryId() == entryId)
      return car;
  }
  throw std::runtime_error("missing car: " + entryId);
}

inline Car &AddTestCar(RaceSession &session, const std::string &entryId = "entry-1",
                       const std::string &teamName = "Team A") {
  CarConfig car;
  car.fuelTankCapacity = 100.0;
  RaceClass cls{"Hypercar", "Hypercar"};
  AddCar(session, car, cls, teamName, 1, "1", entryId);
  InitPartDamageState(session.cars.back().state().partDamage);
  return session.cars.back();
}

inline void StrandCarOnTrack(Car &car, RaceSession &session) {
  car.state().engineHealth = 0.0;
  car.state().currentSpeed = 0.0;
  UpdateTrackObstructions(session, 0.1);
}

/** Strand multiple cars in one obstruction tick (avoids partial flag state). */
inline void StrandCarsOnTrack(RaceSession &session,
                              const std::vector<std::reference_wrapper<Car>> &cars) {
  for (Car &car : cars) {
    car.state().engineHealth = 0.0;
    car.state().currentSpeed = 0.0;
  }
  UpdateTrackObstructions(session, 0.1);
}

inline void SetHighStructuralDamage(Car &car) {
  InitPartDamageState(car.state().partDamage);
  for (int i = 0; i < static_cast<int>(DamagePart::Count); ++i) {
    if (i == static_cast<int>(DamagePart::Engine))
      car.state().partDamage.health[i] = 15.0;
    else if (IsBodyDamagePart(static_cast<DamagePart>(i)))
      car.state().partDamage.health[i] = 25.0;
    else
      car.state().partDamage.health[i] = 80.0;
  }
}

/** Right-side (FR+RR) or left-side (FL+RL) at 0% — matches fatal crash retirement rule. */
inline void ApplyCatastrophicSameSideLoss(Car &car, bool rightSide = true) {
  InitPartDamageState(car.state().partDamage);
  PartDamageState &d = car.state().partDamage;
  const DamagePart bodyA = rightSide ? DamagePart::BodyFR : DamagePart::BodyFL;
  const DamagePart bodyB = rightSide ? DamagePart::BodyRR : DamagePart::BodyRL;
  const DamagePart suspA = rightSide ? DamagePart::SuspFR : DamagePart::SuspFL;
  const DamagePart suspB = rightSide ? DamagePart::SuspRR : DamagePart::SuspRL;
  d.health[DamagePartIndex(bodyA)] = 0.0;
  d.health[DamagePartIndex(bodyB)] = 0.0;
  d.health[DamagePartIndex(suspA)] = 0.0;
  d.health[DamagePartIndex(suspB)] = 0.0;
  d.irreparable[DamagePartIndex(suspA)] = true;
  d.irreparable[DamagePartIndex(suspB)] = true;
}

inline std::vector<TrafficModifiers> TrafficModsFor(RaceSession &session) {
  return std::vector<TrafficModifiers>(session.cars.size());
}

inline void SimulateBlueBlock(Car &car, RaceSession &session, int ticks) {
  (void)car;
  auto mods = TrafficModsFor(session);
  for (int t = 0; t < ticks; ++t) {
    mods[0].blueFlag = true;
    mods[0].blocked = true;
    UpdatePenalties(session, 0.1, mods);
  }
}

inline TrafficEvent MakeCollisionEvent(const std::string &aggressorId,
                                       const std::string &otherId,
                                       double impact, double relativeSpeedMs,
                                       bool closingFromRear,
                                       double lateralSepM = 1.2) {
  TrafficEvent ev;
  ev.type = TrafficEvent::Type::Collision;
  ev.entryId = aggressorId;
  ev.otherEntryId = otherId;
  ev.impact = impact;
  ev.relativeSpeedMs = relativeSpeedMs;
  ev.lateralSepM = lateralSepM;
  ev.closingFromRear = closingFromRear;
  ev.message = "test collision";
  return ev;
}

#endif
