#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "part_damage.hpp"
#include "traffic.hpp"

namespace {

TrafficLateralContext CorridorLateral(const RaceSession &session) {
  TrafficLateralContext lateral;
  lateral.trackWidthM = session.trackWidthM;
  lateral.corridor = &session.corridor;
  lateral.useFrenetDynamics = false;
  return lateral;
}

void RunTraffic(RaceSession &session, std::vector<TrafficModifiers> &mods,
                std::vector<OvertakeBattle> *battles = nullptr) {
  std::vector<TrafficEvent> events;
  std::unordered_map<std::string, double> cooldowns;
  std::vector<OvertakeBattle> localBattles;
  ResolveTraffic(session.cars, session.track.lapLength(), 100.0, cooldowns, mods,
                 events, SessionRaceControl{}, {}, CorridorLateral(session),
                 battles != nullptr ? battles : &localBattles);
}

} // namespace

TEST_CASE("Collision requires lateral overlap in same corridor",
          "[unit][traffic][2d]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "a", "Team A");
  AddTestCar(session, "b", "Team B");
  Car &a = FindCar(session, "a");
  Car &b = FindCar(session, "b");

  a.state().currentLap = 1;
  b.state().currentLap = 1;
  a.state().currentDistance = 200.0;
  b.state().currentDistance = 206.0;
  a.state().currentSpeed = 70.0;
  b.state().currentSpeed = 40.0;
  a.setLateralOffset(0.0);
  b.setLateralOffset(0.85);

  std::vector<TrafficModifiers> mods;
  RunTraffic(session, mods);
  REQUIRE(mods[0].collisionDamage == 0.0);
  REQUIRE_FALSE(mods[0].collision);
}

TEST_CASE("Proximity without overlap or closing speed avoids damage",
          "[unit][traffic][2d]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "a", "Team A");
  AddTestCar(session, "b", "Team B");
  Car &a = FindCar(session, "a");
  Car &b = FindCar(session, "b");

  a.state().currentLap = 1;
  b.state().currentLap = 1;
  a.state().currentDistance = 200.0;
  b.state().currentDistance = 206.0;
  a.state().currentSpeed = 70.0;
  b.state().currentSpeed = 65.0;
  a.setLateralOffset(0.0);
  b.setLateralOffset(0.05);

  std::vector<TrafficModifiers> mods;
  RunTraffic(session, mods);
  REQUIRE(mods[0].collisionDamage == 0.0);
  REQUIRE_FALSE(mods[0].collision);
}

TEST_CASE("Collision triggers when cars overlap laterally at closing speed",
          "[unit][traffic][2d]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "a", "Team A");
  AddTestCar(session, "b", "Team B");
  Car &a = FindCar(session, "a");
  Car &b = FindCar(session, "b");

  a.state().currentLap = 1;
  b.state().currentLap = 1;
  a.state().currentDistance = 200.0;
  b.state().currentDistance = 204.0;
  a.state().currentSpeed = 70.0;
  b.state().currentSpeed = 40.0;
  a.setLateralOffset(0.0);
  b.setLateralOffset(0.05);

  std::vector<TrafficModifiers> mods;
  RunTraffic(session, mods);
  REQUIRE(mods[0].collision);
  REQUIRE(mods[0].collisionDamage > 0.0);
  REQUIRE(mods[1].collisionDamage > 0.0);
  REQUIRE(mods[0].collisionSide != CollisionSide::Unknown);
  REQUIRE(mods[1].collisionSide == MirrorCollisionSide(mods[0].collisionSide));
}

TEST_CASE("Rejoin yield blue flag only when corridors overlap",
          "[unit][traffic][2d]") {
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
  rejoin.setLateralOffset(0.58);

  fast.state().currentLap = 1;
  fast.state().currentDistance = merge - 30.0;
  fast.state().currentSpeed = 58.0;
  fast.setLateralOffset(-0.85);

  std::vector<TrafficModifiers> mods;
  RunTraffic(session, mods);
  REQUIRE_FALSE(mods[1].blueFlag);
}

TEST_CASE("Overtake battle commits attacker to pass line from same lane",
          "[unit][traffic][2d]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "passer", "Pass Team");
  AddTestCar(session, "leader", "Lead Team");
  Car &passer = FindCar(session, "passer");
  Car &leader = FindCar(session, "leader");

  passer.state().currentLap = 1;
  leader.state().currentLap = 1;
  passer.state().currentDistance = 300.0;
  leader.state().currentDistance = 308.0;
  passer.state().currentSpeed = 65.0;
  leader.state().currentSpeed = 52.0;
  passer.setLateralOffset(0.0);
  leader.setLateralOffset(0.0);

  std::vector<TrafficModifiers> mods;
  std::vector<OvertakeBattle> battles;
  RunTraffic(session, mods, &battles);
  REQUIRE(mods[0].overtaking);
  REQUIRE(mods[0].pathIntent != TrafficPathIntent::None);
  REQUIRE_FALSE(battles.empty());
}

TEST_CASE("Traffic caps speed near unstable car in same corridor",
          "[unit][traffic][2d]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "follower", "Follow Team");
  AddTestCar(session, "unstable", "Spin Team");
  Car &follower = FindCar(session, "follower");
  Car &unstable = FindCar(session, "unstable");

  follower.state().currentLap = 1;
  unstable.state().currentLap = 1;
  follower.state().currentDistance = 400.0;
  unstable.state().currentDistance = 408.0;
  follower.state().currentSpeed = 62.0;
  unstable.state().currentSpeed = 48.0;
  follower.setLateralOffset(0.0);
  unstable.setLateralOffset(0.0);
  unstable.rcState().unstableOnTrack = true;

  std::vector<TrafficModifiers> mods;
  RunTraffic(session, mods);
  REQUIRE(mods[0].speedCapMs > 0.0);
  REQUIRE(mods[0].speedCapMs < follower.state().currentSpeed);
  REQUIRE(mods[0].localGripScale <= 0.91);
}

TEST_CASE("Overtake allowed when passer is offset toward outside lane",
          "[unit][traffic][2d]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "passer", "Pass Team");
  AddTestCar(session, "leader", "Lead Team");
  Car &passer = FindCar(session, "passer");
  Car &leader = FindCar(session, "leader");

  passer.state().currentLap = 1;
  leader.state().currentLap = 1;
  passer.state().currentDistance = 300.0;
  leader.state().currentDistance = 308.0;
  passer.state().currentSpeed = 65.0;
  leader.state().currentSpeed = 52.0;
  passer.setLateralOffset(0.55);
  leader.setLateralOffset(0.0);

  std::vector<TrafficModifiers> mods;
  RunTraffic(session, mods);
  REQUIRE(mods[0].overtaking);
}
