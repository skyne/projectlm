/** Experimental (EXP) fleet entry constants and helpers. */

import type { FleetCarPayload, FleetEntryMode } from "../ws_protocol";

export const EXP_MAX_COPIES_MANUFACTURER = 3;
export const EXP_MAX_COPIES_PRIVATEER = 2;
/** One prototype mule on top of the mandatory homologated Hypercar pair. */
export const EXP_HYPERCAR_MFG_MAX_COPIES = 1;
/** Standalone EXP Hypercar programme (no homologated HC team) — matched pair of mules. */
export const EXP_HYPERCAR_STANDALONE_COPIES = 2;
export const EXP_PRIVATEER_PROGRAMME_FEE = 20_000_000;
export const EXP_MANUFACTURER_UNIT_MULTIPLIER = 1.3;
export const EXP_COPY_UNIT_MULTIPLIER = 0.95;
export const EXP_PRIVATEER_UNIT_MULTIPLIER = 1.15;
export const EXP_OPS_FEE = 55_000;
export const EXP_FAN_EXPOSURE_BASE = 50_000;
export const EXP_RD_MULTIPLIER = 1.5;
export const EXP_SPONSOR_BONUS_FACTOR = 0.5;

export function fleetEntryMode(car: FleetCarPayload): FleetEntryMode {
  return car.entryMode ?? "homologated";
}

export function isExperimentalCar(car: FleetCarPayload): boolean {
  return fleetEntryMode(car) === "experimental";
}

export function experimentalRulesPayload() {
  return {
    maxCopiesManufacturer: EXP_MAX_COPIES_MANUFACTURER,
    maxCopiesPrivateer: EXP_MAX_COPIES_PRIVATEER,
    hypercarManufacturerExpMax: EXP_HYPERCAR_MFG_MAX_COPIES,
    hypercarStandaloneExpCopies: EXP_HYPERCAR_STANDALONE_COPIES,
    privateerProgrammeFee: EXP_PRIVATEER_PROGRAMME_FEE,
    manufacturerUnitMultiplier: EXP_MANUFACTURER_UNIT_MULTIPLIER,
    copyUnitMultiplier: EXP_COPY_UNIT_MULTIPLIER,
    privateerUnitMultiplier: EXP_PRIVATEER_UNIT_MULTIPLIER,
    opsFee: EXP_OPS_FEE,
    fanExposureBase: EXP_FAN_EXPOSURE_BASE,
    rdMultiplier: EXP_RD_MULTIPLIER,
  };
}

export function maxExperimentalCopies(
  affiliation: FleetCarPayload["affiliation"],
  classId: string,
  options?: { hypercarMfgException?: boolean },
): number {
  if (classId === "Hypercar") {
    if (options?.hypercarMfgException) {
      return EXP_HYPERCAR_MFG_MAX_COPIES;
    }
    return EXP_HYPERCAR_STANDALONE_COPIES;
  }
  return affiliation === "manufacturer"
    ? EXP_MAX_COPIES_MANUFACTURER
    : EXP_MAX_COPIES_PRIVATEER;
}

export function minExperimentalCopies(
  affiliation: FleetCarPayload["affiliation"],
  classId: string,
  options?: { hypercarMfgException?: boolean },
): number {
  if (classId === "Hypercar") {
    if (options?.hypercarMfgException) {
      return 1;
    }
    return EXP_HYPERCAR_STANDALONE_COPIES;
  }
  return 1;
}

/** Fan/media payout for finishing an experimental entry (overall race position). */
export function computePrototypeExposureFee(racePosition: number): number {
  if (racePosition < 1) return 0;
  const bonus = Math.max(0, 20 - racePosition) * 2_500;
  return EXP_FAN_EXPOSURE_BASE + bonus;
}

export function newExperimentalProgramId(classId: string): string {
  return `exp-${classId}-${Date.now()}`;
}
