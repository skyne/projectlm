#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "part_damage.hpp"
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
  REQUIRE(car.rcState().trackStatus == TrackStatus::ReturningToGarage);
  REQUIRE(CountTrackObstructions(session) == 0);
  session.elapsedRaceTime = car.rcState().garageHandoverTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE_FALSE(car.isRetired());
  REQUIRE(car.inGarageRebuild());

  session.raceControl.fcyHoldUntil = 0.0;
  session.raceControl.slowZoneHoldUntil = 0.0;
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

  REQUIRE(session.raceControl.hazards.size() == 3);
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

TEST_CASE("SC peel-off blocks restart until leader crosses start/finish",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Leader");
  AddTestCar(session, "entry-2", "Follower");
  Car &leader = FindCar(session, "entry-1");
  Car &follower = FindCar(session, "entry-2");
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.flagPhase = FlagPhase::SCInLap;
  SyncRaceControlFlags(session.raceControl);

  OnSafetyCarPeelOff(session);
  REQUIRE(session.raceControl.scAwaitingLeaderSfCross);

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);
  REQUIRE_FALSE(mods[0].overtaking);
  REQUIRE_FALSE(mods[1].overtaking);
  REQUIRE(mods[0].speedCapMs > 0.0);
  REQUIRE(mods[0].speedCapMs <= 60.0 / 3.6 + 0.01);
  REQUIRE(mods[0].scRestartThrottleBoost == Catch::Approx(0.0));

  NotifyCarLapComplete(follower, session);
  REQUIRE(session.raceControl.scAwaitingLeaderSfCross);
  REQUIRE(session.raceControl.flagPhase == FlagPhase::SCInLap);

  NotifyCarLapComplete(leader, session);
  REQUIRE_FALSE(session.raceControl.scAwaitingLeaderSfCross);
  REQUIRE(session.raceControl.flagPhase == FlagPhase::Green);
  REQUIRE(session.raceControl.scRestartUntil > session.elapsedRaceTime);

  mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);
  REQUIRE(mods[0].scRestartThrottleBoost > 0.0);
  REQUIRE(mods[1].scRestartThrottleBoost > 0.0);
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
  REQUIRE(car.rcState().trackStatus == TrackStatus::ReturningToGarage);
  REQUIRE(CountTrackObstructions(session) == 0);

  session.elapsedRaceTime = car.rcState().garageHandoverTime + 0.1;
  UpdateTrackObstructions(session, 0.1);
  REQUIRE(car.rcState().trackStatus == TrackStatus::Cleared);
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
  REQUIRE(session.raceControl.scFormationRestore);
  REQUIRE(session.raceControl.scLapsRemaining == 1);
  REQUIRE_FALSE(session.raceControl.redFlagActive);
}

TEST_CASE("Red flag clears to SC when track safe but car still on track",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.state().currentDistance = 500.0;
  second.state().currentDistance = 300.0;
  session.weather.visibilityKm = 1.0;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);

  session.weather.visibilityKm = 10.0;
  session.weather.phase = WeatherPhase::Dry;
  second.placeInGarageHold(session.track);
  second.applyRedFlagHold();

  const double reviewAt = session.raceControl.redFlagReviewAt;
  session.elapsedRaceTime = reviewAt + 0.1;
  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
  REQUIRE(session.raceControl.scFormationRestore);
  REQUIRE_FALSE(leader.pit().pendingEnter);
  REQUIRE(leader.inPitLane() == false);
}

TEST_CASE("Safety car drives out of pit on deploy instead of teleporting",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session);
  const double box = session.track.pitLane.boxDistance;
  REQUIRE(session.raceControl.safetyCar.phase == SafetyCarPhase::Parked);

  OnSafetyCarDeploy(session);
  REQUIRE(session.raceControl.safetyCar.phase == SafetyCarPhase::ExitingPit);
  REQUIRE(session.raceControl.safetyCar.inPit);
  REQUIRE(session.raceControl.safetyCar.pitLaneDistance == Catch::Approx(box));

  TickSafetyCar(session, 0.5);
  REQUIRE(session.raceControl.safetyCar.pitLaneDistance > box);
  REQUIRE(session.raceControl.safetyCar.phase == SafetyCarPhase::ExitingPit);

  session.raceControl.safetyCar.pitLaneDistance =
      session.track.pitLane.totalLength() - 0.1;
  TickSafetyCar(session, 0.5);
  REQUIRE(session.raceControl.safetyCar.phase == SafetyCarPhase::OnTrack);
  REQUIRE_FALSE(session.raceControl.safetyCar.inPit);
}

