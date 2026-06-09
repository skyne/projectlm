#include "pit_stop.hpp"
#include "driver.hpp"
#include "simulation.hpp"
#include "part_damage.hpp"
#include "track.hpp"
#include <algorithm>
#include <cmath>

namespace {
constexpr double kEmergencyFuelFraction = 0.18;
constexpr double kEmergencyFuelTargetFraction = 0.25;
constexpr double kEmergencyRepairHealthThreshold = 90.0;

bool WheelNeedsEmergencyChange(const SimulationState &state, int wheelIdx) {
  if (wheelIdx < 0 || wheelIdx > 3)
    return false;
  const TyreDeflationState defl = state.tyreDeflation.state[wheelIdx];
  return defl == TyreDeflationState::Soft || defl == TyreDeflationState::Flat;
}

bool RepairTokenAllowed(const std::string &token, const PartDamageState &damage,
                        bool meatball) {
  if (meatball)
    return true;
  if (token == "body" || token == "bodywork") {
    for (DamagePart p = DamagePart::BodyFL; p <= DamagePart::BodyRR;
         p = static_cast<DamagePart>(DamagePartIndex(p) + 1)) {
      if (PartHealth(damage, p) < kEmergencyRepairHealthThreshold)
        return true;
    }
    return false;
  }
  const DamagePart part = DamagePartFromToken(token);
  if (part == DamagePart::Count)
    return false;
  return PartHealth(damage, part) < kEmergencyRepairHealthThreshold;
}

constexpr double kFuelRateSecPerLiter = 0.038;
constexpr double kTireChangeSec = 2.8;
constexpr double kRepairBodySec = 8.0;
constexpr double kDriverChangeSec = 15.0;
constexpr double kSetupChangeSec = 6.0;

double RepairTokenDurationSec(const std::string &repair,
                              const PartDamageState *damage,
                              const CarDamageProfiles *profiles,
                              double mechanicFactor, double pitWorkScale) {
  if (repair == "body" || repair == "bodywork") {
    double total = 0.0;
    for (DamagePart p = DamagePart::BodyFL; p <= DamagePart::BodyRR;
         p = static_cast<DamagePart>(DamagePartIndex(p) + 1)) {
      if (damage != nullptr && profiles != nullptr) {
        total += ScaledRepairSecForHealth(
            profiles->profiles[DamagePartIndex(p)],
            PartHealth(*damage, p));
      } else {
        total += kRepairBodySec;
      }
    }
    return total * mechanicFactor * pitWorkScale;
  }

  const DamagePart part = DamagePartFromToken(repair);
  if (part == DamagePart::Count)
    return 0.0;
  double sec = RepairSpecForPart(part).baseRepairSec;
  if (damage != nullptr && profiles != nullptr) {
    sec = ScaledRepairSecForHealth(profiles->profiles[DamagePartIndex(part)],
                                   PartHealth(*damage, part));
  }
  return sec * mechanicFactor * pitWorkScale;
}
} // namespace

double ComputePitServiceDuration(const PitStopPlan &plan, const CarConfig &car,
                                 const StaffModifiers &staff,
                                 const SimulationState *simState) {
  const double mechanicFactor =
      1.0 - (staff.mechanicSkill / 100.0 - 0.5) * 0.25;
  const double pitWorkScale =
      1.0 / std::max(0.5, car.serviceabilityFactor);
  const double driverSwapScale =
      1.0 / std::max(0.5, car.driverChangeFactor);

  double total = 0.0;

  if (plan.fuelLiters > 0.0)
    total += plan.fuelLiters * kFuelRateSecPerLiter * mechanicFactor *
             pitWorkScale;

  total += static_cast<double>(plan.tiresToChange.size()) * kTireChangeSec *
           mechanicFactor * pitWorkScale;

  static const PartCatalog kCatalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, kCatalog, profiles);
  const PartDamageState *damage =
      simState != nullptr ? &simState->partDamage : nullptr;
  const CarDamageProfiles *profilePtr = damage != nullptr ? &profiles : nullptr;

  for (const std::string &repair : plan.repairs) {
    total += RepairTokenDurationSec(repair, damage, profilePtr, mechanicFactor,
                                    pitWorkScale);
  }

  if (plan.changeDriver)
    total += kDriverChangeSec * mechanicFactor * driverSwapScale;

  const bool hasSetup = std::abs(plan.wingAngleDelta) > 1e-6 ||
                        std::abs(plan.brakeBiasDelta) > 1e-6 ||
                        std::abs(plan.rideHeightDelta) > 1e-6 ||
                        plan.suspension.hasAnyChange();
  if (hasSetup)
    total += kSetupChangeSec * (1.0 - (staff.engineerSkill / 100.0 - 0.5) * 0.2);

  return std::max(5.0, total);
}

