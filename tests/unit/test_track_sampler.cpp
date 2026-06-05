#include "track.hpp"
#include "track_sampler.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>
#include <cmath>
#include <limits>

TEST_CASE("SampleTrackXZ produces dense La Sarthe polyline", "[unit][track_sampler]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  REQUIRE(track.displayPolyline.size() >= 1000);

  const TrackGeometry geometry = SampleTrackXZ(track);

  REQUIRE(geometry.name == "Circuit de la Sarthe");
  REQUIRE(geometry.points.size() >= 1000);
  REQUIRE(geometry.lapLength == Catch::Approx(13626.0).margin(1.0));
  REQUIRE(geometry.points.size() >= 100);
  REQUIRE(geometry.sectors.size() == track.sectors.size());

  double minX = std::numeric_limits<double>::max();
  double maxX = std::numeric_limits<double>::lowest();
  double minZ = std::numeric_limits<double>::max();
  double maxZ = std::numeric_limits<double>::lowest();

  for (const TrackGeometryPoint &point : geometry.points) {
    REQUIRE(std::isfinite(point.x));
    REQUIRE(std::isfinite(point.z));
    minX = std::min(minX, point.x);
    maxX = std::max(maxX, point.x);
    minZ = std::min(minZ, point.z);
    maxZ = std::max(maxZ, point.z);
  }

  REQUIRE(minX >= -200.0);
  REQUIRE(maxX <= 12000.0);
  REQUIRE(minZ >= -200.0);
  REQUIRE(maxZ <= 12000.0);
  REQUIRE(geometry.points.size() >= 100);
}

TEST_CASE("SampleTrackXZ renders closed La Sarthe spline loop", "[unit][track_sampler]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  const TrackGeometry geometry = SampleTrackXZ(track, 25.0);
  REQUIRE(geometry.name == "Circuit de la Sarthe");
  REQUIRE(geometry.points.size() >= 100);
  REQUIRE(geometry.sectors.size() == track.sectors.size());

  const TrackGeometryPoint &first = geometry.points.front();
  const TrackGeometryPoint &last = geometry.points.back();
  const double gap = std::hypot(last.x - first.x, last.z - first.z);
  REQUIRE(gap < 50.0);
}

TEST_CASE("SampleTrackXZ copies sector normalized bounds", "[unit][track_sampler]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("lemans_la_sarthe.json"), track));

  const TrackGeometry geometry = SampleTrackXZ(track, 50.0);

  REQUIRE(geometry.points.size() >= 100);
  REQUIRE(geometry.sectors.front().name == track.sectors.front().name);
  REQUIRE(geometry.sectors.front().startT ==
          Catch::Approx(track.sectors.front().startT));
  REQUIRE(geometry.sectors.back().endT ==
          Catch::Approx(track.sectors.back().endT));
}
