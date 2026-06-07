#ifndef CAR_PARTS_HPP
#define CAR_PARTS_HPP

#include "cooling_layout.hpp"
#include <map>
#include <string>

struct ClassRule;

enum class EChassis {
  CarbonMonocoque,
  Spaceframe,
  // LMH bespoke monocoques
  LMHInHouse,
  LMHDallaraBuilt,
  LMHMultimaticBuilt,
  LMHMonocoque,
  // LMDh homologated spines (Dallara, Oreca, Multimatic, Ligier)
  LMDhDallara,
  LMDhOreca,
  LMDhMultimatic,
  LMDhLigier,
  // LMP2
  Oreca07,
  Oreca07Endurance,
  Oreca07Sprint,
  // LMGT3 homologated constructors
  GT3Spaceframe,
  GT3Oreca,
  GT3PrattMiller,
  GT3McLaren,
  GT3Multimatic
};
enum class EFrontAero {
  LowDragNose,
  LowDragNoseSlim,
  HighDownforceSplitter,
  HighDownforceSplitterPlus
};
enum class ERearAero {
  StandardWing,
  StandardWingLowDrag,
  HighDownforceWing,
  HighDownforceWingPlus,
  WinglessGroundEffect
};
enum class ECoolingPack {
  SprintSlimline,
  SprintSlimlinePlus,
  EnduranceHeavyDuty,
  EnduranceHeavyDutyLight,
  DuctedRacing,
  MaxFlowEndurance
};
enum class ETireCompound { Soft, Medium, Hard, MichelinEndurance };
enum class ETyreTread { Slick, Intermediate, Wet };

enum class EWheelPackage {
  Hypercar18Standard,
  Hypercar18Balanced,
  Hypercar18WideRear,
  Hypercar18LowDrag,
  LMP2Oreca18,
  LMP2Oreca18Wide,
  LMP2Oreca18Endurance,
  GT3Front20Rear21,
  GT3Front20Rear21Endurance,
  GT3WideRear21,
};

enum class ESuspensionLayout {
  PushrodDoubleWishbone,
  PushrodDoubleWishboneEndurance,
  PullrodDoubleWishbone,
  PullrodDoubleWishboneLowDrag,
  DoubleWishboneHeaveSpring,
  MultilinkRearHypercar,
  MacPhersonStrutGT3,
  MacPhersonStrutGT3Light,
  DoubleWishboneGT3,
  DoubleWishboneGT3Stiff,
  DoubleWishboneGT3Endurance,
  OrecaLMP2Spec,
  OrecaLMP2SpecEndurance,
};
enum class EFuelSystem {
  StandardTank,
  LargeTank,
  LeMans90L,
  LeMans95L,
  LeMans110L,
  HydrogenTank
};
enum class EBrakeSystem {
  StandardCaliper,
  StandardCaliperLight,
  CarbonCeramic,
  HeavyDutyEndurance,
  APRacingGT3,
  BremboHypercar,
  AkebonoHypercar,
  APRacingPrototype
};
enum class ETransmission {
  SixSpeedSequential,
  SixSpeedSequentialEndurance,
  SixSpeedSequentialShortRatio,
  SevenSpeedSequential,
  EightSpeedPaddle,
  XtracP1359,
  XtracP1359Endurance,
  XtracP529,
  XtracP529Endurance,
  SingleSpeedEDrive
};
enum class EHybridSystem {
  None,
  NoneLightweight,
  NoneEndurance,
  LMDh500kW,
  HypercarHV,
  LMDh50kW
};

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

