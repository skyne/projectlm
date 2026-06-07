#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "race_control.hpp"

TEST_CASE("Blue flag ladder escalates warning to drive-through to stop-go to black",
          "[unit][race_control][penalties]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);

  SimulateBlueBlock(car, session, 30);
  REQUIRE(car.rcState().blueFlagStrikes == 1);
  REQUIRE(car.rcState().pendingPenalty == PendingPenalty::None);

  SimulateBlueBlock(car, session, 30);
  REQUIRE(car.rcState().blueFlagStrikes == 2);
  REQUIRE(car.rcState().pendingPenalty == PendingPenalty::DriveThrough);
  REQUIRE(car.rcState().lapsToComply == 3);

  SimulateBlueBlock(car, session, 30);
  REQUIRE(car.rcState().blueFlagStrikes == 3);
  REQUIRE(car.rcState().pendingPenalty == PendingPenalty::StopGo);

  SimulateBlueBlock(car, session, 30);
  REQUIRE(car.rcState().blueFlagStrikes == 4);
  REQUIRE(car.rcState().pendingPenalty == PendingPenalty::Black);
}

TEST_CASE("Blue flag strikes decay after clean laps", "[unit][race_control][penalties]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.rcState().blueFlagStrikes = 2;
  car.rcState().cleanLapsSinceStrike = 0;

  for (int i = 0; i < 5; ++i)
    NotifyCarLapComplete(car, session);

  REQUIRE(car.rcState().blueFlagStrikes == 1);
  REQUIRE(car.rcState().cleanLapsSinceStrike == 0);
}

TEST_CASE("Unserved drive-through escalates to black flag", "[unit][race_control][penalties]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.state().currentLap = 10;
  car.rcState().pendingPenalty = PendingPenalty::DriveThrough;
  car.rcState().penaltyIssuedLap = 5;
  car.rcState().lapsToComply = 2;

  UpdatePenalties(session, 0.1, TrafficModsFor(session));

  REQUIRE(car.rcState().pendingPenalty == PendingPenalty::Black);
  REQUIRE(car.rcState().penaltyReason.find("Unserved") != std::string::npos);
}

TEST_CASE("Unserved black flag disqualifies car", "[unit][race_control][penalties]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.state().currentLap = 12;
  car.rcState().pendingPenalty = PendingPenalty::Black;
  car.rcState().penaltyIssuedLap = 8;
  car.rcState().lapsToComply = 2;

  UpdatePenalties(session, 0.1, TrafficModsFor(session));

  REQUIRE(car.isRetired());
  REQUIRE(car.retireReason().find("Disqualified") != std::string::npos);
}

TEST_CASE("Meatball flag issued for heavy damage and ignored deadline becomes stop-go",
          "[unit][race_control][penalties]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.state().currentLap = 4;
  SetHighStructuralDamage(car);

  UpdatePenalties(session, 0.1, TrafficModsFor(session));
  REQUIRE(car.rcState().meatballActive);
  REQUIRE(car.rcState().meatballDeadlineLap == 7);

  car.state().currentLap = 8;
  UpdatePenalties(session, 0.1, TrafficModsFor(session));
  REQUIRE(car.rcState().pendingPenalty == PendingPenalty::StopGo);
  REQUIRE_FALSE(car.rcState().meatballActive);
}

TEST_CASE("Meatball clears when damage is repaired below threshold",
          "[unit][race_control][penalties]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  SetHighStructuralDamage(car);
  UpdatePenalties(session, 0.1, TrafficModsFor(session));
  REQUIRE(car.rcState().meatballActive);

  InitPartDamageState(car.state().partDamage);
  UpdatePenalties(session, 0.1, TrafficModsFor(session));
  REQUIRE_FALSE(car.rcState().meatballActive);
}

TEST_CASE("Blue flag timer does not accumulate under FCY no-overtaking",
          "[unit][race_control][penalties]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  session.raceControl.flagPhase = FlagPhase::FCY;
  SyncRaceControlFlags(session.raceControl);

  auto mods = TrafficModsFor(session);
  for (int t = 0; t < 40; ++t) {
    mods[0].blueFlag = true;
    mods[0].blocked = true;
    UpdatePenalties(session, 0.1, mods);
  }

  REQUIRE(car.rcState().blueFlagStrikes == 0);
}
