"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_path_1 = __importDefault(require("node:path"));
const catalog_1 = require("./catalog");
const part_compatibility_1 = require("./part_compatibility");
const repoRoot = node_path_1.default.resolve(process.cwd(), "..");
const baseBuild = () => ({
    carName: "Test",
    chassis_type: "LMDhDallara",
    front_aero_type: "LowDragNose",
    rear_aero_type: "StandardWing",
    diffuser_type: "StockFloor",
    exhaust_type: "TwinOutletSide",
    cooling_pack: "EnduranceHeavyDuty",
    wheel_package: "Hypercar18Standard",
    suspension_layout: "PushrodDoubleWishbone",
    fuel_system: "LeMans110L",
    brake_system: "BremboHypercar",
    transmission: "XtracP1359",
    hybrid_system: "LMDh50kW",
    engine: {
        engine_layout: "V8",
        fuel_type: "Gasoline",
        cylinders: 8,
        bore: 0.095,
        stroke: 0.078,
        max_rpm: 8500,
        peak_torque_nm: 650,
        peak_torque_rpm: 6500,
        base_vibration: 1.0,
        aspiration: "TwinTurbo",
        drivetrain: "RWD",
    },
});
(0, node_test_1.describe)("exhaust_diffuser catalog and compatibility", () => {
    const rules = (0, part_compatibility_1.loadAssemblyRules)(repoRoot);
    const catalog = (0, catalog_1.loadGameCatalog)(repoRoot);
    (0, node_test_1.it)("loads diffuser and exhaust parts", () => {
        strict_1.default.ok(catalog.partsBySlot.diffuser.length >= 8);
        strict_1.default.ok(catalog.partsBySlot.exhaust.length >= 8);
        strict_1.default.ok(catalog.partsBySlot.diffuser.some((p) => p.partType === "HighDownforceDiffuser"));
        strict_1.default.ok(catalog.partsBySlot.exhaust.some((p) => p.partType === "BlownDiffuser"));
    });
    (0, node_test_1.it)("wingless rear rejects stock floor and accepts floor diffusers", () => {
        const stockErr = (0, part_compatibility_1.validateAssemblyCompatibility)({
            ...baseBuild(),
            rear_aero_type: "WinglessGroundEffect",
            diffuser_type: "StockFloor",
        }, rules);
        strict_1.default.match(stockErr ?? "", /diffuser floor|not compatible with StockFloor/i);
        const floorErr = (0, part_compatibility_1.validateAssemblyCompatibility)({
            ...baseBuild(),
            rear_aero_type: "WinglessGroundEffect",
            front_aero_type: "LowDragNose",
            diffuser_type: "HighDownforceDiffuser",
        }, rules);
        strict_1.default.equal(floorErr, null);
    });
    (0, node_test_1.it)("blown exhaust requires active diffuser floor", () => {
        const err = (0, part_compatibility_1.validateAssemblyCompatibility)({
            ...baseBuild(),
            diffuser_type: "FlatFloor",
            exhaust_type: "BlownDiffuser",
        }, rules);
        strict_1.default.ok(err);
    });
    (0, node_test_1.it)("DPF exhaust requires diesel fuel", () => {
        const err = (0, part_compatibility_1.validateAssemblyCompatibility)({
            ...baseBuild(),
            exhaust_type: "DieselDPF",
        }, rules);
        strict_1.default.match(err ?? "", /Diesel/i);
    });
    (0, node_test_1.it)("fuel cell rejects ICE exhaust and accepts underbody outlets", () => {
        const fcEngine = {
            ...baseBuild().engine,
            fuel_type: "Hydrogen",
            energy_converter: "FuelCell",
            drivetrain: "FullEV",
        };
        const fcBase = {
            ...baseBuild(),
            engine: fcEngine,
            hybrid_system: "None",
            transmission: "SingleSpeedEDrive",
            fuel_system: "HydrogenTank",
        };
        const iceErr = (0, part_compatibility_1.validateAssemblyCompatibility)({ ...fcBase, exhaust_type: "SideExitTwin" }, rules);
        strict_1.default.match(iceErr ?? "", /underbody outlet/i);
        const activeErr = (0, part_compatibility_1.validateAssemblyCompatibility)({
            ...fcBase,
            rear_aero_type: "WinglessGroundEffect",
            diffuser_type: "FlatFloor",
            exhaust_type: "ActiveUnderbody",
        }, rules);
        strict_1.default.ok(activeErr);
        const qualiErr = (0, part_compatibility_1.validateAssemblyCompatibility)({
            ...fcBase,
            rear_aero_type: "WinglessGroundEffect",
            diffuser_type: "DoubleDeckerDiffuser",
            exhaust_type: "ActiveUnderbody",
        }, rules);
        strict_1.default.equal(qualiErr, null);
    });
    (0, node_test_1.it)("combustion rejects e-drive outlet parts", () => {
        const err = (0, part_compatibility_1.validateAssemblyCompatibility)({
            ...baseBuild(),
            diffuser_type: "HighDownforceDiffuser",
            exhaust_type: "ActiveUnderbody",
        }, rules);
        strict_1.default.match(err ?? "", /exhaust system/i);
    });
});
