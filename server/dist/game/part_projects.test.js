"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const facilities_1 = require("./facilities");
const part_instances_1 = require("./part_instances");
const part_projects_1 = require("./part_projects");
(0, node_test_1.describe)("part_projects", () => {
    const part = (0, part_instances_1.newPartInstance)("wing.hyper", "rear_aero", "aero", "inhouse");
    (0, node_test_1.it)("rejects without facility", () => {
        const err = (0, part_projects_1.validatePartProject)(part, (0, facilities_1.defaultFacilities)(), part_projects_1.PART_PROJECT_RD_COST, 100000, "performance");
        strict_1.default.match(err ?? "", /facility/i);
    });
    (0, node_test_1.it)("applies performance focus with engineer skill", () => {
        const facilities = (0, facilities_1.defaultFacilities)().map((f) => f.id === "wind_tunnel" ? { ...f, tier: 1 } : f);
        strict_1.default.equal((0, part_projects_1.validatePartProject)(part, facilities, part_projects_1.PART_PROJECT_RD_COST, 100000, "performance"), null);
        const next = (0, part_projects_1.applyPartProject)(part, "performance", 90);
        strict_1.default.ok(next.performanceMaturity > part.performanceMaturity);
    });
});
