"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_path_1 = __importDefault(require("node:path"));
const driver_market_1 = require("./driver_market");
const driver_catalog_1 = require("./driver_catalog");
const REPO_ROOT = node_path_1.default.resolve(__dirname, "../../..");
(0, node_test_1.describe)("driver_market", () => {
    (0, node_test_1.it)("scales roster cap with fleet size", () => {
        strict_1.default.equal((0, driver_market_1.maxDriverRosterForFleet)(1), 6);
        strict_1.default.equal((0, driver_market_1.maxDriverRosterForFleet)(5), 25);
        strict_1.default.ok((0, driver_market_1.driverRosterCapMessage)(5).includes("25"));
        strict_1.default.ok((0, driver_market_1.driverRosterCapMessage)(5).includes("4 per car"));
    });
    (0, node_test_1.it)("lists real free agents from 2025 grids ahead of random prospects", () => {
        const market = (0, driver_market_1.buildDriverMarket)(REPO_ROOT, {
            seed: 424242,
            playerTeamName: "Player Team",
            existingRoster: [],
        });
        const freeAgents = market.filter((l) => l.source === "free_agent");
        const prospects = market.filter((l) => l.source === "prospect");
        strict_1.default.ok(freeAgents.length >= 10);
        strict_1.default.ok(prospects.length <= 4);
        const names = new Set(freeAgents.map((l) => l.driver.name));
        strict_1.default.ok(names.has("Sarah Bovy"));
        strict_1.default.ok(names.has("Michelle Gatting"));
        strict_1.default.ok(names.has("Rahel Frey"));
        const catalogIds = new Set((0, driver_catalog_1.listWecCatalogDriverIds)(REPO_ROOT));
        for (const listing of freeAgents) {
            strict_1.default.ok(!catalogIds.has(listing.driver.id));
            strict_1.default.ok(listing.tagline.length > 0);
        }
    });
    (0, node_test_1.it)("prioritises female free agents in the market shuffle", () => {
        const market = (0, driver_market_1.buildDriverMarket)(REPO_ROOT, {
            seed: 777,
            playerTeamName: "Player Team",
            existingRoster: [],
        });
        const freeAgents = market.filter((l) => l.source === "free_agent");
        const femaleCount = freeAgents.filter((l) => l.driver.gender === "female").length;
        strict_1.default.ok(femaleCount >= 5);
    });
});
