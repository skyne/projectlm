#include "part_damage.hpp"
#include "car_entity.hpp"
#include "race.hpp"
#include "simulation.hpp"
#include <algorithm>
#include <cmath>

namespace {
constexpr int kPartCount = static_cast<int>(DamagePart::Count);

void SetProfile(PartDamageProfile &p, double repairSec, double restore,
                double irreparableBelow, double wearResistance) {
  p.baseRepairSec = repairSec;
  p.restoreAmount = restore;
  p.irreparableBelow = irreparableBelow;
  p.wearResistance = wearResistance;
}

double CornerSeverityFor(const PartDamageState &state,
                         const TyreDeflationStateArr &tyres, int wheelIdx) {
  const DamagePart body = BodyPartForWheel(wheelIdx);
  const DamagePart susp = SuspPartForWheel(wheelIdx);
  const double bodyH = PartHealth(state, body);
  const double suspH = PartHealth(state, susp);
  double cornerScore = 1.0 - std::min(bodyH, suspH) / 100.0;
  const auto defl = tyres.state[wheelIdx];
  const double deflationBonus =
      defl == TyreDeflationState::Flat ? 0.40
      : defl == TyreDeflationState::Soft ? 0.15
                                         : 0.0;
  const bool suspCritical = PartHealth(state, susp) <= 15.0;
  const double criticalBonus = suspCritical ? 0.35 : 0.0;
  return std::clamp(cornerScore + deflationBonus + criticalBonus, 0.0, 1.0);
}

int CountCriticalCorners(const PartDamageState &state,
                         const CarDamageProfiles &profiles) {
  int count = 0;
  for (int w = 0; w < 4; ++w) {
    const DamagePart susp = SuspPartForWheel(w);
    if (IsPartBelowCritical(state, susp,
                            profiles.profiles[DamagePartIndex(susp)]))
      ++count;
  }
  return count;
}

int CountCriticalCornersFixed(const PartDamageState &state) {
  int count = 0;
  for (int w = 0; w < 4; ++w) {
    const DamagePart susp = SuspPartForWheel(w);
    if (PartHealth(state, susp) <= 15.0)
      ++count;
  }
  return count;
}

bool DiagonalPairDamaged(const double cornerSeverity[4]) {
  const bool flRr = cornerSeverity[0] > 0.5 && cornerSeverity[3] > 0.5;
  const bool frRl = cornerSeverity[1] > 0.5 && cornerSeverity[2] > 0.5;
  return flRr || frRl;
}

bool SameSidePairDamaged(const double cornerSeverity[4]) {
  const bool left = cornerSeverity[0] > 0.5 && cornerSeverity[2] > 0.5;
  const bool right = cornerSeverity[1] > 0.5 && cornerSeverity[3] > 0.5;
  return left || right;
}

double CornerStructuralHealth(const PartDamageState &state, int wheelIdx) {
  return std::min(PartHealth(state, BodyPartForWheel(wheelIdx)),
                  PartHealth(state, SuspPartForWheel(wheelIdx)));
}
} // namespace

bool HasCatastrophicSameSideLoss(const PartDamageState &state,
                                 double destroyedMaxHealth) {
  auto pairDestroyed = [&](int a, int b) {
    return CornerStructuralHealth(state, a) <= destroyedMaxHealth &&
           CornerStructuralHealth(state, b) <= destroyedMaxHealth;
  };
  // Left/right sides and complete front/rear axles — all undriveable at 0%.
  return pairDestroyed(0, 2) || pairDestroyed(1, 3) || pairDestroyed(0, 1) ||
         pairDestroyed(2, 3);
}

bool HasIrreparableSuspension(const PartDamageState &state) {
  for (int w = 0; w < 4; ++w) {
    if (PartHealth(state, SuspPartForWheel(w)) <= 15.0)
      return true;
  }
  return false;
}

bool HasCriticalSuspension(const PartDamageState &state,
                           const CarDamageProfiles &profiles) {
  for (int w = 0; w < 4; ++w) {
    const DamagePart susp = SuspPartForWheel(w);
    if (IsPartBelowCritical(state, susp,
                            profiles.profiles[DamagePartIndex(susp)]))
      return true;
  }
  return false;
}

bool HasTerminalStructuralDamage(const PartDamageState &state) {
  CarConfig car;
  return !IsCarPhysicallyRepairable(state, car);
}

PartDamageState::PartDamageState() {
  InitPartDamageState(*this);
}

int DamagePartIndex(DamagePart part) { return static_cast<int>(part); }

std::string DamagePartToken(DamagePart part) {
  switch (part) {
  case DamagePart::Engine: return "engine";
  case DamagePart::Gearbox: return "gearbox";
  case DamagePart::Cooling: return "cooling";
  case DamagePart::Brakes: return "brakes";
  case DamagePart::Hybrid: return "hybrid";
  case DamagePart::AeroFront: return "aero_front";
  case DamagePart::AeroRear: return "aero_rear";
  case DamagePart::BodyFL: return "body_fl";
  case DamagePart::BodyFR: return "body_fr";
  case DamagePart::BodyRL: return "body_rl";
  case DamagePart::BodyRR: return "body_rr";
  case DamagePart::SuspFL: return "susp_fl";
  case DamagePart::SuspFR: return "susp_fr";
  case DamagePart::SuspRL: return "susp_rl";
  case DamagePart::SuspRR: return "susp_rr";
  case DamagePart::Monocoque: return "monocoque";
  default: return "";
  }
}

