"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const economy_1 = require("./economy");
(0, node_test_1.describe)("experimental race finances", () => {
    (0, node_test_1.it)("pays appearance and media exposure but no points or prize money", () => {
        const fin = (0, economy_1.computeRaceFinances)(1, "Hypercar", "6h", [], [], {
            scoring: true,
            entryMode: "experimental",
            racePosition: 8,
        });
        strict_1.default.equal(fin.prizeMoney, 0);
        strict_1.default.equal(fin.championshipPoints, 0);
        strict_1.default.ok(fin.appearanceFee > 0);
        strict_1.default.ok(fin.netEarnings > 0);
        strict_1.default.ok(fin.rdPointsEarned >= 0);
    });
    (0, node_test_1.it)("still awards championship points for homologated entries", () => {
        const fin = (0, economy_1.computeRaceFinances)(1, "Hypercar", "6h", [], [], {
            scoring: true,
            entryMode: "homologated",
        });
        strict_1.default.ok(fin.championshipPoints > 0);
        strict_1.default.ok(fin.prizeMoney > 0);
    });
});
