#ifndef CAR_PARTS_HPP
#define CAR_PARTS_HPP

#include "cooling_layout.hpp"
#include "part_catalog.hpp"
#include <string>

struct ClassRule;

enum class ETireCompound { Soft, Medium, Hard, MichelinEndurance };
enum class ETyreTread { Slick, Intermediate, Wet };

struct ChassisPart {
  double mass = 0.0;
  double structuralRigidity = 1.0;
  double baselineDrag = 0.0;
  /** >1.0 = faster tyre/fuel/repair work in pits */
  double serviceability = 1.0;
  /** >1.0 = faster driver swap (cockpit access) */
  double driverChangeFactor = 1.0;
};

struct FrontAeroPart {
  double mass = 0.0;
  double downforceCl = 0.0;
  double dragCd = 0.0;
};

struct RearAeroPart {
  double mass = 0.0;
  double downforceCl = 0.0;
  double dragCd = 0.0;
  bool permitsWinglessPitch = false;
};

struct CoolingPart {
  double mass = 0.0;
  double dragCd = 0.0;
  double thermalDissipationRate = 1.0;
};

struct TirePart {
  double mass = 0.0;
  double gripMultiplier = 1.0;
  double wearRate = 0.0;
  double optimalTemp = 80.0;
};

struct WheelPackagePart {
  double mass = 0.0;
  double frontDiameterM = 0.457;
  double rearDiameterM = 0.457;
  double frontWidthMm = 305.0;
  double rearWidthMm = 310.0;
  double gripFactor = 1.0;
  double wearFactor = 1.0;
  double dragCd = 0.0;
  double unsprungMassKg = 8.0;
};

struct SuspensionPart {
  double mass = 0.0;
  double frontSpringStiffness = 130000.0;
  double rearSpringStiffness = 145000.0;
  double rideHeightM = 0.040;
  double rollStiffness = 1.0;
  double aeroPlatformStability = 1.0;
  double unsprungFactor = 1.0;
  double mechanicalGrip = 1.0;
};

struct FuelSystemPart {
  double mass = 0.0;
  double capacityLiters = 100.0;
};

struct BrakePart {
  double mass = 0.0;
  double maxPressure = 0.7;
  double fadeUnderHeat = 0.1;
};

struct TransmissionPart {
  double mass = 0.0;
  int gearCount = 6;
  double gearRatios[8] = {4.5, 2.5, 1.85, 1.35, 1.05, 0.82, 0.0, 0.0};
  double gearShiftSpeeds[7] = {18.0, 38.0, 55.0, 72.0, 88.0, 0.0, 0.0};
  double shiftDelaySec = 0.08;
};

struct HybridPart {
  double mass = 0.0;
  double deployPowerKW = 0.0;
  double regenRate = 0.0;
  double stintDeployBudgetMJ = 0.0;
};

struct DiffuserPart {
  double mass = 0.0;
  double downforceCl = 0.0;
  /// When rear aero permits wingless pitch, use this floor Cl if > 0.
  double winglessDownforceCl = 0.0;
  double dragCd = 0.0;
  double groundEffectMult = 1.0;
  double aeroStability = 1.0;
  double mechanicalGrip = 1.0;
};

struct ExhaustPart {
  double mass = 0.0;
  double dragCd = 0.0;
  double backPressure = 0.0;
  double powerMult = 1.0;
  double thermalMult = 1.0;
  double diffuserBoost = 0.0;
  double aeroStability = 1.0;
  double serviceability = 1.0;
};

struct EngineConfig {
  std::string layout;
  std::string fuelType;
  int cylinders = 0;
  double bore = 0.0;
  double stroke = 0.0;
  int maxRPM = 0;
  double baseVibrationFactor = 1.0;
  /// Measured peak torque (Nm). When > 0, used instead of displacement estimate.
  double peakTorqueNm = 0.0;
  /// RPM at peak torque; shapes torque curve when > 0.
  int peakTorqueRpm = 0;
  /// Nm per litre for NA race engines when peak_torque_nm is not set (0 = default).
  double specificTorqueNmPerL = 0.0;
  std::string aspiration;
  std::string drivetrain;
  /// Hydrogen only: Combustion (ICE) or FuelCell.
  std::string energyConverter;
  double generatorKw = 0.0;
  /// Fuel-cell buffer sizing hint (0–1) from garage UI.
  double bufferSize = 0.5;
};