DamagePart DamagePartFromToken(const std::string &token) {
  if (token == "engine") return DamagePart::Engine;
  if (token == "gearbox") return DamagePart::Gearbox;
  if (token == "cooling") return DamagePart::Cooling;
  if (token == "brakes") return DamagePart::Brakes;
  if (token == "hybrid") return DamagePart::Hybrid;
  if (token == "aero_front" || token == "front_aero") return DamagePart::AeroFront;
  if (token == "aero_rear" || token == "rear_aero") return DamagePart::AeroRear;
  if (token == "body_fl") return DamagePart::BodyFL;
  if (token == "body_fr") return DamagePart::BodyFR;
  if (token == "body_rl") return DamagePart::BodyRL;
  if (token == "body_rr") return DamagePart::BodyRR;
  if (token == "body" || token == "bodywork") return DamagePart::BodyFL;
  if (token == "susp_fl") return DamagePart::SuspFL;
  if (token == "susp_fr") return DamagePart::SuspFR;
  if (token == "susp_rl") return DamagePart::SuspRL;
  if (token == "susp_rr") return DamagePart::SuspRR;
  if (token == "monocoque" || token == "chassis" || token == "tub" ||
      token == "safety_cell")
    return DamagePart::Monocoque;
  return DamagePart::Count;
}

bool IsBodyDamagePart(DamagePart part) {
  return part >= DamagePart::BodyFL && part <= DamagePart::BodyRR;
}

bool IsSuspDamagePart(DamagePart part) {
  return part >= DamagePart::SuspFL && part <= DamagePart::SuspRR;
}

bool IsMonocoquePart(DamagePart part) {
  return part == DamagePart::Monocoque;
}

bool IsMonocoqueBreached(const PartDamageState &state) {
  return PartHealth(state, DamagePart::Monocoque) <= 0.0;
}

DamagePart BodyPartForWheel(int wheelIdx) {
  switch (wheelIdx) {
  case 0: return DamagePart::BodyFL;
  case 1: return DamagePart::BodyFR;
  case 2: return DamagePart::BodyRL;
  default: return DamagePart::BodyRR;
  }
}

DamagePart SuspPartForWheel(int wheelIdx) {
  switch (wheelIdx) {
  case 0: return DamagePart::SuspFL;
  case 1: return DamagePart::SuspFR;
  case 2: return DamagePart::SuspRL;
  default: return DamagePart::SuspRR;
  }
}

int WheelIndexForBodyPart(DamagePart part) {
  switch (part) {
  case DamagePart::BodyFL: return 0;
  case DamagePart::BodyFR: return 1;
  case DamagePart::BodyRL: return 2;
  case DamagePart::BodyRR: return 3;
  default: return -1;
  }
}

int WheelIndexForSuspPart(DamagePart part) {
  switch (part) {
  case DamagePart::SuspFL: return 0;
  case DamagePart::SuspFR: return 1;
  case DamagePart::SuspRL: return 2;
  case DamagePart::SuspRR: return 3;
  default: return -1;
  }
}

void BuildCarDamageProfiles(const CarConfig &car, const PartCatalog &catalog,
                            CarDamageProfiles &out) {
  const ChassisPart chassis = GetChassisStats(catalog, car.chassisId);
  // Stock WEC endurance: gradual wear should not breach 85% over 24h alone.
  const double chassisRel = std::max(0.85, chassis.structuralRigidity) * 1.35;
  const TransmissionPart trans =
      GetTransmissionStats(catalog, car.transmissionId);
  const double transRel = 0.95 + (trans.gearCount >= 7 ? 0.05 : 0.0);

  SetProfile(out.profiles[DamagePartIndex(DamagePart::Engine)], 12.0, 25.0, 5.0,
             chassisRel * car.engineStressMult);
  SetProfile(out.profiles[DamagePartIndex(DamagePart::Gearbox)], 45.0, 25.0, 8.0,
             chassisRel * transRel);
  SetProfile(out.profiles[DamagePartIndex(DamagePart::Cooling)], 18.0, 30.0, 10.0,
             chassisRel);
  SetProfile(out.profiles[DamagePartIndex(DamagePart::Brakes)], 22.0, 30.0, 12.0,
             chassisRel);
  SetProfile(out.profiles[DamagePartIndex(DamagePart::Hybrid)], 60.0, 30.0, 5.0,
             chassisRel);
  SetProfile(out.profiles[DamagePartIndex(DamagePart::AeroFront)], 28.0, 35.0,
             12.0, chassisRel);
  SetProfile(out.profiles[DamagePartIndex(DamagePart::AeroRear)], 35.0, 40.0,
             10.0, chassisRel);
  for (DamagePart p = DamagePart::BodyFL; p <= DamagePart::BodyRR;
       p = static_cast<DamagePart>(DamagePartIndex(p) + 1)) {
    SetProfile(out.profiles[DamagePartIndex(p)], 6.0, 20.0, 0.0, chassisRel);
  }
  for (DamagePart p = DamagePart::SuspFL; p <= DamagePart::SuspRR;
       p = static_cast<DamagePart>(DamagePartIndex(p) + 1)) {
    SetProfile(out.profiles[DamagePartIndex(p)], 55.0, 40.0, 15.0, chassisRel);
  }
  SetProfile(out.profiles[DamagePartIndex(DamagePart::Monocoque)], 120.0, 12.0,
             25.0, chassisRel * 1.15);
  (void)car;
}

