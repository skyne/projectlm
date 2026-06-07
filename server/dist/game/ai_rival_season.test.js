"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const ai_rival_season_1 = require("./ai_rival_season");
const driver_catalog_1 = require("./driver_catalog");
const repoRoot = path.resolve(process.cwd(), "..");
(0, node_test_1.describe)("ai_rival_season", () => {
    (0, node_test_1.it)("seeds rivals from the Le Mans entry list excluding the player", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        strict_1.default.equal(season.seasonYear, 2026);
        strict_1.default.ok(season.teams.length >= 20);
        strict_1.default.ok(!season.teams.some((t) => t.teamName.toLowerCase() === "skytech"));
        strict_1.default.ok(season.teams.every((t) => t.budget > 0));
        strict_1.default.ok(season.drivers.length >= 100);
    });
    (0, node_test_1.it)("awards class championship points and updates form after a race", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        const toyota = season.teams.find((t) => t.teamName.toLowerCase().includes("toyota"));
        strict_1.default.ok(toyota);
        (0, ai_rival_season_1.resolveAiSeasonTick)(season, {
            playerTeamName: "SkyTech",
            scoring: true,
            eventFormat: "6h",
            raceResults: [
                {
                    entryId: "e1",
                    teamName: toyota.teamName,
                    carNumber: "7",
                    classId: "Hypercar",
                    position: 1,
                },
                {
                    entryId: "e2",
                    teamName: "Cursor Racing",
                    carNumber: "99",
                    classId: "Hypercar",
                    position: 2,
                },
            ],
        });
        strict_1.default.equal(toyota.lastRoundPoints, 25);
        strict_1.default.equal(toyota.championshipPoints, 25);
        strict_1.default.ok(toyota.form >= 1);
        strict_1.default.ok((0, ai_rival_season_1.rivalModifiersForTeam)(toyota.teamName, season).wingDelta !== 0);
    });
    (0, node_test_1.it)("computes class positions independently of overall order", () => {
        const positions = (0, ai_rival_season_1.classPositions)([
            { entryId: "h1", teamName: "A", carNumber: "1", classId: "Hypercar", position: 1 },
            { entryId: "g1", teamName: "B", carNumber: "2", classId: "LMGT3", position: 2 },
            { entryId: "h2", teamName: "C", carNumber: "3", classId: "Hypercar", position: 3 },
        ]);
        strict_1.default.equal(positions.get("h1"), 1);
        strict_1.default.equal(positions.get("h2"), 2);
        strict_1.default.equal(positions.get("g1"), 1);
    });
    (0, node_test_1.it)("lets rich rivals remove driver market listings", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        for (const team of season.teams.slice(0, 3)) {
            team.budget = 120000000;
            team.form = 2;
        }
        const market = [
            {
                id: "wec-toyota-driver",
                source: "wec_active",
                driver: {
                    name: "Test Driver",
                    nationality: "JP",
                    tier: "Platinum",
                    dryPace: 90,
                    wetPace: 88,
                    consistency: 90,
                    overtaking: 86,
                    defending: 84,
                    trafficManagement: 88,
                    rollingStart: 86,
                    standingStart: 84,
                    setupFeedback: 82,
                    tireManagement: 86,
                    fuelSaving: 84,
                    composure: 88,
                    nightPace: 86,
                    rainRadar: 84,
                    stamina: 86,
                    maxStintHours: 3,
                },
                contractedTeam: season.teams[0].teamName,
                signingFee: 200000,
                salaryPerRace: 50000,
                tagline: "buyout",
            },
            {
                id: "prospect-1",
                source: "prospect",
                driver: {
                    name: "Prospect",
                    nationality: "FR",
                    tier: "Silver",
                    dryPace: 78,
                    wetPace: 76,
                    consistency: 80,
                    overtaking: 74,
                    defending: 72,
                    trafficManagement: 76,
                    rollingStart: 74,
                    standingStart: 72,
                    setupFeedback: 70,
                    tireManagement: 76,
                    fuelSaving: 74,
                    composure: 78,
                    nightPace: 74,
                    rainRadar: 70,
                    stamina: 76,
                    maxStintHours: 2.5,
                },
                signingFee: 80000,
                salaryPerRace: 20000,
                tagline: "prospect",
            },
        ];
        const { market: remaining, signedIds } = (0, ai_rival_season_1.resolveAiDriverMarketBids)(repoRoot, season, market, 42);
        strict_1.default.ok(signedIds.length >= 1);
        strict_1.default.ok(remaining.length < market.length);
    });
    (0, node_test_1.it)("ranks rivals by class for standings display", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        const hyper = season.teams.filter((t) => t.primaryClassId === "Hypercar");
        hyper[0].championshipPoints = 50;
        hyper[1].championshipPoints = 30;
        const top = (0, ai_rival_season_1.topRivalsByClass)(season, "Hypercar", 2);
        strict_1.default.equal(top.length, 2);
        strict_1.default.equal(top[0].championshipPoints, 50);
    });
    (0, node_test_1.it)("scales pit aggression into bounded modifier range", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        const hot = season.teams[0];
        hot.form = 3;
        hot.engineerSkill = 92;
        const cold = season.teams[1];
        cold.form = -3;
        cold.engineerSkill = 72;
        const hotMod = (0, ai_rival_season_1.rivalModifiersForTeam)(hot.teamName, season);
        const coldMod = (0, ai_rival_season_1.rivalModifiersForTeam)(cold.teamName, season);
        strict_1.default.ok(hotMod.pitAggression > coldMod.pitAggression);
        strict_1.default.ok(hotMod.pitAggression <= 1.15);
        strict_1.default.ok(coldMod.pitAggression >= 0.85);
    });
    (0, node_test_1.it)("awards drivers championship points to full entry rosters", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        (0, ai_rival_season_1.resolveDriverChampionshipTick)(season, {
            repoRoot,
            scoring: true,
            playerTeamName: "SkyTech",
            playerRoster: [],
            playerFleet: [],
            raceResults: [
                {
                    entryId: "toyota-7",
                    teamName: "Toyota Racing",
                    carNumber: "7",
                    classId: "Hypercar",
                    position: 1,
                },
            ],
        });
        const buemi = season.drivers.find((d) => d.name.includes("Buemi"));
        strict_1.default.ok(buemi);
        strict_1.default.equal(buemi.lastRoundPoints, 25);
        strict_1.default.equal(buemi.championshipPoints, 25);
        strict_1.default.equal(season.drivers.filter((d) => d.teamName === "Toyota Racing" && d.lastRoundPoints === 25).length, 3);
        const top = (0, ai_rival_season_1.topDriversByClass)(season, "Hypercar", 3);
        strict_1.default.equal(top.length, 3);
        strict_1.default.ok(top.every((d) => d.championshipPoints === 25));
    });
    (0, node_test_1.it)("marks player roster drivers in standings and scores them", () => {
        const playerDriver = {
            name: "Alex Test",
            nationality: "GB",
            tier: "Gold",
            dryPace: 85,
            wetPace: 82,
            consistency: 84,
            overtaking: 80,
            defending: 78,
            trafficManagement: 80,
            rollingStart: 78,
            standingStart: 76,
            setupFeedback: 74,
            tireManagement: 80,
            fuelSaving: 78,
            composure: 82,
            nightPace: 78,
            rainRadar: 76,
            stamina: 80,
            maxStintHours: 3,
        };
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        const playerFleet = [
            {
                id: "car-1",
                carNumber: "42",
                classId: "Hypercar",
                affiliation: "privateer",
                acquisition: "privateer",
                build: { carName: "SkyTech 42" },
                carConfigPath: "configs/runtime/test.txt",
                assignedDriverIndices: [0],
            },
        ];
        (0, ai_rival_season_1.syncPlayerDriversToStandings)(season, "SkyTech", [playerDriver], playerFleet);
        const key = (0, ai_rival_season_1.driverIdentityKey)(playerDriver.name, playerDriver.nationality);
        const row = season.drivers.find((d) => d.driverKey === key);
        strict_1.default.ok(row?.isPlayerDriver);
        (0, ai_rival_season_1.resolveDriverChampionshipTick)(season, {
            repoRoot,
            scoring: true,
            playerTeamName: "SkyTech",
            playerRoster: [playerDriver],
            playerFleet,
            raceResults: [
                {
                    entryId: "h1",
                    teamName: "A",
                    carNumber: "1",
                    classId: "Hypercar",
                    position: 1,
                },
                {
                    entryId: "h2",
                    teamName: "B",
                    carNumber: "2",
                    classId: "Hypercar",
                    position: 2,
                },
                {
                    entryId: "player-1",
                    teamName: "SkyTech",
                    carNumber: "42",
                    classId: "Hypercar",
                    position: 5,
                },
            ],
        });
        strict_1.default.equal(row.championshipPoints, 15);
    });
    (0, node_test_1.it)("records player team in rival standings after a round", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        (0, ai_rival_season_1.applyPlayerTeamRoundResult)(season, "SkyTech", "LMP2", 18);
        const player = season.teams.find((t) => t.isPlayerTeam);
        strict_1.default.ok(player);
        strict_1.default.equal(player.championshipPoints, 18);
        strict_1.default.equal(player.primaryClassId, "LMP2");
    });
    (0, node_test_1.it)("writes AI market signings into runtime roster overrides", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        for (const team of season.teams)
            team.budget = 1000000;
        const toyota = season.teams.find((t) => t.teamName === "Toyota Racing");
        strict_1.default.ok(toyota);
        toyota.budget = 120000000;
        toyota.form = 3;
        const market = [
            {
                id: "wec-toyota-new",
                source: "wec_active",
                contractedTeam: "Toyota Racing",
                driver: {
                    name: "Signed Prospect",
                    nationality: "FR",
                    tier: "Gold",
                    dryPace: 85,
                    wetPace: 82,
                    consistency: 84,
                    overtaking: 80,
                    defending: 78,
                    trafficManagement: 80,
                    rollingStart: 78,
                    standingStart: 76,
                    setupFeedback: 74,
                    tireManagement: 80,
                    fuelSaving: 78,
                    composure: 82,
                    nightPace: 78,
                    rainRadar: 76,
                    stamina: 80,
                    maxStintHours: 3,
                },
                signingFee: 100000,
                salaryPerRace: 30000,
                tagline: "buyout",
            },
        ];
        const { signedIds } = (0, ai_rival_season_1.resolveAiDriverMarketBids)(repoRoot, season, market, 42);
        strict_1.default.ok(signedIds.includes("wec-toyota-new"));
        const key = "Toyota Racing#7";
        strict_1.default.ok(season.rosterOverrides?.[key]?.some((d) => d.name === "Signed Prospect"));
        const rel = (0, driver_catalog_1.exportRuntimeDrivers)(repoRoot, {
            rosterOverrides: season.rosterOverrides,
        });
        const abs = path.join(repoRoot, rel);
        const text = fs.readFileSync(abs, "utf8");
        strict_1.default.ok(text.includes("Signed Prospect"));
    });
    (0, node_test_1.it)("builds off-week headline and narrative events", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        const toyota = season.teams.find((t) => t.teamName.toLowerCase().includes("toyota"));
        strict_1.default.ok(toyota);
        (0, ai_rival_season_1.resolveAiSeasonTick)(season, {
            playerTeamName: "SkyTech",
            scoring: true,
            eventFormat: "6h",
            raceResults: [
                {
                    entryId: "e1",
                    teamName: toyota.teamName,
                    carNumber: "7",
                    classId: "Hypercar",
                    position: 1,
                },
            ],
        });
        strict_1.default.ok((season.lastOffWeekEvents?.length ?? 0) >= 2);
        strict_1.default.ok(season.lastOffWeekEvents?.some((e) => e.type === "points"));
        strict_1.default.ok(season.lastOffWeekEvents?.some((e) => e.type === "standings"));
        for (const team of season.teams)
            team.budget = 1000000;
        toyota.budget = 120000000;
        toyota.form = 3;
        (0, ai_rival_season_1.resolveAiDriverMarketBids)(repoRoot, season, [
            {
                id: "wec-toyota-new",
                source: "wec_active",
                contractedTeam: "Toyota Racing",
                driver: {
                    name: "Narrative Prospect",
                    nationality: "FR",
                    tier: "Gold",
                    dryPace: 85,
                    wetPace: 82,
                    consistency: 84,
                    overtaking: 80,
                    defending: 78,
                    trafficManagement: 80,
                    rollingStart: 78,
                    standingStart: 76,
                    setupFeedback: 74,
                    tireManagement: 80,
                    fuelSaving: 78,
                    composure: 82,
                    nightPace: 78,
                    rainRadar: 76,
                    stamina: 80,
                    maxStintHours: 3,
                },
                signingFee: 100000,
                salaryPerRace: 30000,
                tagline: "buyout",
            },
        ], 42);
        strict_1.default.ok(season.lastOffWeekHeadline);
        strict_1.default.ok(season.lastOffWeekEvents?.some((e) => e.type === "market"));
        strict_1.default.ok((0, ai_rival_season_1.buildOffWeekHeadline)(season).length > 0);
    });
});
