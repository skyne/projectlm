#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "overtake_battle.hpp"
#include "traffic.hpp"

namespace {

TrafficLateralContext CorridorLateral(const RaceSession &session) {
  TrafficLateralContext lateral;
  lateral.trackWidthM = session.trackWidthM;
  lateral.corridor = &session.corridor;
  lateral.useFrenetDynamics = false;
  return lateral;
}

Car &AddClassCar(RaceSession &session, const std::string &entryId,
                 const std::string &teamName, const std::string &classId) {
  CarConfig car;
  car.calculatedTotalMass = 900.0;
  car.fuelTankCapacity = 100.0;
  RaceClass cls{classId, classId};
  AddCar(session, car, cls, teamName, 1, "1", entryId);
  InitPartDamageState(session.cars.back().state().partDamage);
  return session.cars.back();
}

void RunBattles(RaceSession &session, std::vector<TrafficModifiers> &mods,
                std::vector<OvertakeBattle> &battles,
                const std::vector<Car *> &leaderboard = {},
                double raceTime = 100.0) {
  std::vector<TrafficEvent> events;
  std::unordered_map<std::string, double> cooldowns;
  ResolveTraffic(session.cars, session.track.lapLength(), raceTime, cooldowns, mods,
                 events, SessionRaceControl{}, leaderboard,
                 CorridorLateral(session), &battles);
}

size_t ModIndex(const RaceSession &session, const std::string &entryId) {
  for (size_t i = 0; i < session.cars.size(); ++i) {
    if (session.cars[i].entryId() == entryId)
      return i;
  }
  return session.cars.size();
}

} // namespace

TEST_CASE("Faster class closing triggers blue flag not defend",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(session, "gt", "GT Team", "LMGT3");

  Car &hyp = FindCar(session, "hyp");
  Car &gt = FindCar(session, "gt");
  hyp.state().currentLap = 1;
  gt.state().currentLap = 1;
  hyp.state().currentDistance = 400.0;
  gt.state().currentDistance = 408.0;
  hyp.state().currentSpeed = 72.0;
  gt.state().currentSpeed = 58.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles, {}, 100.0);
  RunBattles(session, mods, battles, {}, 100.5);

  const size_t gtIdx = ModIndex(session, "gt");
  const size_t hypIdx = ModIndex(session, "hyp");
  REQUIRE(mods[gtIdx].blueFlag);
  REQUIRE_FALSE(mods[gtIdx].defending);
  REQUIRE(mods[hypIdx].overtaking);
  REQUIRE((mods[hypIdx].pathIntent == TrafficPathIntent::AttackInside ||
           mods[hypIdx].pathIntent == TrafficPathIntent::AttackOutside));
  REQUIRE(mods[gtIdx].pathIntent != TrafficPathIntent::YieldInside);
  REQUIRE(mods[gtIdx].pathIntent != TrafficPathIntent::YieldOutside);
}

TEST_CASE("Faster class blue flag at extended lookahead before pass window",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(session, "gt", "GT Team", "LMGT3");

  Car &hyp = FindCar(session, "hyp");
  Car &gt = FindCar(session, "gt");
  hyp.state().currentLap = 1;
  gt.state().currentLap = 1;
  hyp.state().currentDistance = 300.0;
  gt.state().currentDistance = 350.0;
  hyp.state().currentSpeed = 72.0;
  gt.state().currentSpeed = 58.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles);

  const size_t gtIdx = ModIndex(session, "gt");
  const size_t hypIdx = ModIndex(session, "hyp");
  REQUIRE(mods[gtIdx].blueFlag);
  REQUIRE(mods[hypIdx].overtaking);
  REQUIRE(mods[gtIdx].pathIntent != TrafficPathIntent::YieldInside);
  REQUIRE(mods[gtIdx].pathIntent != TrafficPathIntent::YieldOutside);
}