void InitPartDamageState(PartDamageState &state) {
  for (int i = 0; i < kPartCount; ++i) {
    state.health[i] = 100.0;
    state.irreparable[i] = false;
  }
  state.hiddenFaults.clear();
}

double PartHealth(const PartDamageState &state, DamagePart part) {
  const int idx = DamagePartIndex(part);
  if (idx < 0 || idx >= kPartCount)
    return 100.0;
  return state.health[idx];
}

void SyncDerivedEngineHealth(SimulationState &state, const CarConfig &car) {
  double minHealth = PartHealth(state.partDamage, DamagePart::Engine);
  minHealth = std::min(minHealth, PartHealth(state.partDamage, DamagePart::Gearbox));
  minHealth = std::min(minHealth, PartHealth(state.partDamage, DamagePart::Cooling));
  if (car.hybridDeployPowerKW > 0.0)
    minHealth = std::min(minHealth, PartHealth(state.partDamage, DamagePart::Hybrid));
  state.engineHealth = minHealth;
}

void ApplyPartWear(PartDamageState &state, DamagePart part, double amount,
                   const PartDamageProfile &profile) {
  const int idx = DamagePartIndex(part);
  if (idx < 0 || idx >= kPartCount || amount <= 0.0)
    return;
  const double scale = 1.0 / std::max(0.35, profile.wearResistance);
  state.health[idx] = std::max(0.0, state.health[idx] - amount * scale);
}

void ApplyPartDamageHit(PartDamageState &state, DamagePart part, double amount,
                        const PartDamageProfile &profile) {
  (void)profile;
  const int idx = DamagePartIndex(part);
  if (idx < 0 || idx >= kPartCount || amount <= 0.0)
    return;
  state.health[idx] = std::max(0.0, state.health[idx] - amount);
}

void ApplyCollisionDamage(PartDamageState &state, const CarDamageProfiles &profiles,
                          double impact, CollisionSide side, bool hasHybrid) {
  if (impact < kRubbingImpactThreshold)
    return;

  const auto hit = [&](DamagePart part, double amt) {
    ApplyPartDamageHit(state, part, amt,
                       profiles.profiles[DamagePartIndex(part)]);
  };

  const int leftWheels[] = {0, 2};
  const int rightWheels[] = {1, 3};
  const int frontWheels[] = {0, 1};
  const int rearWheels[] = {2, 3};
  const int *sideWheels = side == CollisionSide::Left ? leftWheels : rightWheels;
  const int sideCount = 2;

  const double scale = impact >= 11.0 ? 1.0 : 0.55;

  const auto hitAxle = [&](const int *wheels, DamagePart aeroPart, bool frontAxle) {
    if (impact < 7.0) {
      hit(BodyPartForWheel(wheels[0]), (1.2 + impact * 0.22) * scale);
      return;
    }
    if (impact < 10.0) {
      for (int i = 0; i < 2; ++i) {
        hit(BodyPartForWheel(wheels[i]), (4.5 + impact * 0.65) * scale);
        hit(SuspPartForWheel(wheels[i]), (2.5 + impact * 0.35) * scale);
      }
      hit(aeroPart, impact * 0.35 * scale);
      return;
    }
    for (int i = 0; i < 2; ++i) {
      hit(BodyPartForWheel(wheels[i]), (7.0 + impact * 0.85) * scale);
      hit(SuspPartForWheel(wheels[i]), (5.5 + impact * 0.75) * scale);
    }
    hit(aeroPart, impact * 0.65 * scale);
    if (frontAxle) {
      hit(DamagePart::Engine, impact * 0.22 * scale);
      if (hasHybrid)
        hit(DamagePart::Hybrid, impact * 0.18 * scale);
    }
    if (impact >= kMonocoqueStressImpact)
      ApplyMonocoqueImpactDamage(state, profiles, impact);
  };

  if (side == CollisionSide::Front) {
    hitAxle(frontWheels, DamagePart::AeroFront, true);
    return;
  }
  if (side == CollisionSide::Rear) {
    hitAxle(rearWheels, DamagePart::AeroRear, false);
    return;
  }

  if (impact < 7.0) {
    if (side == CollisionSide::Unknown) {
      hit(DamagePart::BodyFL, (2.5 + impact * 0.45) * scale);
      return;
    }
    const int w = side == CollisionSide::Left ? 0 : 1;
    hit(BodyPartForWheel(w), (1.2 + impact * 0.22) * scale);
    return;
  }

  if (impact < 10.0) {
    if (side == CollisionSide::Unknown) {
      hit(DamagePart::BodyFL, (2.0 + impact * 0.28) * scale);
      hit(SuspPartForWheel(0), (2.0 + impact * 0.3) * scale);
      if (impact > 8.0)
        hit(DamagePart::AeroFront, impact * 0.25 * scale);
      return;
    }
    for (int i = 0; i < sideCount; ++i) {
      const int w = sideWheels[i];
      hit(BodyPartForWheel(w), (4.5 + impact * 0.65) * scale);
      hit(SuspPartForWheel(w), (2.5 + impact * 0.35) * scale);
    }
    if (impact > 8.0)
      hit(DamagePart::AeroFront, impact * 0.35 * scale);
    return;
  }

  if (side == CollisionSide::Unknown) {
    hit(DamagePart::BodyFL, (6.0 + impact * 0.7) * scale);
    hit(SuspPartForWheel(0), (4.5 + impact * 0.55) * scale);
    hit(DamagePart::AeroFront, impact * 0.45 * scale);
    if (impact >= kMonocoqueStressImpact)
      ApplyMonocoqueImpactDamage(state, profiles, impact);
    return;
  }

  for (int i = 0; i < sideCount; ++i) {
    const int w = sideWheels[i];
    hit(BodyPartForWheel(w), (7.0 + impact * 0.85) * scale);
    hit(SuspPartForWheel(w), (5.5 + impact * 0.75) * scale);
  }
  hit(DamagePart::AeroRear, impact * 0.65 * scale);
  hit(DamagePart::Engine, impact * 0.22 * scale);
  if (hasHybrid)
    hit(DamagePart::Hybrid, impact * 0.18 * scale);
  if (impact >= kMonocoqueStressImpact)
    ApplyMonocoqueImpactDamage(state, profiles, impact);
}

