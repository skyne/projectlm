export type StaffRole = "engineer" | "mechanic" | "strategist";
export type StaffStatus = "active" | "injured" | "ill" | "poached";

export interface StaffMember {
  id: string;
  role: StaffRole;
  name: string;
  skill: number;
  experience: number;
  salaryPerRace: number;
  morale: number;
  assignedCarId: string;
  status: StaffStatus;
  unavailableUntilRound?: number;
  traits?: string[];
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  engineer: "Engineer",
  mechanic: "Mechanic",
  strategist: "Strategist",
};

const STAFF_ROLES: StaffRole[] = ["engineer", "mechanic", "strategist"];

const JUNIOR_NAMES: Record<StaffRole, string> = {
  engineer: "Junior Engineer",
  mechanic: "Junior Mechanic",
  strategist: "Junior Strategist",
};

const JUNIOR_SKILLS: Record<StaffRole, number> = {
  engineer: 60,
  mechanic: 58,
  strategist: 55,
};

const DEFAULT_SALARY_BY_ROLE: Record<StaffRole, number> = {
  engineer: 42_000,
  mechanic: 38_000,
  strategist: 36_000,
};

const JUNIOR_SALARY_BY_ROLE: Record<StaffRole, number> = {
  engineer: 32_000,
  mechanic: 28_000,
  strategist: 26_000,
};

type RawStaffMember = Partial<StaffMember> & {
  role: StaffRole;
  name: string;
  skill: number;
};

function clampSkill(skill: number): number {
  return Math.max(0, Math.min(100, Math.round(skill)));
}

function salaryForSkill(role: StaffRole, skill: number): number {
  return DEFAULT_SALARY_BY_ROLE[role] + Math.max(0, skill - 50) * 600;
}

function staffId(role: StaffRole, carId: string, junior = false): string {
  return junior ? `staff-junior-${role}-${carId}` : `staff-${role}-${carId}`;
}

function normalizeMember(raw: RawStaffMember, assignedCarId: string): StaffMember {
  const role = raw.role;
  const skill = clampSkill(raw.skill);
  return {
    id: String(raw.id ?? staffId(role, assignedCarId)),
    role,
    name: String(raw.name),
    skill,
    experience: Number(raw.experience ?? 0),
    salaryPerRace: Number(raw.salaryPerRace ?? salaryForSkill(role, skill)),
    morale: Number(raw.morale ?? 75),
    assignedCarId,
    status: (raw.status as StaffStatus | undefined) ?? "active",
    ...(raw.unavailableUntilRound !== undefined
      ? { unavailableUntilRound: Number(raw.unavailableUntilRound) }
      : {}),
    ...(raw.traits?.length ? { traits: [...raw.traits] } : {}),
  };
}

function memberNeedsMigration(
  raw: RawStaffMember,
  normalized: StaffMember,
): boolean {
  return (
    raw.id === undefined ||
    raw.assignedCarId === undefined ||
    raw.experience === undefined ||
    raw.salaryPerRace === undefined ||
    raw.morale === undefined ||
    raw.status === undefined ||
    normalized.skill !== clampSkill(raw.skill) ||
    normalized.assignedCarId !== String(raw.assignedCarId ?? "")
  );
}

function createJuniorPlaceholder(role: StaffRole, carId: string): StaffMember {
  const skill = JUNIOR_SKILLS[role];
  return {
    id: staffId(role, carId, true),
    role,
    name: JUNIOR_NAMES[role],
    skill,
    experience: 0,
    salaryPerRace: JUNIOR_SALARY_BY_ROLE[role],
    morale: 70,
    assignedCarId: carId,
    status: "active",
  };
}

export function migrateStaffToPerCar(
  rawStaff: RawStaffMember[],
  fleetIds: string[],
): { staff: StaffMember[]; migrated: boolean } {
  const primaryCarId = fleetIds[0];
  if (!primaryCarId) {
    return { staff: [], migrated: rawStaff.length > 0 };
  }

  let migrated = false;
  const result: StaffMember[] = [];
  const legacy = rawStaff.filter((member) => !member.assignedCarId);

  for (const raw of rawStaff) {
    if (!raw.assignedCarId) continue;
    const normalized = normalizeMember(raw, String(raw.assignedCarId));
    if (memberNeedsMigration(raw, normalized)) migrated = true;
    result.push(normalized);
  }

  for (const role of STAFF_ROLES) {
    const onPrimary = result.find(
      (member) => member.role === role && member.assignedCarId === primaryCarId,
    );
    if (onPrimary) continue;

    const legacyMember = legacy.find((member) => member.role === role);
    if (legacyMember) {
      const normalized = normalizeMember(legacyMember, primaryCarId);
      result.push(normalized);
      migrated = true;
    }
  }

  for (const carId of fleetIds) {
    if (carId === primaryCarId) continue;
    for (const role of STAFF_ROLES) {
      const onCar = result.find(
        (member) => member.role === role && member.assignedCarId === carId,
      );
      if (onCar) continue;
      result.push(createJuniorPlaceholder(role, carId));
      migrated = true;
    }
  }

  return { staff: result, migrated };
}

export function isJuniorPlaceholder(member: StaffMember): boolean {
  if (member.id?.startsWith("staff-junior-")) return true;
  return member.name === JUNIOR_NAMES[member.role];
}

export function isStaffSlotFilled(
  member: StaffMember | null | undefined,
): boolean {
  return member != null && !isJuniorPlaceholder(member);
}

export function findVacantCarsForRole(
  fleetIds: string[],
  staff: StaffMember[],
  role: StaffRole,
): string[] {
  return fleetIds.filter((carId) => {
    const member = staff.find(
      (s) => s.role === role && s.assignedCarId === carId,
    );
    return !isStaffSlotFilled(member);
  });
}

export function assignStaffToCar(
  staff: StaffMember[],
  carId: string,
  listing: {
    role: StaffRole;
    name: string;
    skill: number;
    experience?: number;
    salaryPerRace?: number;
    morale?: number;
    traits?: string[];
  },
): StaffMember[] {
  const role = listing.role;
  const idx = staff.findIndex(
    (s) => s.role === role && s.assignedCarId === carId,
  );
  const member = normalizeMember(
    {
      id: `staff-${role}-${carId}`,
      role,
      name: listing.name,
      skill: listing.skill,
      experience: listing.experience,
      salaryPerRace: listing.salaryPerRace,
      morale: listing.morale,
      traits: listing.traits,
      status: "active",
    },
    carId,
  );
  if (idx >= 0) {
    const next = [...staff];
    next[idx] = member;
    return next;
  }
  return [...staff, member];
}

export function staffForCar(staff: StaffMember[], carId: string): StaffMember[] {
  return staff.filter((member) => member.assignedCarId === carId);
}

export function estimateWeeklySalaries(staff: StaffMember[]): number {
  return staff.reduce((sum, member) => sum + member.salaryPerRace, 0);
}
