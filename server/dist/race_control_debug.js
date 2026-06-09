"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyMockDebugRaceControl = applyMockDebugRaceControl;
function syncFlagBits(rc) {
    rc.fcyActive = rc.flagPhase === "fcy";
    rc.scActive = rc.flagPhase === "sc" || rc.flagPhase === "sc_in_lap";
    rc.redFlagActive = rc.flagPhase === "red_flag";
    if (!rc.redFlagActive)
        rc.redFlagSecondsRemaining = 0;
}
function eventForPhase(phase) {
    switch (phase) {
        case "green":
            return "GreenFlag";
        case "slow_zone":
            return "SlowZone";
        case "fcy":
            return "FcyDeploy";
        case "sc":
            return "SafetyCarDeploy";
        case "sc_in_lap":
            return "SafetyCarInThisLap";
        case "red_flag":
            return "RedFlagDeploy";
        default:
            return null;
    }
}
function ensureSectorFlags(rc, sectorCount) {
    if (rc.sectorFlags.length !== sectorCount) {
        rc.sectorFlags = Array.from({ length: sectorCount }, () => 0);
    }
}
function refreshIncidentSectorFlags(rc, ctx) {
    ensureSectorFlags(rc, ctx.sectorCount);
    rc.sectorFlags.fill(0);
    for (const idx of ctx.obstructedSectorIndices()) {
        if (idx >= 0 && idx < ctx.sectorCount) {
            rc.sectorFlags[idx] = 2;
        }
    }
    for (const hz of rc.surfaceHazards) {
        if (hz.sectorIndex >= 0 && hz.sectorIndex < ctx.sectorCount) {
            rc.sectorFlags[hz.sectorIndex] = Math.max(rc.sectorFlags[hz.sectorIndex], 1);
        }
    }
}
function releaseAllFromRaceControlHold(rc, ctx) {
    rc.scLapsRemaining = 0;
    rc.redFlagSecondsRemaining = 0;
    syncFlagBits(rc);
    ctx.releaseGarageCars();
}
function applyMockDebugRaceControl(payload, ctx) {
    const rc = ctx.mockRaceControl;
    switch (payload.action) {
        case "flag_phase": {
            const phase = payload.phase;
            if (!phase)
                return "phase required";
            rc.flagPhase = phase;
            syncFlagBits(rc);
            if (phase === "sc")
                rc.scLapsRemaining = Math.max(rc.scLapsRemaining, 2);
            if (phase === "red_flag")
                rc.redFlagSecondsRemaining = 60;
            if (phase === "green")
                releaseAllFromRaceControlHold(rc, ctx);
            const evType = eventForPhase(phase);
            if (evType) {
                ctx.pushEvent({
                    type: evType,
                    timestamp: ctx.raceTime,
                    message: `Debug race control: ${phase.replace(/_/g, " ")}`,
                });
            }
            return null;
        }
        case "sector_flag": {
            ensureSectorFlags(rc, ctx.sectorCount);
            const idx = payload.sectorIndex ?? 0;
            if (idx < 0 || idx >= ctx.sectorCount)
                return "invalid sector";
            rc.sectorFlags[idx] = Math.max(0, Math.min(2, payload.level ?? 0));
            return null;
        }
        case "strand_car": {
            if (!payload.entryId)
                return "entryId required";
            const car = ctx.findCar(payload.entryId);
            if (!car)
                return "entry not found";
            if (car.retired)
                return "car retired";
            return ctx.strandCar(payload.entryId, payload.reason ?? "Debug incident");
        }
        case "clear_track": {
            for (const entryId of collectObstructedEntryIds(ctx)) {
                ctx.clearObstructionCar(entryId);
            }
            ensureSectorFlags(rc, ctx.sectorCount);
            rc.sectorFlags.fill(0);
            rc.surfaceHazards = [];
            rc.activeIncidentEntryId = "";
            if (rc.flagPhase !== "red_flag") {
                rc.flagPhase = "green";
                releaseAllFromRaceControlHold(rc, ctx);
            }
            ctx.pushEvent({
                type: "GreenFlag",
                timestamp: ctx.raceTime,
                message: "Debug race control: track cleared",
            });
            return null;
        }
        case "spawn_hazard": {
            ensureSectorFlags(rc, ctx.sectorCount);
            const idx = payload.sectorIndex ?? 0;
            if (idx < 0 || idx >= ctx.sectorCount)
                return "invalid sector";
            const kind = payload.kind ?? "debris";
            rc.surfaceHazards.push({
                sectorIndex: idx,
                kind,
                gripMultiplier: payload.gripMultiplier ?? 0.7,
            });
            rc.sectorFlags[idx] = Math.max(rc.sectorFlags[idx] ?? 0, 1);
            ctx.pushEvent({
                type: "SurfaceHazard",
                timestamp: ctx.raceTime,
                message: `Debug race control: ${kind} hazard in sector ${idx + 1}`,
            });
            const fireCount = rc.surfaceHazards.filter((h) => h.kind === "fire").length;
            if (fireCount >= 2 && rc.flagPhase !== "red_flag") {
                rc.flagPhase = "red_flag";
                rc.redFlagSecondsRemaining = 60;
                syncFlagBits(rc);
                ctx.pushEvent({
                    type: "RedFlagDeploy",
                    timestamp: ctx.raceTime,
                    message: `Race control: Red flag — multiple track fires (${fireCount})`,
                });
            }
            return null;
        }
        case "clear_hazards": {
            rc.surfaceHazards = [];
            refreshIncidentSectorFlags(rc, ctx);
            ctx.pushEvent({
                type: "SurfaceCleared",
                timestamp: ctx.raceTime,
                message: "Debug race control: surface hazards cleared",
            });
            return null;
        }
        case "white_flag": {
            rc.whiteFlagActive = payload.active ?? true;
            if (rc.whiteFlagActive) {
                ctx.pushEvent({
                    type: "WhiteFlag",
                    timestamp: ctx.raceTime,
                    message: "Debug race control: white flag",
                });
            }
            return null;
        }
        default:
            return `unknown action: ${payload.action}`;
    }
}
function collectObstructedEntryIds(ctx) {
    return ctx.obstructedEntryIds();
}
