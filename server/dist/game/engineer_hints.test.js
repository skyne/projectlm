"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const engineer_hints_1 = require("./engineer_hints");
function snap(overrides = {}) {
    return {
        entryId: "e1",
        teamName: "Team",
        carNumber: "7",
        classId: "LMP2",
        lap: 5,
        distance: 1000,
        normalizedT: 0.2,
        speed: 60,
        rpm: 5000,
        fuel: 50,
        tireWear: 0.3,
        engineHealth: 100,
        sectorIndex: 0,
        racePosition: 1,
        inPit: false,
        retired: false,
        currentLapTime: 100,
        currentSectorTime: 30,
        lastLapTime: 100,
        bestLapTime: 99,
        gapToLeader: 0,
        currentLapSectorTimes: [],
        lapHistory: [],
        position: { x: 0, y: 0, z: 0 },
        tangent: { x: 1, y: 0, z: 0 },
        ...overrides,
    };
}
(0, node_test_1.describe)("evaluateCarHint", () => {
    (0, node_test_1.it)("flags emergency fuel", () => {
        const hint = (0, engineer_hints_1.evaluateCarHint)(snap({ fuel: 15, fuelTankCapacity: 100 }), 0);
        strict_1.default.ok(hint);
        strict_1.default.equal(hint.category, "emergency");
    });
    (0, node_test_1.it)("flags worn tyres", () => {
        const hint = (0, engineer_hints_1.evaluateCarHint)(snap({ tireWear: 0.8 }), 0);
        strict_1.default.ok(hint);
        strict_1.default.equal(hint.category, "tyre_wear");
    });
    (0, node_test_1.it)("flags wrong tyres in wet conditions", () => {
        const hint = (0, engineer_hints_1.evaluateCarHint)(snap({ tireCompound: "soft" }), 0.5);
        strict_1.default.ok(hint);
        strict_1.default.equal(hint.category, "wrong_tyre");
    });
    (0, node_test_1.it)("skips cars in the pit", () => {
        strict_1.default.equal((0, engineer_hints_1.evaluateCarHint)(snap({ inPit: true, fuel: 5 }), 0), null);
    });
    (0, node_test_1.it)("skips cars with a pit stop already queued", () => {
        strict_1.default.equal((0, engineer_hints_1.evaluateCarHint)(snap({ pitQueued: true, tireWear: 0.8 }), 0), null);
        strict_1.default.equal((0, engineer_hints_1.evaluateCarHint)(snap({ pitQueued: true, fuel: 15, fuelTankCapacity: 100 }), 0), null);
        strict_1.default.equal((0, engineer_hints_1.evaluateCarHint)(snap({ pitQueued: true, partHealth: { body_fl: 70 } }), 0), null);
    });
});
(0, node_test_1.describe)("EngineerHintManager", () => {
    (0, node_test_1.it)("raises one hint and snoozes after dismiss", () => {
        const mgr = new engineer_hints_1.EngineerHintManager();
        const worn = snap({ tireWear: 0.8 });
        const first = mgr.tick([worn], ["e1"], 0, 100, 20, false);
        strict_1.default.ok(first.hint);
        strict_1.default.equal(first.autoPaused, true);
        strict_1.default.equal(first.timeScale, 20);
        const second = mgr.tick([worn], ["e1"], 0, 110, 20, true);
        strict_1.default.equal(second.hint, null);
        mgr.dismiss(first.hint.hintId);
        const third = mgr.tick([worn], ["e1"], 0, 120, 20, false);
        strict_1.default.equal(third.hint, null);
        const fourth = mgr.tick([worn], ["e1"], 0, 200, 20, false);
        strict_1.default.ok(fourth.hint);
    });
    (0, node_test_1.it)("clears an active hint when pit is queued for that car", () => {
        const mgr = new engineer_hints_1.EngineerHintManager();
        const worn = snap({ tireWear: 0.8 });
        const raised = mgr.tick([worn], ["e1"], 0, 100, 20, false);
        strict_1.default.ok(raised.hint);
        const queued = mgr.tick([{ ...worn, pitQueued: true }], ["e1"], 0, 110, 20, true);
        strict_1.default.equal(queued.hint, null);
        strict_1.default.equal(queued.autoResumed, true);
        strict_1.default.equal(mgr.getActiveHint(), null);
    });
});
