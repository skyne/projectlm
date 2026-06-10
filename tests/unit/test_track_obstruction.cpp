#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "car_entity.hpp"
#include "race.hpp"
#include "race_control.hpp"
#include "config_loader.hpp"
#include "../helpers/paths.hpp"

static RaceSession MakeMinimalSession() {
  return MakeMinimalRaceSession();
}

TEST_CASE("Fire is extinguished before tow recovery begins", "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  Car &c = AddTestCar(session);
  c.igniteFire();
  c.state().currentSpeed = 0.0;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::Stranded);
  REQUIRE(c.onFire());

  session.elapsedRaceTime = c.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::Stranded);
  REQUIRE(c.onFire());
  REQUIRE(c.rcState().fireExtinguishEndTime > session.elapsedRaceTime);
  REQUIRE(c.rcState().recoveryEndTime < 0.0);

  session.elapsedRaceTime = c.rcState().fireExtinguishEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE_FALSE(c.onFire());
  REQUIRE(c.rcState().trackStatus == TrackStatus::Recovering);
  REQUIRE(c.rcState().recoveryEndTime > session.elapsedRaceTime);

  session.elapsedRaceTime = c.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::ReturningToGarage);
  REQUIRE_FALSE(c.inGarageRebuild());

  session.elapsedRaceTime = c.rcState().garageHandoverTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE_FALSE(c.isRetired());
  REQUIRE(c.inGarageRebuild());
  REQUIRE(c.rcState().trackStatus == TrackStatus::Cleared);
}

TEST_CASE("Engine failure on track strands instead of instant retire",
          "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  CarConfig car;
  car.fuelTankCapacity = 100.0;
  RaceClass cls{"Hypercar", "Hypercar"};
  AddCar(session, car, cls, "Team A", 1, "1", "entry-1");
  Car &c = session.cars.front();
  c.state().engineHealth = 0.0;
  c.state().currentSpeed = 0.0;

  UpdateTrackObstructions(session, 0.1);

  REQUIRE_FALSE(c.isRetired());
  REQUIRE(c.rcState().trackStatus == TrackStatus::Stranded);
  REQUIRE(c.isOnTrackObstruction());
}

TEST_CASE("Stranded car transitions through recovery to garage rebuild",
          "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  CarConfig car;
  car.fuelTankCapacity = 100.0;
  RaceClass cls{"Hypercar", "Hypercar"};
  AddCar(session, car, cls, "Team A", 1, "1", "entry-1");
  Car &c = session.cars.front();
  c.state().engineHealth = 0.0;
  c.state().currentSpeed = 0.0;

  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::Stranded);

  session.elapsedRaceTime = c.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::Recovering);

  session.elapsedRaceTime = c.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::ReturningToGarage);

  session.elapsedRaceTime = c.rcState().garageHandoverTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE_FALSE(c.isRetired());
  REQUIRE(c.inGarageRebuild());
  REQUIRE(c.rcState().trackStatus == TrackStatus::Cleared);
}

TEST_CASE("Out of fuel tow retires the car in race session", "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  REQUIRE(session.sessionMode == SessionMode::Race);
  Car &c = AddTestCar(session);
  c.state().fuelRemaining = 0.0;
  c.state().currentSpeed = 0.0;
  for (int i = 0; i < 35; ++i)
    UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::Stranded);

  session.elapsedRaceTime = c.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  session.elapsedRaceTime = c.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::ReturningToGarage);
  session.elapsedRaceTime = c.rcState().garageHandoverTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.isRetired());
}

TEST_CASE("Practice out of fuel tow refuels in garage instead of retiring",
          "[unit][obstruction][open_session]") {
  RaceSession session = MakeMinimalSession();
  session.sessionMode = SessionMode::Practice;
  CarConfig carCfg;
  carCfg.fuelTankCapacity = 100.0;
  RaceClass cls{"Hypercar", "Hypercar"};
  AddCar(session, carCfg, cls, "Team A", 1, "1", "entry-1");
  Car &c = session.cars.front();
  c.state().fuelRemaining = 0.0;
  c.state().currentSpeed = 0.0;
  for (int i = 0; i < 35; ++i)
    UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::Stranded);

  session.elapsedRaceTime = c.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  session.elapsedRaceTime = c.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(c.rcState().trackStatus == TrackStatus::ReturningToGarage);
  session.elapsedRaceTime = c.rcState().garageHandoverTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE_FALSE(c.isRetired());
  REQUIRE(c.inGarageRebuild());

  while (c.inGarageRebuild()) {
    c.tickGarageRebuild(session.track, session.elapsedRaceTime, 3600.0);
    session.elapsedRaceTime += 1.0;
  }
  REQUIRE(c.state().fuelRemaining == Catch::Approx(100.0));
  REQUIRE_FALSE(c.inGarageRebuild());
  REQUIRE(c.rcState().trackStatus == TrackStatus::Racing);
}

