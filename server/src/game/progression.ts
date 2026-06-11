import type { DriverProfilePayload } from "../ws_protocol";
import type { StaffMember, StaffRole } from "./staff";
import type { WeekendSessionType } from "./weekend_sessions";
import { facilityTrainingMultiplier, type FacilityState } from "./facilities";

export const XP_PER_LEVEL = 100;
export const MAX_STAFF_SKILL = 98;

export type OffWeekTrainingAction =
  | "driver_sim"
  | "pit_drills"
  | "data_review"
  | "strategy_tabletop";

export const OFF_WEEK_TRAINING_COST = 45_000;
export const OFF_WEEK_TRAINING_XP = 28;
export const MAX_OFF_WEEK_TRAINING_SLOTS = 2;

export interface StatBump {
  stat: string;
  from: number;
  to: number;
}

export interface ProgressionGain {
  id: string;
  name: string;
  xpGained: number;
  xpTotal: number;
  levelBefore: number;
  levelAfter: number;
  statBumps?: StatBump[];
}

export interface ProgressionSummary {
  drivers: ProgressionGain[];
  staff: ProgressionGain[];
}

type DriverStatKey = keyof Pick<
  DriverProfilePayload,
  | "dryPace"
  | "wetPace"
  | "consistency"
  | "setupFeedback"
  | "tireManagement"
  | "stamina"
  | "adaptability"
  | "nightPace"
  | "fuelSaving"
>;

const DRIVER_STAT_ROTATION: DriverStatKey[] = [
  "dryPace",
  "stamina",
  "tireManagement",
  "setupFeedback",
  "wetPace",
  "consistency",
  "adaptability",
  "nightPace",
  "fuelSaving",
];

const DRIVER_STAT_CAPS: Partial<Record<DriverStatKey, number>> = {
  setupFeedback: 92,
  adaptability: 94,
};

export function progressionXpValue(xp?: number): number {
  return Math.max(0, Math.round(xp ?? 0));
}

export function progressionLevel(xp: number): number {
  return Math.floor(progressionXpValue(xp) / XP_PER_LEVEL) + 1;
}

export function xpIntoCurrentLevel(xp: number): number {
  return progressionXpValue(xp) % XP_PER_LEVEL;
}

export function xpToNextLevel(xp: number): number {
  return XP_PER_LEVEL - xpIntoCurrentLevel(xp);
}

export function driverXpForPrivateTest(durationHours: number): number {
  return Math.round(Math.max(1, durationHours) * 8);
}

export function staffXpForPrivateTest(durationHours: number): number {
  return Math.round(Math.max(1, durationHours) * 5);
}

export function driverXpForWeekendSession(
  sessionType: WeekendSessionType,
  options: { classified?: boolean; lapsCompleted?: number } = {},
): number {
  const classified = options.classified !== false;
  const laps = options.lapsCompleted ?? 0;
  let base = 0;
  switch (sessionType) {
    case "practice":
      base = 10 + Math.min(12, Math.floor(laps / 3));
      break;
    case "qualifying":
      base = 18;
      break;
    case "race":
      base = 24 + Math.min(20, Math.floor(laps / 5));
      break;
    default:
      base = 8;
  }
  if (!classified) base = Math.max(4, Math.round(base * 0.35));
  return base;
}

export function staffXpForWeekendSession(
  sessionType: WeekendSessionType,
  options: { classified?: boolean } = {},
): number {
  const classified = options.classified !== false;
  let base =
    sessionType === "race" ? 16 : sessionType === "qualifying" ? 8 : 6;
  if (!classified) base = Math.max(3, Math.round(base * 0.4));
  return base;
}

function driverStatForLevel(level: number): DriverStatKey {
  return DRIVER_STAT_ROTATION[(level - 1) % DRIVER_STAT_ROTATION.length]!;
}

export function nextDriverRewardLabel(level: number): string {
  const stat = driverStatForLevel(level);
  const labels: Record<string, string> = {
    dryPace: "+1 Dry Pace",
    setupFeedback: "+1 Setup Feedback",
    stamina: "+1 Stamina",
    tireManagement: "+1 Tire Management",
    wetPace: "+1 Wet Pace",
    consistency: "+1 Consistency",
    adaptability: "+1 Adaptability",
    nightPace: "+1 Night Pace",
    fuelSaving: "+1 Fuel Saving",
  };
  return labels[stat] ?? `+1 ${stat}`;
}

