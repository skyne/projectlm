"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const facilities_1 = require("./facilities");
(0, node_test_1.describe)("facilities", () => {
    (0, node_test_1.it)("defaults all facilities to tier 0", () => {
        const fac = (0, facilities_1.defaultFacilities)();
        strict_1.default.equal(fac.length, 5);
        strict_1.default.ok(fac.every((f) => f.tier === 0));
    });
    (0, node_test_1.it)("gates chassis dev on carbon fab + design studio", () => {
        const fac = (0, facilities_1.defaultFacilities)();
        strict_1.default.equal((0, facilities_1.canDevelopCategory)(fac, "chassis"), false);
        const built = fac.map((f) => f.id === "carbon_fab" || f.id === "design_studio"
            ? { ...f, tier: 1 }
            : f);
        strict_1.default.equal((0, facilities_1.canDevelopCategory)(built, "chassis"), true);
    });
    (0, node_test_1.it)("boosts training with wind tunnel and dyno", () => {
        const base = (0, facilities_1.facilityTrainingMultiplier)((0, facilities_1.defaultFacilities)());
        const built = (0, facilities_1.defaultFacilities)().map((f) => f.id === "wind_tunnel" || f.id === "dyno_cell" ? { ...f, tier: 1 } : f);
        strict_1.default.ok((0, facilities_1.facilityTrainingMultiplier)(built) > base);
    });
});
