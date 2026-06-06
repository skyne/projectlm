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
  REQUIRE(session.cars.size() == 68);
  REQUIRE(session.cars[0].teamName().find("Aston Martin") != std::string::npos);
  REQUIRE(session.cars[17].raceClass().id == "Hypercar");
  REQUIRE(session.cars[18].raceClass().id == "LMP2");
  REQUIRE(session.cars[36].raceClass().id == "LMP2");
  REQUIRE(session.cars[37].raceClass().id == "LMGT3");
  REQUIRE(session.cars[0].carNumber() == "007");
  REQUIRE(session.cars[2].carNumber() == "7");
  REQUIRE(session.cars[61].carNumber() == "150");

  while (!IsRaceComplete(session))
    TickRace(session, 0.1);

  REQUIRE(IsRaceComplete(session));
  auto board = GetLeaderboard(session);
  REQUIRE(board.size() == 68);
  // Multiclass BoP — cars finish laps at different rates; leader triggers session end
  REQUIRE(board.front()->state().currentLap > session.targetLaps);
  for (const Car *car : board)
    REQUIRE(car->raceClass().id != "");
}
