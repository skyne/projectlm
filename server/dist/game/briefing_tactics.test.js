"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const briefing_tactics_1 = require("./briefing_tactics");
(0, node_test_1.describe)("briefing_tactics", () => {
    (0, node_test_1.it)("maps pole_attack to soft push with minimal fuel", () => {
        const t = (0, briefing_tactics_1.resolveBriefingTactics)({ carId: "c1", briefingId: "pole_attack" }, "qualifying", "Hypercar");
        strict_1.default.equal(t.compound, "soft");
        strict_1.default.equal(t.driverMode, "push");
        strict_1.default.ok(t.pitFuelLiters != null && t.pitFuelLiters < 30);
    });
    (0, node_test_1.it)("maps conserve to harvest hybrid and higher fuel stop fraction", () => {
        const t = (0, briefing_tactics_1.resolveBriefingTactics)({ carId: "c1", briefingId: "conserve" }, "race", "Hypercar");
        strict_1.default.equal(t.driverMode, "conserve");
        strict_1.default.equal(t.hybridStrategy, "harvest");
        strict_1.default.ok(t.fuelStopFraction > 0.28);
    });
    (0, node_test_1.it)("derives pole_attack for aggressive lead AI in quali", () => {
        const b = (0, briefing_tactics_1.deriveAiBriefing)("qualifying", {
            gridIndex: 0,
            teamSize: 2,
            pitAggression: 1.2,
            classId: "Hypercar",
        });
        strict_1.default.equal(b.briefingId, "pole_attack");
    });
    (0, node_test_1.it)("detects teammate on track within yield threshold", () => {
        const snap = {
            entryId: "e1",
            teamName: "Us",
            classId: "Hypercar",
            gapToLeader: 10,
            retired: false,
            inGarage: false,
        };
        const other = {
            entryId: "e2",
            teamName: "Us",
            classId: "Hypercar",
            gapToLeader: 10.2,
            retired: false,
            inGarage: false,
        };
        strict_1.default.equal((0, briefing_tactics_1.teammateOnTrackGapSec)(snap, [snap, other], 0.3), true);
        strict_1.default.equal((0, briefing_tactics_1.teammateOnTrackGapSec)(snap, [snap, other], 0.1), false);
    });
});
