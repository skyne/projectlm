#include "track.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>
#include <cmath>

TEST_CASE("LoadTrack loads La Sarthe JSON", "[unit][track]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));
  REQUIRE(track.name == "Circuit de la Sarthe");
  REQUIRE(track.sectors.size() == 17);
  REQUIRE(track.lapLength() == Catch::Approx(13626.0).margin(1.0));
}

TEST_CASE("TrackSpline pose along lap", "[unit][track]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  TrackPose start = track.poseAtDistance(0.0);
  TrackPose mid = track.poseAtDistance(track.lapLength() * 0.5);

  REQUIRE(start.normalizedT == Catch::Approx(0.0).margin(0.01));
  REQUIRE(mid.normalizedT == Catch::Approx(0.5).margin(0.02));
  REQUIRE(std::isfinite(start.position.x));
  REQUIRE(std::isfinite(mid.position.z));
}

TEST_CASE("sectorIndexAtDistance wraps sectors", "[unit][track]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  size_t s0 = track.sectorIndexAtDistance(0.0);
  size_t sMid = track.sectorIndexAtDistance(track.lapLength() * 0.3);
  REQUIRE(s0 < track.sectors.size());
  REQUIRE(sMid < track.sectors.size());
}