double EstimatePitRemainingSec(const PitStopState &pit,
                               const TrackDefinition &track) {
  if (!pit.inPit || !track.pitLane.valid())
    return 0.0;

  const double speedLimit = track.pitLane.speedLimitMs;
  if (speedLimit <= 0.0)
    return 0.0;

  const double laneLen = track.pitLane.totalLength();
  const double boxDistance = track.pitLane.boxDistance;
  double remaining = 0.0;

  switch (pit.phase) {
  case PitPhase::DrivingIn:
    remaining += std::max(0.0, boxDistance - pit.pitLaneDistance) / speedLimit;
    remaining += std::max(0.0, pit.pitDuration - pit.pitElapsed);
    if (pit.pitDuration <= 0.0)
      remaining += 5.0;
    remaining += std::max(0.0, laneLen - boxDistance) / speedLimit;
    break;
  case PitPhase::AtBox:
    remaining += std::max(0.0, pit.pitDuration - pit.pitElapsed);
    remaining += std::max(0.0, laneLen - boxDistance) / speedLimit;
    break;
  case PitPhase::DrivingOut:
    remaining += std::max(0.0, laneLen - pit.pitLaneDistance) / speedLimit;
    break;
  default:
    break;
  }
  return remaining;
}

void ApplyPitServices(PitStopPlan &plan, CarConfig &car,
                      SimulationState &state, DriverState &driver) {
  if (plan.fuelLiters > 0.0) {
    const double added = std::min(plan.fuelLiters,
                                  car.fuelTankCapacity - state.fuelRemaining);
    state.fuelRemaining = std::min(car.fuelTankCapacity,
                                   state.fuelRemaining + added);
    if (IsBatteryPrimaryEv(car)) {
      state.batteryChargeMJ = state.fuelRemaining;
      state.hybridDeployRemainingMJ = state.fuelRemaining;
    }
    car.calculatedTotalMass += added * (IsBatteryPrimaryEv(car) ? 0.45 : 0.75);
  }

  if (!plan.tiresToChange.empty()) {
    for (const std::string &wheelLabel : plan.tiresToChange) {
      const int wheelIdx = WheelIndexFromLabel(wheelLabel);
      if (wheelIdx >= 0) {
        state.tireWear[wheelIdx] = 0.0;
        state.tireTempC[wheelIdx] = 85.0;
        ClearTyreDeflation(state, wheelIdx);
      }
    }
    static const PartCatalog kCatalog{};
    car.tyreTread = plan.tyreTread;
    ApplyTireCompoundStats(car, plan.tireCompound, kCatalog);
  }

  static const PartCatalog kCatalog{};
  CarDamageProfiles profiles;
  BuildCarDamageProfiles(car, kCatalog, profiles);
  for (const std::string &repair : plan.repairs) {
    RepairPartToken(state.partDamage, repair, profiles);
  }
  SyncDerivedEngineHealth(state, car);

  if (plan.changeDriver) {
    if (plan.swapToDriverIndex >= 0)
      driver.swapDriver(plan.swapToDriverIndex);
    else
      driver.swapDriver((driver.activeIndex + 1) %
                        static_cast<int>(driver.roster.size()));
  }

  if (std::abs(plan.wingAngleDelta) > 1e-6) {
    car.totalDownforceCl =
        std::max(0.1, car.totalDownforceCl + plan.wingAngleDelta * 0.08);
    car.totalDragCd =
        std::max(0.05, car.totalDragCd + plan.wingAngleDelta * 0.02);
  }

  SuspensionSetupDelta suspensionDelta = plan.suspension;
  if (std::abs(plan.rideHeightDelta) > 1e-6 && !suspensionDelta.hasAnyChange()) {
    suspensionDelta.frontRideHeightDelta = plan.rideHeightDelta;
    suspensionDelta.rearRideHeightDelta = plan.rideHeightDelta;
  }
  ApplySuspensionSetupDelta(car, suspensionDelta);

  (void)plan.brakeBiasDelta;

  if (car.isGeneratorOnly && car.hybridStintDeployBudgetMJ > 0.0 &&
      !plan.driveThrough) {
    state.batteryChargeMJ = car.hybridStintDeployBudgetMJ;
    state.hybridDeployRemainingMJ = car.hybridStintDeployBudgetMJ;
  }
}

