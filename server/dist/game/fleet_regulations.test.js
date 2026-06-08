"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const fleet_1 = require("./fleet");
const catalog_1 = require("./catalog");
const path_1 = __importDefault(require("path"));
const repoRoot = path_1.default.resolve(__dirname, "../../..");
function car(id, classId, opts = {}) {
    const raw = (0, catalog_1.defaultBuildForClass)(repoRoot, classId);
    const build = {
        carName: `Car ${id}`,
        chassis_type: raw?.chassis_type ?? "LMDhDallara",
        front_aero_type: raw?.front_aero_type ?? "LowDragNose",
        rear_aero_type: raw?.rear_aero_type ?? "StandardWing",
        cooling_pack: raw?.cooling_pack ?? "EnduranceHeavyDuty",
        wheel_package: raw?.wheel_package ?? "Hypercar18Standard",
        suspension_layout: raw?.suspension_layout ?? "PushrodDoubleWishbone",
        fuel_system: raw?.fuel_system ?? "LeMans110L",
        brake_system: raw?.brake_system ?? "BremboHypercar",
        transmission: raw?.transmission ?? "XtracP1359",
        hybrid_system: raw?.hybrid_system ?? "LMDh50kW",
    };
    return {
        id,
        carNumber: id.replace("car-", ""),
        classId,
        affiliation: "manufacturer",
        acquisition: "build",
        build,
        carConfigPath: `configs/runtime/fleet/${id}.txt`,
        ...opts,
    };
}
(0, node_test_1.describe)("experimental fleet regulations", () => {
    (0, node_test_1.it)("allows homologated and experimental programmes in the same class", () => {
        const hom = car("car-1", "LMP2", { classId: "LMP2" });
        const expBuild = { ...hom.build, front_aero_type: "HighDownforceSplitter" };
        const exp = car("car-2", "LMP2", {
            classId: "LMP2",
            entryMode: "experimental",
            experimentalProgramId: "exp-lmp2-1",
            build: expBuild,
            carNumber: "2",
        });
        strict_1.default.equal((0, fleet_1.validateFleetRegulations)([hom, exp]), null);
    });
    (0, node_test_1.it)("rejects experimental design matching homologated spec", () => {
        const hom = car("car-1", "LMP2", { classId: "LMP2" });
        const exp = car("car-2", "LMP2", {
            classId: "LMP2",
            entryMode: "experimental",
            experimentalProgramId: "exp-lmp2-1",
            build: { ...hom.build },
            carNumber: "2",
        });
        const err = (0, fleet_1.validateFleetRegulations)([hom, exp]);
        strict_1.default.ok(err?.includes("different design"));
    });
    (0, node_test_1.it)("requires identical builds within experimental programme", () => {
        const exp1 = car("car-1", "LMP2", {
            entryMode: "experimental",
            experimentalProgramId: "exp-lmp2",
            classId: "LMP2",
        });
        const exp2 = car("car-2", "LMP2", {
            entryMode: "experimental",
            experimentalProgramId: "exp-lmp2",
            classId: "LMP2",
            carNumber: "2",
            build: { ...exp1.build, rear_aero_type: "HighDownforceWingPlus" },
        });
        const err = (0, fleet_1.validateFleetRegulations)([exp1, exp2]);
        strict_1.default.ok(err?.includes("EXP"));
    });
});
