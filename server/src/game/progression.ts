import type { DriverProfilePayload } from "../ws_protocol";
import type { StaffMember } from "./staff";

export const XP_PER_LEVEL = 100;
export const MAX_STAFF_SKILL = 98;

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

function driverStatForLevel(level: number): "setupFeedback" | "dryPace" {
  return level % 2 === 1 ? "setupFeedback" : "dryPace";
}

export function nextDriverRewardLabel(level: number): string {
  const stat = driverStatForLevel(level);
  return stat === "setupFeedback" ? "+1 Setup Feedback" : "+1 Dry Pace";
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
    const from = next[stat];
    const cap = stat === "setupFeedback" ? 92 : 98;
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
    const from = next.skill;
    const to = Math.min(MAX_STAFF_SKILL, from + 1);
    if (to > from) {
      bumps.push({ stat: "skill", from, to });
      next = { ...next, skill: to };
    }
  }

  return { member: next, bumps };
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
  const driverIdSet = new Set(participantDriverIds);
  const staffIdSet = new Set(participantStaffIds);

  const summary: ProgressionSummary = { drivers: [], staff: [] };

  const nextDrivers = drivers.map((driver) => {
    const id = driver.id?.trim();
    if (!id || !driverIdSet.has(id)) return driver;
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
    if (!staffIdSet.has(member.id)) return member;
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
