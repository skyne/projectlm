#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "race_control.hpp"
#include "traffic.hpp"

TEST_CASE("Single stranded car escalates to FCY", "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  StrandCarOnTrack(car, session);

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::FCY);
  REQUIRE(session.raceControl.fcyActive);
}

TEST_CASE("Two stranded cars deploy safety car", "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &a = FindCar(session, "entry-1");
  Car &b = FindCar(session, "entry-2");
  a.rcState().trackStatus = TrackStatus::Stranded;
  b.rcState().trackStatus = TrackStatus::Stranded;
  a.rcState().obstructionSectorIndex = 0;
  b.rcState().obstructionSectorIndex = 1;
  REQUIRE(CountTrackObstructions(session) == 2);

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
  REQUIRE(session.raceControl.scActive);
  REQUIRE(session.raceControl.scLapsRemaining == 2);
}

TEST_CASE("FCY clears after obstruction removed and hold expires",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  StrandCarOnTrack(car, session);
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::FCY);

  session.elapsedRaceTime = car.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  session.elapsedRaceTime = car.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(car.isRetired());
  REQUIRE(CountTrackObstructions(session) == 0);

  session.raceControl.fcyHoldUntil = 0.0;
  session.raceControl.slowZoneHoldUntil = 0.0;
  session.raceControl.sectorFlags.assign(session.track.sectors.size(), 0);
  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::Green);
  REQUIRE_FALSE(session.raceControl.fcyActive);
}

TEST_CASE("Collision processing leaves debris on track",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 4.0, 9.0, true)});

  REQUIRE(session.raceControl.hazards.size() == 1);
  REQUIRE(FindCar(session, "entry-1").rcState().collisionWarnings >= 1);
}

TEST_CASE("White flag active in final hour of long race", "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession(7200.0);
  AddTestCar(session);
  session.elapsedRaceTime = 3700.0;

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.whiteFlagActive);
}

TEST_CASE("White flag inactive when more than one hour remains",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession(7200.0);
  AddTestCar(session);
  session.elapsedRaceTime = 3000.0;

  UpdateRaceControl(session, {});

  REQUIRE_FALSE(session.raceControl.whiteFlagActive);
}

TEST_CASE("ApplyFlagModifiers caps speed under FCY and disables overtaking",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.state().currentSpeed = 60.0;
  session.raceControl.flagPhase = FlagPhase::FCY;
  SyncRaceControlFlags(session.raceControl);

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE(mods[0].speedCapMs <= 22.0);
  REQUIRE_FALSE(mods[0].overtaking);
}

TEST_CASE("ApplyFlagModifiers caps speed in double-yellow sector",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.state().currentDistance = session.track.lapLength() * 0.25;
  session.raceControl.sectorFlags = {static_cast<int>(SectorFlagLevel::DoubleYellow),
                                     static_cast<int>(SectorFlagLevel::Green)};

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE(mods[0].speedCapMs <= 18.0);
  REQUIRE_FALSE(mods[0].overtaking);
}

TEST_CASE("ApplyFlagModifiers grants rolling restart throttle boost",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session);
  session.raceControl.scRestartUntil = session.elapsedRaceTime + 5.0;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE(mods[0].scRestartThrottleBoost > 0.0);
}

TEST_CASE("SCInLap sync keeps scActive true", "[unit][race_control][escalation]") {
  SessionRaceControl rc;
  rc.flagPhase = FlagPhase::SCInLap;
  SyncRaceControlFlags(rc);
  REQUIRE(rc.scActive);
  REQUIRE_FALSE(rc.fcyActive);
}