TEST_CASE("Safety car peels off through pit entrance on peel-off",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session);
  const PitLaneDefinition &lane = session.track.pitLane;
  const double box = lane.boxDistance;

  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = lane.mergeTrackDistance;
  session.raceControl.safetyCar.currentSpeed = lane.speedLimitMs;

  OnSafetyCarPeelOff(session);
  REQUIRE(session.raceControl.safetyCar.phase == SafetyCarPhase::EnteringPit);

  bool enteredAtPitEntrance = false;
  bool droveForwardInPitLane = false;
  double prevPitLaneDistance = -1.0;
  for (int i = 0; i < 5000; ++i) {
    TickSafetyCar(session, 0.05);
    const SafetyCarState &sc = session.raceControl.safetyCar;
    if (sc.phase == SafetyCarPhase::EnteringPit && sc.inPit) {
      if (!enteredAtPitEntrance) {
        REQUIRE(sc.pitLaneDistance < 1.0);
        enteredAtPitEntrance = true;
      }
      if (prevPitLaneDistance >= 0.0 && sc.pitLaneDistance > prevPitLaneDistance)
        droveForwardInPitLane = true;
      prevPitLaneDistance = sc.pitLaneDistance;
    }
    if (sc.phase == SafetyCarPhase::Parked)
      break;
  }
  REQUIRE(enteredAtPitEntrance);
  REQUIRE(droveForwardInPitLane);

  REQUIRE(session.raceControl.safetyCar.phase == SafetyCarPhase::Parked);
  REQUIRE(session.raceControl.safetyCar.inPit);
  REQUIRE(session.raceControl.safetyCar.pitLaneDistance == Catch::Approx(box));
  REQUIRE(session.raceControl.safetyCar.currentSpeed == Catch::Approx(0.0));
}

TEST_CASE("ApplyFlagModifiers blocks cars ahead of the safety car during SC",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.state().currentDistance = 300.0;
  second.state().currentDistance = 500.0;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scFormationRestore = true;
  session.raceControl.scFormationOrder = {"entry-1", "entry-2"};
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 450.0;
  session.raceControl.safetyCar.currentSpeed = 18.0;
  session.raceControl.safetyCar.currentLap = 1;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE(mods[0].overtaking);
  REQUIRE(mods[0].speedCapMs >= 90.0 / 3.6 - 0.5);
  REQUIRE_FALSE(mods[1].overtaking);
  REQUIRE(mods[1].blocked);
  REQUIRE(mods[1].speedCapMs <= (60.0 / 3.6) * 1.02);
}

TEST_CASE("SC train cars pace at 60 km/h while catch-up runs near 90 km/h",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.state().currentDistance = 200.0;
  second.state().currentDistance = 500.0;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scFormationRestore = true;
  session.raceControl.scFormationOrder = {"entry-1", "entry-2"};
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 530.0;
  session.raceControl.safetyCar.currentSpeed = 60.0 / 3.6;
  session.raceControl.safetyCar.currentLap = 1;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE(mods[0].overtaking);
  REQUIRE(mods[0].speedCapMs >= 90.0 / 3.6 - 0.5);
  REQUIRE_FALSE(mods[1].overtaking);
  REQUIRE(mods[1].speedCapMs == Catch::Approx(60.0 / 3.6 * 1.02).margin(0.5));
}

TEST_CASE("Safety car slows when ahead of train leader",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &leader = FindCar(session, "entry-1");
  leader.state().currentDistance = 200.0;
  leader.state().currentSpeed = 60.0 / 3.6;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 500.0;
  session.raceControl.safetyCar.currentSpeed = 60.0 / 3.6;
  session.raceControl.safetyCar.currentLap = 1;

  const double trainSpeed = 60.0 / 3.6;
  for (int i = 0; i < 60; ++i)
    TickSafetyCar(session, 0.1);

  REQUIRE(session.raceControl.safetyCar.currentSpeed < trainSpeed - 0.2);

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);
  REQUIRE(mods[0].speedCapMs >= trainSpeed - 0.5);
}