void ApplyMonocoqueImpactDamage(PartDamageState &state,
                                const CarDamageProfiles &profiles,
                                double impact) {
  if (impact < kMonocoqueStressImpact)
    return;
  const auto &profile = profiles.profiles[DamagePartIndex(DamagePart::Monocoque)];
  double amount = 0.0;
  if (impact >= kHugeCrashImpact + 2.0)
    amount = 18.0 + (impact - kHugeCrashImpact) * 2.4;
  else if (impact >= kHugeCrashImpact)
    amount = 10.0 + (impact - kHugeCrashImpact) * 2.0;
  else
    amount = 1.5 + (impact - kMonocoqueStressImpact) * 1.8;
  ApplyPartDamageHit(state, DamagePart::Monocoque, amount, profile);
}

double FireIgnitionChanceFromImpact(double impact, bool hasFuel,
                                    bool hasHybrid) {
  if (impact < kHugeCrashImpact)
    return 0.0;
  double chance = 0.08 + (impact - kHugeCrashImpact) * 0.05;
  if (hasFuel)
    chance += 0.12;
  if (hasHybrid)
    chance += 0.06;
  return std::clamp(chance, 0.0, 0.55);
}

void ApplyFireDamage(PartDamageState &state, const CarDamageProfiles &profiles,
                     double deltaTime) {
  if (deltaTime <= 0.0)
    return;
  const auto &mono = profiles.profiles[DamagePartIndex(DamagePart::Monocoque)];
  const auto &engine = profiles.profiles[DamagePartIndex(DamagePart::Engine)];
  ApplyPartDamageHit(state, DamagePart::Monocoque, 2.2 * deltaTime, mono);
  ApplyPartDamageHit(state, DamagePart::Engine, 3.0 * deltaTime, engine);
  ApplyPartDamageHit(state, DamagePart::Cooling, 1.2 * deltaTime,
                     profiles.profiles[DamagePartIndex(DamagePart::Cooling)]);
}


namespace {

uint32_t HashCollisionSeed(uint32_t seed, int salt) {
  seed ^= static_cast<uint32_t>(salt + 0x9e3779b9);
  seed *= 0x85ebca6bU;
  seed ^= seed >> 13;
  return seed;
}

bool RollCollisionChance(uint32_t seed, double probability) {
  const double r =
      static_cast<double>(HashCollisionSeed(seed, 0) % 10000) / 10000.0;
  return r < std::clamp(probability, 0.0, 1.0);
}

} // namespace

CollisionSide CollisionContactSide(double gap, double combinedLength, double selfN,
                                 double otherN) {
  constexpr double kAlongsideGap = 0.55;
  constexpr double kLongitudinalEpsilon = 0.1;
  const double absGap = std::abs(gap);

  if (absGap < combinedLength * kAlongsideGap) {
    constexpr double kLatEps = 0.15;
    if (otherN < selfN - kLatEps)
      return CollisionSide::Left;
    if (otherN > selfN + kLatEps)
      return CollisionSide::Right;
    return CollisionSide::Unknown;
  }

  if (gap > combinedLength * kLongitudinalEpsilon)
    return CollisionSide::Front;
  if (gap < -combinedLength * kLongitudinalEpsilon)
    return CollisionSide::Rear;
  return CollisionSide::Unknown;
}

CollisionSide MirrorCollisionSide(CollisionSide side) {
  switch (side) {
  case CollisionSide::Left:
    return CollisionSide::Right;
  case CollisionSide::Right:
    return CollisionSide::Left;
  case CollisionSide::Front:
    return CollisionSide::Rear;
  case CollisionSide::Rear:
    return CollisionSide::Front;
  default:
    return CollisionSide::Unknown;
  }
}

