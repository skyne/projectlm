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
                const std::vector<Car *> &leaderboard = {}) {
  std::vector<TrafficEvent> events;
  std::unordered_map<std::string, double> cooldowns;
  ResolveTraffic(session.cars, session.track.lapLength(), 100.0, cooldowns, mods,
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

TEST_CASE("Faster class closing triggers yield not defend",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "hyp", "Hyper Team", "Hypercar");
  AddClassCar(session, "gt", "GT Team", "LMGT3");

  Car &hyp = FindCar(session, "hyp");
  Car &gt = FindCar(session, "gt");
  hyp.state().currentLap = 1;
  gt.state().currentLap = 1;
  hyp.state().currentDistance = 400.0;
  gt.state().currentDistance = 418.0;
  hyp.state().currentSpeed = 72.0;
  gt.state().currentSpeed = 58.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles);

  const size_t gtIdx = ModIndex(session, "gt");
  const size_t hypIdx = ModIndex(session, "hyp");
  REQUIRE(mods[gtIdx].blueFlag);
  REQUIRE(mods[gtIdx].yielding);
  REQUIRE_FALSE(mods[gtIdx].defending);
  REQUIRE(mods[hypIdx].overtaking);
  REQUIRE((mods[gtIdx].pathIntent == TrafficPathIntent::YieldInside ||
           mods[gtIdx].pathIntent == TrafficPathIntent::YieldOutside));
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
  leader.state().currentDistance = 512.0;
  chaser.state().currentSpeed = 66.0;
  leader.state().currentSpeed = 54.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles);

  const size_t leaderIdx = ModIndex(session, "leader");
  REQUIRE(mods[leaderIdx].defending);
  REQUIRE_FALSE(mods[leaderIdx].yielding);
  REQUIRE((mods[leaderIdx].pathIntent == TrafficPathIntent::DefendInside ||
           mods[leaderIdx].pathIntent == TrafficPathIntent::DefendOutside));
}

TEST_CASE("In-class lapping uses yield path not defend",
          "[unit][overtake_battle]") {
  RaceSession session = MakeMinimalRaceSession();
  AddClassCar(session, "lapper", "Lap Team", "Hypercar");
  AddClassCar(session, "lapped", "Lapped Team", "Hypercar");

  Car &lapper = FindCar(session, "lapper");
  Car &lapped = FindCar(session, "lapped");
  lapper.state().currentLap = 2;
  lapped.state().currentLap = 1;
  lapper.state().currentDistance = 200.0;
  lapped.state().currentDistance = 220.0;
  lapper.state().currentSpeed = 70.0;
  lapped.state().currentSpeed = 68.0;

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunBattles(session, mods, battles);

  const size_t lappedIdx = ModIndex(session, "lapped");
  REQUIRE(DefenderMustYield(lapper, lapped, 1));
  REQUIRE(mods[lappedIdx].yielding);
  REQUIRE_FALSE(mods[lappedIdx].defending);
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
