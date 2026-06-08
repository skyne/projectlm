"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const meta_state_1 = require("./meta_state");
function meta(partial) {
    return {
        teamName: "Test Team",
        budget: 1000000,
        rdPoints: 100,
        playerEntryId: "entry-1",
        seasonYear: 2026,
        currentRound: 0,
        staff: [],
        unlockedParts: ["tire.Medium"],
        calendar: [
            {
                round: 1,
                trackId: "imola",
                format: "6h",
                eventType: "race",
                completed: true,
                championshipPoints: 25,
                prizeMoney: 50000,
                rdPointsEarned: 5,
            },
        ],
        setupComplete: true,
        fleet: [],
        driverRoster: [],
        driverMarket: [],
        aiRivalSeason: {
            seasonYear: 2026,
            teams: [
                {
                    teamName: "Toyota",
                    primaryClassId: "Hypercar",
                    budget: 1,
                    rdTier: 1,
                    engineerSkill: 80,
                    form: 0,
                    championshipPoints: 25,
                    racesScored: 1,
                    arc: null,
                    lastRoundPoints: 25,
                    driversSigned: 2,
                },
            ],
            drivers: [],
        },
        ...partial,
    };
}
(0, node_test_1.describe)("buildSeasonStartSnapshot", () => {
    (0, node_test_1.it)("captures season-start career state including AI rivals", () => {
        const state = meta({ budget: 2500000, currentRound: 2 });
        const snap = (0, meta_state_1.buildSeasonStartSnapshot)(state);
        strict_1.default.equal(snap.seasonYear, 2026);
        strict_1.default.equal(snap.budget, 2500000);
        strict_1.default.equal(snap.currentRound, 2);
        strict_1.default.equal(snap.aiRivalSeason.teams[0].championshipPoints, 25);
        strict_1.default.equal(snap.calendar[0].completed, true);
        strict_1.default.notEqual(snap.calendar, state.calendar);
        strict_1.default.notEqual(snap.aiRivalSeason, state.aiRivalSeason);
    });
});
