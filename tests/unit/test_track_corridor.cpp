#include "track.hpp"
#include "track_corridor.hpp"
#include "track_perimeter_surfaces.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>
#include <cmath>

TEST_CASE("Paul Ricard surface profile loads and affects zone grip",
          "[unit][corridor]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("paul_ricard.json"), track));
  REQUIRE(track.corridor.surfaceProfile.size() >= 3);
  TrackCorridor corridor;
  corridor.build(track);
  const double s = track.lapLength() * 0.55;
  const double halfAsphalt = corridor.asphaltHalfWidth(s);
  const double grip =
      corridor.zoneGripAt(s, halfAsphalt + 4.0);
  REQUIRE(grip < 1.0);
}

TEST_CASE("Synthesized perimeter grass and barrier wrap the lap",
          "[unit][corridor]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("fuji.json"), track));
  REQUIRE(track.corridor.surfaceProfile.size() >= 4);
  TrackCorridor corridor;
  corridor.build(track);
  const double s = track.lapLength() * 0.12;
  const double halfAsphalt = corridor.asphaltHalfWidth(s);
  const LateralSurfaceZone grassZone =
      corridor.lateralZoneAt(s, halfAsphalt + 5.0);
  REQUIRE((grassZone == LateralSurfaceZone::OutboardRunoff ||
           grassZone == LateralSurfaceZone::InboardRunoff));
  const double extent = corridor.maxLateralExtentN(s, halfAsphalt + 5.0);
  REQUIRE(extent >= halfAsphalt + kPerimeterGrassGapM);
}

TEST_CASE("TrackCorridor lateral zones partition asphalt runoff boundary",
          "[unit][corridor]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("sample_circuit.json"), track));
  TrackCorridor corridor;
  corridor.build(track);
  const double s = track.lapLength() * 0.2;
  const double halfAsphalt = corridor.asphaltHalfWidth(s);
  REQUIRE(corridor.lateralZoneAt(s, 0.0) == LateralSurfaceZone::Asphalt);
  REQUIRE(corridor.lateralZoneAt(s, halfAsphalt * 0.5) ==
          LateralSurfaceZone::Asphalt);
  REQUIRE(corridor.lateralZoneAt(s, halfAsphalt + 2.0) ==
          LateralSurfaceZone::OutboardRunoff);
  REQUIRE(corridor.lateralZoneAt(s, -(halfAsphalt + 2.0)) ==
          LateralSurfaceZone::InboardRunoff);
  REQUIRE(corridor.lateralZoneAt(s, halfAsphalt + 8.0) ==
          LateralSurfaceZone::OutboardRunoff);
  REQUIRE(corridor.lateralZoneAt(s, halfAsphalt + kPerimeterGrassGapM + 0.5) ==
          LateralSurfaceZone::OutboardBoundary);
  REQUIRE(corridor.lateralZoneAt(s, halfAsphalt + kPerimeterGrassGapM + 5.0) ==
          LateralSurfaceZone::OutboardBoundary);
}

TEST_CASE("TrackCorridor samples width from profile", "[unit][corridor]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("sample_circuit.json"), track));
  REQUIRE(track.corridor.defaultWidthM == Catch::Approx(12.0));
  REQUIRE(track.corridor.widthProfile.size() == 1);
  REQUIRE(track.corridor.pitLane.offsetM == Catch::Approx(12.0));

  TrackCorridor corridor;
  corridor.build(track);
  REQUIRE(corridor.length() == Catch::Approx(track.lapLength()).margin(1.0));

  const double gridMid = track.lapLength() * 0.05;
  const double backStraight = track.lapLength() * 0.35;
  REQUIRE(corridor.widthAt(gridMid) == Catch::Approx(15.0).margin(0.5));
  REQUIRE(corridor.widthAt(backStraight) == Catch::Approx(12.0).margin(0.5));
  REQUIRE(corridor.maxLateralN(gridMid) ==
          Catch::Approx(corridor.widthAt(gridMid) * 0.5).margin(0.01));
}

TEST_CASE("TrackCorridor racing line stays inside corners", "[unit][corridor]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("sample_circuit.json"), track));

  TrackCorridor corridor;
  corridor.build(track);

  double maxAbsKappa = 0.0;
  double cornerKappa = 0.0;
  double racingAtCorner = 0.0;
  const double step = 20.0;
  for (double s = 0.0; s < track.lapLength(); s += step) {
    const double kappa = track.signedCurvatureAtDistance(s);
    if (std::abs(kappa) > maxAbsKappa) {
      maxAbsKappa = std::abs(kappa);
      cornerKappa = kappa;
      racingAtCorner = corridor.racingLineN(s);
    }
  }
  REQUIRE(maxAbsKappa > 1e-4);
  REQUIRE(racingAtCorner * cornerKappa > 0.0);
  REQUIRE(std::abs(racingAtCorner) > 0.01);
}

TEST_CASE("TrackCorridor effectiveCurvature follows Frenet offset",
          "[unit][corridor]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("sample_circuit.json"), track));

  TrackCorridor corridor;
  corridor.build(track);

  double cornerS = 0.0;
  double cornerKappa = 0.0;
  for (double s = 0.0; s < track.lapLength(); s += 10.0) {
    const double kappa = track.signedCurvatureAtDistance(s);
    if (std::abs(kappa) > std::abs(cornerKappa)) {
      cornerKappa = kappa;
      cornerS = s;
    }
  }
  REQUIRE(std::abs(cornerKappa) > 1e-4);

  const double centre = corridor.effectiveCurvature(cornerS, 0.0);
  const double inside = corridor.effectiveCurvature(cornerS, corridor.racingLineN(cornerS));
  REQUIRE(centre == Catch::Approx(cornerKappa).margin(1e-4));
  if (cornerKappa > 0.0)
    REQUIRE(inside > centre);
  else
    REQUIRE(inside < centre);
}

TEST_CASE("TrackCorridor lateralOffsetM and poseAt offset perpendicular",
          "[unit][corridor]") {
  TrackDefinition track;
  REQUIRE(LoadTrack(TrackPath("sample_circuit.json"), track));

  TrackCorridor corridor;
  corridor.build(track);

  const double s = track.lapLength() * 0.2;
  const double normalized = 0.5;
  const double n = corridor.lateralOffsetM(s, normalized);
  REQUIRE(n == Catch::Approx(corridor.maxLateralN(s) * normalized).margin(1e-6));

  const TrackPose centre = track.poseAtDistance(s);
  const TrackPose offset = corridor.poseAt(s, n);
  const double dx = offset.position.x - centre.position.x;
  const double dz = offset.position.z - centre.position.z;
  const double lateralDist = std::hypot(dx, dz);
  REQUIRE(lateralDist == Catch::Approx(std::abs(n)).margin(0.05));
}