TEST_CASE("Garage rejoin after tow clears sector flags and allows FCY end",
          "[unit][obstruction][open_session]") {
  RaceSession session = MakeMinimalSession();
  session.sessionMode = SessionMode::Practice;
  CarConfig carCfg;
  carCfg.fuelTankCapacity = 100.0;
  RaceClass cls{"Hypercar", "Hypercar"};
  AddCar(session, carCfg, cls, "Team A", 1, "1", "entry-1");
  Car &c = session.cars.front();
  c.state().fuelRemaining = 0.0;
  c.state().currentSpeed = 0.0;
  for (int i = 0; i < 35; ++i)
    UpdateTrackObstructions(session, 0.1);
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::FCY);

  session.elapsedRaceTime = c.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  session.elapsedRaceTime = c.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(CountTrackObstructions(session) == 0);
  REQUIRE(session.raceControl.sectorFlags[c.rcState().obstructionSectorIndex] ==
          static_cast<int>(SectorFlagLevel::Green));

  while (c.inGarageRebuild()) {
    c.tickGarageRebuild(session.track, session.elapsedRaceTime, 3600.0);
    session.elapsedRaceTime += 1.0;
  }
  REQUIRE(c.rcState().trackStatus == TrackStatus::Racing);

  session.raceControl.fcyHoldUntil = 0.0;
  session.raceControl.slowZoneHoldUntil = 0.0;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::Green);
  REQUIRE_FALSE(session.raceControl.fcyActive);
}

TEST_CASE("Surface hazard reduces local grip", "[unit][hazard]") {
  RaceSession session = MakeMinimalSession();
  SpawnSurfaceHazard(session, 120.0, HazardKind::Oil, "entry-1", 0.65, 25.0);
  const double grip = LocalGripMultiplierAt(session, 120.0, 0.0,
                                            session.track.lapLength());
  REQUIRE(grip < 0.9);
  REQUIRE(grip >= 0.55);
}

TEST_CASE("Overlapping hazards use lowest grip multiplier", "[unit][hazard]") {
  RaceSession session = MakeMinimalSession();
  SpawnSurfaceHazard(session, 100.0, HazardKind::Oil, "entry-1", 0.8, 30.0);
  SpawnSurfaceHazard(session, 105.0, HazardKind::Coolant, "entry-2", 0.55, 30.0);
  const double grip = LocalGripMultiplierAt(session, 102.0, 0.0,
                                            session.track.lapLength());
  REQUIRE(grip == Catch::Approx(0.55).margin(0.01));
}

TEST_CASE("Lateral hazard only affects cars in its lane", "[unit][hazard]") {
  RaceSession session = MakeMinimalSession();
  SpawnSurfaceHazard(session, 120.0, HazardKind::Oil, "entry-1", 0.65, 25.0,
                     4.0, 2.0);
  const double lap = session.track.lapLength();
  REQUIRE(LocalGripMultiplierAt(session, 120.0, 0.0, lap) ==
          Catch::Approx(1.0).margin(0.01));
  REQUIRE(LocalGripMultiplierAt(session, 120.0, 4.0, lap) ==
          Catch::Approx(0.65).margin(0.01));
}

TEST_CASE("Full-width hazard when lateral span is zero", "[unit][hazard]") {
  RaceSession session = MakeMinimalSession();
  SpawnSurfaceHazard(session, 80.0, HazardKind::Debris, "entry-1", 0.7, 20.0,
                     3.0, 0.0);
  const double lap = session.track.lapLength();
  REQUIRE(LocalGripMultiplierAt(session, 80.0, 0.0, lap) ==
          Catch::Approx(0.7).margin(0.01));
  REQUIRE(LocalGripMultiplierAt(session, 80.0, -5.0, lap) ==
          Catch::Approx(0.7).margin(0.01));
}

