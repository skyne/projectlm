"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEC_OVERALL_MIN_DISTANCE_FRACTION = exports.CLASS_MIN_DISTANCE_FRACTION = void 0;
exports.raceDistanceMeters = raceDistanceMeters;
exports.applyRaceClassification = applyRaceClassification;
exports.snapshotsToRaceResults = snapshotsToRaceResults;
/**
 * FIA WEC classifies cars that cover ≥70% of the **overall** winner's distance.
 * This sim uses 75% of the **class leader** — stricter per-class and easier to reason
 * about in multi-class endurance.
 */
exports.CLASS_MIN_DISTANCE_FRACTION = 0.75;
/** FIA WEC sporting regulation reference (overall winner distance). */
exports.WEC_OVERALL_MIN_DISTANCE_FRACTION = 0.7;
function raceDistanceMeters(snap, lapLength) {
    if (lapLength <= 0)
        return 0;
    const completedLaps = Math.max(0, (snap.lap ?? 1) - 1);
    return completedLaps * lapLength + Math.max(0, snap.distance ?? 0);
}
function applyRaceClassification(snapshots, lapLength, options) {
    if (options?.enabled === false || lapLength <= 0 || snapshots.length === 0) {
        return snapshots;
    }
    const minFrac = options?.minClassFraction ?? exports.CLASS_MIN_DISTANCE_FRACTION;
    const classLeaderDistance = {};
    for (const snap of snapshots) {
        const dist = raceDistanceMeters(snap, lapLength);
        const prev = classLeaderDistance[snap.classId] ?? 0;
        if (dist > prev)
            classLeaderDistance[snap.classId] = dist;
    }
    return snapshots.map((snap) => {
        if (snap.retired)
            return snap;
        const leaderDist = classLeaderDistance[snap.classId] ?? 0;
        if (leaderDist <= 0)
            return snap;
        const dist = raceDistanceMeters(snap, lapLength);
        if (dist + 1e-6 >= leaderDist * minFrac)
            return snap;
        const pct = Math.round((dist / leaderDist) * 100);
        return {
            ...snap,
            retired: true,
            retireReason: `Not classified (${pct}% of class leader distance, need ${Math.round(minFrac * 100)}%)`,
        };
    });
}
function snapshotsToRaceResults(snapshots) {
    return snapshots.map((s) => ({
        entryId: s.entryId,
        teamName: s.teamName,
        carNumber: s.carNumber,
        classId: s.classId,
        position: s.racePosition,
        bestLapTime: s.bestLapTime ?? 0,
        driverName: s.driverName,
        retired: s.retired,
        retireReason: s.retireReason,
    }));
}
