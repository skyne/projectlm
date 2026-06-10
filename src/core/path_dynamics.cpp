#include "path_dynamics.hpp"

#include <algorithm>
#include <cmath>

namespace {

constexpr double kGravity = 9.81;
constexpr double kMinSpeed = 1.0;
constexpr double kPathLateralGain = 8000.0;
constexpr double kPathLateralDamping = 1200.0;
constexpr double kKerbGripScale = 0.75;
constexpr double kOffTrackGripScale = 0.35;
constexpr double kKerbHalfWidthM = 0.4;

double EffectiveMu(const PathDynamicsInput &input) {
  const double halfWidth = 0.5 * input.trackWidthM;
  const double absN = std::abs(input.n);
  if (absN > halfWidth + kKerbHalfWidthM)
    return input.mu * kOffTrackGripScale;
  if (absN > halfWidth)
    return input.mu * kKerbGripScale;
  return input.mu;
}

void ApplyFrictionCircle(double &fx, double &fy, double maxForce) {
  if (maxForce <= 0.0) {
    fx = 0.0;
    fy = 0.0;
    return;
  }
  const double magnitude = std::hypot(fx, fy);
  if (magnitude <= maxForce || magnitude <= 1e-9)
    return;
  const double scale = maxForce / magnitude;
  fx *= scale;
  fy *= scale;
}

} // namespace

PathDynamicsOutput stepPathDynamics(const PathDynamicsInput &input, double dt) {
  (void)dt;

  const double muEff = EffectiveMu(input);
  const double fz = input.mass * kGravity;
  const double maxForce = muEff * fz;

  double fx = input.FxDesired;
  double fy = kPathLateralGain * (input.targetNM - input.n) -
              kPathLateralDamping * input.lateralVelocity;
  fy = std::clamp(fy, -input.maxLateralN, input.maxLateralN);

  ApplyFrictionCircle(fx, fy, maxForce);

  const double vFloor = std::max(input.v, kMinSpeed);

  PathDynamicsOutput out;
  out.Fx = fx;
  out.Fy = fy;
  out.ds = input.v * std::cos(input.beta);
  out.dn = input.v * std::sin(input.beta);
  out.dv = fx / input.mass;
  out.dBeta = fy / (input.mass * vFloor) - input.effectiveKappa * input.v -
              input.headingRestoreGain * input.beta;
  return out;
}