TEST_CASE("Safety car brakes on pit merge when leader has extra completed laps",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &leader = FindCar(session, "entry-1");
  const double trainSpeed = 60.0 / 3.6;
  const double lapLen = session.track.lapLength();

  leader.state().currentLap = 3;
  leader.state().currentDistance = 50.0;
  leader.state().currentSpeed = trainSpeed;

  session.raceControl.flagPhase = FlagPhase::SC;
  SafetyCarState &sc = session.raceControl.safetyCar;
  sc.phase = SafetyCarPhase::OnTrack;
  sc.inPit = false;
  sc.trackDistance = 120.0;
  sc.currentLap = 0;
  sc.currentSpeed = trainSpeed;

  for (int i = 0; i < 8; ++i)
    TickSafetyCar(session, 0.1);
  REQUIRE(sc.currentSpeed < trainSpeed - 0.3);

  double travel = 0.0;
  for (int i = 0; i < 20; ++i) {
    const double before =
        sc.trackDistance + static_cast<double>(sc.currentLap) * lapLen;
    TickSafetyCar(session, 0.1);
    const double after =
        sc.trackDistance + static_cast<double>(sc.currentLap) * lapLen;
    travel += after - before;
  }
  REQUIRE(travel < 120.0);
}

TEST_CASE("Safety car brakes on pit merge while race leader is still in pits",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &leader = FindCar(session, "entry-1");
  const double trainSpeed = 60.0 / 3.6;
  const double merge = session.track.pitLane.mergeTrackDistance;

  leader.pit().inPit = true;
  leader.pit().phase = PitPhase::AtBox;
  leader.pit().pitLaneDistance = session.track.pitLane.boxDistance;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scReferenceEntryId = "entry-1";
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = merge;
  session.raceControl.safetyCar.currentLap = 0;
  session.raceControl.safetyCar.currentSpeed = trainSpeed;

  for (int i = 0; i < 5; ++i)
    TickSafetyCar(session, 0.1);
  REQUIRE(session.raceControl.safetyCar.currentSpeed < trainSpeed - 0.5);
}

TEST_CASE("Safety car does not chase pack backmarker lap position",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &backmarker = FindCar(session, "entry-2");
  const double trainSpeed = 60.0 / 3.6;
  const double lapLen = session.track.lapLength();
  const double merge = session.track.pitLane.mergeTrackDistance;

  leader.state().currentLap = 1;
  leader.state().currentDistance = 100.0;
  leader.state().currentSpeed = trainSpeed;
  backmarker.state().currentLap = 2;
  backmarker.state().currentDistance = lapLen * 0.9;
  backmarker.state().currentSpeed = trainSpeed;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scReferenceEntryId = "entry-1";
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = merge;
  session.raceControl.safetyCar.currentLap = 0;
  session.raceControl.safetyCar.currentSpeed = trainSpeed;

  double travel = 0.0;
  for (int i = 0; i < 30; ++i) {
    const double before = session.raceControl.safetyCar.trackDistance;
    TickSafetyCar(session, 0.1);
    travel += session.raceControl.safetyCar.trackDistance - before;
  }
  REQUIRE(travel < 400.0);
}

TEST_CASE("Train limits apply when car trails SC at lower lap distance",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &car = FindCar(session, "entry-1");

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 1500.0;
  session.raceControl.safetyCar.currentSpeed = 0.0;
  session.raceControl.safetyCar.currentLap = 1;
  car.state().currentDistance = 1000.0;
  car.state().currentLap = 1;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE_FALSE(mods[0].overtaking);
  REQUIRE(mods[0].speedCapMs <= 60.0 / 3.6 + 0.5);
}

TEST_CASE("Formation restore does not snap cars ahead of the safety car",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &leader = FindCar(session, "entry-1");

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scFormationRestore = true;
  session.raceControl.scFormationOrder = {"entry-1"};
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 500.0;
  session.raceControl.safetyCar.currentSpeed = 18.0;
  session.raceControl.safetyCar.currentLap = 1;
  leader.state().currentDistance = 560.0;
  leader.state().currentSpeed = 18.0;
  leader.state().currentLap = 1;

  EnforceSafetyCarTrainPositions(session);
  REQUIRE(leader.state().currentDistance == Catch::Approx(560.0));

  session.raceControl.scFormationRestore = false;
  EnforceSafetyCarTrainPositions(session);
  REQUIRE(leader.state().currentDistance < 500.0);
}

