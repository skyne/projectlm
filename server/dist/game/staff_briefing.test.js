"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const staff_briefing_1 = require("./staff_briefing");
(0, node_test_1.describe)("staff_briefing", () => {
    (0, node_test_1.it)("lowers yield threshold as strategist skill rises", () => {
        const low = (0, staff_briefing_1.teammateYieldThresholdSec)(20);
        const high = (0, staff_briefing_1.teammateYieldThresholdSec)(90);
        strict_1.default.ok(low > high);
        strict_1.default.ok(low <= 0.8);
        strict_1.default.ok(high >= 0.15);
    });
    (0, node_test_1.it)("reads assigned strategist skill per car", () => {
        const skill = (0, staff_briefing_1.strategistSkillFromStaff)([
            {
                id: "s1",
                role: "strategist",
                name: "A",
                skill: 80,
                experience: 1,
                salaryPerRace: 1,
                morale: 1,
                assignedCarId: "car-a",
                status: "active",
            },
            {
                id: "s2",
                role: "strategist",
                name: "B",
                skill: 40,
                experience: 1,
                salaryPerRace: 1,
                morale: 1,
                assignedCarId: "car-b",
                status: "active",
            },
        ], "car-a");
        strict_1.default.equal(skill, 80);
    });
    (0, node_test_1.it)("shortens support release delay with higher skill", () => {
        strict_1.default.ok((0, staff_briefing_1.teammateSupportReleaseDelaySec)(90) < (0, staff_briefing_1.teammateSupportReleaseDelaySec)(30));
    });
});
