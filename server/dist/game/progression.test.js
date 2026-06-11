"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const progression_1 = require("./progression");
const facilities_1 = require("./facilities");
const baseDriver = (id, name) => ({
    id,
    name,
    nationality: "GB",
    tier: "Gold",
    dryPace: 80,
    wetPace: 78,
    consistency: 80,
    overtaking: 76,
    defending: 76,
    trafficManagement: 76,
    rollingStart: 74,
    standingStart: 74,
    setupFeedback: 70,
    tireManagement: 76,
    fuelSaving: 74,
    composure: 78,
    nightPace: 74,
    rainRadar: 70,
    stamina: 78,
    adaptability: 70,
    maxStintHours: 2.5,
});
const baseStaff = (id) => ({
    id,
    role: "engineer",
    name: "Jean Dupont",
    skill: 72,
    experience: 10,
    salaryPerRace: 12000,
    morale: 80,
    assignedCarId: "car-1",
    status: "active",
});
(0, node_test_1.describe)("progression", () => {
    (0, node_test_1.it)("computes level and xp into current level", () => {
        strict_1.default.equal((0, progression_1.progressionLevel)(0), 1);
        strict_1.default.equal((0, progression_1.progressionLevel)(99), 1);
        strict_1.default.equal((0, progression_1.progressionLevel)(100), 2);
        strict_1.default.equal((0, progression_1.xpIntoCurrentLevel)(132), 32);
    });
    (0, node_test_1.it)("awards private test xp", () => {
        strict_1.default.equal((0, progression_1.driverXpForPrivateTest)(4), 32);
        strict_1.default.equal((0, progression_1.staffXpForPrivateTest)(4), 20);
    });
    (0, node_test_1.it)("applies driver level-up at 100 xp", () => {
        const drivers = [baseDriver("d1", "Marco")];
        drivers[0].progressionXp = 80;
        const { drivers: next, summary } = (0, progression_1.applyPrivateTestProgression)(drivers, [], ["d1"], [], 4);
        strict_1.default.equal(summary.drivers[0]?.xpGained, 32);
        strict_1.default.equal(next[0].progressionXp, 112);
        // Level 2 rotates to stamina (after dryPace at level 1).
        strict_1.default.ok((next[0].stamina ?? 0) > 78);
    });
    (0, node_test_1.it)("scales private test xp with joint-testing multiplier", () => {
        const drivers = [baseDriver("d1", "Marco")];
        const { summary } = (0, progression_1.applyPrivateTestProgression)(drivers, [], ["d1"], [], 4, { xpMultiplier: 1.25 });
        strict_1.default.equal(summary.drivers[0]?.xpGained, 40);
    });
    (0, node_test_1.it)("applies staff skill bump at threshold", () => {
        const staff = [baseStaff("s1")];
        staff[0].progressionXp = 85;
        const { staff: next, summary } = (0, progression_1.applyPrivateTestProgression)([], staff, [], ["s1"], 4);
        strict_1.default.equal(summary.staff[0]?.xpGained, 20);
        strict_1.default.equal(next[0].progressionXp, 105);
        // Engineer level 2 awards morale (odd levels = skill).
        strict_1.default.equal(next[0].morale, 81);
    });
    (0, node_test_1.it)("awards weekend session xp by type", () => {
        strict_1.default.ok((0, progression_1.driverXpForWeekendSession)("race") > (0, progression_1.driverXpForWeekendSession)("practice"));
        strict_1.default.ok((0, progression_1.staffXpForWeekendSession)("race") >= (0, progression_1.staffXpForWeekendSession)("qualifying"));
    });
    (0, node_test_1.it)("applies weekend progression to assigned roster", () => {
        const drivers = [baseDriver("d1", "Marco")];
        const staff = [baseStaff("s1")];
        const { summary } = (0, progression_1.applyWeekendProgression)(drivers, staff, ["d1"], ["s1"], "qualifying");
        strict_1.default.equal(summary.drivers[0]?.xpGained, (0, progression_1.driverXpForWeekendSession)("qualifying"));
        strict_1.default.equal(summary.staff[0]?.xpGained, (0, progression_1.staffXpForWeekendSession)("qualifying"));
    });
    (0, node_test_1.it)("collects weekend participants from fleet assignments", () => {
        const drivers = [baseDriver("d1", "Marco")];
        const staff = [baseStaff("s1")];
        const { driverIds, staffIds } = (0, progression_1.collectWeekendParticipants)(["car-1"], drivers, staff, { "car-1": ["d1"] });
        strict_1.default.deepEqual(driverIds, ["d1"]);
        strict_1.default.deepEqual(staffIds, ["s1"]);
    });
    (0, node_test_1.it)("runs off-week driver simulator training", () => {
        const drivers = [baseDriver("d1", "Marco")];
        const result = (0, progression_1.applyOffWeekTraining)(drivers, [], "driver_sim", { driverId: "d1" }, (0, facilities_1.defaultFacilities)());
        strict_1.default.equal(result.error, undefined);
        strict_1.default.ok(result.summary.drivers[0]?.xpGained > 0);
    });
});
