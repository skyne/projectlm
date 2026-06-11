import type { DriverRosterRulesPayload } from "../ws/protocol";

const DEFAULT_RULES: DriverRosterRulesPayload = {
  maxDriversPerCar: 4,
  reserveSlotsPerCar: 1,
  minRosterCap: 6,
};

export function driverRosterRules(
  catalog?: { driverRosterRules?: DriverRosterRulesPayload },
): DriverRosterRulesPayload {
  return { ...DEFAULT_RULES, ...catalog?.driverRosterRules };
}

export function maxDriverRosterForFleet(
  fleetCarCount: number,
  catalog?: { driverRosterRules?: DriverRosterRulesPayload },
): number {
  const rules = driverRosterRules(catalog);
  const cars = Math.max(1, Math.floor(fleetCarCount));
  return Math.max(
    rules.minRosterCap,
    cars * (rules.maxDriversPerCar + rules.reserveSlotsPerCar),
  );
}

export function maxDriversPerCar(
  catalog?: { driverRosterRules?: DriverRosterRulesPayload },
): number {
  return driverRosterRules(catalog).maxDriversPerCar;
}
