"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const weekend_setup_1 = require("./weekend_setup");
const baseBuild = () => ({
    carName: "Test",
    chassis_type: "MonocoqueHypercar",
    front_aero_type: "HypercarFrontWing",
    rear_aero_type: "HypercarRearWing",
    cooling_pack: "HypercarCooling",
    wheel_package: "HypercarWheels",
    suspension_layout: "DoubleWishboneHypercar",
    fuel_system: "HypercarFuel",
    brake_system: "CarbonCeramic",
    transmission: "HypercarGearbox",
    hybrid_system: "HypercarHybrid",
    front_ride_height_mm: 40,
    rear_ride_height_mm: 42,
});
(0, node_test_1.describe)("weekend_setup", () => {
    (0, node_test_1.it)("defaultTrackPreset includes track notes for Le Mans", () => {
        const preset = (0, weekend_setup_1.defaultTrackPreset)("lemans_la_sarthe");
        strict_1.default.equal(preset.trackId, "lemans_la_sarthe");
        strict_1.default.ok(preset.notes?.includes("Mulsanne"));
        strict_1.default.equal(preset.wingBaseline, -0.05);
    });
    (0, node_test_1.it)("mergeBuildWithTrackPreset overlays weekend sheet onto garage build", () => {
        const merged = (0, weekend_setup_1.mergeBuildWithTrackPreset)(baseBuild(), {
            trackId: "spa",
            wingBaseline: 0.05,
            frontRideHeightMm: 36,
            frontCamberDeg: -2.8,
        });
        strict_1.default.equal(merged.starting_wing_delta, 0.05);
        strict_1.default.equal(merged.front_ride_height_mm, 36);
        strict_1.default.equal(merged.front_camber_deg, -2.8);
        strict_1.default.equal(merged.rear_ride_height_mm, 42);
    });
    (0, node_test_1.it)("resolveTrackPreset merges saved preset over defaults", () => {
        const resolved = (0, weekend_setup_1.resolveTrackPreset)("monza", {
            trackId: "monza",
            wingBaseline: -0.04,
        });
        strict_1.default.equal(resolved.wingBaseline, -0.04);
        strict_1.default.ok(resolved.notes?.includes("drag"));
    });
    (0, node_test_1.it)("resolveCarTrackPreset prefers per-car preset over legacy meta preset", () => {
        const car = {
            id: "car-1",
            carNumber: "7",
            classId: "Hypercar",
            affiliation: "manufacturer",
            acquisition: "build",
            build: baseBuild(),
            carConfigPath: "configs/runtime/fleet/car_7.txt",
            trackSetupPresets: {
                spa: { trackId: "spa", wingBaseline: -0.02 },
            },
        };
        const meta = {
            trackSetupPresets: { spa: { trackId: "spa", wingBaseline: 0.08 } },
        };
        const resolved = (0, weekend_setup_1.resolveCarTrackPreset)(car, "spa", meta);
        strict_1.default.equal(resolved.wingBaseline, -0.02);
    });
    (0, node_test_1.it)("validateTrackPreset rejects out-of-range values", () => {
        strict_1.default.equal((0, weekend_setup_1.validateTrackPreset)({ trackId: "x", wingBaseline: 0.2 }), "Wing baseline must be within ±0.12");
        strict_1.default.equal((0, weekend_setup_1.validateTrackPreset)({ trackId: "x", finalDriveRatio: 5 }), "Final drive must be 3.0–4.2");
        strict_1.default.equal((0, weekend_setup_1.validateTrackPreset)({ trackId: "x", wingBaseline: -0.05 }), null);
    });
});
