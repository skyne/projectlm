"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const sponsor_appeal_1 = require("./sponsor_appeal");
function driver(id, gender) {
    return {
        id,
        name: id,
        nationality: "GB",
        tier: "Gold",
        gender,
        dryPace: 80,
        wetPace: 78,
        consistency: 80,
        overtaking: 75,
        defending: 75,
        trafficManagement: 75,
        rollingStart: 74,
        standingStart: 74,
        setupFeedback: 72,
        tireManagement: 76,
        fuelSaving: 74,
        composure: 78,
        nightPace: 76,
        rainRadar: 70,
        stamina: 80,
        maxStintHours: 3,
    };
}
(0, node_test_1.describe)("computeCarSponsorAppeal", () => {
    (0, node_test_1.it)("returns 1.0 multiplier with no gender data", () => {
        const r = (0, sponsor_appeal_1.computeCarSponsorAppeal)(["a", "b"], [driver("a"), driver("b")], []);
        strict_1.default.equal(r.multiplier, 1);
        strict_1.default.equal(r.lines.length, 0);
    });
    (0, node_test_1.it)("adds per-female-driver enthusiasm", () => {
        const r = (0, sponsor_appeal_1.computeCarSponsorAppeal)(["a"], [driver("a", "female")], []);
        strict_1.default.ok(r.multiplier > 1);
        strict_1.default.equal(r.lines[0]?.label.includes("female"), true);
    });
    (0, node_test_1.it)("stacks all-female lineup bonus when every driver is female", () => {
        const roster = [driver("a", "female"), driver("b", "female")];
        const r = (0, sponsor_appeal_1.computeCarSponsorAppeal)(["a", "b"], roster, []);
        strict_1.default.ok(r.multiplier >= 1.14);
        strict_1.default.ok(r.lines.some((l) => l.label.includes("All-female")));
    });
    (0, node_test_1.it)("adds staff alignment bonus", () => {
        const staff = [
            { role: "engineer", name: "E", skill: 80, gender: "female" },
            { role: "strategist", name: "S", skill: 75, gender: "female" },
            { role: "mechanic", name: "M", skill: 70, gender: "female" },
        ];
        const r = (0, sponsor_appeal_1.computeCarSponsorAppeal)(["a", "b"], [driver("a", "male"), driver("b", "male")], staff);
        strict_1.default.ok(r.lines.some((l) => l.label.includes("crew")));
    });
});
(0, node_test_1.describe)("applySponsorAppeal", () => {
    (0, node_test_1.it)("rounds inflated sponsor income", () => {
        strict_1.default.equal((0, sponsor_appeal_1.applySponsorAppeal)(50000, 1.08), 54000);
    });
});
