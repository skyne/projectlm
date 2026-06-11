import type { DriverProfilePayload, StaffMemberPayload } from "../ws_protocol";

export type DriverGender = "female" | "male";

export interface SponsorAppealBreakdownLine {
  label: string;
  /** Fractional bonus, e.g. 0.08 = +8% */
  bonus: number;
}

export interface SponsorAppealResult {
  /** Multiplier applied to sponsor per-race income and bonuses (1.0 = no change). */
  multiplier: number;
  lines: SponsorAppealBreakdownLine[];
}

/** Per assigned female driver on a car — fan / lifestyle sponsors respond individually. */
export const FEMALE_DRIVER_INDIVIDUAL_BONUS = 0.03;

/** All assigned drivers on the car are female (min 2) — programme-wide appeal spike. */
export const ALL_FEMALE_LINEUP_BONUS = 0.08;

/** Engineer + strategist + mechanic on the car are all female — authentic programme story. */
export const ALL_FEMALE_STAFF_BONUS = 0.05;

export const MAX_SPONSOR_APPEAL_MULTIPLIER = 1.2;

export function driverGender(d: DriverProfilePayload): DriverGender | null {
  if (d.gender === "female" || d.gender === "male") return d.gender;
  return null;
}

export function staffGender(m: StaffMemberPayload): DriverGender | null {
  if (m.gender === "female" || m.gender === "male") return m.gender;
  return null;
}

/**
 * Sponsor enthusiasm multiplier for a single car entry.
 * See docs/DRIVER_GENDER_SPONSOR_MECHANICS.md for design intent.
 */
export function computeCarSponsorAppeal(
  assignedDriverIds: string[],
  roster: DriverProfilePayload[],
  staffOnCar: StaffMemberPayload[],
): SponsorAppealResult {
  const lines: SponsorAppealBreakdownLine[] = [];
  let bonusSum = 0;

  const drivers = assignedDriverIds
    .map((id) => roster.find((d) => d.id === id))
    .filter((d): d is DriverProfilePayload => Boolean(d));

  const femaleDrivers = drivers.filter((d) => driverGender(d) === "female");
  if (femaleDrivers.length > 0) {
    const b = femaleDrivers.length * FEMALE_DRIVER_INDIVIDUAL_BONUS;
    bonusSum += b;
    lines.push({
      label: `${femaleDrivers.length} female driver${femaleDrivers.length === 1 ? "" : "s"} on entry`,
      bonus: b,
    });
  }

  const allDriversFemale =
    drivers.length >= 2 && drivers.every((d) => driverGender(d) === "female");
  if (allDriversFemale) {
    bonusSum += ALL_FEMALE_LINEUP_BONUS;
    lines.push({
      label: "All-female driver lineup",
      bonus: ALL_FEMALE_LINEUP_BONUS,
    });
  }

  const keyStaff = staffOnCar.filter((s) =>
    ["engineer", "strategist", "mechanic"].includes(s.role),
  );
  const allKeyStaffFemale =
    keyStaff.length >= 2 &&
    keyStaff.every((s) => staffGender(s) === "female");
  if (allKeyStaffFemale) {
    bonusSum += ALL_FEMALE_STAFF_BONUS;
    lines.push({
      label: "All-female car crew (eng / strategy / mechanics)",
      bonus: ALL_FEMALE_STAFF_BONUS,
    });
  }

  const multiplier = Math.min(
    MAX_SPONSOR_APPEAL_MULTIPLIER,
    1 + bonusSum,
  );

  return { multiplier, lines };
}

export function applySponsorAppeal(amount: number, multiplier: number): number {
  if (amount <= 0 || multiplier <= 1) return amount;
  return Math.round(amount * multiplier);
}
