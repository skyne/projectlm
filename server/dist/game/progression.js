"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_OFF_WEEK_TRAINING_SLOTS = exports.OFF_WEEK_TRAINING_XP = exports.OFF_WEEK_TRAINING_COST = exports.MAX_STAFF_SKILL = exports.XP_PER_LEVEL = void 0;
exports.progressionXpValue = progressionXpValue;
exports.progressionLevel = progressionLevel;
exports.xpIntoCurrentLevel = xpIntoCurrentLevel;
exports.xpToNextLevel = xpToNextLevel;
exports.driverXpForPrivateTest = driverXpForPrivateTest;
exports.staffXpForPrivateTest = staffXpForPrivateTest;
exports.driverXpForWeekendSession = driverXpForWeekendSession;
exports.staffXpForWeekendSession = staffXpForWeekendSession;
exports.nextDriverRewardLabel = nextDriverRewardLabel;
exports.applyPrivateTestProgression = applyPrivateTestProgression;
exports.applyWeekendProgression = applyWeekendProgression;
exports.collectWeekendParticipants = collectWeekendParticipants;
exports.applyOffWeekTraining = applyOffWeekTraining;
const facilities_1 = require("./facilities");
exports.XP_PER_LEVEL = 100;
exports.MAX_STAFF_SKILL = 98;
exports.OFF_WEEK_TRAINING_COST = 45000;
exports.OFF_WEEK_TRAINING_XP = 28;
exports.MAX_OFF_WEEK_TRAINING_SLOTS = 2;
const DRIVER_STAT_ROTATION = [
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
const DRIVER_STAT_CAPS = {
    setupFeedback: 92,
    adaptability: 94,
};
function progressionXpValue(xp) {
    return Math.max(0, Math.round(xp ?? 0));
}
function progressionLevel(xp) {
    return Math.floor(progressionXpValue(xp) / exports.XP_PER_LEVEL) + 1;
}
function xpIntoCurrentLevel(xp) {
    return progressionXpValue(xp) % exports.XP_PER_LEVEL;
}
function xpToNextLevel(xp) {
    return exports.XP_PER_LEVEL - xpIntoCurrentLevel(xp);
}
function driverXpForPrivateTest(durationHours) {
    return Math.round(Math.max(1, durationHours) * 8);
}
function staffXpForPrivateTest(durationHours) {
    return Math.round(Math.max(1, durationHours) * 5);
}
function driverXpForWeekendSession(sessionType, options = {}) {
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
    if (!classified)
        base = Math.max(4, Math.round(base * 0.35));
    return base;
}
function staffXpForWeekendSession(sessionType, options = {}) {
    const classified = options.classified !== false;
    let base = sessionType === "race" ? 16 : sessionType === "qualifying" ? 8 : 6;
    if (!classified)
        base = Math.max(3, Math.round(base * 0.4));
    return base;
}
function driverStatForLevel(level) {
    return DRIVER_STAT_ROTATION[(level - 1) % DRIVER_STAT_ROTATION.length];
}
function nextDriverRewardLabel(level) {
    const stat = driverStatForLevel(level);
    const labels = {
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
function staffStatForRole(role, level) {
    if (role === "engineer") {
        return level % 2 === 1 ? "skill" : "morale";
    }
    if (role === "mechanic") {
        return level % 2 === 1 ? "skill" : "morale";
    }
    return level % 2 === 1 ? "skill" : "morale";
}
function applyDriverLevelUps(driver, xpBefore, xpAfter) {
    const levelBefore = progressionLevel(xpBefore);
    const levelAfter = progressionLevel(xpAfter);
    let next = { ...driver, progressionXp: xpAfter };
    const bumps = [];
    for (let level = levelBefore + 1; level <= levelAfter; level++) {
        const stat = driverStatForLevel(level);
        const from = next[stat] ?? 70;
        const cap = DRIVER_STAT_CAPS[stat] ?? 98;
        const to = Math.min(cap, from + 1);
        if (to > from) {
            bumps.push({ stat, from, to });
            next = { ...next, [stat]: to };
        }
    }
    return { driver: next, bumps };
}
function applyStaffLevelUps(member, xpBefore, xpAfter) {
    const levelBefore = progressionLevel(xpBefore);
    const levelAfter = progressionLevel(xpAfter);
    let next = { ...member, progressionXp: xpAfter };
    const bumps = [];
    for (let level = levelBefore + 1; level <= levelAfter; level++) {
        const stat = staffStatForRole(member.role, level);
        if (stat === "morale") {
            const from = next.morale ?? 75;
            const to = Math.min(98, from + 1);
            if (to > from) {
                bumps.push({ stat, from, to });
                next = { ...next, morale: to };
            }
        }
        else {
            const from = next.skill;
            const to = Math.min(exports.MAX_STAFF_SKILL, from + 1);
            if (to > from) {
                bumps.push({ stat: "skill", from, to });
                next = { ...next, skill: to };
            }
        }
    }
    return { member: next, bumps };
}
function applyXpBatch(drivers, staff, driverIds, staffIds, driverXp, staffXp) {
    const summary = { drivers: [], staff: [] };
    const nextDrivers = drivers.map((driver) => {
        const id = driver.id?.trim();
        if (!id || !driverIds.has(id))
            return driver;
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
        if (!staffIds.has(member.id))
            return member;
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
function applyPrivateTestProgression(drivers, staff, participantDriverIds, participantStaffIds, durationHours, options = {}) {
    const mult = Math.max(1, options.xpMultiplier ?? 1);
    const driverXp = Math.round(driverXpForPrivateTest(durationHours) * mult);
    const staffXp = Math.round(staffXpForPrivateTest(durationHours) * mult);
    return applyXpBatch(drivers, staff, new Set(participantDriverIds), new Set(participantStaffIds), driverXp, staffXp);
}
function applyWeekendProgression(drivers, staff, participantDriverIds, participantStaffIds, sessionType, options = {}) {
    const mult = options.privateTestMultiplier ?? 1;
    const driverXp = Math.round(driverXpForWeekendSession(sessionType, options) * mult);
    const staffXp = Math.round(staffXpForWeekendSession(sessionType, options) * mult);
    return applyXpBatch(drivers, staff, new Set(participantDriverIds), new Set(participantStaffIds), driverXp, staffXp);
}
function collectWeekendParticipants(fleetCarIds, driverRoster, staff, assignments) {
    const driverIds = new Set();
    const carIdSet = new Set(fleetCarIds);
    for (const carId of fleetCarIds) {
        for (const id of assignments[carId] ?? []) {
            if (driverRoster.some((d) => d.id === id))
                driverIds.add(id);
        }
    }
    const staffIds = staff
        .filter((s) => s.assignedCarId && carIdSet.has(s.assignedCarId))
        .map((s) => s.id);
    return { driverIds: [...driverIds], staffIds };
}
function applyOffWeekTraining(drivers, staff, action, targets, facilities = []) {
    const mult = (0, facilities_1.facilityTrainingMultiplier)(facilities);
    const xp = Math.round(exports.OFF_WEEK_TRAINING_XP * mult);
    if (action === "driver_sim") {
        const id = targets.driverId?.trim();
        if (!id)
            return { drivers, staff, summary: { drivers: [], staff: [] }, error: "driverId required" };
        const result = applyXpBatch(drivers, staff, new Set([id]), new Set(), xp, 0);
        return { ...result, summary: result.summary };
    }
    if (action === "pit_drills" || action === "data_review" || action === "strategy_tabletop") {
        const id = targets.staffId?.trim();
        if (!id)
            return { drivers, staff, summary: { drivers: [], staff: [] }, error: "staffId required" };
        const member = staff.find((s) => s.id === id);
        if (!member) {
            return { drivers, staff, summary: { drivers: [], staff: [] }, error: "Staff not found" };
        }
        const roleOk = (action === "pit_drills" && member.role === "mechanic") ||
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
