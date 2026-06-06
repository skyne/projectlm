"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tickAiGarageRelease = tickAiGarageRelease;
/** Staggered garage release for AI entries during practice/qualifying. */
function tickAiGarageRelease(snapshots, managedEntryIds, ctx, submitCommand) {
    if (ctx.weekendSessionType !== "practice" && ctx.weekendSessionType !== "qualifying") {
        return;
    }
    for (const snap of snapshots) {
        if (managedEntryIds.has(snap.entryId))
            continue;
        if (!snap.inGarage || snap.retired)
            continue;
        const seed = hashEntry(snap.entryId);
        const minDelay = ctx.weekendSessionType === "qualifying" ? 25 + (seed % 90) : 45 + (seed % 420);
        const classBias = snap.classId === "Hypercar" ? -12 : snap.classId === "LMGT3" ? 18 : 0;
        const releaseAt = Math.max(15, minDelay + classBias);
        if (ctx.raceTime >= releaseAt) {
            submitCommand(snap.entryId, "release");
        }
    }
}
function hashEntry(entryId) {
    let h = 0;
    for (let i = 0; i < entryId.length; i++) {
        h = (h * 31 + entryId.charCodeAt(i)) >>> 0;
    }
    return h;
}
