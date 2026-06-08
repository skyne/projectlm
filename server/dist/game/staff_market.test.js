"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const staff_1 = require("./staff");
const economy_1 = require("./economy");
const staff_market_1 = require("./staff_market");
(0, node_test_1.describe)("staff market", () => {
    (0, node_test_1.it)("builds varied listings with creative names", () => {
        const seed = (0, staff_market_1.staffMarketSeedForRound)("Audi SkyTech", 3, 0);
        const market = (0, staff_market_1.buildStaffMarket)({ seed, existingStaff: [] });
        strict_1.default.ok(market.length >= 20);
        const names = new Set(market.map((l) => l.name));
        strict_1.default.equal(names.size, market.length);
        strict_1.default.ok(market.some((l) => l.source === "veteran"));
        strict_1.default.ok(market.some((l) => l.traits.length > 0));
    });
    (0, node_test_1.it)("signs into the first vacant car slot", () => {
        const staff = [
            {
                id: "staff-engineer-car1",
                role: "engineer",
                name: "Luca Rossi",
                skill: 80,
                experience: 10,
                salaryPerRace: 40000,
                morale: 80,
                assignedCarId: "car-1",
                status: "active",
            },
            {
                id: "staff-mechanic-car1",
                role: "mechanic",
                name: "Marcus Webb",
                skill: 78,
                experience: 8,
                salaryPerRace: 36000,
                morale: 80,
                assignedCarId: "car-1",
                status: "active",
            },
            {
                id: "staff-junior-mechanic-car-2",
                role: "mechanic",
                name: "Junior Mechanic",
                skill: 58,
                experience: 0,
                salaryPerRace: 28000,
                morale: 70,
                assignedCarId: "car-2",
                status: "active",
            },
        ];
        const vacant = (0, staff_1.findVacantCarsForRole)(["car-1", "car-2"], staff, "mechanic");
        strict_1.default.deepEqual(vacant, ["car-2"]);
        strict_1.default.ok((0, staff_1.isJuniorPlaceholder)(staff[2]));
        strict_1.default.ok(!(0, staff_1.isStaffSlotFilled)(staff[2]));
        const listing = (0, staff_market_1.buildStaffMarket)({ seed: 42, existingStaff: staff })[0];
        const found = (0, staff_market_1.findStaffMarketListing)((0, staff_market_1.buildStaffMarket)({ seed: 42, existingStaff: staff }), listing.id);
        strict_1.default.ok(found);
        const next = (0, staff_1.assignStaffToCar)(staff, "car-2", {
            role: "mechanic",
            name: found.name,
            skill: found.skill,
            experience: found.experience,
            salaryPerRace: found.salaryPerRace,
            morale: found.morale,
            traits: found.traits,
        });
        const hired = next.find((m) => m.role === "mechanic" && m.assignedCarId === "car-2");
        strict_1.default.ok(hired);
        strict_1.default.equal(hired.name, found.name);
        strict_1.default.ok((0, staff_1.isStaffSlotFilled)(hired));
    });
    (0, node_test_1.it)("replaces an incumbent crew member on assign", () => {
        const staff = [
            {
                id: "staff-engineer-car-1",
                role: "engineer",
                name: "Luca Rossi",
                skill: 80,
                experience: 10,
                salaryPerRace: 40000,
                morale: 80,
                assignedCarId: "car-1",
                status: "active",
            },
        ];
        strict_1.default.deepEqual((0, staff_1.findVacantCarsForRole)(["car-1"], staff, "engineer"), []);
        const listing = (0, staff_market_1.buildStaffMarket)({ seed: 7, existingStaff: staff }).find((l) => l.role === "engineer");
        const severance = (0, economy_1.staffSeveranceCost)(staff[0]);
        strict_1.default.equal(severance, 80000);
        const next = (0, staff_1.assignStaffToCar)(staff, "car-1", {
            role: listing.role,
            name: listing.name,
            skill: listing.skill,
            experience: listing.experience,
            salaryPerRace: listing.salaryPerRace,
            morale: listing.morale,
            traits: listing.traits,
        });
        const replaced = next.find((m) => m.role === "engineer" && m.assignedCarId === "car-1");
        strict_1.default.ok(replaced);
        strict_1.default.equal(replaced.name, listing.name);
        strict_1.default.notEqual(replaced.name, "Luca Rossi");
    });
});