TEST_CASE("Expired hazards are removed", "[unit][hazard]") {
  RaceSession session = MakeMinimalSession();
  SpawnSurfaceHazard(session, 50.0, HazardKind::Debris, "entry-1", 0.7, 20.0);
  REQUIRE(session.raceControl.hazards.size() == 1);
  session.elapsedRaceTime = session.raceControl.hazards.front().clearAt + 1.0;
  UpdateTrackHazards(session, 0.1);
  REQUIRE(session.raceControl.hazards.empty());
}

TEST_CASE("Out of fuel strands after stopped timer elapses", "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  CarConfig car;
  car.fuelTankCapacity = 100.0;
  RaceClass cls{"Hypercar", "Hypercar"};
  AddCar(session, car, cls, "Team A", 1, "1", "entry-1");
  Car &c = session.cars.front();
  c.state().fuelRemaining = 0.0;
  c.state().currentSpeed = 0.0;

  for (int i = 0; i < 35; ++i)
    UpdateTrackObstructions(session, 0.1);

  REQUIRE(c.rcState().trackStatus == TrackStatus::Stranded);
  REQUIRE(c.rcState().obstructionReason.find("fuel") != std::string::npos);
}

TEST_CASE("Hybrid with deploy energy is not stranded when ICE fuel is empty",
          "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  CarConfig car;
  car.fuelTankCapacity = 100.0;
  car.hybridDeployPowerKW = 50.0;
  car.hybridStintDeployBudgetMJ = 8.0;
  RaceClass cls{"Hypercar", "Hypercar"};
  AddCar(session, car, cls, "Team A", 1, "1", "entry-1");
  Car &c = session.cars.front();
  c.state().fuelRemaining = 0.0;
  c.state().hybridDeployRemainingMJ = 8.0;
  c.state().batteryChargeMJ = 8.0;
  c.state().currentSpeed = 0.0;

  for (int i = 0; i < 35; ++i)
    UpdateTrackObstructions(session, 0.1);

  REQUIRE(c.rcState().trackStatus == TrackStatus::Racing);
}

TEST_CASE("Cars in garage hold are not stranded on engine failure", "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  Car &c = AddTestCar(session);
  c.placeInGarageHold(session.track);
  c.state().engineHealth = 0.0;
  c.state().currentSpeed = 0.0;

  UpdateTrackObstructions(session, 0.1);

  REQUIRE(c.rcState().trackStatus == TrackStatus::Racing);
  REQUIRE_FALSE(c.isOnTrackObstruction());
}

TEST_CASE("Stalled car is obstruction and self-restarts without tow",
          "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  AddTestCar(session, "spin", "Spin Team");
  Car &car = FindCar(session, "spin");
  car.rcState().trackStatus = TrackStatus::Stalled;
  car.rcState().stallRestartAt = 5.0;
  car.state().currentSpeed = 0.0;

  REQUIRE(car.isOnTrackObstruction());
  REQUIRE(CountTrackObstructions(session) == 1);

  UpdateTrackObstructions(session, 0.1);
  REQUIRE(car.rcState().trackStatus == TrackStatus::Stalled);

  session.elapsedRaceTime = 6.0;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(car.rcState().trackStatus == TrackStatus::Racing);
  REQUIRE(car.state().currentSpeed > 0.0);
  REQUIRE_FALSE(car.isOnTrackObstruction());
}

TEST_CASE("CountTrackObstructions ignores cleared and racing cars", "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  AddTestCar(session, "entry-1");
  AddTestCar(session, "entry-2");
  Car &a = FindCar(session, "entry-1");
  Car &b = FindCar(session, "entry-2");
  StrandCarOnTrack(a, session);
  b.rcState().trackStatus = TrackStatus::Recovering;

  REQUIRE(CountTrackObstructions(session) == 2);

  b.rcState().trackStatus = TrackStatus::Cleared;
  REQUIRE(CountTrackObstructions(session) == 1);
}

TEST_CASE("Two engine failures strand both cars on track", "[unit][obstruction]") {
  RaceSession session = MakeMinimalSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &a = FindCar(session, "entry-1");
  Car &b = FindCar(session, "entry-2");
  StrandCarsOnTrack(session, {std::ref(a), std::ref(b)});

  REQUIRE(a.rcState().trackStatus == TrackStatus::Stranded);
  REQUIRE(b.rcState().trackStatus == TrackStatus::Stranded);
  REQUIRE(CountTrackObstructions(session) == 2);
}
