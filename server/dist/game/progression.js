"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_STAFF_SKILL = exports.XP_PER_LEVEL = void 0;
exports.progressionXpValue = progressionXpValue;
exports.progressionLevel = progressionLevel;
exports.xpIntoCurrentLevel = xpIntoCurrentLevel;
exports.xpToNextLevel = xpToNextLevel;
exports.driverXpForPrivateTest = driverXpForPrivateTest;
exports.staffXpForPrivateTest = staffXpForPrivateTest;
exports.nextDriverRewardLabel = nextDriverRewardLabel;
exports.applyPrivateTestProgression = applyPrivateTestProgression;
exports.XP_PER_LEVEL = 100;
exports.MAX_STAFF_SKILL = 98;
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
function driverStatForLevel(level) {
    return level % 2 === 1 ? "setupFeedback" : "dryPace";
}
function nextDriverRewardLabel(level) {
    const stat = driverStatForLevel(level);
    return stat === "setupFeedback" ? "+1 Setup Feedback" : "+1 Dry Pace";
}
function applyDriverLevelUps(driver, xpBefore, xpAfter) {
    const levelBefore = progressionLevel(xpBefore);
    const levelAfter = progressionLevel(xpAfter);
    let next = { ...driver, progressionXp: xpAfter };
    const bumps = [];
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
function applyStaffLevelUps(member, xpBefore, xpAfter) {
    const levelBefore = progressionLevel(xpBefore);
    const levelAfter = progressionLevel(xpAfter);
    let next = { ...member, progressionXp: xpAfter };
    const bumps = [];
    for (let level = levelBefore + 1; level <= levelAfter; level++) {
        const from = next.skill;
        const to = Math.min(exports.MAX_STAFF_SKILL, from + 1);
        if (to > from) {
            bumps.push({ stat: "skill", from, to });
            next = { ...next, skill: to };
        }
    }
    return { member: next, bumps };
}
function applyPrivateTestProgression(drivers, staff, participantDriverIds, participantStaffIds, durationHours, options = {}) {
    const mult = Math.max(1, options.xpMultiplier ?? 1);
    const driverXp = Math.round(driverXpForPrivateTest(durationHours) * mult);
    const staffXp = Math.round(staffXpForPrivateTest(durationHours) * mult);
    const driverIdSet = new Set(participantDriverIds);
    const staffIdSet = new Set(participantStaffIds);
    const summary = { drivers: [], staff: [] };
    const nextDrivers = drivers.map((driver) => {
        const id = driver.id?.trim();
        if (!id || !driverIdSet.has(id))
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
        if (!staffIdSet.has(member.id))
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
