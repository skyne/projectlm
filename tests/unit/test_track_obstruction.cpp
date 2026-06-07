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

TEST_CASE("Stranded car transitions through recovery to retired",
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
  REQUIRE(c.isRetired());
}

TEST_CASE("Surface hazard reduces local grip", "[unit][hazard]") {
  RaceSession session = MakeMinimalSession();
  SpawnSurfaceHazard(session, 120.0, HazardKind::Oil, "entry-1", 0.65, 25.0);
  const double grip = LocalGripMultiplierAt(session, 120.0, session.track.lapLength());
  REQUIRE(grip < 0.9);
  REQUIRE(grip >= 0.55);
}

TEST_CASE("Overlapping hazards use lowest grip multiplier", "[unit][hazard]") {
  RaceSession session = MakeMinimalSession();
  SpawnSurfaceHazard(session, 100.0, HazardKind::Oil, "entry-1", 0.8, 30.0);
  SpawnSurfaceHazard(session, 105.0, HazardKind::Coolant, "entry-2", 0.55, 30.0);
  const double grip = LocalGripMultiplierAt(session, 102.0, session.track.lapLength());
  REQUIRE(grip == Catch::Approx(0.55).margin(0.01));
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
