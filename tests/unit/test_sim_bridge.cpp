#include "sim_bridge.hpp"
#include "../helpers/paths.hpp"
#include <algorithm>
#include <catch_amalgamated.hpp>

TEST_CASE("SimBridge read API lifecycle", "[unit][sim_bridge]") {
  SimBridge bridge;
  REQUIRE(bridge.initFromRaceConfig(ConfigPath("race_config.txt")));

  REQUIRE_FALSE(bridge.isRaceComplete());

  const TrackGeometry geometry = bridge.getTrackGeometry();
  REQUIRE(geometry.name == "Circuit de la Sarthe");
  REQUIRE(geometry.lapLength == Catch::Approx(13626.0).margin(1.0));
  REQUIRE(geometry.points.size() >= 100);
  REQUIRE(geometry.sectors.size() == 17);

  const auto initialSnapshots = bridge.getSnapshots();
  REQUIRE(initialSnapshots.size() == 1);
  REQUIRE(initialSnapshots.front().entryId != "");

  bridge.tick(0.1);
  const auto snapshots = bridge.getSnapshots();
  REQUIRE(snapshots.size() == 1);
  REQUIRE(snapshots.front().distance >= 0.0);

  bool sawEvents = false;
  const int maxTicks = 50000;
  for (int i = 0; i < maxTicks && !bridge.isRaceComplete(); ++i) {
    bridge.tick(0.1);
    const auto events = bridge.drainEvents();
    if (!events.empty()) {
      sawEvents = true;
      break;
    }
  }
  REQUIRE(sawEvents);

  for (int i = 0; i < maxTicks && !bridge.isRaceComplete(); ++i)
    bridge.tick(0.1);

  REQUIRE(bridge.isRaceComplete());

  const auto finalEvents = bridge.drainEvents();
  const bool hasRaceComplete = std::any_of(
      finalEvents.begin(), finalEvents.end(), [](const SimEvent &event) {
        return event.type == SimEventType::RaceComplete;
      });
  REQUIRE(hasRaceComplete);
}

TEST_CASE("SimBridge restartRace resets progress", "[unit][sim_bridge]") {
  SimBridge bridge;
  REQUIRE(bridge.initFromRaceConfig(ConfigPath("race_config.txt")));

  bridge.tick(1.0);
  REQUIRE(bridge.getSnapshots().front().distance > 0.0);
  REQUIRE(bridge.restartRace());
  REQUIRE(bridge.getSnapshots().front().distance == Catch::Approx(0.0));
  REQUIRE_FALSE(bridge.isRaceComplete());
}

TEST_CASE("SimBridge reloadDefinitions refreshes session", "[unit][sim_bridge]") {
  SimBridge bridge;
  const std::string configPath = ConfigPath("race_config.txt");
  REQUIRE(bridge.initFromRaceConfig(configPath));

  bridge.tick(2.0);
  REQUIRE(bridge.reloadDefinitions());
  REQUIRE(bridge.getSnapshots().front().distance == Catch::Approx(0.0));
  REQUIRE_FALSE(bridge.isRaceComplete());

  const TrackGeometry geometry = bridge.getTrackGeometry();
  REQUIRE(geometry.name == "Circuit de la Sarthe");
}