function staffStatForRole(role: StaffRole, level: number): string {
  if (role === "engineer") {
    return level % 2 === 1 ? "skill" : "morale";
  }
  if (role === "mechanic") {
    return level % 2 === 1 ? "skill" : "morale";
  }
  return level % 2 === 1 ? "skill" : "morale";
}

function applyDriverLevelUps(
  driver: DriverProfilePayload,
  xpBefore: number,
  xpAfter: number,
): { driver: DriverProfilePayload; bumps: StatBump[] } {
  const levelBefore = progressionLevel(xpBefore);
  const levelAfter = progressionLevel(xpAfter);
  let next = { ...driver, progressionXp: xpAfter };
  const bumps: StatBump[] = [];

  for (let level = levelBefore + 1; level <= levelAfter; level++) {
    const stat = driverStatForLevel(level);
    const from = (next[stat] as number) ?? 70;
    const cap = DRIVER_STAT_CAPS[stat] ?? 98;
    const to = Math.min(cap, from + 1);
    if (to > from) {
      bumps.push({ stat, from, to });
      next = { ...next, [stat]: to };
    }
  }

  return { driver: next, bumps };
}

function applyStaffLevelUps(
  member: StaffMember,
  xpBefore: number,
  xpAfter: number,
): { member: StaffMember; bumps: StatBump[] } {
  const levelBefore = progressionLevel(xpBefore);
  const levelAfter = progressionLevel(xpAfter);
  let next: StaffMember = { ...member, progressionXp: xpAfter };
  const bumps: StatBump[] = [];

  for (let level = levelBefore + 1; level <= levelAfter; level++) {
    const stat = staffStatForRole(member.role, level);
    if (stat === "morale") {
      const from = next.morale ?? 75;
      const to = Math.min(98, from + 1);
      if (to > from) {
        bumps.push({ stat, from, to });
        next = { ...next, morale: to };
      }
    } else {
      const from = next.skill;
      const to = Math.min(MAX_STAFF_SKILL, from + 1);
      if (to > from) {
        bumps.push({ stat: "skill", from, to });
        next = { ...next, skill: to };
      }
    }
  }

  return { member: next, bumps };
}

function applyXpBatch(
  drivers: DriverProfilePayload[],
  staff: StaffMember[],
  driverIds: Set<string>,
  staffIds: Set<string>,
  driverXp: number,
  staffXp: number,
): {
  drivers: DriverProfilePayload[];
  staff: StaffMember[];
  summary: ProgressionSummary;
} {
  const summary: ProgressionSummary = { drivers: [], staff: [] };

  const nextDrivers = drivers.map((driver) => {
    const id = driver.id?.trim();
    if (!id || !driverIds.has(id)) return driver;
    const xpBefore = progressionXpValue(driver.progressionXp);
    const xpAfter = xpBefore + driverXp;
    const { driver: updated, bumps } = applyDriverLevelUps(driver, xpBefore, xpAfter);
    summary.drivers.push({
      id,
      name: driver.name,
      xpGained: driverXp,
      xpTotal: xpAfter,
      levelBefore: progressionLevel(xpBefore),
      levelAfter: progressionLevel(xpAfter),
      statBumps: bumps.length ? bumps : undefined,
    });
    return updated;
  });

  const nextStaff = staff.map((member) => {
    if (!staffIds.has(member.id)) return member;
    const xpBefore = progressionXpValue(member.progressionXp);
    const xpAfter = xpBefore + staffXp;
    const { member: updated, bumps } = applyStaffLevelUps(member, xpBefore, xpAfter);
    summary.staff.push({
      id: member.id,
      name: member.name,
      xpGained: staffXp,
      xpTotal: xpAfter,
      levelBefore: progressionLevel(xpBefore),
      levelAfter: progressionLevel(xpAfter),
      statBumps: bumps.length ? bumps : undefined,
    });
    return updated;
  });

  return { drivers: nextDrivers, staff: nextStaff, summary };
}