std::vector<TyrePunctureRoll> EvaluateCollisionTyrePuncture(
    double impact, CollisionSide side, double overlapFactor, uint32_t seed) {
  std::vector<TyrePunctureRoll> rolls;
  if (impact < 7.0 || overlapFactor <= 0.05)
    return rolls;

  const double overlap = std::clamp(overlapFactor, 0.0, 1.0);

  if (side == CollisionSide::Left || side == CollisionSide::Right) {
    const int w = side == CollisionSide::Left ? 0 : 1;
    const double pSoft =
        std::clamp((impact - 6.5) / 4.0, 0.0, 1.0) * overlap;
    if (impact >= 9.5 && overlap > 0.55 &&
        RollCollisionChance(seed, pSoft * 0.75))
      rolls.push_back({w, true});
    else if (RollCollisionChance(seed + 1, pSoft * 0.6))
      rolls.push_back({w, false});
    return rolls;
  }

  if (side == CollisionSide::Front) {
    const double pSoft = std::clamp((impact - 10.5) / 3.0, 0.0, 1.0) * overlap;
    if (impact >= 13.0 && RollCollisionChance(seed, pSoft * 0.5))
      rolls.push_back({0, true});
    else if (impact >= 11.0 && RollCollisionChance(seed + 1, pSoft * 0.45))
      rolls.push_back({0, false});
    return rolls;
  }

  if (side == CollisionSide::Rear) {
    const double pSoft = std::clamp((impact - 11.5) / 3.0, 0.0, 1.0) * overlap;
    if (impact >= 14.0 && RollCollisionChance(seed, pSoft * 0.45))
      rolls.push_back({2, true});
    else if (impact >= 12.0 && RollCollisionChance(seed + 1, pSoft * 0.4))
      rolls.push_back({2, false});
    return rolls;
  }

  if (side == CollisionSide::Unknown) {
    const double pSoft =
        std::clamp((impact - 6.5) / 4.0, 0.0, 1.0) * overlap * 0.5;
    if (impact >= 9.5 && RollCollisionChance(seed, pSoft * 0.35))
      rolls.push_back({0, true});
    else if (RollCollisionChance(seed + 1, pSoft * 0.3))
      rolls.push_back({0, false});
  }
  return rolls;
}

std::vector<TyrePunctureRoll> EvaluateDebrisTyrePuncture(
    double speedMs, double gripMultiplier, double debrisSeverity,
    double weatherGripScale, uint32_t seed) {
  std::vector<TyrePunctureRoll> rolls;
  if (speedMs < 12.0 || debrisSeverity <= 0.05 || gripMultiplier >= 0.99)
    return rolls;
  const double weatherFactor =
      weatherGripScale > 0.0 && weatherGripScale < 1.0
          ? std::min(1.2, 1.0 / weatherGripScale)
          : 1.0;
  const double pSoft =
      std::clamp((speedMs - 10.0) / 35.0, 0.0, 1.0) *
      std::clamp((0.7 - gripMultiplier) / 0.35, 0.0, 1.0) * debrisSeverity *
      weatherFactor;
  const int wheel = static_cast<int>(HashCollisionSeed(seed, 3) % 2);
  if (RollCollisionChance(seed, pSoft * 0.55))
    rolls.push_back({wheel, false});
  if (speedMs > 28.0 && RollCollisionChance(seed + 2, pSoft * 0.25))
    rolls.push_back({wheel, true});
  return rolls;
}

std::vector<int> CollisionPunctureWheels(double impact, CollisionSide side) {
  std::vector<int> wheels;
  for (const TyrePunctureRoll &roll :
       EvaluateCollisionTyrePuncture(impact, side, 1.0, 424242U)) {
    if (roll.instantFlat)
      wheels.push_back(roll.wheelIdx);
  }
  return wheels;
}

void ApplyHiddenFaultBleed(PartDamageState &state, double deltaTime) {
  for (HiddenFault &fault : state.hiddenFaults) {
    if (fault.revealed)
      continue;
    fault.severity = std::min(100.0, fault.severity + 0.06 * deltaTime);
    const int idx = DamagePartIndex(fault.linkedPart);
    if (idx >= 0 && idx < kPartCount) {
      state.health[idx] = std::max(
          0.0, state.health[idx] - 0.025 * deltaTime * (fault.severity / 100.0));
    }
  }
}

void RevealEscalatedHiddenFaults(PartDamageState &state) {
  for (HiddenFault &fault : state.hiddenFaults) {
    if (fault.revealed)
      continue;
    const double linked = PartHealth(state, fault.linkedPart);
    if (fault.severity >= 90.0 || linked < 75.0) {
      fault.revealed = true;
      ApplyPartDamageHit(state, fault.linkedPart, 8.0, {10.0, 20.0, 0.0, 1.0});
    }
  }
}

