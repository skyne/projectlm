#ifndef TRACK_SAMPLER_HPP
#define TRACK_SAMPLER_HPP

#include "track.hpp"
#include <string>
#include <vector>

struct TrackGeometryPoint {
  double x = 0.0;
  double z = 0.0;
};

struct TrackGeometrySector {
  std::string name;
  double startT = 0.0;
  double endT = 0.0;
};

struct TrackGeometry {
  std::string name;
  double lapLength = 0.0;
  std::vector<TrackGeometryPoint> points;
  std::vector<TrackGeometrySector> sectors;
};

TrackGeometry SampleTrackXZ(const TrackDefinition &track,
                            double stepMeters = 20.0);

std::string OutlinePathForTrack(const std::string &trackJsonPath);
bool LoadTrackOutline(const std::string &outlinePath,
                      const TrackDefinition &track, TrackGeometry &geometry);

#endif
