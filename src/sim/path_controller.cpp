#include "path_controller.hpp"
#include "car_entity.hpp"
#include <algorithm>
#include <cmath>

namespace {

constexpr double kGridConvergeM = 200.0;
constexpr double kPassMarginM = 1.15;
constexpr double kChicaneKappaThreshold = 0.0065;

double Lerp(double a, double b, double t) {
  return a + (b - a) * std::clamp(t, 0.0, 1.0);
}

double PassOffsetM(double kappa) {
  return std::copysign(kPassMarginM, -kappa);
}

double TargetForIntent(TrafficPathIntent intent, double racingN, double maxN,
                       double insideDelta, double outsideDelta) {
  double target = racingN;
  switch (intent) {
  case TrafficPathIntent::AttackInside:
  case TrafficPathIntent::YieldInside:
  case TrafficPathIntent::DefendInside:
    target = racingN + insideDelta;
    break;
  case TrafficPathIntent::AttackOutside:
  case TrafficPathIntent::YieldOutside:
  case TrafficPathIntent::DefendOutside:
    target = racingN + outsideDelta;
    break;
  case TrafficPathIntent::RacingLine:
  case TrafficPathIntent::None:
  default:
    target = racingN;
    break;
  }
  return std::clamp(target, -maxN * 0.95, maxN * 0.95);
}

} // namespace

PathTarget computePathTarget(const Car &car, const TrackCorridor &corridor,
                             const TrafficModifiers &traffic, double s) {
  PathTarget target;
  const double racingN = corridor.racingLineN(s);
  const double maxN = corridor.maxLateralN(s);
  const double kappa = corridor.effectiveCurvature(s, racingN);
  const double outsideDelta = PassOffsetM(kappa);
  const double insideDelta = -outsideDelta;

  if (car.isRejoiningYield()) {
    target.targetNM = corridor.lateralOffsetM(s, 0.58);
    target.urgency = 0.9;
    return target;
  }

  if (traffic.pathIntent != TrafficPathIntent::None &&
      traffic.pathIntent != TrafficPathIntent::RacingLine) {
    double marginScale = 1.0;
    if (traffic.yielding && !traffic.blueFlag)
      marginScale = 1.35;
    if (traffic.yielding && !traffic.blueFlag &&
        std::abs(kappa) > kChicaneKappaThreshold)
      marginScale = std::max(marginScale, 1.6);
    const double scaledOutside = outsideDelta * marginScale;
    const double scaledInside = insideDelta * marginScale;
    target.targetNM =
        TargetForIntent(traffic.pathIntent, racingN, maxN, scaledInside,
                        scaledOutside);
    target.urgency = std::clamp(0.55 + traffic.pathUrgency * 0.45, 0.55, 1.0);
    if (traffic.alongside)
      target.urgency = std::min(target.urgency, 0.75);
    return target;
  }

  if (traffic.yielding && !traffic.blueFlag) {
    const double yieldDelta = insideDelta;
    target.targetNM =
        std::clamp(racingN + yieldDelta, -maxN * 0.95, maxN * 0.95);
    target.urgency = 0.85;
    return target;
  }

  if (traffic.overtaking) {
    target.targetNM =
        TargetForIntent(TrafficPathIntent::AttackOutside, racingN, maxN,
                        insideDelta, outsideDelta);
    target.urgency = 1.0;
    return target;
  }

  if (traffic.blocked) {
    target.targetNM = racingN;
    target.urgency = 0.6;
    return target;
  }

  if (s < kGridConvergeM) {
    const double gridNorm = (car.gridPosition() % 2 == 0) ? 0.15 : -0.15;
    const double gridN = corridor.lateralOffsetM(s, gridNorm);
    const double blend = s < 0.0 ? 0.0 : std::clamp(s / kGridConvergeM, 0.0, 1.0);
    target.targetNM = Lerp(gridN, racingN, blend);
    target.urgency = 0.3;
    return target;
  }

  target.targetNM = racingN;
  target.urgency = 0.0;
  return target;
}
