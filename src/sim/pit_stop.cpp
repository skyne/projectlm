#include "pit_stop.hpp"
#include "driver.hpp"
#include "simulation.hpp"
#include "part_damage.hpp"
#include "track.hpp"
#include <algorithm>
#include <cmath>

namespace {
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
    car.calculatedTotalMass += added * 0.75;
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
  return false;
}

bool ShouldEnterPitLane(const PitStopState &pit, double normalizedT,
                        bool lapJustCompleted, int currentLap,
                        double fuelRemaining, double fuelTankCapacity,
                        bool redFlagActive) {
  if (!pit.pendingEnter || pit.inPit)
    return false;
  if (lapJustCompleted)
    return true;
  if (redFlagActive)
    return true;
  // Emergency fuel — do not force another full lap to reach the pit window.
  if (fuelTankCapacity > 0.0 && fuelRemaining >= 0.0 &&
      fuelRemaining <= fuelTankCapacity * 0.18)
    return true;
  // On the opening lap cars sit on the start/finish line — wait until lap 2+
  // before allowing mid-lap pit entry via track position.
  if (currentLap <= 1)
    return false;
  return normalizedT >= 0.985 || normalizedT <= 0.015;
}
