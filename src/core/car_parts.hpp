#ifndef CAR_PARTS_HPP
#define CAR_PARTS_HPP

#include <map>
#include <string>

struct ClassRule;

enum class EChassis { CarbonMonocoque, Spaceframe };
enum class EFrontAero { LowDragNose, HighDownforceSplitter };
enum class ERearAero { StandardWing, HighDownforceWing, WinglessGroundEffect };
enum class ECoolingPack { SprintSlimline, EnduranceHeavyDuty };
enum class ETireCompound { Soft, Medium, Hard };
enum class EFuelSystem { StandardTank, LargeTank };
enum class EBrakeSystem { StandardCaliper, CarbonCeramic, HeavyDutyEndurance };
enum class ETransmission {
  SixSpeedSequential,
  SevenSpeedSequential,
  EightSpeedPaddle
};
enum class EHybridSystem { None, LMDh500kW, HypercarHV };

struct ChassisPart {
  double mass = 0.0;
  double structuralRigidity = 1.0;
  double baselineDrag = 0.0;
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
  FrontAeroPart frontLowDragNose{8.0, 0.5, 0.04};
  FrontAeroPart frontHighDownforceSplitter{15.0, 1.2, 0.12};
  RearAeroPart rearStandardWing{18.0, 1.0, 0.14, false};
  RearAeroPart rearHighDownforceWing{25.0, 1.8, 0.22, false};
  RearAeroPart rearWinglessGroundEffect{10.0, 1.3, 0.08, true};
  CoolingPart coolingSprintSlimline{10.0, 0.03, 0.8};
  CoolingPart coolingEnduranceHeavyDuty{25.0, 0.09, 1.5};
  TirePart tireSoft{12.0, 1.15, 0.08, 85.0};
  TirePart tireMedium{12.0, 1.0, 0.05, 80.0};
  TirePart tireHard{12.0, 0.90, 0.03, 75.0};
  FuelSystemPart fuelStandardTank{35.0, 100.0};
  FuelSystemPart fuelLargeTank{50.0, 140.0};
  BrakePart brakeStandardCaliper{8.0, 0.70, 0.15};
  BrakePart brakeCarbonCeramic{12.0, 0.85, 0.05};
  BrakePart brakeHeavyDutyEndurance{18.0, 0.75, 0.08};
  TransmissionPart transmissionSixSpeed{45.0, 6,
                                        {4.5, 2.5, 1.85, 1.35, 1.05, 0.82},
                                        {18.0, 38.0, 55.0, 72.0, 88.0}, 0.08};
  TransmissionPart transmissionSevenSpeed{
      48.0, 7, {4.2, 2.6, 1.9, 1.45, 1.15, 0.92, 0.75},
      {16.0, 34.0, 50.0, 66.0, 80.0, 94.0}, 0.06};
  TransmissionPart transmissionEightSpeed{
      52.0, 8, {3.8, 2.4, 1.8, 1.4, 1.1, 0.9, 0.75, 0.62},
      {14.0, 30.0, 46.0, 60.0, 74.0, 86.0, 98.0}, 0.04};
  HybridPart hybridNone{0.0, 0.0, 0.0, 0.0};
  HybridPart hybridLMDh500kW{85.0, 500.0, 0.30, 8.0};
  HybridPart hybridHypercarHV{95.0, 200.0, 0.50, 3.5};
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
};

struct AssemblyConfig {
  double engineWeightCoeff = 35.0;
  double engineWeightCylFactor = 5.0;
  double dieselWeightMult = 1.3;
  double baseVehicleMass = 150.0;
  double torqueCoefficient = 110.0;
  double hpConversion = 7127.0;
  double referenceStroke = 0.080;
  double referenceRPM = 6000.0;
  double fuelBurnCoeff = 0.15;
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
  ETireCompound tireChoice = ETireCompound::Medium;
  EFuelSystem fuelSystemChoice = EFuelSystem::StandardTank;
  EBrakeSystem brakeSystemChoice = EBrakeSystem::StandardCaliper;
  ETransmission transmissionChoice = ETransmission::SixSpeedSequential;
  EHybridSystem hybridSystemChoice = EHybridSystem::None;
  double frontSpringStiffness = 100000.0;
  double rearSpringStiffness = 100000.0;
  double rideHeight = 0.050;
  /** Session setup — normalized 0 (min) to 1 (max). 0.5 = baseline part geometry. */
  double frontWingAngle = 0.5;
  double rearWingAngle = 0.5;
  double frontDamper = 0.5;
  double rearDamper = 0.5;
  /** Installed radiator sizes (0–1) from build; openings are session-adjustable. */
  double engineRadiatorSize = 0.0;
  double oilCoolerSize = 0.0;
  double chargeAirCoolerSize = 0.0;
  double gearboxCoolerSize = 0.0;
  double engineRadiatorOpening = 1.0;
  double oilCoolerOpening = 1.0;
  double chargeAirCoolerOpening = 1.0;
  double gearboxCoolerOpening = 1.0;
  double calculatedTotalMass = 0.0;
  double totalDragCd = 0.0;
  double totalDownforceCl = 0.0;
  double structuralRigidityFactor = 1.0;
  double coolingCapacity = 1.0;
  double peakHorsepower = 0.0;
  double peakTorque = 0.0;
  double vibrationIndex = 0.0;
  double fuelBurnRate = 0.0;
  double tireGripMultiplier = 1.0;
  double tireWearRate = 0.0;
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
};

ChassisPart GetChassisStats(EChassis type, const PartCatalog &catalog);
FrontAeroPart GetFrontAeroStats(EFrontAero type, const PartCatalog &catalog);
RearAeroPart GetRearAeroStats(ERearAero type, const PartCatalog &catalog);
CoolingPart GetCoolingStats(ECoolingPack type, const PartCatalog &catalog);
TirePart GetTireStats(ETireCompound type, const PartCatalog &catalog);
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

#endif
