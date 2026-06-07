#include "class_rules.hpp"
#include "config_loader.hpp"
#include "race.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>
#include <filesystem>
#include <fstream>

TEST_CASE("LoadEntriesFromConfig honors explicit entry_id with duplicate grids",
          "[integration][race]") {
  const std::string path =
      (std::filesystem::path(ProjectRoot()) / "configs/runtime/_test_entry_ids.txt")
          .string();
  {
    std::filesystem::create_directories(
        std::filesystem::path(path).parent_path());
    const std::string hyperCar =
        (std::filesystem::path(ProjectRoot()) /
         "configs/cars/lemans2026/aston_martin_valkyrie.txt")
            .string();
    const std::string gt3Car =
        (std::filesystem::path(ProjectRoot()) /
         "configs/cars/lemans2026/aston_martin_vantage_lmgt3.txt")
            .string();
    std::ofstream out(path);
    out << "# test duplicate class grids\n";
    out << "entry=Team Hyper," << hyperCar << ",Hypercar,1,20,entry-hyper-1\n";
    out << "entry=Team GT3," << gt3Car << ",LMGT3,1,20,entry-gt3-1\n";
  }

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

  REQUIRE(LoadEntriesFromConfig(session, path, catalog, assembly,
                                ConfigPath("class_rules.txt")));
  REQUIRE(session.cars.size() == 2);
  REQUIRE(session.cars[0].entryId() == "entry-hyper-1");
  REQUIRE(session.cars[1].entryId() == "entry-gt3-1");
  REQUIRE(session.cars[0].carNumber() == "20");
  REQUIRE(session.cars[1].carNumber() == "20");
  REQUIRE(session.cars[0].raceClass().id == "Hypercar");
  REQUIRE(session.cars[1].raceClass().id == "LMGT3");
}
