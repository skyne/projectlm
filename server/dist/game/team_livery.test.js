"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const team_livery_1 = require("./team_livery");
(0, node_test_1.describe)("team_livery", () => {
    (0, node_test_1.it)("normalizes colors and pattern", () => {
        const livery = (0, team_livery_1.normalizeTeamLivery)({
            primary: "#112233",
            secondary: "#aabbcc",
            pattern: "dual_stripe",
        });
        strict_1.default.ok(livery);
        strict_1.default.equal(livery.pattern, "dual_stripe");
        strict_1.default.equal(livery.logoDataUrl, null);
    });
    (0, node_test_1.it)("rejects invalid colors and oversized logos", () => {
        strict_1.default.equal((0, team_livery_1.normalizeTeamLivery)({ primary: "red", secondary: "#fff" }), null);
        const huge = `data:image/png;base64,${"A".repeat(100000)}`;
        strict_1.default.equal((0, team_livery_1.isValidLogoDataUrl)(huge), false);
        const tiny = "data:image/png;base64,AAAA";
        strict_1.default.equal((0, team_livery_1.isValidLogoDataUrl)(tiny), true);
    });
});