double ComputeStructuralSeverity(const PartDamageState &state,
                                 const TyreDeflationStateArr &tyres) {
  double cornerSeverity[4];
  for (int w = 0; w < 4; ++w)
    cornerSeverity[w] = CornerSeverityFor(state, tyres, w);

  double worst = 0.0;
  double sumTop2 = 0.0;
  for (int w = 0; w < 4; ++w)
    worst = std::max(worst, cornerSeverity[w]);
  double sorted[4] = {cornerSeverity[0], cornerSeverity[1], cornerSeverity[2],
                      cornerSeverity[3]};
  std::sort(sorted, sorted + 4, std::greater<double>());
  sumTop2 = sorted[0] + sorted[1];

  double severity = worst * 40.0 + sumTop2 * 12.5;
  if (DiagonalPairDamaged(cornerSeverity))
    severity += 20.0;
  else if (SameSidePairDamaged(cornerSeverity))
    severity += 10.0;
  severity += CountCriticalCornersFixed(state) * 12.0;
  const double monoH = PartHealth(state, DamagePart::Monocoque);
  if (monoH < 100.0)
    severity += (1.0 - monoH / 100.0) * 30.0;
  return std::clamp(severity, 0.0, 100.0);
}

LimpMode EvaluateLimpMode(const PartDamageState &state, const CarConfig &car,
                          const TyreDeflationStateArr &tyres, double batteryMJ) {
  if (IsMonocoqueBreached(state))
    return LimpMode::Immobilized;

  const double monoH = PartHealth(state, DamagePart::Monocoque);
  if (monoH > 0.0 && monoH <= 25.0)
    return LimpMode::Immobilized;

  if (HasCatastrophicSameSideLoss(state))
    return LimpMode::Immobilized;

  const double structural = ComputeStructuralSeverity(state, tyres);
  const int criticalCorners = CountCriticalCornersFixed(state);
  if (structural >= 92.0 || criticalCorners >= 3)
    return LimpMode::Immobilized;
  if (structural >= 68.0)
    return LimpMode::BarelyDriveable;

  const double engineH = PartHealth(state, DamagePart::Engine);
  const double gearboxH = PartHealth(state, DamagePart::Gearbox);
  const bool iceDead =
      (engineH <= 0.0 && gearboxH <= 0.0) ||
      (engineH < 8.0 && gearboxH < 12.0);
  if (iceDead && car.hybridDeployPowerKW > 0.0 && batteryMJ > 8.0)
    return LimpMode::HybridOnly;
  if (engineH < 20.0 || gearboxH < 20.0)
    return LimpMode::ReducedPower;
  return LimpMode::None;
}

CollisionSide CollisionSideFromLateral(double lateralOffset) {
  if (lateralOffset < -0.08)
    return CollisionSide::Left;
  if (lateralOffset > 0.08)
    return CollisionSide::Right;
  return CollisionSide::Unknown;
}

void TickTyreDeflationRisk(SimulationState &state, const CarConfig &car,
                           double deltaTime, double punctureWearThreshold) {
  (void)car;
  for (int i = 0; i < 4; ++i) {
    if (state.tyreDeflation.state[i] == TyreDeflationState::Flat)
      continue;
    if (state.tyreDeflation.state[i] == TyreDeflationState::Soft) {
      state.tyreDeflation.progress[i] += deltaTime * 0.04;
      if (state.tyreDeflation.progress[i] >= 1.0)
        state.tyreDeflation.state[i] = TyreDeflationState::Flat;
      continue;
    }
    if (state.tireWear[i] < punctureWearThreshold)
      continue;
    const double wearExcess = (state.tireWear[i] - punctureWearThreshold) / 0.12;
    const double roll = std::fmod(
        std::sin((state.elapsedRaceTime + i * 17.3) * 0.31) * 43758.5453, 1.0);
    if (roll < wearExcess * 0.000025 * deltaTime) {
      state.tyreDeflation.state[i] = TyreDeflationState::Soft;
      state.tyreDeflation.progress[i] = 0.2;
    }
  }
}

void TickDeflatedTyreBodyDamage(SimulationState &state,
                                const CarDamageProfiles &profiles,
                                double deltaTime, double minSpeedMs) {
  if (state.currentSpeed < minSpeedMs)
    return;
  for (int i = 0; i < 4; ++i) {
    const auto defl = state.tyreDeflation.state[i];
    if (defl == TyreDeflationState::Normal)
      continue;
    const double speedFactor = std::min(1.5, state.currentSpeed / 25.0);
    const double rate =
        (defl == TyreDeflationState::Flat ? 2.2 : 0.7) * speedFactor * deltaTime;
    ApplyPartDamageHit(state.partDamage, BodyPartForWheel(i), rate,
                       profiles.profiles[DamagePartIndex(BodyPartForWheel(i))]);
    if (defl == TyreDeflationState::Flat) {
      ApplyPartDamageHit(state.partDamage, SuspPartForWheel(i), rate * 0.35,
                         profiles.profiles[DamagePartIndex(SuspPartForWheel(i))]);
    }
  }
}

