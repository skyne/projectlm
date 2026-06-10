#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "pit_stop.hpp"
#include "traffic.hpp"

TEST_CASE("PitMergeGapSafe blocks merge when fast car is closing behind",
          "[unit][traffic][pit]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "rejoin", "Rejoin Team");
  AddTestCar(session, "fast", "Fast Team");
  Car &rejoin = FindCar(session, "rejoin");
  Car &fast = FindCar(session, "fast");

  const double lap = session.track.lapLength();
  const double merge = session.track.pitLane.mergeTrackDistance;
  const double pitSpeed = session.track.pitLane.speedLimitMs;

  rejoin.state().currentLap = 2;
  fast.state().currentLap = 2;
  fast.state().currentDistance = merge - 25.0;
  fast.state().currentSpeed = 55.0;

  REQUIRE_FALSE(PitMergeGapSafe(rejoin, session.cars, lap, merge, pitSpeed));
}

TEST_CASE("PitMergeGapSafe allows merge with clear track behind",
          "[unit][traffic][pit]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "rejoin", "Rejoin Team");
  AddTestCar(session, "fast", "Fast Team");
  Car &rejoin = FindCar(session, "rejoin");
  Car &fast = FindCar(session, "fast");

  const double lap = session.track.lapLength();
  const double merge = session.track.pitLane.mergeTrackDistance;
  const double pitSpeed = session.track.pitLane.speedLimitMs;

  rejoin.state().currentLap = 2;
  fast.state().currentLap = 2;
  fast.state().currentDistance = merge - 140.0;
  fast.state().currentSpeed = 55.0;

  REQUIRE(PitMergeGapSafe(rejoin, session.cars, lap, merge, pitSpeed));
}

TEST_CASE("Rejoining car yields instead of causing rear-end collision",
          "[unit][traffic][pit]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "fast", "Fast Team");
  AddTestCar(session, "rejoin", "Rejoin Team");
  Car &fast = FindCar(session, "fast");
  Car &rejoin = FindCar(session, "rejoin");

  const double merge = 50.0;
  rejoin.state().currentLap = 1;
  rejoin.state().currentDistance = merge;
  rejoin.state().currentSpeed = 14.0;
  rejoin.beginRejoinYield(12.0);

  fast.state().currentLap = 1;
  fast.state().currentDistance = merge - 30.0;
  fast.state().currentSpeed = 58.0;

  std::vector<TrafficModifiers> mods;
  std::vector<TrafficEvent> events;
  std::unordered_map<std::string, double> cooldowns;
  ResolveTraffic(session.cars, session.track.lapLength(), 100.0, cooldowns, mods,
                 events, SessionRaceControl{}, {}, {14.0, nullptr, false});

  const size_t fastIdx = 0;
  const size_t rejoinIdx = 1;
  REQUIRE(mods[fastIdx].collisionDamage == 0.0);
  REQUIRE_FALSE(mods[fastIdx].collision);
  REQUIRE(mods[rejoinIdx].blueFlag);
  REQUIRE(mods[rejoinIdx].speedCapMs > 0.0);
}

TEST_CASE("PitMergeGapSafe train on centerline allows merge when rejoin outside lane",
          "[unit][traffic][pit]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "rejoin", "Rejoin Team");
  AddTestCar(session, "fast", "Fast Team");
  Car &rejoin = FindCar(session, "rejoin");
  Car &fast = FindCar(session, "fast");

  const double lap = session.track.lapLength();
  const double merge = session.track.pitLane.mergeTrackDistance;
  const double pitSpeed = session.track.pitLane.speedLimitMs;

  rejoin.state().currentLap = 2;
  fast.state().currentLap = 2;
  fast.state().currentDistance = merge - 25.0;
  fast.state().currentSpeed = 55.0;
  fast.setLateralOffset(0.0);

  TrafficLateralContext lateral;
  lateral.trackWidthM = session.trackWidthM;
  lateral.useFrenetDynamics = true;

  REQUIRE(PitMergeGapSafe(rejoin, session.cars, lap, merge, pitSpeed, lateral));
}

TEST_CASE("Pit exit waits for gap before merging on green flag",
          "[unit][traffic][pit]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "rejoin", "Rejoin Team");
  AddTestCar(session, "fast", "Fast Team");
  Car &rejoin = FindCar(session, "rejoin");
  Car &fast = FindCar(session, "fast");

  const double merge = session.track.pitLane.mergeTrackDistance;
  fast.state().currentLap = 2;
  fast.state().currentDistance = merge - 20.0;
  fast.state().currentSpeed = 60.0;

  rejoin.state().currentLap = 2;
  rejoin.pit().inPit = true;
  rejoin.pit().phase = PitPhase::DrivingOut;
  rejoin.pit().pitLaneDistance = session.track.pitLane.totalLength();

  const bool merged =
      rejoin.processPitLaneTick(session.track, 0.1, session.staff, 3600.0,
                                false, &session.cars, true);
  REQUIRE_FALSE(merged);
  REQUIRE(rejoin.inPitLane());
  REQUIRE(rejoin.pit().statusMessage == "Waiting for gap");
}
