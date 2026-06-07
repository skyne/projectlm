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
  Count
};

enum class HiddenFaultKind : uint8_t {
  CoolingHoseLeak,
  PowertrainSealLeak,
  HairlineCrack,
  WiringChafe
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
/** True when any corner suspension is marked irreparable (terminal for race). */
bool HasIrreparableSuspension(const PartDamageState &state);
/** True after garage assessment — irreparable structural parts, no return to track. */
bool HasTerminalStructuralDamage(const PartDamageState &state);
/** Two corners on the same side or axle at 0% body+susp — car stops on track. */
bool HasCatastrophicSameSideLoss(const PartDamageState &state,
                                 double destroyedMaxHealth = 0.0);
const char *LimpModeLabel(LimpMode mode);
const char *TyreDeflationLabel(TyreDeflationState state);
const char *HiddenFaultKindToken(HiddenFaultKind kind);
HiddenFaultKind HiddenFaultKindFromToken(const std::string &token);

#endif