void ApplyTyrePuncture(SimulationState &state, int wheelIdx, bool instantFlat) {
  if (wheelIdx < 0 || wheelIdx > 3)
    return;
  if (instantFlat) {
    state.tyreDeflation.state[wheelIdx] = TyreDeflationState::Flat;
    state.tyreDeflation.progress[wheelIdx] = 1.0;
  } else if (state.tyreDeflation.state[wheelIdx] == TyreDeflationState::Normal) {
    state.tyreDeflation.state[wheelIdx] = TyreDeflationState::Soft;
    state.tyreDeflation.progress[wheelIdx] = 0.35;
  }
}

void ClearTyreDeflation(SimulationState &state, int wheelIdx) {
  if (wheelIdx < 0 || wheelIdx > 3)
    return;
  state.tyreDeflation.state[wheelIdx] = TyreDeflationState::Normal;
  state.tyreDeflation.progress[wheelIdx] = 0.0;
}

bool RepairPartInPit(PartDamageState &state, DamagePart part,
                     const PartDamageProfile &profile) {
  const int idx = DamagePartIndex(part);
  if (idx < 0 || idx >= kPartCount)
    return false;
  if (PartHealth(state, part) >= 99.5)
    return false;
  state.health[idx] =
      std::min(100.0, state.health[idx] + profile.restoreAmount);
  return true;
}

bool RepairPartToken(PartDamageState &state, const std::string &token,
                     const CarDamageProfiles &profiles) {
  if (token == "body" || token == "bodywork") {
    bool any = false;
    for (DamagePart p = DamagePart::BodyFL; p <= DamagePart::BodyRR;
         p = static_cast<DamagePart>(DamagePartIndex(p) + 1)) {
      any = RepairPartInPit(state, p, profiles.profiles[DamagePartIndex(p)]) ||
            any;
    }
    return any;
  }
  const DamagePart part = DamagePartFromToken(token);
  if (part == DamagePart::Count)
    return false;
  return RepairPartInPit(state, part, profiles.profiles[DamagePartIndex(part)]);
}

PartDamageRepairSpec RepairSpecForPart(DamagePart part) {
  switch (part) {
  case DamagePart::Engine: return {12.0, 25.0};
  case DamagePart::Gearbox: return {45.0, 25.0};
  case DamagePart::Cooling: return {18.0, 30.0};
  case DamagePart::Brakes: return {22.0, 30.0};
  case DamagePart::Hybrid: return {60.0, 30.0};
  case DamagePart::AeroFront: return {28.0, 35.0};
  case DamagePart::AeroRear: return {35.0, 40.0};
  case DamagePart::BodyFL:
  case DamagePart::BodyFR:
  case DamagePart::BodyRL:
  case DamagePart::BodyRR: return {6.0, 20.0};
  case DamagePart::SuspFL:
  case DamagePart::SuspFR:
  case DamagePart::SuspRL:
  case DamagePart::SuspRR: return {55.0, 40.0};
  case DamagePart::Monocoque: return {120.0, 12.0};
  default: return {10.0, 15.0};
  }
}

double RemainingSessionSec(const RaceSession &session, const Car &car) {
  if (session.targetDurationSeconds > 0.0)
    return std::max(0.0, session.targetDurationSeconds - session.elapsedRaceTime);
  if (session.targetLaps > 0) {
    const double avgLap = car.bestLapTime() > 0.0 ? car.bestLapTime()
                                                    : car.lastLapTime();
    if (avgLap > 0.0) {
      const int lapsLeft =
          std::max(0, session.targetLaps + 1 - car.state().currentLap);
      return lapsLeft * avgLap;
    }
  }
  return 86400.0 * 7.0;
}

bool IsPartBelowCritical(const PartDamageState &state, DamagePart part,
                         const PartDamageProfile &profile) {
  if (profile.irreparableBelow <= 0.0)
    return false;
  return PartHealth(state, part) <= profile.irreparableBelow;
}

double ScaledRepairSecForHealth(const PartDamageProfile &profile,
                                double health) {
  if (health >= kRaceableHealthThreshold)
    return 0.0;

  const double base = profile.baseRepairSec;
  const double critical = profile.irreparableBelow;

  if (critical <= 0.0) {
    const double scale =
        (kRaceableHealthThreshold - health) / kRaceableHealthThreshold;
    return base * (1.0 + scale * 3.0);
  }

  if (health > critical) {
    const double span = std::max(1.0, kRaceableHealthThreshold - critical);
    const double t = (kRaceableHealthThreshold - health) / span;
    return base * (1.0 + t * 7.0);
  }

  const double severity = 1.0 - health / std::max(critical, 1.0);
  return base * (60.0 + severity * 240.0);
}

double PartRepairSecToRaceable(const PartDamageState &state, DamagePart part,
                               const PartDamageProfile &profile,
                               double targetHealth) {
  double health = PartHealth(state, part);
  if (health >= targetHealth)
    return 0.0;

  double total = 0.0;
  for (int pass = 0; pass < 24 && health < targetHealth; ++pass) {
    total += ScaledRepairSecForHealth(profile, health);
    health = std::min(100.0, health + profile.restoreAmount);
  }
  return total;
}

