#include "path_dynamics.hpp"
#include <catch_amalgamated.hpp>
#include <cmath>

namespace {

PathDynamicsInput BaseInput() {
  PathDynamicsInput input;
  input.mass = 1000.0;
  input.mu = 1.0;
  input.v = 30.0;
  input.trackWidthM = 12.0;
  input.maxLateralN = 20000.0;
  return input;
}

} // namespace

TEST_CASE("stepPathDynamics saturates combined forces on friction circle",
          "[unit][path]") {
  PathDynamicsInput input = BaseInput();
  input.FxDesired = 12000.0;
  input.n = 1.0;
  input.targetNM = 0.0;
  input.lateralVelocity = 0.0;

  const PathDynamicsOutput out = stepPathDynamics(input, 0.01);
  const double maxForce = input.mu * input.mass * 9.81;
  const double combined = std::hypot(out.Fx, out.Fy);

  REQUIRE(combined == Catch::Approx(maxForce).margin(1e-6));
  REQUIRE(out.Fx < input.FxDesired);
  REQUIRE(std::abs(out.Fy) > 0.0);
}

TEST_CASE("stepPathDynamics keeps longitudinal force when lateral demand is zero",
          "[unit][path]") {
  PathDynamicsInput input = BaseInput();
  input.FxDesired = 5000.0;
  input.n = 0.0;
  input.targetNM = 0.0;
  input.lateralVelocity = 0.0;

  const PathDynamicsOutput out = stepPathDynamics(input, 0.01);
  const double maxForce = input.mu * input.mass * 9.81;

  REQUIRE(out.Fy == Catch::Approx(0.0).margin(1e-9));
  REQUIRE(out.Fx == Catch::Approx(std::min(input.FxDesired, maxForce)).margin(1e-6));
}

TEST_CASE("stepPathDynamics recenters lateral offset on a straight",
          "[unit][path]") {
  PathDynamicsInput input = BaseInput();
  input.effectiveKappa = 0.0;
  input.beta = 0.0;
  input.v = 35.0;
  input.n = 0.8;
  input.targetNM = 0.0;
  input.lateralVelocity = 0.0;
  input.FxDesired = 0.0;
  input.headingRestoreGain = 6.0;

  double n = input.n;
  double beta = input.beta;
  double v = input.v;
  const double dt = 0.02;
  for (int i = 0; i < 400; ++i) {
    input.n = n;
    input.lateralVelocity = v * std::sin(beta);
    input.v = v;
    input.beta = beta;
    const PathDynamicsOutput out = stepPathDynamics(input, dt);
    n += out.dn * dt;
    v = std::max(1.0, v + out.dv * dt);
    beta += out.dBeta * dt;
  }

  REQUIRE(std::abs(n) < 0.05);
  REQUIRE(std::abs(beta) < 0.05);
}