TEST_CASE("Train cannot pass SC while it drives to pit entrance on peel-off",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &car = FindCar(session, "entry-1");

  session.raceControl.flagPhase = FlagPhase::SCInLap;
  session.raceControl.scAwaitingLeaderSfCross = true;
  session.raceControl.safetyCar.phase = SafetyCarPhase::EnteringPit;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 500.0;
  session.raceControl.safetyCar.currentSpeed = 16.0;
  session.raceControl.safetyCar.currentLap = 1;
  car.state().currentDistance = 560.0;
  car.state().currentSpeed = 18.0;
  car.state().currentLap = 1;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);
  REQUIRE_FALSE(mods[0].overtaking);
  REQUIRE(mods[0].blocked);
  REQUIRE(mods[0].speedCapMs <= 16.0);

  EnforceSafetyCarTrainPositions(session);
  REQUIRE(car.state().currentDistance < 500.0);
}

TEST_CASE("EnforceSafetyCarTrainPositions pulls cars back past the SC",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &car = FindCar(session, "entry-1");

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 500.0;
  session.raceControl.safetyCar.currentSpeed = 0.0;
  session.raceControl.safetyCar.currentLap = 1;
  car.state().currentDistance = 560.0;
  car.state().currentSpeed = 18.0;
  car.state().currentLap = 1;

  EnforceSafetyCarTrainPositions(session);
  REQUIRE(car.state().currentDistance < 500.0);
  REQUIRE(car.state().currentSpeed == Catch::Approx(0.0));
}

TEST_CASE("Cars cannot pass SC when lap counts differ from safety car",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  Car &leader = FindCar(session, "entry-1");
  const double trainSpeed = 60.0 / 3.6;

  leader.state().currentLap = 3;
  leader.state().currentDistance = 50.0;
  leader.state().currentSpeed = trainSpeed;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 120.0;
  session.raceControl.safetyCar.currentLap = 0;
  session.raceControl.safetyCar.currentSpeed = 0.0;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);
  REQUIRE_FALSE(mods[0].overtaking);
  REQUIRE_FALSE(mods[0].blocked);

  leader.state().currentDistance = 130.0;
  mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);
  REQUIRE_FALSE(mods[0].overtaking);
  REQUIRE(mods[0].blocked);
  REQUIRE(mods[0].speedCapMs <= 0.5);
}

TEST_CASE("Formation catch-up slows in hazard sectors",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.state().currentDistance = 50.0;
  second.state().currentDistance = 400.0;
  session.raceControl.sectorFlags = {
      static_cast<int>(SectorFlagLevel::DoubleYellow),
      static_cast<int>(SectorFlagLevel::Green),
      static_cast<int>(SectorFlagLevel::Green),
  };

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scFormationRestore = true;
  session.raceControl.scFormationOrder = {"entry-1", "entry-2"};
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE(mods[0].overtaking);
  REQUIRE(mods[0].speedCapMs <= 18.0);
}

TEST_CASE("Formation catch-up may pass safety car but wrong-order cars cannot",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.state().currentDistance = 200.0;
  second.state().currentDistance = 480.0;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scFormationRestore = true;
  session.raceControl.scFormationOrder = {"entry-1", "entry-2"};
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 460.0;
  session.raceControl.safetyCar.currentSpeed = 18.0;
  session.raceControl.safetyCar.currentLap = 1;

  auto mods = TrafficModsFor(session);
  ApplyFlagModifiers(session, mods);

  REQUIRE(mods[0].overtaking);
  REQUIRE_FALSE(mods[0].blocked);
  REQUIRE(mods[1].blocked);
}

