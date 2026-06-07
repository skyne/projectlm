"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const race_control_model_1 = require("./race_control_model");
(0, node_test_1.describe)("race_control_model", () => {
    (0, node_test_1.it)("defaultMockRaceControlState starts green with no hazards", () => {
        const rc = (0, race_control_model_1.defaultMockRaceControlState)();
        strict_1.default.equal(rc.flagPhase, "green");
        strict_1.default.equal(rc.fcyActive, false);
        strict_1.default.equal(rc.scActive, false);
        strict_1.default.deepEqual(rc.surfaceHazards, []);
        strict_1.default.equal(rc.activeIncidentEntryId, "");
        strict_1.default.equal(rc.scLapsRemaining, 0);
    });
    (0, node_test_1.it)("countTrackObstructions counts stranded and recovering cars", () => {
        strict_1.default.equal((0, race_control_model_1.countTrackObstructions)(["racing", "stranded"]), 1);
        strict_1.default.equal((0, race_control_model_1.countTrackObstructions)(["recovering", "recovering"]), 2);
        strict_1.default.equal((0, race_control_model_1.countTrackObstructions)(["racing", "cleared", undefined]), 0);
    });
    (0, node_test_1.it)("countTrackObstructions ignores racing and cleared only", () => {
        strict_1.default.equal((0, race_control_model_1.countTrackObstructions)([]), 0);
        strict_1.default.equal((0, race_control_model_1.countTrackObstructions)(["racing", "racing"]), 0);
        strict_1.default.equal((0, race_control_model_1.countTrackObstructions)(["stranded", "racing", "recovering", "cleared"]), 2);
    });
    (0, node_test_1.it)("exports stable flag phase and penalty enums", () => {
        strict_1.default.ok(race_control_model_1.FLAG_PHASES.includes("fcy"));
        strict_1.default.ok(race_control_model_1.FLAG_PHASES.includes("sc_in_lap"));
        strict_1.default.ok(race_control_model_1.PENDING_PENALTIES.includes("drive_through"));
        strict_1.default.ok(race_control_model_1.PENDING_PENALTIES.includes("stop_go"));
        strict_1.default.ok(race_control_model_1.TRACK_STATUSES.includes("stranded"));
        strict_1.default.ok(race_control_model_1.TRACK_STATUSES.includes("recovering"));
    });
    (0, node_test_1.it)("mock lifecycle constants are positive durations", () => {
        strict_1.default.ok(race_control_model_1.MOCK_STRANDED_STOP_SEC > 0);
        strict_1.default.ok(race_control_model_1.MOCK_MARSHAL_RESPONSE_SEC > 0);
        strict_1.default.ok(race_control_model_1.MOCK_TOW_DURATION_SEC > race_control_model_1.MOCK_MARSHAL_RESPONSE_SEC);
    });
    (0, node_test_1.it)("defaultMockRaceControlState returns independent copies", () => {
        const a = (0, race_control_model_1.defaultMockRaceControlState)();
        const b = (0, race_control_model_1.defaultMockRaceControlState)();
        a.sectorFlags.push(1);
        a.surfaceHazards.push({ sectorIndex: 0, kind: "oil", gripMultiplier: 0.7 });
        strict_1.default.deepEqual(b.sectorFlags, []);
        strict_1.default.deepEqual(b.surfaceHazards, []);
    });
});
