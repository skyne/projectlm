#ifndef COOLING_LAYOUT_HPP
#define COOLING_LAYOUT_HPP

#include <string>

struct CoolingLayout {
  double engineRadiator = 0.65;
  double oilCooler = 0.55;
  double chargeAirCooler = 0.5;
  double gearboxCooler = 0.4;
};

struct CoolingCompiled {
  double massKg = 0.0;
  double dragCd = 0.0;
  double dissipation = 0.0;
};

double Clamp01(double v);

CoolingLayout CoolingPresetLayout(const std::string &presetId);

CoolingCompiled CompileCoolingLayout(const CoolingLayout &layout,
                                     double ductAirflowFactor);

#endif
