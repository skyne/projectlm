#include "track_corridor.hpp"
#include <algorithm>
#include <cmath>

namespace {

constexpr double kFiaWidthSlope = 1.0 / 20.0; // 1 m change per 20 m
constexpr double kRacingLineCurvatureScale = 18.0;
constexpr double kRacingLineMaxFraction = 0.35;
constexpr int kRacingLineSmoothRadius = 3;

double WrapDistance(double s, double lapLength) {
  if (lapLength <= 1e-6)
    return 0.0;
  double d = std::fmod(s, lapLength);
  if (d < 0.0)
    d += lapLength;
  return d;
}

Vec3 VecNormalize(const Vec3 &v) {
  const double len = std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-9)
    return {0.0, 0.0, 1.0};
  return {v.x / len, v.y / len, v.z / len};
}

Vec3 VecAdd(const Vec3 &a, const Vec3 &b) {
  return {a.x + b.x, a.y + b.y, a.z + b.z};
}

Vec3 VecScale(const Vec3 &v, double s) {
  return {v.x * s, v.y * s, v.z * s};
}

} // namespace

void TrackCorridor::build(const TrackDefinition &track, double sampleStepM) {
  track_ = &track;
  distances_.clear();
  widths_.clear();
  racingLineN_.clear();
  curvatures_.clear();

  const double lapLength = track.lapLength();
  if (lapLength <= 1e-6)
    return;

  const double step = std::max(0.5, sampleStepM);
  const int sampleCount =
      std::max(2, static_cast<int>(std::ceil(lapLength / step)) + 1);
  distances_.reserve(static_cast<size_t>(sampleCount));
  for (int i = 0; i < sampleCount; ++i) {
    const double s = std::min(static_cast<double>(i) * step, lapLength);
    distances_.push_back(s);
    if (s >= lapLength - 1e-6)
      break;
  }
  if (distances_.empty() || distances_.back() < lapLength - 1e-6)
    distances_.push_back(lapLength);

  widths_ = BuildRawWidthProfile(track, distances_);
  ApplyFiaWidthSmoothing(widths_, distances_);
  racingLineN_ = BuildRacingLineProfile(track, distances_, widths_);

  curvatures_.resize(distances_.size());
  for (size_t i = 0; i < distances_.size(); ++i)
    curvatures_[i] = track.signedCurvatureAtDistance(distances_[i]);
}

double TrackCorridor::length() const {
  return track_ ? track_->lapLength() : 0.0;
}

double TrackCorridor::sampleArray(const std::vector<double> &values,
                                  double s) const {
  if (values.empty() || distances_.empty())
    return 0.0;
  const double lapLength = length();
  const double d = WrapDistance(s, lapLength);

  auto it =
      std::lower_bound(distances_.begin(), distances_.end(), d);
  size_t idx = static_cast<size_t>(std::distance(distances_.begin(), it));
  if (idx >= values.size())
    idx = values.size() - 1;
  if (idx == 0)
    return values[0];

  const double d0 = distances_[idx - 1];
  const double d1 = distances_[idx];
  const double alpha = (d1 > d0) ? (d - d0) / (d1 - d0) : 0.0;
  return values[idx - 1] * (1.0 - alpha) + values[idx] * alpha;
}

double TrackCorridor::widthAt(double s) const { return sampleArray(widths_, s); }

double TrackCorridor::racingLineN(double s) const {
  return sampleArray(racingLineN_, s);
}

double TrackCorridor::maxLateralN(double s) const { return widthAt(s) * 0.5; }

double TrackCorridor::effectiveCurvature(double s, double n) const {
  const double kappa = sampleArray(curvatures_, s);
  double denom = 1.0 - n * kappa;
  denom = std::clamp(denom, 0.05, 10.0);
  return kappa / denom;
}

double TrackCorridor::lateralOffsetM(double s, double normalized) const {
  return std::clamp(normalized, -1.0, 1.0) * maxLateralN(s);
}

TrackPose TrackCorridor::poseAt(double s, double n) const {
  if (!track_)
    return {};
  TrackPose pose = track_->poseAtDistance(s);
  Vec3 perp = {-pose.tangent.z, 0.0, pose.tangent.x};
  perp = VecNormalize(perp);
  pose.position = VecAdd(pose.position, VecScale(perp, n));
  return pose;
}

std::vector<double>
TrackCorridor::BuildRawWidthProfile(const TrackDefinition &track,
                                    const std::vector<double> &distances) {
  const double lapLength = track.lapLength();
  const double defaultWidth = track.corridor.defaultWidthM > 0.0
                                  ? track.corridor.defaultWidthM
                                  : 12.0;
  std::vector<double> widths(distances.size(), defaultWidth);

  for (size_t i = 0; i < distances.size(); ++i) {
    const double s = distances[i];
    for (const TrackSector &sector : track.sectors) {
      if (sector.widthM > 0.0 && s >= sector.startDistance &&
          s < sector.endDistance) {
        widths[i] = sector.widthM;
        break;
      }
    }
    for (const TrackWidthSegment &segment : track.corridor.widthProfile) {
      const double start = segment.startT * lapLength;
      const double end = segment.endT * lapLength;
      if (s >= start && s < end) {
        widths[i] = segment.widthM;
        break;
      }
    }
  }
  return widths;
}

void TrackCorridor::ApplyFiaWidthSmoothing(std::vector<double> &widths,
                                         const std::vector<double> &distances) {
  if (widths.size() < 2 || widths.size() != distances.size())
    return;

  for (size_t i = 1; i < widths.size(); ++i) {
    const double ds = distances[i] - distances[i - 1];
    const double limit = widths[i - 1] + kFiaWidthSlope * ds;
    widths[i] = std::min(widths[i], limit);
  }
  for (size_t i = widths.size() - 1; i > 0; --i) {
    const double ds = distances[i] - distances[i - 1];
    const double limit = widths[i] + kFiaWidthSlope * ds;
    widths[i - 1] = std::min(widths[i - 1], limit);
  }
}

std::vector<double> TrackCorridor::BuildRacingLineProfile(
    const TrackDefinition &track, const std::vector<double> &distances,
    const std::vector<double> &widths) {
  std::vector<double> line(distances.size(), 0.0);
  for (size_t i = 0; i < distances.size(); ++i) {
    const double kappa = track.signedCurvatureAtDistance(distances[i]);
    const double halfWidth = widths[i] * 0.5;
    const double magnitude =
        std::min(halfWidth * kRacingLineMaxFraction,
                 std::abs(kappa) * kRacingLineCurvatureScale);
    if (std::abs(kappa) > 1e-5)
      line[i] = std::copysign(magnitude, kappa);
  }

  if (line.size() < 3)
    return line;

  std::vector<double> smoothed(line.size(), 0.0);
  for (size_t i = 0; i < line.size(); ++i) {
    double sum = 0.0;
    int count = 0;
    for (int j = -kRacingLineSmoothRadius; j <= kRacingLineSmoothRadius; ++j) {
      const int idx = static_cast<int>(i) + j;
      if (idx < 0 || idx >= static_cast<int>(line.size()))
        continue;
      sum += line[static_cast<size_t>(idx)];
      ++count;
    }
    smoothed[i] = count > 0 ? sum / count : line[i];
  }
  return smoothed;
}
