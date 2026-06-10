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

  REQUIRE(session.raceControl.hazards.size() >= 4);
  int debris = 0;
  int oil = 0;
  int coolant = 0;
  int fuel = 0;
  for (const TrackSurfaceHazard &hz : session.raceControl.hazards) {
    if (hz.kind == HazardKind::Debris)
      ++debris;
    if (hz.kind == HazardKind::Oil)
      ++oil;
    if (hz.kind == HazardKind::Coolant)
      ++coolant;
    if (hz.kind == HazardKind::Fuel)
      ++fuel;
  }
  REQUIRE(debris == 1);
  REQUIRE(oil == 1);
  REQUIRE(coolant == 1);
  REQUIRE(fuel == 1);
}

TEST_CASE("Collision surface hazards survive on-track tow clearance",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &victim = FindCar(session, "entry-2");
  victim.state().engineHealth = 0.0;
  victim.state().currentSpeed = 0.0;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(victim.rcState().trackStatus == TrackStatus::Stranded);

  ProcessCollisionPenalties(
      session,
      {MakeCollisionEvent("entry-1", "entry-2", 5.5, 10.0, true)});
  REQUIRE(session.raceControl.hazards.size() >= 4);

  session.elapsedRaceTime = victim.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  session.elapsedRaceTime = victim.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(victim.rcState().trackStatus == TrackStatus::ReturningToGarage);
  REQUIRE(session.raceControl.hazards.size() >= 4);
}

TEST_CASE("Blue-flag non-compliance rear-end penalizes defender not chaser",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &chaser = FindCar(session, "entry-1");
  Car &defender = FindCar(session, "entry-2");
  defender.driver().active().trafficManagement = 55.0;
  defender.driver().active().consistency = 80.0;

  ProcessCollisionPenalties(
      session,
      {MakeBlueFlagPassCollision("entry-1", "entry-2", 6.5, 12.0, true,
                                 "entry-1", 1.2, false, false)});

  REQUIRE(defender.rcState().pendingPenalty == PendingPenalty::StopGo);
  REQUIRE(chaser.rcState().pendingPenalty == PendingPenalty::None);
}

TEST_CASE("Blue-flag defender lifting leaves chaser unpunished",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &chaser = FindCar(session, "entry-1");
  Car &defender = FindCar(session, "entry-2");
  defender.driver().active().trafficManagement = 88.0;
  defender.driver().active().consistency = 85.0;

  ProcessCollisionPenalties(
      session,
      {MakeBlueFlagPassCollision("entry-1", "entry-2", 3.2, 8.0, true,
                                 "entry-1", 1.2, true, false)});

  REQUIRE(chaser.rcState().pendingPenalty == PendingPenalty::None);
  REQUIRE(defender.rcState().pendingPenalty == PendingPenalty::None);
  REQUIRE(chaser.rcState().collisionWarnings == 0);
  REQUIRE(defender.rcState().collisionWarnings == 0);
}

TEST_CASE("Blue-flag side contact penalizes defending GT not overtaking hyper",
          "[unit][race_control][collision]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "hyper", "Hyper Team");
  AddTestCar(session, "gt", "GT Team");
  Car &hyper = FindCar(session, "hyper");
  Car &gt = FindCar(session, "gt");
  gt.driver().active().trafficManagement = 70.0;

  ProcessCollisionPenalties(
      session,
      {MakeBlueFlagPassCollision("hyper", "gt", 5.2, 9.0, false, "gt", 0.85,
                                 false, true)});

  REQUIRE(gt.rcState().pendingPenalty == PendingPenalty::StopGo);
  REQUIRE(hyper.rcState().pendingPenalty == PendingPenalty::None);
}
