#ifndef TRACK_CORRIDOR_HPP
#define TRACK_CORRIDOR_HPP

#include "track.hpp"
#include <vector>

class TrackCorridor {
public:
  void build(const TrackDefinition &track, double sampleStepM = 2.0);

  double length() const;
  double widthAt(double s) const;
  /** Racing-line lateral offset from centreline (metres, left positive). */
  double racingLineN(double s) const;
  /** Half-track usable width from centreline (metres). */
  double maxLateralN(double s) const;
  /** Frenet curvature at lateral offset n: kappa / (1 - n*kappa). */
  double effectiveCurvature(double s, double n) const;
  /** Map normalized lateral [-1, 1] to metres at arc length s. */
  double lateralOffsetM(double s, double normalized) const;
  TrackPose poseAt(double s, double n) const;

private:
  const TrackDefinition *track_ = nullptr;
  std::vector<double> distances_;
  std::vector<double> widths_;
  std::vector<double> racingLineN_;
  std::vector<double> curvatures_;

  double sampleArray(const std::vector<double> &values, double s) const;
  static std::vector<double>
  BuildRawWidthProfile(const TrackDefinition &track,
                       const std::vector<double> &distances);
  static void ApplyFiaWidthSmoothing(std::vector<double> &widths,
                                     const std::vector<double> &distances);
  static std::vector<double>
  BuildRacingLineProfile(const TrackDefinition &track,
                         const std::vector<double> &distances,
                         const std::vector<double> &widths);
};

#endif