struct AssemblyConfig {
  double engineWeightCoeff = 35.0;
  double engineWeightCylFactor = 5.0;
  double dieselWeightMult = 1.3;
  double baseVehicleMass = 150.0;
  /// Default Nm/L for race NA engines when car omits peak_torque_nm.
  double defaultSpecificTorqueNmPerL = 105.0;
  double bodyBaseDragCd = 0.32;
  double hpConversion = 7127.0;
  double referenceStroke = 0.080;
  double referenceRPM = 6000.0;
  /// Litres per second at max RPM, scaled by displacement and rpm (BSFC proxy).
  double fuelBurnCoeff = 0.011;
  double fuelRefRPM = 5000.0;
  double groundSuckNumerator = 0.05;
  double groundSuckOffset = 0.01;
  double groundEffectDownforce = 0.6;
  double winglessDragReduction = 0.04;
};

struct CarConfig {
  std::string name;
  EngineConfig engine;
  std::string chassisId = "CarbonMonocoque";
  std::string frontAeroId = "LowDragNose";
  std::string rearAeroId = "StandardWing";
  std::string coolingId = "EnduranceHeavyDuty";
  CoolingLayout coolingLayout;
  bool hasCustomCoolingLayout = false;
  double ductAirflowFactor = 1.0;
  ETireCompound tireChoice = ETireCompound::Medium;
  ETyreTread tyreTread = ETyreTread::Slick;
  std::string wheelPackageId = "Hypercar18Standard";
  std::string suspensionId = "PushrodDoubleWishbone";
  std::string frontSuspensionId = "PushrodDoubleWishbone";
  std::string rearSuspensionId = "PushrodDoubleWishbone";
  bool hasCustomWheelDims = false;
  double customFrontWheelDiameterM = 0.0;
  double customRearWheelDiameterM = 0.0;
  double customFrontTireWidthMm = 0.0;
  double customRearTireWidthMm = 0.0;
  std::string fuelSystemId = "StandardTank";
  std::string brakeSystemId = "StandardCaliper";
  std::string transmissionId = "SixSpeedSequential";
  std::string hybridSystemId = "None";
  std::string diffuserId = "StockFloor";
  std::string exhaustId = "TwinOutletSide";
  double frontSpringStiffness = 100000.0;
  double rearSpringStiffness = 100000.0;
  double frontRideHeightM = 0.040;
  double rearRideHeightM = 0.040;
  double frontArbStiffness = 1.0;
  double rearArbStiffness = 1.0;
  int frontDamperBump = 8;
  int frontDamperRebound = 8;
  int rearDamperBump = 8;
  int rearDamperRebound = 8;
  bool hasCustomSuspensionSetup = false;
  bool hasCustomFrontSpring = false;
  bool hasCustomRearSpring = false;
  bool hasCustomFrontRideHeight = false;
  bool hasCustomRearRideHeight = false;
  bool hasCustomFrontArb = false;
  bool hasCustomRearArb = false;
  bool hasCustomDampers = false;
  /** Tyre balance from wheel widths only; rake/ARB applied in FinalizeSuspensionDerivedStats. */
  double wheelTyreBalanceFactor = 1.0;
  double rideHeight = 0.050;
  double calculatedTotalMass = 0.0;
  double totalDragCd = 0.0;
  double totalDownforceCl = 0.0;
  double structuralRigidityFactor = 1.0;
  double serviceabilityFactor = 1.0;
  double driverChangeFactor = 1.0;
  double coolingCapacity = 1.0;
  double peakHorsepower = 0.0;
  double peakTorque = 0.0;
  double vibrationIndex = 0.0;
  double fuelBurnRate = 0.0;
  double tireGripMultiplier = 1.0;
  double tireWearRate = 0.0;
  double tireOptimalTempC = 80.0;
  double frontWheelRadiusM = 0.33;
  double rearWheelRadiusM = 0.33;
  double frontAxleGripFactor = 1.0;
  double rearAxleGripFactor = 1.0;
  /** Front/rear balance — understeer & turn-in vs baseline ratio. */
  double tyreBalanceFactor = 1.0;
  double wheelGripFactor = 1.0;
  /** Package baseline wear rate multiplier. */
  double wheelWearFactor = 1.0;
  /** Width/diameter — per-axle wear & thermal load in TickSimulation. */
  double frontAxleWearFactor = 1.0;
  double rearAxleWearFactor = 1.0;
  double frontAxleHeatFactor = 1.0;
  double rearAxleHeatFactor = 1.0;
  double frontAxleCoolFactor = 1.0;
  double rearAxleCoolFactor = 1.0;
  double rollStiffnessFactor = 1.0;
  /** Roll stiffness from parts + CG before ARB multiplier. */
  double suspensionRollStiffnessBase = 1.0;
  double aeroPlatformStability = 1.0;
  double suspensionMechanicalGrip = 1.0;
  double unsprungMassKg = 0.0;
  double fuelTankCapacity = 100.0;
  double brakeMaxPressure = 0.7;
  double brakeFadeUnderHeat = 0.1;
  int gearCount = 6;
  double gearRatios[8] = {};
  double gearShiftSpeeds[7] = {};
  double shiftDelaySec = 0.08;
  double hybridDeployPowerKW = 0.0;
  double hybridRegenRate = 0.0;
  double hybridStintDeployBudgetMJ = 0.0;
  double engineThrottleResponse = 1.0;
  double throttleLagTau = 0.08;
  double torquePeakRatio = 0.75;
  double torqueCurveFalloff = 2.0;
  double engineStressMult = 1.0;
  double cgCorneringBonus = 1.0;
  double powertrainFuelBurnMult = 1.0;
  double powertrainThermalMult = 1.0;
  double drivetrainExtraMassKg = 0.0;
  bool isGeneratorOnly = false;
  bool isElectricDrive = false;
  bool isFuelCell = false;
  double generatorPowerKW = 0.0;
  double drivetrainEfficiency = 1.0;
  double electricalDeployKW = 0.0;
  double powertrainServiceabilityMult = 1.0;
  double frontCamberDeg = -2.5;
  double rearCamberDeg = -1.8;
  double frontToeDeg = 0.0;
  double rearToeDeg = 0.0;
  /** Per-car final drive; 0 = use physics_config default. */
  double finalDriveRatio = 0.0;
  double startingWingDelta = 0.0;
  double startingBrakeBias = 0.5;
};

