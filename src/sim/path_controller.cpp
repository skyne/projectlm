#include "path_controller.hpp"
#include "car_entity.hpp"
#include <algorithm>
#include <cmath>

namespace {

constexpr double kGridConvergeM = 200.0;
constexpr double kOvertakeOutsideMarginM = 1.2;

double Lerp(double a, double b, double t) {
  return a + (b - a) * std::clamp(t, 0.0, 1.0);
}

} // namespace

PathTarget computePathTarget(const Car &car, const TrackCorridor &corridor,
                             const TrafficModifiers &traffic, double s) {
  PathTarget target;
  const double racingN = corridor.racingLineN(s);
  const double maxN = corridor.maxLateralN(s);

  if (car.isRejoiningYield()) {
    target.targetNM = corridor.lateralOffsetM(s, 0.58);
    target.urgency = 0.9;
    return target;
  }

  if (traffic.overtaking) {
    const double kappa = corridor.effectiveCurvature(s, racingN);
    const double outside = std::copysign(kOvertakeOutsideMarginM, -kappa);
    target.targetNM =
        std::clamp(racingN + outside, -maxN * 0.95, maxN * 0.95);
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
