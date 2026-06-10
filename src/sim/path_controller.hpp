#ifndef PATH_CONTROLLER_HPP
#define PATH_CONTROLLER_HPP

#include "track_corridor.hpp"
#include "traffic.hpp"

class Car;

struct PathTarget {
  double targetNM = 0.0;
  double urgency = 0.0;
};

/** Lateral path target in metres (left positive) from racing line + traffic. */
PathTarget computePathTarget(const Car &car, const TrackCorridor &corridor,
                             const TrafficModifiers &traffic, double s);

#endif
