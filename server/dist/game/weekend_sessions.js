"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_DURATION_SECONDS = exports.WEEKEND_SESSION_ORDER = void 0;
exports.appliesWeekendSchedule = appliesWeekendSchedule;
exports.nextWeekendSession = nextWeekendSession;
exports.sessionDisplayLabel = sessionDisplayLabel;
exports.sessionDurationSeconds = sessionDurationSeconds;
exports.canStartWeekendSession = canStartWeekendSession;
exports.applyQualifyingGrid = applyQualifyingGrid;
exports.sortTimingResults = sortTimingResults;
exports.collectQualifyingResults = collectQualifyingResults;
exports.WEEKEND_SESSION_ORDER = [
    "practice",
    "qualifying",
    "race",
];
/** Sim duration for short weekend sessions (seconds). Race uses calendar format. */
exports.SESSION_DURATION_SECONDS = {
    practice: 60 * 60,
    qualifying: 15 * 60,
};
function appliesWeekendSchedule(eventType, format) {
    const lower = (format ?? "").trim().toLowerCase();
    return eventType !== "test" && lower !== "test";
}
function nextWeekendSession(completed) {
    for (const step of exports.WEEKEND_SESSION_ORDER) {
        if (!completed.includes(step))
            return step;
    }
    return null;
}
function sessionDisplayLabel(sessionType) {
    switch (sessionType) {
        case "practice":
            return "Free Practice";
        case "qualifying":
            return "Qualifying";
        case "race":
            return "Race";
    }
}
function sessionDurationSeconds(sessionType, raceFormat, formatToRaceSeconds) {
    if (sessionType === "practice")
        return exports.SESSION_DURATION_SECONDS.practice;
    if (sessionType === "qualifying")
        return exports.SESSION_DURATION_SECONDS.qualifying;
    return formatToRaceSeconds(raceFormat);
}
function canStartWeekendSession(sessionType, completed) {
    if (sessionType === "practice") {
        if (completed.includes("practice")) {
            return "Free practice already completed — restart the session to run again";
        }
        return null;
    }
    if (sessionType === "qualifying") {
        if (!completed.includes("practice")) {
            return "Complete free practice before qualifying";
        }
        if (completed.includes("qualifying")) {
            return "Qualifying already completed — restart the session to run again";
        }
        return null;
    }
    if (!completed.includes("qualifying")) {
        return "Complete qualifying before the race";
    }
    if (completed.includes("race")) {
        return "Race already completed for this round";
    }
    return null;
}
/** Re-grid entries by overall qualifying classification (one car per grid slot). */
function applyQualifyingGrid(entries, qualiResults) {
    if (qualiResults.length === 0)
        return entries;
    const bestByEntry = new Map(qualiResults.map((q) => [q.entryId, q.bestLapTime]));
    const sorted = [...entries].sort((a, b) => {
        const ta = bestByEntry.get(a.entryId) ?? Number.POSITIVE_INFINITY;
        const tb = bestByEntry.get(b.entryId) ?? Number.POSITIVE_INFINITY;
        if (ta !== tb)
            return ta - tb;
        return a.grid - b.grid;
    });
    return sorted.map((entry, index) => ({ ...entry, grid: index + 1 }));
}
/** Order practice/qualifying results by best lap (cars without a lap go last). */
function sortTimingResults(results) {
    return [...results].sort((a, b) => {
        const aHas = (a.bestLapTime ?? 0) > 0;
        const bHas = (b.bestLapTime ?? 0) > 0;
        if (aHas !== bHas)
            return aHas ? -1 : 1;
        if (aHas && bHas && a.bestLapTime !== b.bestLapTime) {
            return (a.bestLapTime ?? 0) - (b.bestLapTime ?? 0);
        }
        return (a.lastLapTime ?? 0) - (b.lastLapTime ?? 0);
    });
}
function collectQualifyingResults(snapshots) {
    return snapshots
        .filter((s) => s.bestLapTime > 0)
        .map((s) => ({
        entryId: s.entryId,
        classId: s.classId,
        bestLapTime: s.bestLapTime,
    }));
}
