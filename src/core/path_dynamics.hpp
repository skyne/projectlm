#ifndef PATH_DYNAMICS_HPP
#define PATH_DYNAMICS_HPP

struct PathDynamicsInput {
  double targetNM = 0.0;
  double trackWidthM = 12.0;
  double effectiveKappa = 0.0;
  double mu = 1.6;
  double mass = 900.0;
  double v = 0.0;
  double beta = 0.0;
  double n = 0.0;
  double lateralVelocity = 0.0;
  double FxDesired = 0.0;
  double maxLateralN = 12000.0;
  /** Driver/path alignment — pulls beta toward 0 (rad/s per rad). */
  double headingRestoreGain = 6.0;
};

struct PathDynamicsOutput {
  double Fx = 0.0;
  double Fy = 0.0;
  double ds = 0.0;
  double dn = 0.0;
  double dv = 0.0;
  double dBeta = 0.0;
};

PathDynamicsOutput stepPathDynamics(const PathDynamicsInput &input, double dt);

#endif
