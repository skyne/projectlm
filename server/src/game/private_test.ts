import type { MetaStatePayload, StartPrivateTestPayload } from "../ws_protocol";
import { validateFleetRegulations } from "./fleet";
import {
  sanitizeAssignedDriverIds,
  validateExclusiveDriverAssignments,
} from "./driver_catalog";
import { isSeasonCalendarComplete } from "./season_end";
import { appliesWeekendSchedule } from "./weekend_sessions";
import { TRACK_CATALOG, WEC_2026_CALENDAR } from "./track_catalog";

export const PRIVATE_TEST_MIN_HOURS = 1;
export const PRIVATE_TEST_MAX_HOURS = 72;
export const PRIVATE_TEST_DEFAULT_HOURS = 4;

export function clampPrivateTestDurationHours(hours: number): number {
  if (!Number.isFinite(hours)) return PRIVATE_TEST_DEFAULT_HOURS;
  return Math.min(
    PRIVATE_TEST_MAX_HOURS,
    Math.max(PRIVATE_TEST_MIN_HOURS, Math.round(hours)),
  );
}

export function isRaceWeekendInProgress(meta: MetaStatePayload): boolean {
  const current = meta.calendar.find((e) => e.round === meta.currentRound);
  if (!current || current.completed) return false;
  if (!appliesWeekendSchedule(current.eventType, current.format)) return false;
  return meta.weekendProgress?.round === meta.currentRound;
}

export function canStartPrivateTest(meta: MetaStatePayload): boolean {
  return privateTestBlockedReason(meta) === null;
}

export function privateTestBlockedReason(meta: MetaStatePayload): string | null {
  if (!meta.setupComplete) return "Complete team setup first";
  if (meta.seasonComplete || isSeasonCalendarComplete(meta.calendar)) {
    return "Season complete — review results and start the next season";
  }
  if (isRaceWeekendInProgress(meta)) {
    return "Finish the race weekend before scheduling a private test";
  }
  if (!meta.fleet?.length) return "Your team needs at least one car";
  return null;
}

function validateDriverAssignments(
  meta: MetaStatePayload,
  carIds: string[],
  driverAssignments: StartPrivateTestPayload["driverAssignments"],
): string | null {
  const roster = meta.driverRoster ?? [];
  const fleetSubset = carIds.map((id) => {
    const car = meta.fleet?.find((c) => c.id === id);
    if (!car) return null;
    const assigned = driverAssignments[id];
    if (!assigned?.length) {
      return { ...car, assignedDriverIds: [] as string[] };
    }
    return { ...car, assignedDriverIds: sanitizeAssignedDriverIds(assigned, roster) };
  });

  if (fleetSubset.some((c) => c === null)) {
    return "One or more selected cars were not found in your fleet";
  }

  return validateExclusiveDriverAssignments(
    fleetSubset.filter((c): c is NonNullable<typeof c> => c !== null),
    roster,
  );
}

export function validatePrivateTestPayload(
  meta: MetaStatePayload,
  raw: StartPrivateTestPayload,
): { payload: StartPrivateTestPayload } | { error: string } {
  const blocked = privateTestBlockedReason(meta);
  if (blocked) return { error: blocked };

  const trackId = String(raw.trackId ?? "").trim();
  if (!trackId || !TRACK_CATALOG[trackId]) {
    return { error: "Select a valid track" };
  }

  const carIds = [...new Set((raw.carIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
  if (!carIds.length) return { error: "Select at least one car" };

  const fleetIds = new Set((meta.fleet ?? []).map((c) => c.id));
  for (const carId of carIds) {
    if (!fleetIds.has(carId)) return { error: `Unknown car: ${carId}` };
  }

  const fleetSubset = (meta.fleet ?? []).filter((c) => carIds.includes(c.id));
  const fleetErr = validateFleetRegulations(fleetSubset);
  if (fleetErr) return { error: fleetErr };

  const driverAssignments = raw.driverAssignments ?? {};
  for (const carId of carIds) {
    if (!driverAssignments[carId]?.length) {
      const car = meta.fleet?.find((c) => c.id === carId);
      return { error: `Assign at least one driver to car #${car?.carNumber ?? carId}` };
    }
  }

  const assignmentKeys = Object.keys(driverAssignments).filter(
    (k) => driverAssignments[k]?.length,
  );
  for (const key of assignmentKeys) {
    if (!carIds.includes(key)) {
      return { error: "Driver assignments must match selected cars only" };
    }
  }

  const assignErr = validateDriverAssignments(meta, carIds, driverAssignments);
  if (assignErr) return { error: assignErr };

  const durationHours = clampPrivateTestDurationHours(raw.durationHours);

  return {
    payload: {
      trackId,
      carIds,
      driverAssignments,
      durationHours,
      carSetups: raw.carSetups,
    },
  };
}

export function trackMonthForPrivateTest(trackId: string): number {
  const event = WEC_2026_CALENDAR.find((e) => e.trackId === trackId);
  return event?.month ?? 6;
}

export function privateTestWeatherSeed(seasonYear: number, trackId: string): number {
  let hash = 0;
  for (let i = 0; i < trackId.length; i++) {
    hash = (hash * 31 + trackId.charCodeAt(i)) | 0;
  }
  return seasonYear * 1000 + Math.abs(hash % 1000);
}

export function collectPrivateTestParticipants(
  meta: MetaStatePayload,
  carIds: string[],
  driverAssignments: StartPrivateTestPayload["driverAssignments"],
): { driverIds: string[]; staffIds: string[] } {
  const driverIds = new Set<string>();
  for (const carId of carIds) {
    for (const id of sanitizeAssignedDriverIds(
      driverAssignments[carId] ?? [],
      meta.driverRoster ?? [],
    )) {
      driverIds.add(id);
    }
  }

  const carIdSet = new Set(carIds);
  const staffIds = (meta.staff ?? [])
    .filter((s) => s.assignedCarId && carIdSet.has(s.assignedCarId))
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));

  return { driverIds: [...driverIds], staffIds };
}