bool IsCarPhysicallyRepairable(const PartDamageState &state,
                               const CarConfig &car) {
  if (IsMonocoqueBreached(state))
    return false;

  const bool leftDestroyed =
      CornerStructuralHealth(state, 0) <= 0.0 &&
      CornerStructuralHealth(state, 2) <= 0.0;
  const bool rightDestroyed =
      CornerStructuralHealth(state, 1) <= 0.0 &&
      CornerStructuralHealth(state, 3) <= 0.0;
  if (leftDestroyed && rightDestroyed)
    return false;

  const double engineH = PartHealth(state, DamagePart::Engine);
  const double gearboxH = PartHealth(state, DamagePart::Gearbox);
  if (engineH <= 0.0 && gearboxH <= 0.0 && car.hybridDeployPowerKW <= 0.0)
    return false;
  return true;
}

bool IsCarRaceable(const PartDamageState &state, const CarConfig &car,
                   const TyreDeflationStateArr &tyres, double batteryMJ) {
  if (!IsCarPhysicallyRepairable(state, car))
    return false;
  const LimpMode limp = EvaluateLimpMode(state, car, tyres, batteryMJ);
  return limp != LimpMode::Immobilized;
}

double ComputeGarageRebuildDurationSec(double assessedRepairSec,
                                       bool damageRebuild) {
  if (!damageRebuild)
    return std::max(60.0, assessedRepairSec);
  return std::max(kGarageRebuildMinSec,
                  assessedRepairSec + kGarageRebuildOverheadSec);
}

CarRepairAssessment
ComputeCarRepairAssessment(const PartDamageState &state, const CarConfig &car,
                           const TyreDeflationStateArr &tyres,
                           const CarDamageProfiles &profiles,
                           double remainingSessionSec, double targetHealth) {
  CarRepairAssessment out;
  out.remainingSessionSec = std::max(0.0, remainingSessionSec);
  out.physicallyRepairable = IsCarPhysicallyRepairable(state, car);

  for (int pi = 0; pi < kPartCount; ++pi) {
    const DamagePart part = static_cast<DamagePart>(pi);
    const double health = PartHealth(state, part);
    if (health >= targetHealth)
      continue;

    const PartDamageProfile &profile = profiles.profiles[pi];
    PartRepairAssessment partOut;
    partOut.token = DamagePartToken(part);
    partOut.health = health;
    partOut.repairSec = PartRepairSecToRaceable(state, part, profile, targetHealth);
    partOut.physicallyRepairable = out.physicallyRepairable;
    partOut.needsGarageRebuild =
        IsPartBelowCritical(state, part, profile) ||
        partOut.repairSec > kMaxPitLaneRepairSec;
    partOut.sessionRepairable =
        out.physicallyRepairable && partOut.repairSec <= out.remainingSessionSec;
    out.totalRepairSec += partOut.repairSec;
    out.parts.push_back(std::move(partOut));
  }

  out.needsGarageRebuild =
      out.totalRepairSec > kMaxPitLaneRepairSec ||
      std::any_of(out.parts.begin(), out.parts.end(),
                  [](const PartRepairAssessment &p) {
                    return p.needsGarageRebuild;
                  });
  out.sessionRepairable =
      out.physicallyRepairable && out.totalRepairSec <= out.remainingSessionSec;

  if (out.physicallyRepairable && !IsCarRaceable(state, car, tyres, 0.0) &&
      out.parts.empty()) {
    out.sessionRepairable = false;
  }

  (void)tyres;
  return out;
}

void RestoreDamagedPartsToRaceable(PartDamageState &state,
                                   double targetHealth) {
  for (int i = 0; i < kPartCount; ++i) {
    if (state.health[i] < targetHealth)
      state.health[i] = targetHealth;
    state.irreparable[i] = false;
  }
}

const char *LimpModeLabel(LimpMode mode) {
  switch (mode) {
  case LimpMode::ReducedPower: return "reduced_power";
  case LimpMode::HybridOnly: return "hybrid_only";
  case LimpMode::BarelyDriveable: return "barely_driveable";
  case LimpMode::Immobilized: return "immobilized";
  default: return "none";
  }
}

const char *TyreDeflationLabel(TyreDeflationState state) {
  switch (state) {
  case TyreDeflationState::Soft: return "soft";
  case TyreDeflationState::Flat: return "flat";
  default: return "normal";
  }
}

const char *HiddenFaultKindToken(HiddenFaultKind kind) {
  switch (kind) {
  case HiddenFaultKind::CoolingHoseLeak: return "cooling_hose_leak";
  case HiddenFaultKind::PowertrainSealLeak: return "powertrain_seal_leak";
  case HiddenFaultKind::HairlineCrack: return "hairline_crack";
  case HiddenFaultKind::WiringChafe: return "wiring_chafe";
  case HiddenFaultKind::TubStress: return "tub_stress";
  default: return "unknown";
  }
}

HiddenFaultKind HiddenFaultKindFromToken(const std::string &token) {
  if (token == "cooling_hose_leak") return HiddenFaultKind::CoolingHoseLeak;
  if (token == "powertrain_seal_leak") return HiddenFaultKind::PowertrainSealLeak;
  if (token == "hairline_crack") return HiddenFaultKind::HairlineCrack;
  if (token == "wiring_chafe") return HiddenFaultKind::WiringChafe;
  if (token == "tub_stress") return HiddenFaultKind::TubStress;
  return HiddenFaultKind::CoolingHoseLeak;
}