TEST_CASE("Same-class battle allows defender to close the door",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "chaser", "Chase Team", "LMGT3");
  AddClassCar(session, "leader", "Lead Team", "LMGT3");

  Car &chaser = FindCar(session, "chaser");
  Car &leader = FindCar(session, "leader");
  chaser.state().currentLap = 1;
  leader.state().currentLap = 1;
  chaser.state().currentDistance = 500.0;
  leader.state().currentDistance = 508.0;
  chaser.state().currentSpeed = 66.0;
  leader.state().currentSpeed = 54.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles, {}, 100.0);
  RunBattles(session, mods, battles, {}, 100.5);
  RunBattles(session, mods, battles, {}, 101.0);

  const size_t leaderIdx = ModIndex(session, "leader");
  REQUIRE(mods[leaderIdx].defending);
  REQUIRE_FALSE(mods[leaderIdx].yielding);
  REQUIRE((mods[leaderIdx].pathIntent == TrafficPathIntent::DefendInside ||
           mods[leaderIdx].pathIntent == TrafficPathIntent::DefendOutside));
}

TEST_CASE("In-class lapping uses blue flag not defend",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "lapper", "Lap Team", "Hypercar");
  AddClassCar(session, "lapped", "Lapped Team", "Hypercar");

  Car &lapper = FindCar(session, "lapper");
  Car &lapped = FindCar(session, "lapped");
  lapper.state().currentLap = 2;
  lapped.state().currentLap = 1;
  lapper.state().currentDistance = 200.0;
  lapped.state().currentDistance = 214.0;
  lapper.state().currentSpeed = 70.0;
  lapped.state().currentSpeed = 55.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles);

  const size_t lappedIdx = ModIndex(session, "lapped");
  REQUIRE(DefenderMustYield(lapper, lapped, 1));
  REQUIRE(mods[lappedIdx].blueFlag);
  REQUIRE_FALSE(mods[lappedIdx].defending);
  REQUIRE(mods[lappedIdx].pathIntent != TrafficPathIntent::YieldInside);
  REQUIRE(mods[lappedIdx].pathIntent != TrafficPathIntent::YieldOutside);
}

TEST_CASE("Separated cars on racing line avoid collision",
          "[unit][traffic][2d][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(session, "gt", "GT Team", "LMGT3");

  Car &hyp = FindCar(session, "hyp");
  Car &gt = FindCar(session, "gt");
  hyp.state().currentLap = 1;
  gt.state().currentLap = 1;
  hyp.state().currentDistance = 200.0;
  gt.state().currentDistance = 206.0;
  hyp.state().currentSpeed = 70.0;
  gt.state().currentSpeed = 40.0;
  hyp.setLateralOffset(0.0);
  gt.setLateralOffset(0.85);

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles);

  const size_t hypIdx = ModIndex(session, "hyp");
  REQUIRE(mods[hypIdx].collisionDamage == 0.0);
  REQUIRE_FALSE(mods[hypIdx].collision);
}

TEST_CASE("Blue flag chaser applies gap-based speed cap and throttle lift",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(session, "gt", "GT Team", "LMGT3");

  Car &hyp = FindCar(session, "hyp");
  Car &gt = FindCar(session, "gt");
  hyp.driver().active().trafficManagement = 55.0;
  hyp.driver().active().composure = 50.0;
  hyp.state().currentLap = 1;
  gt.state().currentLap = 1;
  hyp.state().currentDistance = 400.0;
  gt.state().currentDistance = 430.0;
  hyp.state().currentSpeed = 72.0;
  gt.state().currentSpeed = 58.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles, {}, 100.0);
  RunBattles(session, mods, battles, {}, 100.5);

  const size_t hypIdx = ModIndex(session, "hyp");
  REQUIRE(mods[hypIdx].overtaking);
  REQUIRE(mods[hypIdx].speedCapMs > 58.0);
  REQUIRE(mods[hypIdx].speedCapMs < 72.0);
  REQUIRE(mods[hypIdx].throttleLift > 0.0);
  REQUIRE(mods[hypIdx].draftThrottleBoost < 0.012);
}

