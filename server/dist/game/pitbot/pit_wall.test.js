"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const pit_wall_1 = require("./pit_wall");
function snap(classId, entryId, teamName) {
    return {
        entryId,
        teamName,
        carNumber: entryId,
        classId,
        lap: 1,
        distance: 0,
        normalizedT: 0,
        speed: 0,
        rpm: 0,
        fuel: 50,
        tireWear: 0,
        engineHealth: 100,
        sectorIndex: 0,
        racePosition: 1,
        inPit: false,
        retired: false,
        currentLapTime: 0,
        currentSectorTime: 0,
        lastLapTime: 0,
        bestLapTime: 0,
        gapToLeader: 0,
        currentLapSectorTimes: [0, 0, 0],
        lapHistory: [],
        position: { x: 0, y: 0, z: 0 },
        tangent: { x: 1, y: 0, z: 0 },
    };
}
(0, node_test_1.describe)("teamResultsByClass", () => {
    (0, node_test_1.it)("groups managed entries by class", () => {
        const snaps = [
            snap("LMP2", "e1", "Cursor Racing"),
            snap("LMGT3", "e2", "Cursor Racing"),
            snap("Hypercar", "e3", "Other Team"),
        ];
        const byClass = (0, pit_wall_1.teamResultsByClass)(snaps, { entryIds: ["e1", "e2"] });
        strict_1.default.equal(byClass.LMP2?.length, 1);
        strict_1.default.equal(byClass.LMGT3?.length, 1);
        strict_1.default.equal(byClass.Hypercar, undefined);
    });
});
(0, node_test_1.describe)("sortedTeamClasses", () => {
    (0, node_test_1.it)("orders Hypercar before LMP2 before LMGT3", () => {
        const order = (0, pit_wall_1.sortedTeamClasses)({
            LMGT3: [snap("LMGT3", "g1", "T")],
            LMP2: [snap("LMP2", "p1", "T")],
            Hypercar: [snap("Hypercar", "h1", "T")],
        });
        strict_1.default.deepEqual(order, ["Hypercar", "LMP2", "LMGT3"]);
    });
});