struct PartCatalog {
  ChassisPart chassisCarbonMonocoque{75.0, 1.2, 0.01};
  ChassisPart chassisSpaceframe{120.0, 0.6, 0.05};
  ChassisPart chassisLMHInHouse{72.0, 1.35, 0.006};
  ChassisPart chassisLMHDallaraBuilt{73.0, 1.33, 0.007};
  ChassisPart chassisLMHMultimaticBuilt{74.0, 1.32, 0.007};
  ChassisPart chassisLMHMonocoque{72.0, 1.35, 0.006};
  ChassisPart chassisLMDhDallara{76.0, 1.25, 0.009};
  ChassisPart chassisLMDhOreca{75.0, 1.24, 0.010};
  ChassisPart chassisLMDhMultimatic{77.0, 1.26, 0.008};
  ChassisPart chassisLMDhLigier{76.0, 1.23, 0.010};
  ChassisPart chassisOreca07{74.0, 1.22, 0.010};
  ChassisPart chassisOreca07Endurance{75.5, 1.20, 0.010};
  ChassisPart chassisOreca07Sprint{72.5, 1.24, 0.009};
  ChassisPart chassisGT3Spaceframe{95.0, 0.95, 0.018};
  ChassisPart chassisGT3Oreca{94.0, 0.96, 0.017};
  ChassisPart chassisGT3PrattMiller{96.0, 0.94, 0.019};
  ChassisPart chassisGT3McLaren{93.0, 0.97, 0.016};
  ChassisPart chassisGT3Multimatic{95.0, 0.95, 0.018};
  FrontAeroPart frontLowDragNose{8.0, 0.5, 0.04};
  FrontAeroPart frontLowDragNoseSlim{7.0, 0.45, 0.035};
  FrontAeroPart frontHighDownforceSplitter{15.0, 1.2, 0.12};
  FrontAeroPart frontHighDownforceSplitterPlus{16.5, 1.28, 0.13};
  RearAeroPart rearStandardWing{18.0, 1.0, 0.14, false};
  RearAeroPart rearStandardWingLowDrag{16.0, 0.88, 0.12, false};
  RearAeroPart rearHighDownforceWing{25.0, 1.8, 0.22, false};
  RearAeroPart rearHighDownforceWingPlus{26.5, 1.92, 0.23, false};
  RearAeroPart rearWinglessGroundEffect{10.0, 1.3, 0.08, true};
  CoolingPart coolingSprintSlimline{10.0, 0.03, 0.8};
  CoolingPart coolingSprintSlimlinePlus{12.0, 0.034, 1.05};
  CoolingPart coolingEnduranceHeavyDuty{25.0, 0.09, 1.5};
  CoolingPart coolingEnduranceHeavyDutyLight{21.0, 0.065, 1.32};
  CoolingPart coolingDuctedRacing{22.0, 0.095, 1.95};
  CoolingPart coolingMaxFlowEndurance{38.0, 0.14, 2.4};
  TirePart tireSoft{12.0, 1.15, 0.08, 85.0};
  TirePart tireMedium{12.0, 1.0, 0.05, 80.0};
  TirePart tireHard{12.0, 0.90, 0.03, 75.0};
  TirePart tireMichelinEndurance{11.0, 1.05, 0.04, 82.0};
  FuelSystemPart fuelStandardTank{35.0, 100.0};
  FuelSystemPart fuelLargeTank{50.0, 140.0};
  FuelSystemPart fuelLeMans90L{42.0, 90.0};
  FuelSystemPart fuelLeMans95L{43.5, 95.0};
  FuelSystemPart fuelLeMans110L{48.0, 110.0};
  FuelSystemPart fuelHydrogenTank{62.0, 75.0};
  BrakePart brakeStandardCaliper{8.0, 0.70, 0.15};
  BrakePart brakeStandardCaliperLight{7.0, 0.68, 0.16};
  BrakePart brakeCarbonCeramic{12.0, 0.85, 0.05};
  BrakePart brakeHeavyDutyEndurance{18.0, 0.75, 0.08};
  BrakePart brakeAPRacingGT3{10.0, 0.84, 0.06};
  BrakePart brakeBremboHypercar{11.0, 0.92, 0.04};
  BrakePart brakeAkebonoHypercar{10.5, 0.90, 0.045};
  BrakePart brakeAPRacingPrototype{11.5, 0.91, 0.042};
  TransmissionPart transmissionSixSpeed{45.0, 6,
                                        {4.5, 2.5, 1.85, 1.35, 1.05, 0.82},
                                        {18.0, 38.0, 55.0, 72.0, 88.0}, 0.08};
  TransmissionPart transmissionSixSpeedEndurance{
      47.0, 6, {3.15, 2.02, 1.53, 1.20, 0.97, 0.77},
      {21.0, 40.0, 56.0, 72.0, 86.0}, 0.065};
  TransmissionPart transmissionSixSpeedShortRatio{
      45.0, 6, {3.35, 2.15, 1.62, 1.28, 1.03, 0.82},
      {20.0, 38.0, 54.0, 70.0, 84.0}, 0.058};
  TransmissionPart transmissionSevenSpeed{
      48.0, 7, {4.2, 2.6, 1.9, 1.45, 1.15, 0.92, 0.75},
      {16.0, 34.0, 50.0, 66.0, 80.0, 94.0}, 0.06};
  TransmissionPart transmissionEightSpeed{
      52.0, 8, {3.8, 2.4, 1.8, 1.4, 1.1, 0.9, 0.75, 0.62},
      {14.0, 30.0, 46.0, 60.0, 74.0, 86.0, 98.0}, 0.04};
  TransmissionPart transmissionXtracP1359{
      49.0, 7, {3.0, 2.0, 1.52, 1.20, 0.96, 0.78, 0.60},
      {20.0, 38.0, 54.0, 68.0, 82.0, 94.0}, 0.050};
  TransmissionPart transmissionXtracP1359Endurance{
      50.0, 7, {2.95, 1.98, 1.50, 1.18, 0.94, 0.76, 0.58},
      {19.0, 36.0, 52.0, 66.0, 80.0, 92.0}, 0.054};
  TransmissionPart transmissionXtracP529{
      46.0, 6, {3.2, 2.05, 1.55, 1.22, 0.98, 0.78},
      {22.0, 42.0, 58.0, 74.0, 88.0}, 0.060};
  TransmissionPart transmissionXtracP529Endurance{
      47.0, 6, {3.15, 2.02, 1.53, 1.20, 0.97, 0.77},
      {21.0, 40.0, 56.0, 72.0, 86.0}, 0.055};
  TransmissionPart transmissionSingleSpeedEDrive{
      38.0, 1, {3.2, 0, 0, 0, 0, 0, 0, 0},
      {200.0, 0, 0, 0, 0, 0, 0}, 0.0};
  HybridPart hybridNone{0.0, 0.0, 0.0, 0.0};
  HybridPart hybridNoneLightweight{-2.0, 0.0, 0.0, 0.0};
  HybridPart hybridNoneEndurance{6.0, 0.0, 0.0, 0.0};
  HybridPart hybridLMDh500kW{85.0, 500.0, 0.30, 8.0};
  HybridPart hybridHypercarHV{95.0, 200.0, 0.50, 3.5};
  HybridPart hybridLMDh50kW{92.0, 50.0, 0.35, 8.0};
  WheelPackagePart wheelHypercar18Standard{22.0, 0.457, 0.457, 305.0, 310.0,
                                           1.0, 1.0, 0.012, 8.0};
  WheelPackagePart wheelHypercar18Balanced{23.0, 0.457, 0.457, 305.0, 322.0,
                                           1.03, 1.06, 0.015, 8.8};
  WheelPackagePart wheelHypercar18WideRear{24.0, 0.457, 0.457, 305.0, 335.0,
                                           1.06, 1.12, 0.018, 9.5};
  WheelPackagePart wheelHypercar18LowDrag{20.0, 0.457, 0.457, 295.0, 300.0,
                                          0.96, 0.92, 0.008, 7.0};
  WheelPackagePart wheelLMP2Oreca18{21.0, 0.457, 0.457, 300.0, 305.0, 1.0, 1.0,
                                    0.011, 7.5};
  WheelPackagePart wheelLMP2Oreca18Wide{22.5, 0.457, 0.457, 300.0, 315.0, 1.04,
                                        1.08, 0.013, 8.0};
  WheelPackagePart wheelLMP2Oreca18Endurance{
      21.5, 0.457, 0.457, 300.0, 308.0, 0.99, 0.94, 0.010, 7.8};
  WheelPackagePart wheelGT3Front20Rear21{26.0, 0.508, 0.533, 325.0, 340.0, 1.04,
                                         1.05, 0.016, 10.0};
  WheelPackagePart wheelGT3Front20Rear21Endurance{
      27.0, 0.508, 0.533, 325.0, 345.0, 1.02, 0.96, 0.017, 10.5};
  WheelPackagePart wheelGT3WideRear21{28.0, 0.508, 0.533, 325.0, 355.0, 1.08,
                                      1.14, 0.022, 11.0};
  SuspensionPart suspensionPushrodDoubleWishbone{
      14.0, 135000.0, 150000.0, 0.040, 1.0, 1.0, 1.0, 1.0};
  SuspensionPart suspensionPushrodDoubleWishboneEndurance{
      14.5, 128000.0, 143000.0, 0.041, 0.97, 1.02, 1.02, 1.03};
  SuspensionPart suspensionPullrodDoubleWishbone{
      13.0, 132000.0, 148000.0, 0.038, 1.02, 1.08, 0.95, 1.02};
  SuspensionPart suspensionPullrodDoubleWishboneLowDrag{
      12.5, 130000.0, 146000.0, 0.036, 1.0, 1.14, 0.93, 0.98};
  SuspensionPart suspensionDoubleWishboneHeaveSpring{
      16.0, 142000.0, 158000.0, 0.041, 1.08, 1.12, 1.05, 1.04};
  SuspensionPart suspensionMultilinkRearHypercar{
      15.0, 138000.0, 162000.0, 0.039, 1.05, 1.10, 1.02, 1.03};
  SuspensionPart suspensionMacPhersonStrutGT3{
      11.0, 118000.0, 132000.0, 0.048, 0.92, 0.95, 1.08, 0.94};
  SuspensionPart suspensionMacPhersonStrutGT3Light{
      10.0, 114000.0, 128000.0, 0.049, 0.88, 0.93, 1.12, 0.92};
  SuspensionPart suspensionDoubleWishboneGT3{
      13.0, 122000.0, 138000.0, 0.045, 1.0, 1.0, 1.0, 1.0};
  SuspensionPart suspensionDoubleWishboneGT3Stiff{
      13.5, 128000.0, 145000.0, 0.044, 1.06, 1.02, 0.98, 0.97};
  SuspensionPart suspensionDoubleWishboneGT3Endurance{
      12.8, 116000.0, 132000.0, 0.046, 0.96, 0.98, 1.03, 1.03};
  SuspensionPart suspensionOrecaLMP2Spec{
      12.0, 128000.0, 142000.0, 0.042, 0.98, 1.0, 0.98, 0.98};
  SuspensionPart suspensionOrecaLMP2SpecEndurance{
      12.5, 122000.0, 136000.0, 0.043, 0.94, 1.01, 1.01, 1.02};
  std::map<std::string, std::string> attachmentPoints;
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
  double generatorKw = 0.0;
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
  EChassis chassisChoice = EChassis::CarbonMonocoque;
  EFrontAero frontAeroChoice = EFrontAero::LowDragNose;
  ERearAero rearAeroChoice = ERearAero::StandardWing;
  ECoolingPack coolingChoice = ECoolingPack::EnduranceHeavyDuty;
  CoolingLayout coolingLayout;
  bool hasCustomCoolingLayout = false;
  double ductAirflowFactor = 1.0;
  ETireCompound tireChoice = ETireCompound::Medium;
  ETyreTread tyreTread = ETyreTread::Slick;
  EWheelPackage wheelPackageChoice = EWheelPackage::Hypercar18Standard;
  ESuspensionLayout suspensionChoice = ESuspensionLayout::PushrodDoubleWishbone;
  ESuspensionLayout frontSuspensionChoice = ESuspensionLayout::PushrodDoubleWishbone;
  ESuspensionLayout rearSuspensionChoice = ESuspensionLayout::PushrodDoubleWishbone;
  bool hasCustomWheelDims = false;
  double customFrontWheelDiameterM = 0.0;
  double customRearWheelDiameterM = 0.0;
  double customFrontTireWidthMm = 0.0;
  double customRearTireWidthMm = 0.0;
  EFuelSystem fuelSystemChoice = EFuelSystem::StandardTank;
  EBrakeSystem brakeSystemChoice = EBrakeSystem::StandardCaliper;
  ETransmission transmissionChoice = ETransmission::SixSpeedSequential;
  EHybridSystem hybridSystemChoice = EHybridSystem::None;
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

ChassisPart GetChassisStats(EChassis type, const PartCatalog &catalog);
FrontAeroPart GetFrontAeroStats(EFrontAero type, const PartCatalog &catalog);
RearAeroPart GetRearAeroStats(ERearAero type, const PartCatalog &catalog);
CoolingPart GetCoolingStats(ECoolingPack type, const PartCatalog &catalog);
TirePart GetTireStats(ETireCompound type, const PartCatalog &catalog);
WheelPackagePart GetWheelPackageStats(EWheelPackage type,
                                      const PartCatalog &catalog);
SuspensionPart GetSuspensionStats(ESuspensionLayout type,
                                  const PartCatalog &catalog);
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
FuelSystemPart GetFuelSystemStats(EFuelSystem type, const PartCatalog &catalog);
BrakePart GetBrakeStats(EBrakeSystem type, const PartCatalog &catalog);
TransmissionPart GetTransmissionStats(ETransmission type,
                                        const PartCatalog &catalog);
HybridPart GetHybridStats(EHybridSystem type, const PartCatalog &catalog);
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
