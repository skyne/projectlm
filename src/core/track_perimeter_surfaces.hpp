#ifndef TRACK_PERIMETER_SURFACES_HPP
#define TRACK_PERIMETER_SURFACES_HPP

#include "track.hpp"
#include <vector>

constexpr double kPerimeterGrassGapM = 10.0;
constexpr double kPerimeterBarrierWidthM = 1.2;
constexpr int kPerimeterSampleCount = 480;

std::vector<TrackSurfaceSegment>
SynthesizePerimeterSurfaces(const std::vector<TrackSurfaceSegment> &authored,
                            const TrackSurfaceDefaults &defaults,
                            double defaultWidthM,
                            const std::vector<TrackWidthSegment> &widthProfile);

#endif
