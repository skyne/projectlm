"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const weekend_sessions_1 = require("./weekend_sessions");
function entry(entryId, classId, grid) {
    return {
        entryId,
        teamName: entryId,
        carConfigPath: "configs/car.txt",
        classId,
        grid,
        carNumber: String(grid),
        isPlayer: false,
    };
}
(0, node_test_1.describe)("weekend_sessions", () => {
    (0, node_test_1.it)("applies multi-session schedule only to race rounds", () => {
        strict_1.default.equal((0, weekend_sessions_1.appliesWeekendSchedule)("test", "test"), false);
        strict_1.default.equal((0, weekend_sessions_1.appliesWeekendSchedule)("race", "6h"), true);
    });
    (0, node_test_1.it)("advances practice → qualifying → race", () => {
        strict_1.default.equal((0, weekend_sessions_1.nextWeekendSession)([]), "practice");
        strict_1.default.equal((0, weekend_sessions_1.nextWeekendSession)(["practice"]), "qualifying");
        strict_1.default.equal((0, weekend_sessions_1.nextWeekendSession)(["practice", "qualifying"]), "race");
        strict_1.default.equal((0, weekend_sessions_1.nextWeekendSession)(["practice", "qualifying", "race"]), null);
    });
    (0, node_test_1.it)("enforces session order", () => {
        strict_1.default.equal((0, weekend_sessions_1.canStartWeekendSession)("practice", []), null);
        strict_1.default.match((0, weekend_sessions_1.canStartWeekendSession)("qualifying", []) ?? "", /free practice/i);
        strict_1.default.match((0, weekend_sessions_1.canStartWeekendSession)("race", ["practice"]) ?? "", /qualifying/i);
        strict_1.default.equal((0, weekend_sessions_1.canStartWeekendSession)("race", ["practice", "qualifying"]), null);
    });
    (0, node_test_1.it)("nextWeekendSession after practice complete returns qualifying", () => {
        strict_1.default.equal((0, weekend_sessions_1.nextWeekendSession)(["practice"]), "qualifying");
        strict_1.default.equal((0, weekend_sessions_1.nextWeekendSession)(["practice", "qualifying"]), "race");
    });
    (0, node_test_1.it)("sortTimingResults orders by best lap with no-lap entries last", () => {
        const sorted = (0, weekend_sessions_1.sortTimingResults)([
            { entryId: "slow", bestLapTime: 99.1 },
            { entryId: "fast", bestLapTime: 97.2 },
            { entryId: "none", bestLapTime: 0 },
            { entryId: "mid", bestLapTime: 98.0 },
        ]);
        strict_1.default.deepEqual(sorted.map((r) => r.entryId), ["fast", "mid", "slow", "none"]);
    });
    (0, node_test_1.it)("applyQualifyingGrid assigns unique overall grid slots by best lap", () => {
        const entries = [
            entry("e1", "Hypercar", 1),
            entry("e2", "Hypercar", 2),
            entry("e3", "GT3", 3),
            entry("e4", "GT3", 4),
        ];
        const reordered = (0, weekend_sessions_1.applyQualifyingGrid)(entries, [
            { entryId: "e1", classId: "Hypercar", bestLapTime: 98.2 },
            { entryId: "e2", classId: "Hypercar", bestLapTime: 97.5 },
            { entryId: "e3", classId: "GT3", bestLapTime: 102.1 },
            { entryId: "e4", classId: "GT3", bestLapTime: 101.4 },
        ]);
        strict_1.default.deepEqual(reordered.map((e) => ({ id: e.entryId, grid: e.grid })), [
            { id: "e2", grid: 1 },
            { id: "e1", grid: 2 },
            { id: "e4", grid: 3 },
            { id: "e3", grid: 4 },
        ]);
        const grids = reordered.map((e) => e.grid);
        strict_1.default.equal(new Set(grids).size, grids.length);
    });
});
