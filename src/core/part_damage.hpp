#ifndef PART_DAMAGE_HPP
#define PART_DAMAGE_HPP

#include "car_parts.hpp"
#include <cstdint>
#include <string>
#include <vector>

struct SimulationState;

enum class DamagePart : uint8_t {
  Engine = 0,
  Gearbox,
  Cooling,
  Brakes,
  Hybrid,
  AeroFront,
  AeroRear,
  BodyFL,
  BodyFR,
  BodyRL,
  BodyRR,
  SuspFL,
  SuspFR,
  SuspRL,
  SuspRR,
  Monocoque,
  Count
};

enum class HiddenFaultKind : uint8_t {
  CoolingHoseLeak,
  PowertrainSealLeak,
  HairlineCrack,
  WiringChafe,
  TubStress
};

enum class TyreDeflationState : uint8_t { Normal = 0, Soft, Flat };

enum class LimpMode : uint8_t {
  None = 0,
  ReducedPower,
  HybridOnly,
  BarelyDriveable,
  Immobilized
};

enum class CollisionSide : int8_t { Unknown = 0, Left, Right, Front, Rear };

struct HiddenFault {
  HiddenFaultKind kind = HiddenFaultKind::CoolingHoseLeak;
  DamagePart linkedPart = DamagePart::Cooling;
  double severity = 0.0;
  bool revealed = false;
};

struct PartDamageProfile {
  double baseRepairSec = 10.0;
  double restoreAmount = 20.0;
  double irreparableBelow = 0.0;
  double wearResistance = 1.0;
};

struct PartDamageState {
  double health[static_cast<int>(DamagePart::Count)];
  bool irreparable[static_cast<int>(DamagePart::Count)];
  std::vector<HiddenFault> hiddenFaults;

  PartDamageState();
};

struct CarDamageProfiles {
  PartDamageProfile profiles[static_cast<int>(DamagePart::Count)];
};

struct TyreDeflationStateArr {
  TyreDeflationState state[4] = {TyreDeflationState::Normal, TyreDeflationState::Normal,
                                 TyreDeflationState::Normal, TyreDeflationState::Normal};
  double progress[4] = {0.0, 0.0, 0.0, 0.0};
};

int DamagePartIndex(DamagePart part);
DamagePart DamagePartFromToken(const std::string &token);
std::string DamagePartToken(DamagePart part);
bool IsBodyDamagePart(DamagePart part);
bool IsSuspDamagePart(DamagePart part);
DamagePart BodyPartForWheel(int wheelIdx);
DamagePart SuspPartForWheel(int wheelIdx);
int WheelIndexForBodyPart(DamagePart part);
int WheelIndexForSuspPart(DamagePart part);

void BuildCarDamageProfiles(const CarConfig &car, const PartCatalog &catalog,
                            CarDamageProfiles &out);

void InitPartDamageState(PartDamageState &state);
void SyncDerivedEngineHealth(SimulationState &state, const CarConfig &car);
double PartHealth(const PartDamageState &state, DamagePart part);

void ApplyPartWear(PartDamageState &state, DamagePart part, double amount,
                   const PartDamageProfile &profile);
void ApplyPartDamageHit(PartDamageState &state, DamagePart part, double amount,
                        const PartDamageProfile &profile);

void ApplyCollisionDamage(PartDamageState &state, const CarDamageProfiles &profiles,
                          double impact, CollisionSide side, bool hasHybrid);

void ApplyHiddenFaultBleed(PartDamageState &state, double deltaTime);
void RevealEscalatedHiddenFaults(PartDamageState &state);

double ComputeStructuralSeverity(const PartDamageState &state,
                                 const TyreDeflationStateArr &tyres);
LimpMode EvaluateLimpMode(const PartDamageState &state, const CarConfig &car,
                          const TyreDeflationStateArr &tyres, double batteryMJ);

CollisionSide CollisionSideFromLateral(double lateralOffset);
/** Classify which face of `self` contacted `other` from gap and lateral geometry. */
CollisionSide CollisionContactSide(double gap, double combinedLength, double selfN,
                                   double otherN);
CollisionSide MirrorCollisionSide(CollisionSide side);

struct TyrePunctureRoll {
  int wheelIdx = -1;
  bool instantFlat = false;
};

std::vector<TyrePunctureRoll> EvaluateCollisionTyrePuncture(double impact,
                                                            CollisionSide side,
                                                            double overlapFactor,
                                                            uint32_t seed);

std::vector<TyrePunctureRoll> EvaluateDebrisTyrePuncture(double speedMs,
                                                         double gripMultiplier,
                                                         double debrisSeverity,
                                                         double weatherGripScale,
                                                         uint32_t seed);

/** @deprecated Prefer EvaluateCollisionTyrePuncture. */
std::vector<int> CollisionPunctureWheels(double impact, CollisionSide side);