bool PitPlanHasActiveService(const PitStopPlan &plan) {
  if (plan.driveThrough || plan.stopGo)
    return true;
  if (plan.fuelLiters > 0.0)
    return true;
  if (!plan.tiresToChange.empty())
    return true;
  if (!plan.repairs.empty())
    return true;
  if (plan.changeDriver)
    return true;
  if (plan.garageRebuild)
    return true;
  return false;
}

bool CarNeedsEmergencyPit(const CarConfig &car, const SimulationState &state,
                          const CarRaceControlState &rc) {
  const LimpMode limp = EvaluateLimpMode(state.partDamage, car,
                                         state.tyreDeflation, state.batteryChargeMJ);
  if (limp == LimpMode::BarelyDriveable || limp == LimpMode::HybridOnly ||
      limp == LimpMode::Immobilized)
    return true;
  if (rc.meatballActive)
    return true;
  for (int i = 0; i < 4; ++i) {
    if (WheelNeedsEmergencyChange(state, i))
      return true;
  }
  const double tank = car.fuelTankCapacity;
  if (tank > 0.0 && state.fuelRemaining >= 0.0 &&
      state.fuelRemaining / tank <= kEmergencyFuelFraction)
    return true;
  const double hybridBudget = car.hybridStintDeployBudgetMJ;
  if (hybridBudget > 0.0 && state.hybridDeployRemainingMJ >= 0.0 &&
      state.hybridDeployRemainingMJ / hybridBudget <= kEmergencyFuelFraction)
    return true;
  return false;
}

void SanitizeRedFlagEmergencyPlan(PitStopPlan &plan, const CarConfig &car,
                                const SimulationState &state,
                                const CarRaceControlState &rc) {
  plan.changeDriver = false;
  plan.garageRebuild = false;
  plan.driveThrough = false;
  plan.stopGo = false;
  plan.wingAngleDelta = 0.0;
  plan.brakeBiasDelta = 0.0;
  plan.rideHeightDelta = 0.0;
  plan.suspension = SuspensionSetupDelta{};

  const double tank = car.fuelTankCapacity;
  if (plan.fuelLiters > 0.0) {
    if (tank <= 0.0 || state.fuelRemaining / tank > kEmergencyFuelFraction) {
      plan.fuelLiters = 0.0;
    } else {
      const double target = tank * kEmergencyFuelTargetFraction;
      const double maxAdd = std::max(0.0, target - state.fuelRemaining);
      plan.fuelLiters = std::min(plan.fuelLiters, maxAdd);
      if (plan.fuelLiters < 0.01)
        plan.fuelLiters = 0.0;
    }
  }

  std::vector<std::string> allowedTires;
  allowedTires.reserve(plan.tiresToChange.size());
  for (const std::string &wheelLabel : plan.tiresToChange) {
    const int wheelIdx = WheelIndexFromLabel(wheelLabel);
    if (WheelNeedsEmergencyChange(state, wheelIdx))
      allowedTires.push_back(wheelLabel);
  }
  plan.tiresToChange = std::move(allowedTires);

  std::vector<std::string> allowedRepairs;
  allowedRepairs.reserve(plan.repairs.size());
  for (const std::string &repair : plan.repairs) {
    if (RepairTokenAllowed(repair, state.partDamage, rc.meatballActive))
      allowedRepairs.push_back(repair);
  }
  plan.repairs = std::move(allowedRepairs);
}

bool ShouldEnterPitLane(const PitStopState &pit, double normalizedT,
                        bool lapJustCompleted, int currentLap,
                        bool redFlagActive) {
  if (!pit.pendingEnter || pit.inPit)
    return false;
  if (lapJustCompleted)
    return true;
  (void)redFlagActive;
  // Pit entry only at the start/finish straight — no mid-lap teleport. Cars that
  // cannot reach the pits must stop on track and use marshal recovery instead.
  if (currentLap <= 1)
    return false;
  return normalizedT >= 0.985 || normalizedT <= 0.015;
}
