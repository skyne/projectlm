import type { StaffMemberPayload } from "../ws_protocol";

/** Strategist skill 0–100 → gap before yielding to a teammate (seconds). */
export function teammateYieldThresholdSec(skill: number): number {
  const s = Math.max(0, Math.min(100, skill));
  const low = 0.8;
  const high = 0.15;
  return low + (high - low) * (s / 100);
}

export function strategistSkillFromStaff(
  staff: StaffMemberPayload[] | undefined,
  carId?: string,
): number {
  const list = staff ?? [];
  const strategists = list.filter(
    (m) => m.role === "strategist" && m.status === "active",
  );
  if (!strategists.length) return 50;

  if (carId) {
    const assigned = strategists.find((m) => m.assignedCarId === carId);
    if (assigned) return assigned.skill;
  }

  const sum = strategists.reduce((a, m) => a + m.skill, 0);
  return Math.round(sum / strategists.length);
}

/** Higher skill → tighter support timing (seconds delay before support car releases). */
export function teammateSupportReleaseDelaySec(skill: number): number {
  const s = Math.max(0, Math.min(100, skill));
  return Math.round(8 - (s / 100) * 5);
}
