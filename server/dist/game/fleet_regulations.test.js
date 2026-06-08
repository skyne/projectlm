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
(0, node_test_1.describe)("fleet programme grouping", () => {
    (0, node_test_1.it)("treats homologated and experimental hypercars as separate programmes", () => {
        const hom = car("car-1", "Hypercar");
        const exp = car("car-2", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc",
            carNumber: "2",
        });
        strict_1.default.equal((0, fleet_1.sameFleetProgramme)(hom, exp), false);
        strict_1.default.equal((0, fleet_1.sameFleetProgramme)(hom, hom), true);
        strict_1.default.equal((0, fleet_1.sameFleetProgramme)(exp, exp), true);
    });
});
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
    (0, node_test_1.it)("allows one EXP Hypercar for manufacturers with two homologated Hypercars", () => {
        const hom1 = car("car-1", "Hypercar");
        const hom2 = car("car-2", "Hypercar", {
            carNumber: "2",
            build: { ...hom1.build },
        });
        const expBuild = { ...hom1.build, front_aero_type: "HighDownforceSplitter" };
        const exp = car("car-3", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc-1",
            build: expBuild,
            carNumber: "3",
        });
        strict_1.default.equal((0, fleet_1.validateFleetRegulations)([hom1, hom2, exp]), null);
    });
    (0, node_test_1.it)("allows standalone two-car EXP Hypercar without homologated programme", () => {
        const expBuild = {
            ...car("car-1", "Hypercar").build,
            front_aero_type: "HighDownforceSplitter",
        };
        const exp1 = car("car-1", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc-standalone",
            build: expBuild,
        });
        const exp2 = car("car-2", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc-standalone",
            build: expBuild,
            carNumber: "2",
        });
        strict_1.default.equal((0, fleet_1.validateFleetRegulations)([exp1, exp2]), null);
    });
    (0, node_test_1.it)("rejects standalone EXP Hypercar with only one car", () => {
        const exp = car("car-1", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc-standalone",
            build: {
                ...car("car-1", "Hypercar").build,
                front_aero_type: "HighDownforceSplitter",
            },
        });
        const err = (0, fleet_1.validateFleetRegulations)([exp]);
        strict_1.default.ok(err?.includes("at least 2"));
    });
    (0, node_test_1.it)("rejects EXP Hypercar while homologated manufacturer programme is incomplete", () => {
        const hom = car("car-1", "Hypercar");
        const exp = car("car-2", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc-1",
            build: { ...hom.build, front_aero_type: "HighDownforceSplitter" },
            carNumber: "2",
        });
        const err = (0, fleet_1.validateFleetRegulations)([hom, exp]);
        strict_1.default.ok(err?.includes("Complete your homologated Hypercar programme"));
    });
    (0, node_test_1.it)("rejects more than one EXP Hypercar for manufacturers", () => {
        const hom1 = car("car-1", "Hypercar");
        const hom2 = car("car-2", "Hypercar", {
            carNumber: "2",
            build: { ...hom1.build },
        });
        const expBuild = { ...hom1.build, front_aero_type: "HighDownforceSplitter" };
        const exp1 = car("car-3", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc-1",
            build: expBuild,
            carNumber: "3",
        });
        const exp2 = car("car-4", "Hypercar", {
            entryMode: "experimental",
            experimentalProgramId: "exp-hc-1",
            build: expBuild,
            carNumber: "4",
        });
        const err = (0, fleet_1.validateFleetRegulations)([hom1, hom2, exp1, exp2]);
        strict_1.default.ok(err?.includes("At most 1 experimental Hypercar"));
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
