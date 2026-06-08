"use strict";
/** Shared race-control constants and types — mirrors race_control_common.hpp. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PENDING_PENALTIES = exports.TRACK_STATUSES = exports.FLAG_PHASES = exports.MOCK_STRANDED_STOP_SEC = exports.MOCK_TOW_DURATION_SEC = exports.MOCK_MARSHAL_RESPONSE_SEC = void 0;
exports.defaultMockRaceControlState = defaultMockRaceControlState;
exports.countTrackObstructions = countTrackObstructions;
/** Mock stranded lifecycle — simplified from C++ marshal + tow timers. */
exports.MOCK_MARSHAL_RESPONSE_SEC = 15;
exports.MOCK_TOW_DURATION_SEC = 90;
exports.MOCK_STRANDED_STOP_SEC = 3;
exports.FLAG_PHASES = [
    "green",
    "slow_zone",
    "fcy",
    "sc",
    "sc_in_lap",
    "red_flag",
];
exports.TRACK_STATUSES = [
    "racing",
    "stranded",
    "recovering",
    "cleared",
];
exports.PENDING_PENALTIES = [
    "none",
    "drive_through",
    "stop_go",
    "black",
];
function defaultMockRaceControlState() {
    return {
        flagPhase: "green",
        sectorFlags: [],
        fcyActive: false,
        scActive: false,
        scLapsRemaining: 0,
        activeIncidentEntryId: "",
        whiteFlagActive: false,
        surfaceHazards: [],
    };
}
function countTrackObstructions(trackStatuses) {
    let n = 0;
    for (const st of trackStatuses) {
        if (st === "stranded" || st === "recovering")
            n++;
    }
    return n;
}