export function applyPrivateTestProgression(
  drivers: DriverProfilePayload[],
  staff: StaffMember[],
  participantDriverIds: string[],
  participantStaffIds: string[],
  durationHours: number,
  options: { xpMultiplier?: number } = {},
): {
  drivers: DriverProfilePayload[];
  staff: StaffMember[];
  summary: ProgressionSummary;
} {
  const mult = Math.max(1, options.xpMultiplier ?? 1);
  const driverXp = Math.round(driverXpForPrivateTest(durationHours) * mult);
  const staffXp = Math.round(staffXpForPrivateTest(durationHours) * mult);
  return applyXpBatch(
    drivers,
    staff,
    new Set(participantDriverIds),
    new Set(participantStaffIds),
    driverXp,
    staffXp,
  );
}

export function applyWeekendProgression(
  drivers: DriverProfilePayload[],
  staff: StaffMember[],
  participantDriverIds: string[],
  participantStaffIds: string[],
  sessionType: WeekendSessionType,
  options: {
    classified?: boolean;
    lapsCompleted?: number;
    privateTestMultiplier?: number;
  } = {},
): {
  drivers: DriverProfilePayload[];
  staff: StaffMember[];
  summary: ProgressionSummary;
} {
  const mult = options.privateTestMultiplier ?? 1;
  const driverXp = Math.round(
    driverXpForWeekendSession(sessionType, options) * mult,
  );
  const staffXp = Math.round(
    staffXpForWeekendSession(sessionType, options) * mult,
  );
  return applyXpBatch(
    drivers,
    staff,
    new Set(participantDriverIds),
    new Set(participantStaffIds),
    driverXp,
    staffXp,
  );
}

export function collectWeekendParticipants(
  fleetCarIds: string[],
  driverRoster: DriverProfilePayload[],
  staff: StaffMember[],
  assignments: Record<string, string[]>,
): { driverIds: string[]; staffIds: string[] } {
  const driverIds = new Set<string>();
  const carIdSet = new Set(fleetCarIds);
  for (const carId of fleetCarIds) {
    for (const id of assignments[carId] ?? []) {
      if (driverRoster.some((d) => d.id === id)) driverIds.add(id);
    }
  }
  const staffIds = staff
    .filter((s) => s.assignedCarId && carIdSet.has(s.assignedCarId))
    .map((s) => s.id);
  return { driverIds: [...driverIds], staffIds };
}

export function applyOffWeekTraining(
  drivers: DriverProfilePayload[],
  staff: StaffMember[],
  action: OffWeekTrainingAction,
  targets: { driverId?: string; staffId?: string },
  facilities: FacilityState[] = [],
): {
  drivers: DriverProfilePayload[];
  staff: StaffMember[];
  summary: ProgressionSummary;
  error?: string;
} {
  const mult = facilityTrainingMultiplier(facilities);
  const xp = Math.round(OFF_WEEK_TRAINING_XP * mult);

  if (action === "driver_sim") {
    const id = targets.driverId?.trim();
    if (!id) return { drivers, staff, summary: { drivers: [], staff: [] }, error: "driverId required" };
    const result = applyXpBatch(drivers, staff, new Set([id]), new Set(), xp, 0);
    return { ...result, summary: result.summary };
  }

  if (action === "pit_drills" || action === "data_review" || action === "strategy_tabletop") {
    const id = targets.staffId?.trim();
    if (!id) return { drivers, staff, summary: { drivers: [], staff: [] }, error: "staffId required" };
    const member = staff.find((s) => s.id === id);
    if (!member) {
      return { drivers, staff, summary: { drivers: [], staff: [] }, error: "Staff not found" };
    }
    const roleOk =
      (action === "pit_drills" && member.role === "mechanic") ||
      (action === "data_review" && member.role === "engineer") ||
      (action === "strategy_tabletop" && member.role === "strategist");
    if (!roleOk) {
      return {
        drivers,
        staff,
        summary: { drivers: [], staff: [] },
        error: `Wrong role for ${action}`,
      };
    }
    const result = applyXpBatch(drivers, staff, new Set(), new Set([id]), 0, xp);
    return { ...result, summary: result.summary };
  }

  return { drivers, staff, summary: { drivers: [], staff: [] }, error: "Unknown action" };
}