TEST_CASE("SC formation restores order then peels off",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.state().currentDistance = 300.0;
  second.state().currentDistance = 500.0;
  leader.state().currentLap = 2;
  second.state().currentLap = 2;

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scFormationRestore = true;
  session.raceControl.scFormationOrder = {"entry-1", "entry-2"};
  session.raceControl.scLapsRemaining = 1;
  session.raceControl.scDeployedAtLap = leader.state().currentLap;
  session.raceControl.fcyHoldUntil = 0.0;
  session.raceControl.slowZoneHoldUntil = 0.0;
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;
  session.raceControl.safetyCar.trackDistance = 650.0;
  session.raceControl.safetyCar.currentSpeed = 18.0;
  session.raceControl.safetyCar.currentLap = 2;

  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);

  second.state().currentDistance = 250.0;
  leader.state().currentDistance = 550.0;
  leader.state().currentLap += 1;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.scLapsRemaining == 0);
  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::SCInLap);
  REQUIRE_FALSE(session.raceControl.scFormationRestore);
}

TEST_CASE("Red flag pauses driver stint clock while on track",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session);
  Car &car = FindCar(session, "entry-1");
  car.state().currentDistance = 250.0;
  TrafficModifiers traffic;

  session.raceControl.flagPhase = FlagPhase::RedFlag;
  car.tick(session.track, session.corridor, session.physics, 30.0, 0.0, nullptr,
           &traffic, session.weather, false, 3600.0, true);
  REQUIRE(car.driver().stintTimeSeconds == Catch::Approx(0.0));

  session.raceControl.flagPhase = FlagPhase::Green;
  car.tick(session.track, session.corridor, session.physics, 12.5, 30.0,
           nullptr, &traffic, session.weather, false, 3600.0, false);
  REQUIRE(car.driver().stintTimeSeconds == Catch::Approx(12.5));
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

TEST_CASE("Red flag cancels active pit service at box",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session);
  Car &car = FindCar(session, "entry-1");
  session.raceControl.flagPhase = FlagPhase::RedFlag;
  car.pit().inPit = true;
  car.pit().phase = PitPhase::AtBox;
  car.pit().pitLaneDistance = session.track.pitLane.boxDistance;
  car.pit().plan.tiresToChange = {"FL", "FR", "RL", "RR"};
  car.pit().pitDuration = 30.0;
  car.pit().pitElapsed = 5.0;

  UpdateRedFlagPitProcedure(session);
  car.processPitLaneTick(session.track, 5.0, session.staff, 3600.0, true);

  REQUIRE(car.redFlagHold());
  REQUIRE(car.inGarageHold());
  REQUIRE(car.pit().plan.tiresToChange.empty());
  REQUIRE(car.pit().phase == PitPhase::AtBox);
  REQUIRE(car.inPitLane());
}

TEST_CASE("Red flag queued pit plan does not service or rejoin track",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session);
  Car &car = FindCar(session, "entry-1");
  session.raceControl.flagPhase = FlagPhase::RedFlag;
  car.pit().pendingEnter = true;
  car.pit().plan.fuelLiters = 50.0;
  car.state().currentDistance = 0.0;
  car.state().currentLap = 2;

  UpdateRedFlagPitProcedure(session);
  car.processPitEntry(0.99, false, true);

  for (int i = 0; i < 200 && car.pit().phase != PitPhase::AtBox; ++i)
    car.processPitLaneTick(session.track, 0.1, session.staff, 3600.0, true);

  REQUIRE(car.pit().phase == PitPhase::AtBox);
  REQUIRE(car.redFlagHold());
  REQUIRE(car.pit().plan.fuelLiters == 0.0);

  for (int i = 0; i < 50; ++i)
    car.processPitLaneTick(session.track, 0.1, session.staff, 3600.0, true);

  REQUIRE(car.inPitLane());
  REQUIRE_FALSE(car.pit().phase == PitPhase::DrivingOut);
}

TEST_CASE("Red flag emergency tyre work completes in pits without rejoining",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session);
  Car &car = FindCar(session, "entry-1");
  session.raceControl.flagPhase = FlagPhase::RedFlag;
  ApplyTyrePuncture(car.state(), 0, true);
  car.pit().inPit = true;
  car.pit().phase = PitPhase::AtBox;
  car.pit().pitLaneDistance = session.track.pitLane.boxDistance;
  car.pit().plan.tiresToChange = {"FL"};
  car.pit().pitDuration = 5.0;
  car.pit().pitElapsed = 0.0;

  for (int i = 0; i < 100; ++i)
    car.processPitLaneTick(session.track, 0.1, session.staff, 3600.0, true);

  REQUIRE(car.redFlagEmergencyWorked());
  REQUIRE(car.inPitLane());
  REQUIRE(car.redFlagHold());
  REQUIRE(car.pit().plan.tiresToChange.empty());
  REQUIRE(car.state().tyreDeflation.state[0] == TyreDeflationState::Normal);
}