void TickTyreDeflationRisk(SimulationState &state, const CarConfig &car,
                           double deltaTime, double punctureWearThreshold);
void TickDeflatedTyreBodyDamage(SimulationState &state, const CarDamageProfiles &profiles,
                                double deltaTime, double minSpeedMs);
void ApplyTyrePuncture(SimulationState &state, int wheelIdx, bool instantFlat);
void ClearTyreDeflation(SimulationState &state, int wheelIdx);

bool RepairPartInPit(PartDamageState &state, DamagePart part,
                     const PartDamageProfile &profile);
bool RepairPartToken(PartDamageState &state, const std::string &token,
                     const CarDamageProfiles &profiles);

struct PartDamageRepairSpec {
  double baseRepairSec;
  double restoreAmount;
};

PartDamageRepairSpec RepairSpecForPart(DamagePart part);

/** Health restored by pit/garage work before the car is considered raceable again. */
constexpr double kRaceableHealthThreshold = 70.0;
/** Single pit stop cannot exceed this — longer work uses in-garage rebuild. */
constexpr double kMaxPitLaneRepairSec = 1800.0;
/** Minimum in-garage damage rebuild after tow or heavy pit work (seconds). */
constexpr double kGarageRebuildMinSec = 900.0;
/** Strip-down / reassembly on top of assessed part work (seconds). */
constexpr double kGarageRebuildOverheadSec = 300.0;

double ComputeGarageRebuildDurationSec(double assessedRepairSec,
                                       bool damageRebuild = true);
/** Collision impact at/above this stresses the safety cell. */
constexpr double kMonocoqueStressImpact = 10.0;
/** Severe impacts that can breach the tub or ignite a fire. */
constexpr double kHugeCrashImpact = 13.0;

bool IsMonocoqueBreached(const PartDamageState &state);
bool IsMonocoquePart(DamagePart part);
void ApplyMonocoqueImpactDamage(PartDamageState &state,
                                const CarDamageProfiles &profiles,
                                double impact);
double FireIgnitionChanceFromImpact(double impact, bool hasFuel,
                                    bool hasHybrid);
void ApplyFireDamage(PartDamageState &state, const CarDamageProfiles &profiles,
                     double deltaTime);

struct PartRepairAssessment {
  std::string token;
  double health = 100.0;
  double repairSec = 0.0;
  bool physicallyRepairable = true;
  bool sessionRepairable = true;
  bool needsGarageRebuild = false;
};

struct CarRepairAssessment {
  double totalRepairSec = 0.0;
  double remainingSessionSec = 0.0;
  bool physicallyRepairable = true;
  bool sessionRepairable = true;
  bool needsGarageRebuild = false;
  std::vector<PartRepairAssessment> parts;
};

class Car;
struct RaceSession;

double RemainingSessionSec(const RaceSession &session, const Car &car);
double ScaledRepairSecForHealth(const PartDamageProfile &profile, double health);
double PartRepairSecToRaceable(const PartDamageState &state, DamagePart part,
                               const PartDamageProfile &profile,
                               double targetHealth = kRaceableHealthThreshold);
bool IsPartBelowCritical(const PartDamageState &state, DamagePart part,
                         const PartDamageProfile &profile);
bool IsCarPhysicallyRepairable(const PartDamageState &state,
                               const CarConfig &car);
bool IsCarRaceable(const PartDamageState &state, const CarConfig &car,
                   const TyreDeflationStateArr &tyres, double batteryMJ);
CarRepairAssessment
ComputeCarRepairAssessment(const PartDamageState &state, const CarConfig &car,
                           const TyreDeflationStateArr &tyres,
                           const CarDamageProfiles &profiles,
                           double remainingSessionSec,
                           double targetHealth = kRaceableHealthThreshold);
void RestoreDamagedPartsToRaceable(PartDamageState &state,
                                   double targetHealth = kRaceableHealthThreshold);

/** Suspension below critical health threshold — needs garage-tier rebuild time. */
bool HasCriticalSuspension(const PartDamageState &state,
                           const CarDamageProfiles &profiles);
/** @deprecated Prefer IsCarPhysicallyRepairable / health thresholds. */
bool HasIrreparableSuspension(const PartDamageState &state);
/** @deprecated Prefer !IsCarPhysicallyRepairable. */
bool HasTerminalStructuralDamage(const PartDamageState &state);
/** Two corners on the same side or axle at 0% body+susp — car stops on track. */
bool HasCatastrophicSameSideLoss(const PartDamageState &state,
                                 double destroyedMaxHealth = 0.0);
const char *LimpModeLabel(LimpMode mode);
const char *TyreDeflationLabel(TyreDeflationState state);
const char *HiddenFaultKindToken(HiddenFaultKind kind);
HiddenFaultKind HiddenFaultKindFromToken(const std::string &token);

#endif
