"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const race_control_model_1 = require("./race_control_model");
const race_control_debug_1 = require("./race_control_debug");
(0, node_test_1.describe)("race_control_debug", () => {
    (0, node_test_1.it)("deploys FCY and SC with control events", () => {
        const rc = (0, race_control_model_1.defaultMockRaceControlState)();
        const events = [];
        const ctx = {
            raceTime: 42,
            sectorCount: 3,
            mockRaceControl: rc,
            pushEvent: (e) => events.push(e),
            strandCar: () => null,
            clearObstructionCar: () => { },
            releaseGarageCars: () => { },
            findCar: () => undefined,
            obstructedEntryIds: () => [],
            obstructedSectorIndices: () => [],
        };
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "flag_phase", phase: "fcy" }, ctx), null);
        strict_1.default.equal(rc.flagPhase, "fcy");
        strict_1.default.equal(rc.fcyActive, true);
        strict_1.default.equal(events.at(-1)?.type, "FcyDeploy");
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "flag_phase", phase: "sc" }, ctx), null);
        strict_1.default.equal(rc.scActive, true);
        strict_1.default.ok(rc.scLapsRemaining >= 2);
        strict_1.default.equal(events.at(-1)?.type, "SafetyCarDeploy");
    });
    (0, node_test_1.it)("sets sector flags and spawns hazards", () => {
        const rc = (0, race_control_model_1.defaultMockRaceControlState)();
        const events = [];
        const ctx = {
            raceTime: 10,
            sectorCount: 2,
            mockRaceControl: rc,
            pushEvent: (e) => events.push(e),
            strandCar: () => null,
            clearObstructionCar: () => { },
            releaseGarageCars: () => { },
            findCar: () => undefined,
            obstructedEntryIds: () => [],
            obstructedSectorIndices: () => [],
        };
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "sector_flag", sectorIndex: 1, level: 2 }, ctx), null);
        strict_1.default.deepEqual(rc.sectorFlags, [0, 2]);
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "spawn_hazard", sectorIndex: 0, kind: "oil" }, ctx), null);
        strict_1.default.equal(rc.surfaceHazards.length, 1);
        strict_1.default.deepEqual(rc.sectorFlags, [1, 2]);
        strict_1.default.equal(events.at(-1)?.type, "SurfaceHazard");
    });
    (0, node_test_1.it)("clears hazard sector flags when hazards are cleared", () => {
        const rc = (0, race_control_model_1.defaultMockRaceControlState)();
        const events = [];
        const ctx = {
            raceTime: 10,
            sectorCount: 2,
            mockRaceControl: rc,
            pushEvent: (e) => events.push(e),
            strandCar: () => null,
            clearObstructionCar: () => { },
            releaseGarageCars: () => { },
            findCar: () => undefined,
            obstructedEntryIds: () => [],
            obstructedSectorIndices: () => [],
        };
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "spawn_hazard", sectorIndex: 0, kind: "oil" }, ctx), null);
        strict_1.default.deepEqual(rc.sectorFlags, [1, 0]);
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "clear_hazards" }, ctx), null);
        strict_1.default.deepEqual(rc.sectorFlags, [0, 0]);
        strict_1.default.equal(rc.surfaceHazards.length, 0);
        strict_1.default.equal(events.at(-1)?.type, "SurfaceCleared");
    });
    (0, node_test_1.it)("keeps double yellow when clearing hazards but a car remains stranded", () => {
        const rc = (0, race_control_model_1.defaultMockRaceControlState)();
        const ctx = {
            raceTime: 10,
            sectorCount: 3,
            mockRaceControl: rc,
            pushEvent: () => { },
            strandCar: () => null,
            clearObstructionCar: () => { },
            releaseGarageCars: () => { },
            findCar: () => undefined,
            obstructedEntryIds: () => [],
            obstructedSectorIndices: () => [1],
        };
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "spawn_hazard", sectorIndex: 0, kind: "debris" }, ctx), null);
        strict_1.default.deepEqual(rc.sectorFlags, [1, 0, 0]);
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "clear_hazards" }, ctx), null);
        strict_1.default.deepEqual(rc.sectorFlags, [0, 2, 0]);
    });
    (0, node_test_1.it)("deploys red flag when multiple fire hazards are spawned", () => {
        const rc = (0, race_control_model_1.defaultMockRaceControlState)();
        const events = [];
        const ctx = {
            raceTime: 10,
            sectorCount: 3,
            mockRaceControl: rc,
            pushEvent: (e) => events.push(e),
            strandCar: () => null,
            clearObstructionCar: () => { },
            releaseGarageCars: () => { },
            findCar: () => undefined,
            obstructedEntryIds: () => [],
            obstructedSectorIndices: () => [],
        };
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "spawn_hazard", sectorIndex: 0, kind: "fire" }, ctx), null);
        strict_1.default.equal(rc.flagPhase, "green");
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "spawn_hazard", sectorIndex: 1, kind: "fire" }, ctx), null);
        strict_1.default.equal(rc.flagPhase, "red_flag");
        strict_1.default.equal(rc.redFlagActive, true);
        strict_1.default.equal(events.at(-1)?.type, "RedFlagDeploy");
    });
    (0, node_test_1.it)("green flag releases garage-held cars", () => {
        const rc = (0, race_control_model_1.defaultMockRaceControlState)();
        let released = false;
        const ctx = {
            raceTime: 10,
            sectorCount: 2,
            mockRaceControl: rc,
            pushEvent: () => { },
            strandCar: () => null,
            clearObstructionCar: () => { },
            releaseGarageCars: () => {
                released = true;
            },
            findCar: () => undefined,
            obstructedEntryIds: () => [],
            obstructedSectorIndices: () => [],
        };
        rc.flagPhase = "red_flag";
        rc.scLapsRemaining = 2;
        rc.redFlagSecondsRemaining = 12;
        strict_1.default.equal((0, race_control_debug_1.applyMockDebugRaceControl)({ action: "flag_phase", phase: "green" }, ctx), null);
        strict_1.default.equal(rc.flagPhase, "green");
        strict_1.default.equal(rc.scLapsRemaining, 0);
        strict_1.default.equal(rc.redFlagSecondsRemaining, 0);
        strict_1.default.equal(released, true);
    });
});