TEST_CASE("SC release queues non-workers before red flag emergency workers",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  session.raceControl.flagPhase = FlagPhase::RedFlag;
  ApplyTyrePuncture(leader.state(), 0, true);
  leader.pit().inPit = true;
  leader.pit().phase = PitPhase::AtBox;
  leader.pit().pitLaneDistance = session.track.pitLane.boxDistance;
  leader.pit().plan.tiresToChange = {"FL"};
  leader.pit().pitDuration = 5.0;
  for (int i = 0; i < 100; ++i)
    leader.processPitLaneTick(session.track, 0.1, session.staff, 3600.0, true);
  REQUIRE(leader.redFlagEmergencyWorked());

  session.raceControl.redFlagPitOrder = {"entry-1", "entry-2"};
  second.placeInGarageHold(session.track);
  second.applyRedFlagHold();

  TransitionRedFlagToSc(session);

  REQUIRE_FALSE(second.redFlagHold());
  REQUIRE(second.pit().phase == PitPhase::DrivingOut);
  REQUIRE(leader.redFlagHold());
  REQUIRE(session.raceControl.scPitReleaseQueue.size() == 1);
  REQUIRE(session.raceControl.scPitReleaseQueue.front() == "entry-1");
}

TEST_CASE("SC pit release preserves pre-red-flag race order",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.state().currentDistance = 500.0;
  second.state().currentDistance = 400.0;

  session.raceControl.redFlagPitOrder = {"entry-1", "entry-2"};
  leader.placeInGarageHold(session.track);
  second.placeInGarageHold(session.track);
  leader.applyRedFlagHold();
  second.applyRedFlagHold();

  TransitionRedFlagToSc(session);

  REQUIRE_FALSE(leader.redFlagHold());
  REQUIRE(leader.pit().phase == PitPhase::DrivingOut);
  REQUIRE(second.redFlagHold());
  REQUIRE(session.raceControl.scPitReleaseQueue.size() == 1);
  REQUIRE(session.raceControl.scPitReleaseQueue.front() == "entry-2");
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

TEST_CASE("Multiple fire hazards on track deploy red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session);
  const double lap = session.track.lapLength();
  SpawnSurfaceHazard(session, lap * 0.15, HazardKind::Fire, "debug", 0.58, 40.0);
  SpawnSurfaceHazard(session, lap * 0.45, HazardKind::Fire, "debug", 0.58, 40.0);
  SpawnSurfaceHazard(session, lap * 0.75, HazardKind::Fire, "debug", 0.58, 40.0);

  UpdateRaceControl(session, {});

  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);
  REQUIRE(session.raceControl.redFlagActive);
}

