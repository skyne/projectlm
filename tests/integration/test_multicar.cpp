#include "class_rules.hpp"
#include "config_loader.hpp"
#include "race.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

TEST_CASE("LoadEntriesFromConfig loads three classes", "[integration][race]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  PhysicsConfig physics;
  TrackDefinition track;

  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  RaceSession session;
  session.track = track;
  session.physics = physics;
  session.targetLaps = 1;

  REQUIRE(LoadEntriesFromConfig(session, ConfigPath("entries.txt"), catalog,
                                assembly, ConfigPath("class_rules.txt")));
  REQUIRE(session.cars.size() == 8);
  REQUIRE(session.cars[0].carNumber() == 7);
  REQUIRE(session.cars[5].carNumber() == 91);

  while (!IsRaceComplete(session))
    TickRace(session, 0.1);

  REQUIRE(IsRaceComplete(session));
  auto board = GetLeaderboard(session);
  REQUIRE(board.size() == 8);
  // Multiclass BoP — cars finish laps at different rates; leader triggers session end
  REQUIRE(board.front()->state().currentLap > session.targetLaps);
  for (const Car *car : board)
    REQUIRE(car->raceClass().id != "");
}

TEST_CASE("Multiclass BoP pace order after one lap", "[integration][race][pace]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  PhysicsConfig physics;
  TrackDefinition track;

  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadPhysicsConfig(ConfigPath("physics_config.txt"), physics));
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  RaceSession session;
  session.track = track;
  session.physics = physics;
  session.targetLaps = 1;

  REQUIRE(LoadEntriesFromConfig(session, ConfigPath("entries.txt"), catalog,
                                assembly, ConfigPath("class_rules.txt")));

  const int maxTicks = 20000;
  for (int i = 0; i < maxTicks; ++i) {
    TickRace(session, 0.1);
    bool allFinished = true;
    for (const Car &car : session.cars) {
      if (car.isRetired())
        continue;
      if (car.state().currentLap <= 1)
        allFinished = false;
    }
    if (allFinished)
      break;
  }

  auto bestForClass = [&](const std::string &classId) -> double {
    double best = 0.0;
    for (const Car &car : session.cars) {
      if (car.raceClass().id != classId || car.isRetired())
        continue;
      const auto &laps = car.telemetry().laps();
      if (laps.empty())
        continue;
      const double lapTime = laps.front().lapTime;
      if (best <= 0.0 || lapTime < best)
        best = lapTime;
    }
    return best;
  };

  const double hypercar = bestForClass("Hypercar");
  const double lmp2 = bestForClass("LMP2");
  const double lmgt3 = bestForClass("LMGT3");
  REQUIRE(hypercar > 0.0);
  REQUIRE(lmp2 > 0.0);
  REQUIRE(lmgt3 > 0.0);
  REQUIRE(hypercar < lmp2);
  REQUIRE(lmp2 < lmgt3);
}
