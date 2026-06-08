#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "race_control.hpp"
#include "pit_stop.hpp"
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
  REQUIRE_FALSE(car.isRetired());
  REQUIRE(car.inGarageRebuild());
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

TEST_CASE("Catastrophic same-side stop strands and deploys safety car",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  ApplyCatastrophicSameSideLoss(car, true);
  car.state().currentSpeed = 0.0;

  StrandStoppedCar(car, session, "Heavy crash — immobilized");
  REQUIRE(car.rcState().trackStatus == TrackStatus::Stranded);
  REQUIRE(CountTrackObstructions(session) == 1);

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
  REQUIRE(session.raceControl.scActive);
}

TEST_CASE("Catastrophic same-side tow delivers car to garage rebuild",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession(86400.0);
  Car &car = AddTestCar(session);
  ApplyCatastrophicSameSideLoss(car, true);
  car.state().currentSpeed = 0.0;
  StrandStoppedCar(car, session, "Heavy crash — immobilized");

  session.elapsedRaceTime = car.rcState().marshalDispatchTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(car.rcState().trackStatus == TrackStatus::Recovering);

  session.elapsedRaceTime = car.rcState().recoveryEndTime + 0.1;
  UpdateTrackObstructions(session, 0.1);

  REQUIRE(car.rcState().trackStatus == TrackStatus::Cleared);
  REQUIRE(CountTrackObstructions(session) == 0);
  REQUIRE_FALSE(car.isRetired());
  REQUIRE(car.inGarageRebuild());
}

TEST_CASE("Low visibility deploys red flag", "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session);
  session.weather.visibilityKm = 1.0;

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);
  REQUIRE(session.raceControl.redFlagActive);
}

TEST_CASE("Two obstructions same sector on short track deploy red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &a = FindCar(session, "entry-1");
  Car &b = FindCar(session, "entry-2");
  a.rcState().trackStatus = TrackStatus::Stranded;
  b.rcState().trackStatus = TrackStatus::Stranded;
  a.rcState().obstructionSectorIndex = 0;
  b.rcState().obstructionSectorIndex = 0;
  REQUIRE(CountTrackObstructions(session) == 2);

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);
  REQUIRE(session.raceControl.redFlagActive);
}

TEST_CASE("Two spread obstructions on long track deploy safety car not red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeLongRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &a = FindCar(session, "entry-1");
  Car &b = FindCar(session, "entry-2");
  a.rcState().trackStatus = TrackStatus::Stranded;
  b.rcState().trackStatus = TrackStatus::Stranded;
  a.rcState().obstructionSectorIndex = 0;
  b.rcState().obstructionSectorIndex = 1;

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
  REQUIRE(session.raceControl.scActive);
  REQUIRE_FALSE(session.raceControl.redFlagActive);
}

TEST_CASE("Red flag extends when conditions remain unsafe at review",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session);
  session.weather.visibilityKm = 1.0;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);

  const double reviewAt = session.raceControl.redFlagReviewAt;
  session.elapsedRaceTime = reviewAt + 0.1;
  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);
  REQUIRE(session.raceControl.redFlagExtensions == 1);
  REQUIRE(session.raceControl.redFlagUntil > reviewAt);
}

TEST_CASE("Red flag clears to SC when racing conditions met at review",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  session.weather.visibilityKm = 1.0;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);

  session.weather.visibilityKm = 10.0;
  session.weather.phase = WeatherPhase::Dry;
  car.placeInGarageHold(session.track);

  const double reviewAt = session.raceControl.redFlagReviewAt;
  session.elapsedRaceTime = reviewAt + 0.1;
  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
  REQUIRE(session.raceControl.scActive);
  REQUIRE(session.raceControl.scLapsRemaining == 2);
  REQUIRE_FALSE(session.raceControl.redFlagActive);
}

TEST_CASE("Red flag hold at pit box for non-servicing car",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  car.pit().inPit = true;
  car.pit().phase = PitPhase::AtBox;
  car.pit().pitLaneDistance = session.track.pitLane.boxDistance;
  car.pit().plan = PitStopPlan{};

  car.processPitLaneTick(session.track, 0.1, session.staff, 3600.0, true);

  REQUIRE(car.redFlagHold());
  REQUIRE(car.inGarageHold());
}

TEST_CASE("Active pit service continues under red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  car.pit().inPit = true;
  car.pit().phase = PitPhase::AtBox;
  car.pit().pitLaneDistance = session.track.pitLane.boxDistance;
  car.pit().plan.tiresToChange = {"FL", "FR", "RL", "RR"};
  car.pit().pitDuration = 30.0;
  car.pit().pitElapsed = 0.0;

  car.processPitLaneTick(session.track, 5.0, session.staff, 3600.0, true);

  REQUIRE_FALSE(car.redFlagHold());
  REQUIRE(car.pit().pitElapsed > 0.0);
}

TEST_CASE("SC pit release queue exits red flag hold cars",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  car.placeInGarageHold(session.track);
  car.applyRedFlagHold();

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scPitReleaseQueue = {car.entryId()};
  session.raceControl.scPitReleaseNextAt = 0.0;

  UpdateScPitRelease(session);

  REQUIRE_FALSE(car.redFlagHold());
  REQUIRE_FALSE(car.inGarageHold());
  REQUIRE(car.pit().phase == PitPhase::DrivingOut);
}

TEST_CASE("Two burning cars on track deploy red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &a = FindCar(session, "entry-1");
  Car &b = FindCar(session, "entry-2");
  a.igniteFire();
  b.igniteFire();
  a.state().currentSpeed = 0.0;
  b.state().currentSpeed = 0.0;

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);
  REQUIRE(session.raceControl.redFlagActive);
}

TEST_CASE("Single burning car below two minutes does not deploy red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.igniteFire();
  car.rcState().fireStartedAt = 0.0;
  car.state().currentSpeed = 0.0;
  session.elapsedRaceTime = 60.0;

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase != FlagPhase::RedFlag);
  REQUIRE(CountBurningCarsOnTrack(session) == 1);
}

TEST_CASE("Single burning car after two minutes deploys red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.igniteFire();
  car.rcState().fireStartedAt = 0.0;
  car.state().currentSpeed = 0.0;
  session.elapsedRaceTime = 121.0;

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);
  REQUIRE(session.raceControl.redFlagActive);
}

TEST_CASE("Red flag extends while burning car remains on track at review",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  Car &car = AddTestCar(session);
  car.igniteFire();
  car.rcState().fireStartedAt = 0.0;
  car.state().currentSpeed = 0.0;
  session.elapsedRaceTime = 121.0;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);

  const double reviewAt = session.raceControl.redFlagReviewAt;
  session.elapsedRaceTime = reviewAt + 0.1;
  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);
  REQUIRE(session.raceControl.redFlagExtensions == 1);
  REQUIRE(CountBurningCarsOnTrack(session) == 1);
}
