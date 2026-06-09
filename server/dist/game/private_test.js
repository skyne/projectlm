"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIVATE_TEST_DEFAULT_HOURS = exports.PRIVATE_TEST_MAX_HOURS = exports.PRIVATE_TEST_MIN_HOURS = void 0;
exports.clampPrivateTestDurationHours = clampPrivateTestDurationHours;
exports.isRaceWeekendInProgress = isRaceWeekendInProgress;
exports.canStartPrivateTest = canStartPrivateTest;
exports.privateTestBlockedReason = privateTestBlockedReason;
exports.validatePrivateTestPayload = validatePrivateTestPayload;
exports.trackMonthForPrivateTest = trackMonthForPrivateTest;
exports.privateTestWeatherSeed = privateTestWeatherSeed;
exports.collectPrivateTestParticipants = collectPrivateTestParticipants;
const fleet_1 = require("./fleet");
const driver_catalog_1 = require("./driver_catalog");
const season_end_1 = require("./season_end");
const weekend_sessions_1 = require("./weekend_sessions");
const track_catalog_1 = require("./track_catalog");
exports.PRIVATE_TEST_MIN_HOURS = 1;
exports.PRIVATE_TEST_MAX_HOURS = 72;
exports.PRIVATE_TEST_DEFAULT_HOURS = 4;
function clampPrivateTestDurationHours(hours) {
    if (!Number.isFinite(hours))
        return exports.PRIVATE_TEST_DEFAULT_HOURS;
    return Math.min(exports.PRIVATE_TEST_MAX_HOURS, Math.max(exports.PRIVATE_TEST_MIN_HOURS, Math.round(hours)));
}
function isRaceWeekendInProgress(meta) {
    const current = meta.calendar.find((e) => e.round === meta.currentRound);
    if (!current || current.completed)
        return false;
    if (!(0, weekend_sessions_1.appliesWeekendSchedule)(current.eventType, current.format))
        return false;
    return meta.weekendProgress?.round === meta.currentRound;
}
function canStartPrivateTest(meta) {
    return privateTestBlockedReason(meta) === null;
}
function privateTestBlockedReason(meta) {
    if (!meta.setupComplete)
        return "Complete team setup first";
    if (meta.seasonComplete || (0, season_end_1.isSeasonCalendarComplete)(meta.calendar)) {
        return "Season complete — review results and start the next season";
    }
    if (isRaceWeekendInProgress(meta)) {
        return "Finish the race weekend before scheduling a private test";
    }
    if (!meta.fleet?.length)
        return "Your team needs at least one car";
    return null;
}
function validateDriverAssignments(meta, carIds, driverAssignments) {
    const roster = meta.driverRoster ?? [];
    const fleetSubset = carIds.map((id) => {
        const car = meta.fleet?.find((c) => c.id === id);
        if (!car)
            return null;
        const assigned = driverAssignments[id];
        if (!assigned?.length) {
            return { ...car, assignedDriverIds: [] };
        }
        return { ...car, assignedDriverIds: (0, driver_catalog_1.sanitizeAssignedDriverIds)(assigned, roster) };
    });
    if (fleetSubset.some((c) => c === null)) {
        return "One or more selected cars were not found in your fleet";
    }
    return (0, driver_catalog_1.validateExclusiveDriverAssignments)(fleetSubset.filter((c) => c !== null), roster);
}
function validatePrivateTestPayload(meta, raw) {
    const blocked = privateTestBlockedReason(meta);
    if (blocked)
        return { error: blocked };
    const trackId = String(raw.trackId ?? "").trim();
    if (!trackId || !track_catalog_1.TRACK_CATALOG[trackId]) {
        return { error: "Select a valid track" };
    }
    const carIds = [...new Set((raw.carIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (!carIds.length)
        return { error: "Select at least one car" };
    const fleetIds = new Set((meta.fleet ?? []).map((c) => c.id));
    for (const carId of carIds) {
        if (!fleetIds.has(carId))
            return { error: `Unknown car: ${carId}` };
    }
    const fleetSubset = (meta.fleet ?? []).filter((c) => carIds.includes(c.id));
    const fleetErr = (0, fleet_1.validateFleetRegulations)(fleetSubset);
    if (fleetErr)
        return { error: fleetErr };
    const driverAssignments = raw.driverAssignments ?? {};
    for (const carId of carIds) {
        if (!driverAssignments[carId]?.length) {
            const car = meta.fleet?.find((c) => c.id === carId);
            return { error: `Assign at least one driver to car #${car?.carNumber ?? carId}` };
        }
    }
    const assignmentKeys = Object.keys(driverAssignments).filter((k) => driverAssignments[k]?.length);
    for (const key of assignmentKeys) {
        if (!carIds.includes(key)) {
            return { error: "Driver assignments must match selected cars only" };
        }
    }
    const assignErr = validateDriverAssignments(meta, carIds, driverAssignments);
    if (assignErr)
        return { error: assignErr };
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
function trackMonthForPrivateTest(trackId) {
    const event = track_catalog_1.WEC_2026_CALENDAR.find((e) => e.trackId === trackId);
    return event?.month ?? 6;
}
function privateTestWeatherSeed(seasonYear, trackId) {
    let hash = 0;
    for (let i = 0; i < trackId.length; i++) {
        hash = (hash * 31 + trackId.charCodeAt(i)) | 0;
    }
    return seasonYear * 1000 + Math.abs(hash % 1000);
}
function collectPrivateTestParticipants(meta, carIds, driverAssignments) {
    const driverIds = new Set();
    for (const carId of carIds) {
        for (const id of (0, driver_catalog_1.sanitizeAssignedDriverIds)(driverAssignments[carId] ?? [], meta.driverRoster ?? [])) {
            driverIds.add(id);
        }
    }
    const carIdSet = new Set(carIds);
    const staffIds = (meta.staff ?? [])
        .filter((s) => s.assignedCarId && carIdSet.has(s.assignedCarId))
        .map((s) => s.id)
        .filter((id) => Boolean(id));
    return { driverIds: [...driverIds], staffIds };
}