TEST_CASE("Blue flag chaser tighter when not in push mode",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(session, "gt", "GT Team", "LMGT3");

  Car &hyp = FindCar(session, "hyp");
  Car &gt = FindCar(session, "gt");
  hyp.driver().active().trafficManagement = 70.0;
  hyp.driver().active().composure = 70.0;
  hyp.state().currentLap = 1;
  gt.state().currentLap = 1;
  hyp.state().currentDistance = 400.0;
  gt.state().currentDistance = 430.0;
  hyp.state().currentSpeed = 72.0;
  gt.state().currentSpeed = 58.0;

  auto runOnce = [&](DriverMode mode) {
    hyp.driver().mode = mode;
    std::vector<TrafficModifiers> mods;
    std::vector<OvertakeBattle> battles;
    RunBattles(session, mods, battles, {}, 100.0);
    RunBattles(session, mods, battles, {}, 100.5);
    return mods[ModIndex(session, "hyp")];
  };

  const TrafficModifiers normalMod = runOnce(DriverMode::Normal);
  const TrafficModifiers pushMod = runOnce(DriverMode::Push);

  REQUIRE(normalMod.speedCapMs > 58.0);
  REQUIRE(pushMod.speedCapMs > normalMod.speedCapMs);
  REQUIRE(normalMod.throttleLift > pushMod.throttleLift);
  REQUIRE(normalMod.pathUrgency < pushMod.pathUrgency);
}

TEST_CASE("GT upset pass on healthy hyper is cautious not full send",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(session, "gt", "GT Team", "LMGT3");

  Car &hyp = FindCar(session, "hyp");
  Car &gt = FindCar(session, "gt");
  hyp.state().currentLap = 1;
  gt.state().currentLap = 1;
  hyp.state().currentDistance = 412.0;
  gt.state().currentDistance = 400.0;
  hyp.state().currentSpeed = 22.0;
  gt.state().currentSpeed = 26.0;
  hyp.state().engineHealth = 100.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  for (double t = 100.0; t <= 101.0; t += 0.22) {
    RunBattles(session, mods, battles, {}, t);
  }

  const size_t gtIdx = ModIndex(session, "gt");
  REQUIRE(mods[gtIdx].overtaking);
  REQUIRE(mods[gtIdx].speedCapMs > 22.0);
  REQUIRE(mods[gtIdx].speedCapMs < 26.5);
  REQUIRE(mods[gtIdx].pathUrgency < 0.78);
  REQUIRE(mods[gtIdx].throttleLift > 0.0);
}

TEST_CASE("GT upset pass on limping hyper allows more commitment",
          "[unit][overtake_battle]") {
  RaceSession sessionHealthy = MakeMinimalRaceSession();
  AddClassCar(sessionHealthy, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(sessionHealthy, "gt", "GT Team", "LMGT3");
  Car &hypH = FindCar(sessionHealthy, "hyp");
  Car &gtH = FindCar(sessionHealthy, "gt");
  hypH.state().currentLap = 1;
  gtH.state().currentLap = 1;
  hypH.state().currentDistance = 412.0;
  gtH.state().currentDistance = 400.0;
  hypH.state().currentSpeed = 22.0;
  gtH.state().currentSpeed = 26.0;
  hypH.state().engineHealth = 100.0;

  std::vector<TrafficModifiers> modsHealthy;
  std::vector<OvertakeBattle> battlesHealthy;
  for (double t = 100.0; t <= 101.0; t += 0.22) {
    RunBattles(sessionHealthy, modsHealthy, battlesHealthy, {}, t);
  }

  RaceSession sessionLimp = MakeMinimalRaceSession();
  AddClassCar(sessionLimp, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(sessionLimp, "gt", "GT Team", "LMGT3");
  Car &hypL = FindCar(sessionLimp, "hyp");
  Car &gtL = FindCar(sessionLimp, "gt");
  hypL.state().currentLap = 1;
  gtL.state().currentLap = 1;
  hypL.state().currentDistance = 412.0;
  gtL.state().currentDistance = 400.0;
  hypL.state().currentSpeed = 18.0;
  gtL.state().currentSpeed = 28.0;
  hypL.state().engineHealth = 68.0;

  std::vector<TrafficModifiers> modsLimp;
  std::vector<OvertakeBattle> battlesLimp;
  for (double t = 100.0; t <= 101.0; t += 0.22) {
    RunBattles(sessionLimp, modsLimp, battlesLimp, {}, t);
  }

  REQUIRE(modsLimp[ModIndex(sessionLimp, "gt")].pathUrgency >
          modsHealthy[ModIndex(sessionHealthy, "gt")].pathUrgency);
}
