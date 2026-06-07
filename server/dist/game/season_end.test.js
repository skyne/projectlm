"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const season_end_1 = require("./season_end");
function meta(partial) {
    return {
        teamName: "Test Team",
        budget: 1000000,
        rdPoints: 100,
        playerEntryId: "entry-1",
        seasonYear: 2026,
        currentRound: 8,
        staff: [],
        unlockedParts: [],
        calendar: [],
        setupComplete: true,
        ...partial,
    };
}
(0, node_test_1.describe)("season_end", () => {
    (0, node_test_1.it)("detects a finished scoring calendar", () => {
        const calendar = [
            { round: 0, trackId: "paul_ricard", format: "test", eventType: "test", completed: false, championshipPoints: 0 },
            { round: 1, trackId: "imola", format: "6h", eventType: "race", completed: true, championshipPoints: 25 },
            { round: 2, trackId: "spa", format: "6h", eventType: "race", completed: true, championshipPoints: 18 },
        ];
        strict_1.default.equal((0, season_end_1.isSeasonCalendarComplete)(calendar), true);
        strict_1.default.equal((0, season_end_1.isSeasonCalendarComplete)([{ ...calendar[1], completed: false }]), false);
    });
    (0, node_test_1.it)("builds class standings and player positions", () => {
        const summary = (0, season_end_1.buildSeasonSummary)(meta({
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
                        championshipPoints: 50,
                        racesScored: 2,
                        arc: null,
                        lastRoundPoints: 0,
                        driversSigned: 0,
                    },
                    {
                        teamName: "Test Team",
                        primaryClassId: "Hypercar",
                        budget: 1,
                        rdTier: 1,
                        engineerSkill: 80,
                        form: 0,
                        championshipPoints: 12,
                        racesScored: 1,
                        arc: "underdog",
                        lastRoundPoints: 12,
                        driversSigned: 0,
                        isPlayerTeam: true,
                    },
                ],
                drivers: [],
            },
        }));
        strict_1.default.ok(summary);
        strict_1.default.equal(summary.playerTeamPositions.Hypercar, 2);
        strict_1.default.equal(summary.teamStandings.Hypercar[0].teamName, "Toyota");
    });
    (0, node_test_1.it)("computes scaled championship payouts and completion bonus", () => {
        const summary = (0, season_end_1.buildSeasonSummary)(meta({
            calendar: [
                { round: 1, trackId: "imola", format: "6h", eventType: "race", completed: true, championshipPoints: 12 },
            ],
            aiRivalSeason: {
                seasonYear: 2026,
                teams: [
                    {
                        teamName: "Test Team",
                        primaryClassId: "Hypercar",
                        budget: 1,
                        rdTier: 1,
                        engineerSkill: 80,
                        form: 0,
                        championshipPoints: 12,
                        racesScored: 1,
                        arc: null,
                        lastRoundPoints: 12,
                        driversSigned: 0,
                        isPlayerTeam: true,
                    },
                ],
                drivers: [],
            },
        }));
        const { totalPayout, payouts } = (0, season_end_1.computeSeasonEndPayouts)(meta({ calendar: summary ? [{ round: 1, trackId: "imola", format: "6h", eventType: "race", completed: true, championshipPoints: 12 }] : [] }), summary);
        strict_1.default.equal((0, season_end_1.computeTeamChampionshipPayout)(2, "Hypercar"), 2000000);
        strict_1.default.ok(totalPayout >= 2000000 + 500000);
        strict_1.default.ok(payouts.some((p) => p.label.includes("completion bonus")));
    });
    (0, node_test_1.it)("finalizes a full summary with payout lines", () => {
        const finalized = (0, season_end_1.finalizeSeasonSummary)(meta({
            calendar: [
                { round: 1, trackId: "imola", format: "6h", eventType: "race", completed: true, championshipPoints: 25 },
            ],
            aiRivalSeason: {
                seasonYear: 2026,
                teams: [
                    {
                        teamName: "Test Team",
                        primaryClassId: "Hypercar",
                        budget: 1,
                        rdTier: 1,
                        engineerSkill: 80,
                        form: 0,
                        championshipPoints: 25,
                        racesScored: 1,
                        arc: null,
                        lastRoundPoints: 25,
                        driversSigned: 0,
                        isPlayerTeam: true,
                    },
                ],
                drivers: [],
            },
        }));
        strict_1.default.ok(finalized);
        strict_1.default.equal(finalized.playerTeamPositions.Hypercar, 1);
        strict_1.default.ok(finalized.totalPayout > 0);
    });
});
