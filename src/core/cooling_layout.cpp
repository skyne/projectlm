#include "cooling_layout.hpp"
#include <algorithm>
#include <cmath>

double Clamp01(double v) { return std::max(0.0, std::min(1.0, v)); }

namespace {

struct CoolerCoeffs {
  double massBase;
  double massScale;
  double dragBase;
  double dragScale;
  double dissipationMax;
};

constexpr CoolerCoeffs kEngineRadiator{4.0, 18.0, 0.02, 0.09, 1.35};
constexpr CoolerCoeffs kOilCooler{2.0, 8.0, 0.008, 0.035, 0.45};
constexpr CoolerCoeffs kChargeAirCooler{3.0, 14.0, 0.015, 0.065, 0.95};
constexpr CoolerCoeffs kGearboxCooler{2.0, 10.0, 0.012, 0.04, 0.35};

double CoolerMass(double size, const CoolerCoeffs &c) {
  const double s = Clamp01(size);
  return c.massBase + std::pow(s, 1.3) * c.massScale;
}

double CoolerDrag(double size, const CoolerCoeffs &c) {
  const double s = Clamp01(size);
  return c.dragBase + std::pow(s, 1.2) * c.dragScale;
}

double CoolerDissipation(double size, const CoolerCoeffs &c) {
  const double s = Clamp01(size);
  return std::pow(s, 0.85) * c.dissipationMax;
}

} // namespace

CoolingLayout CoolingPresetLayout(const std::string &presetId) {
  CoolingLayout layout;
  if (presetId == "SprintSlimline") {
    layout.engineRadiator = 0.35;
    layout.oilCooler = 0.25;
    layout.chargeAirCooler = 0.2;
    layout.gearboxCooler = 0.15;
  } else if (presetId == "DuctedRacing") {
    layout.engineRadiator = 0.75;
    layout.oilCooler = 0.6;
    layout.chargeAirCooler = 0.85;
    layout.gearboxCooler = 0.45;
  } else if (presetId == "MaxFlowEndurance") {
    layout.engineRadiator = 0.95;
    layout.oilCooler = 0.85;
    layout.chargeAirCooler = 0.9;
    layout.gearboxCooler = 0.7;
  }
  return layout;
}

CoolingCompiled CompileCoolingLayout(const CoolingLayout &layout,
                                     double ductAirflowFactor) {
  const double airflow = Clamp01(ductAirflowFactor);
  CoolingCompiled out;
  out.massKg =
      CoolerMass(layout.engineRadiator, kEngineRadiator) +
      CoolerMass(layout.oilCooler, kOilCooler) +
      CoolerMass(layout.chargeAirCooler, kChargeAirCooler) +
      CoolerMass(layout.gearboxCooler, kGearboxCooler);
  out.dragCd =
      CoolerDrag(layout.engineRadiator, kEngineRadiator) +
      CoolerDrag(layout.oilCooler, kOilCooler) +
      CoolerDrag(layout.chargeAirCooler, kChargeAirCooler) +
      CoolerDrag(layout.gearboxCooler, kGearboxCooler);
  out.dissipation =
      (CoolerDissipation(layout.engineRadiator, kEngineRadiator) +
       CoolerDissipation(layout.oilCooler, kOilCooler) +
       CoolerDissipation(layout.chargeAirCooler, kChargeAirCooler) +
       CoolerDissipation(layout.gearboxCooler, kGearboxCooler)) *
      airflow;
  return out;
}
