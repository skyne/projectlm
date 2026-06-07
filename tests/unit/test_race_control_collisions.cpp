#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "race_control.hpp"
#include "traffic.hpp"

TEST_CASE("Dual collision reports are treated as a racing incident",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 3.0, 7.0, true),
       MakeCollisionEvent("entry-2", "entry-1", 2.8, 6.5, true)});

  Car &a = FindCar(session, "entry-1");
  Car &b = FindCar(session, "entry-2");
  REQUIRE(a.rcState().pendingPenalty == PendingPenalty::None);
  REQUIRE(b.rcState().pendingPenalty == PendingPenalty::None);
  REQUIRE(a.rcState().collisionWarnings == 0);
  REQUIRE(b.rcState().collisionWarnings == 0);
}

TEST_CASE("Driver running wide receives a warning not a stop-go",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &victim = FindCar(session, "entry-2");
  victim.setLateralOffset(0.45);

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 2.0, 7.0, true, 1.4)});

  REQUIRE(victim.rcState().collisionWarnings == 1);
  REQUIRE(victim.rcState().pendingPenalty == PendingPenalty::None);
  REQUIRE(FindCar(session, "entry-1").rcState().pendingPenalty ==
          PendingPenalty::None);
}

TEST_CASE("Clear rear-end contact escalates warning to drive-through",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &aggressor = FindCar(session, "entry-1");

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 3.6, 8.0, true)});
  REQUIRE(aggressor.rcState().collisionWarnings == 1);
  REQUIRE(aggressor.rcState().pendingPenalty == PendingPenalty::None);

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 3.8, 8.5, true)});
  REQUIRE(aggressor.rcState().pendingPenalty == PendingPenalty::DriveThrough);
}

TEST_CASE("Serious collision issues a long stop-and-go hold",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &aggressor = FindCar(session, "entry-1");
  FindCar(session, "entry-2").state().engineHealth = 0.0;

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 6.5, 12.0, true)});

  REQUIRE(aggressor.rcState().pendingPenalty == PendingPenalty::StopGo);
  REQUIRE(aggressor.rcState().penaltyStopSeconds >= 30.0);
  REQUIRE(aggressor.rcState().penaltyStopSeconds <= 60.0);
}

TEST_CASE("Side-by-side contact with low closing speed is a racing incident",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 3.0, 4.0, false, 1.0)});

  REQUIRE(FindCar(session, "entry-1").rcState().pendingPenalty ==
          PendingPenalty::None);
  REQUIRE(FindCar(session, "entry-2").rcState().pendingPenalty ==
          PendingPenalty::None);
}

TEST_CASE("Collision processing leaves debris hazard on track",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 5.5, 10.0, true)});

  REQUIRE(session.raceControl.hazards.size() == 1);
  REQUIRE(session.raceControl.hazards.front().kind == HazardKind::Debris);
}
