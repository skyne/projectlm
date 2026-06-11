#include "sim_bridge.hpp"
#include "sim_checkpoint.hpp"
#include <catch2/catch_test_macros.hpp>

TEST_CASE("SimBridge checkpoint round-trip", "[unit][sim_checkpoint]") {
  SimBridge bridge;
  REQUIRE(bridge.initFromRaceConfig("configs/race_config_web.txt"));

  bridge.tick(2.0);
  const double raceTimeBefore = bridge.getRaceTime();
  REQUIRE(raceTimeBefore > 0.0);

  const SimCheckpointV1 saved = bridge.captureCheckpoint();
  REQUIRE(saved.cars.size() > 0);

  REQUIRE(bridge.initFromRaceConfig(saved.raceConfigPath));
  std::string error;
  REQUIRE(bridge.restoreCheckpoint(saved, &error));

  REQUIRE(bridge.getRaceTime() == Approx(raceTimeBefore).margin(0.01));
  const auto snaps = bridge.getSnapshots();
  REQUIRE(snaps.size() == saved.cars.size());
}