TEST_CASE("Red flag on track car drives to pits without teleport",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  car.state().currentDistance = 250.0;
  car.state().currentSpeed = 30.0;
  session.raceControl.flagPhase = FlagPhase::RedFlag;

  UpdateRedFlagPitProcedure(session);
  REQUIRE(car.pit().pendingEnter);
  REQUIRE_FALSE(car.inPitLane());

  const double distanceBefore = car.state().currentDistance;
  const TrackPose pose =
      session.track.poseAtRaceDistance(car.state().currentDistance);
  REQUIRE_FALSE(car.processPitEntry(pose.normalizedT, false, true));
  REQUIRE(car.state().currentDistance == distanceBefore);
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

TEST_CASE("SC pit release skips garage rebuild and releases next car",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.beginGarageRebuild(session.track, 0.0, 120.0, "Garage rebuild");
  second.placeInGarageHold(session.track);
  second.applyRedFlagHold();

  session.raceControl.flagPhase = FlagPhase::SC;
  session.raceControl.scPitReleaseQueue = {"entry-1", "entry-2"};
  session.raceControl.scPitReleaseNextAt = 0.0;

  UpdateScPitRelease(session);

  REQUIRE(leader.inGarageRebuild());
  REQUIRE_FALSE(second.redFlagHold());
  REQUIRE(second.pit().phase == PitPhase::DrivingOut);
  REQUIRE(session.raceControl.scPitReleaseQueue.size() == 1);
  REQUIRE(session.raceControl.scPitReleaseQueue.front() == "entry-1");
}

TEST_CASE("Red flag SC picks reference car that can rejoin track",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  AddTestCar(session, "entry-1", "Team A");
  AddTestCar(session, "entry-2", "Team B");
  Car &leader = FindCar(session, "entry-1");
  Car &second = FindCar(session, "entry-2");
  leader.beginGarageRebuild(session.track, 0.0, 120.0, "Garage rebuild");
  second.placeInGarageHold(session.track);
  second.applyRedFlagHold();

  session.raceControl.redFlagPitOrder = {"entry-1", "entry-2"};
  TransitionRedFlagToSc(session);

  REQUIRE(session.raceControl.scReferenceEntryId == "entry-2");
  REQUIRE_FALSE(second.redFlagHold());
  REQUIRE(second.pit().phase == PitPhase::DrivingOut);
  REQUIRE((leader.redFlagHold() || leader.inGarageRebuild()));
}

TEST_CASE("Post-red-flag SC stays out for one lap before in this lap",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  car.placeInGarageHold(session.track);
  car.applyRedFlagHold();

  TransitionRedFlagToSc(session);
  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
  REQUIRE(session.raceControl.scLapsRemaining == 1);

  car.clearRedFlagHold();
  car.releaseFromGarage(session.track);
  car.pit().inPit = false;
  car.pit().phase = PitPhase::None;
  car.state().currentDistance = 100.0;
  session.raceControl.safetyCar.phase = SafetyCarPhase::OnTrack;
  session.raceControl.safetyCar.inPit = false;

  session.raceControl.fcyHoldUntil = session.elapsedRaceTime;
  session.raceControl.slowZoneHoldUntil = session.elapsedRaceTime;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);

  car.state().currentLap += 1;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.scLapsRemaining == 0);
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::SCInLap);
}

TEST_CASE("Post-red-flag SC does not peel off on deploy when order already correct",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  car.state().currentDistance = 250.0;
  session.raceControl.redFlagPitOrder = {"entry-1"};

  TransitionRedFlagToSc(session);
  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
  REQUIRE(session.raceControl.scLapsRemaining == 1);

  session.raceControl.fcyHoldUntil = session.elapsedRaceTime;
  session.raceControl.slowZoneHoldUntil = session.elapsedRaceTime;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::SC);
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
  REQUIRE(session.raceControl.redFlagReviewAt > session.elapsedRaceTime);
}

TEST_CASE("Red flag extension schedules another review before period ends",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session);
  session.weather.visibilityKm = 1.0;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.flagPhase == FlagPhase::RedFlag);

  const double reviewAt = session.raceControl.redFlagReviewAt;
  session.elapsedRaceTime = reviewAt + 0.1;
  UpdateRaceControl(session, {});
  REQUIRE(session.raceControl.redFlagExtensions == 1);
  REQUIRE(session.raceControl.redFlagReviewAt > session.elapsedRaceTime);
  REQUIRE(session.raceControl.redFlagUntil > session.elapsedRaceTime);
}

TEST_CASE("Debug green flag releases cars held in garage after red flag",
          "[unit][race_control][escalation]") {
  RaceSession session = MakeMinimalRaceSession();
  AddMinimalPitLane(session);
  Car &car = AddTestCar(session);
  car.placeInGarageHold(session.track);
  car.applyRedFlagHold();
  session.raceControl.flagPhase = FlagPhase::RedFlag;
  session.raceControl.scLapsRemaining = 2;

  DebugRaceControlRequest req;
  req.action = "flag_phase";
  req.phase = "green";
  REQUIRE(ApplyDebugRaceControl(session, req));

  REQUIRE(session.raceControl.flagPhase == FlagPhase::Green);
  REQUIRE(session.raceControl.scLapsRemaining == 0);
  REQUIRE_FALSE(car.redFlagHold());
  REQUIRE_FALSE(car.inGarageHold());
  REQUIRE(car.pit().phase == PitPhase::DrivingOut);
}
