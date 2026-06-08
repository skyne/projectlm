"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_LABELS = void 0;
exports.migrateStaffToPerCar = migrateStaffToPerCar;
exports.isJuniorPlaceholder = isJuniorPlaceholder;
exports.isStaffSlotFilled = isStaffSlotFilled;
exports.findVacantCarsForRole = findVacantCarsForRole;
exports.assignStaffToCar = assignStaffToCar;
exports.staffForCar = staffForCar;
exports.estimateWeeklySalaries = estimateWeeklySalaries;
exports.ROLE_LABELS = {
    engineer: "Engineer",
    mechanic: "Mechanic",
    strategist: "Strategist",
};
const STAFF_ROLES = ["engineer", "mechanic", "strategist"];
const JUNIOR_NAMES = {
    engineer: "Junior Engineer",
    mechanic: "Junior Mechanic",
    strategist: "Junior Strategist",
};
const JUNIOR_SKILLS = {
    engineer: 60,
    mechanic: 58,
    strategist: 55,
};
const DEFAULT_SALARY_BY_ROLE = {
    engineer: 42000,
    mechanic: 38000,
    strategist: 36000,
};
const JUNIOR_SALARY_BY_ROLE = {
    engineer: 32000,
    mechanic: 28000,
    strategist: 26000,
};
function clampSkill(skill) {
    return Math.max(0, Math.min(100, Math.round(skill)));
}
function salaryForSkill(role, skill) {
    return DEFAULT_SALARY_BY_ROLE[role] + Math.max(0, skill - 50) * 600;
}
function staffId(role, carId, junior = false) {
    return junior ? `staff-junior-${role}-${carId}` : `staff-${role}-${carId}`;
}
function normalizeMember(raw, assignedCarId) {
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
        status: raw.status ?? "active",
        ...(raw.unavailableUntilRound !== undefined
            ? { unavailableUntilRound: Number(raw.unavailableUntilRound) }
            : {}),
        ...(raw.traits?.length ? { traits: [...raw.traits] } : {}),
    };
}
function memberNeedsMigration(raw, normalized) {
    return (raw.id === undefined ||
        raw.assignedCarId === undefined ||
        raw.experience === undefined ||
        raw.salaryPerRace === undefined ||
        raw.morale === undefined ||
        raw.status === undefined ||
        normalized.skill !== clampSkill(raw.skill) ||
        normalized.assignedCarId !== String(raw.assignedCarId ?? ""));
}
function createJuniorPlaceholder(role, carId) {
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
function migrateStaffToPerCar(rawStaff, fleetIds) {
    const primaryCarId = fleetIds[0];
    if (!primaryCarId) {
        return { staff: [], migrated: rawStaff.length > 0 };
    }
    let migrated = false;
    const result = [];
    const legacy = rawStaff.filter((member) => !member.assignedCarId);
    for (const raw of rawStaff) {
        if (!raw.assignedCarId)
            continue;
        const normalized = normalizeMember(raw, String(raw.assignedCarId));
        if (memberNeedsMigration(raw, normalized))
            migrated = true;
        result.push(normalized);
    }
    for (const role of STAFF_ROLES) {
        const onPrimary = result.find((member) => member.role === role && member.assignedCarId === primaryCarId);
        if (onPrimary)
            continue;
        const legacyMember = legacy.find((member) => member.role === role);
        if (legacyMember) {
            const normalized = normalizeMember(legacyMember, primaryCarId);
            result.push(normalized);
            migrated = true;
        }
    }
    for (const carId of fleetIds) {
        if (carId === primaryCarId)
            continue;
        for (const role of STAFF_ROLES) {
            const onCar = result.find((member) => member.role === role && member.assignedCarId === carId);
            if (onCar)
                continue;
            result.push(createJuniorPlaceholder(role, carId));
            migrated = true;
        }
    }
    return { staff: result, migrated };
}
function isJuniorPlaceholder(member) {
    if (member.id?.startsWith("staff-junior-"))
        return true;
    return member.name === JUNIOR_NAMES[member.role];
}
function isStaffSlotFilled(member) {
    return member != null && !isJuniorPlaceholder(member);
}
function findVacantCarsForRole(fleetIds, staff, role) {
    return fleetIds.filter((carId) => {
        const member = staff.find((s) => s.role === role && s.assignedCarId === carId);
        return !isStaffSlotFilled(member);
    });
}
function assignStaffToCar(staff, carId, listing) {
    const role = listing.role;
    const idx = staff.findIndex((s) => s.role === role && s.assignedCarId === carId);
    const member = normalizeMember({
        id: `staff-${role}-${carId}`,
        role,
        name: listing.name,
        skill: listing.skill,
        experience: listing.experience,
        salaryPerRace: listing.salaryPerRace,
        morale: listing.morale,
        traits: listing.traits,
        status: "active",
    }, carId);
    if (idx >= 0) {
        const next = [...staff];
        next[idx] = member;
        return next;
    }
    return [...staff, member];
}
function staffForCar(staff, carId) {
    return staff.filter((member) => member.assignedCarId === carId);
}
function estimateWeeklySalaries(staff) {
    return staff.reduce((sum, member) => sum + member.salaryPerRace, 0);
}