std::string PartChoiceForSlot(const CarConfig &car, const std::string &slot);
std::string TireCompoundCatalogId(ETireCompound compound);

ChassisPart GetChassisStats(const PartCatalog &catalog,
                            const std::string &partId);
FrontAeroPart GetFrontAeroStats(const PartCatalog &catalog,
                                const std::string &partId);
RearAeroPart GetRearAeroStats(const PartCatalog &catalog,
                              const std::string &partId);
CoolingPart GetCoolingStats(const PartCatalog &catalog,
                            const std::string &partId);
TirePart GetTireStats(const PartCatalog &catalog, const std::string &partId);
WheelPackagePart GetWheelPackageStats(const PartCatalog &catalog,
                                      const std::string &partId);
SuspensionPart GetSuspensionStats(const PartCatalog &catalog,
                                  const std::string &partId);
FuelSystemPart GetFuelSystemStats(const PartCatalog &catalog,
                                  const std::string &partId);
BrakePart GetBrakeStats(const PartCatalog &catalog, const std::string &partId);
TransmissionPart GetTransmissionStats(const PartCatalog &catalog,
                                      const std::string &partId);
HybridPart GetHybridStats(const PartCatalog &catalog,
                          const std::string &partId);
DiffuserPart GetDiffuserStats(const PartCatalog &catalog,
                              const std::string &partId);
ExhaustPart GetExhaustStats(const PartCatalog &catalog,
                            const std::string &partId);

inline const char *TireCompoundId(ETireCompound compound,
                                  ETyreTread tread = ETyreTread::Slick) {
  if (tread == ETyreTread::Wet)
    return "wet";
  if (tread == ETyreTread::Intermediate)
    return "intermediate";
  switch (compound) {
  case ETireCompound::Soft:
    return "soft";
  case ETireCompound::Hard:
    return "hard";
  case ETireCompound::MichelinEndurance:
    return "endurance";
  default:
    return "medium";
  }
}

void ApplyTireCompoundStats(CarConfig &car, ETireCompound compound,
                            const PartCatalog &catalog);
std::string GetAttachmentPoint(const PartCatalog &catalog,
                               const std::string &slot,
                               const std::string &partName);
void CompileCarArchitecture(CarConfig &car, const PartCatalog &catalog,
                            const AssemblyConfig &assembly);
void ApplyClassBoP(CarConfig &car, const ClassRule &rule);

struct SuspensionSetupDelta {
  double frontRideHeightDelta = 0.0;
  double rearRideHeightDelta = 0.0;
  double frontSpringDelta = 0.0;
  double rearSpringDelta = 0.0;
  double frontArbDelta = 0.0;
  double rearArbDelta = 0.0;
  int frontDamperBumpDelta = 0;
  int frontDamperReboundDelta = 0;
  int rearDamperBumpDelta = 0;
  int rearDamperReboundDelta = 0;

  bool hasAnyChange() const;
};

void ClampSuspensionSetup(CarConfig &car);
void FinalizeSuspensionDerivedStats(CarConfig &car);
void ApplySuspensionSetupDelta(CarConfig &car, const SuspensionSetupDelta &delta);

#endif
