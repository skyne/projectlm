"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const chassis_setup_1 = require("./chassis_setup");
const pushrodFront = {
    slot: "suspension",
    partType: "PushrodDoubleWishbone",
    fullId: "suspension.PushrodDoubleWishbone",
    displayName: "Pushrod DWB",
    mass: 14,
    stats: {
        front_spring: 135000,
        rear_spring: 150000,
        ride_height: 0.04,
        roll_stiffness: 1,
    },
};
const pushrodRear = {
    ...pushrodFront,
    stats: {
        front_spring: 135000,
        rear_spring: 150000,
        ride_height: 0.042,
        roll_stiffness: 1.05,
    },
};
const baseBuild = () => ({
    carName: "Test",
    chassis_type: "LMDhDallara",
    front_aero_type: "LowDragNose",
    rear_aero_type: "StandardWing",
    cooling_pack: "EnduranceHeavyDuty",
    wheel_package: "Hypercar18",
    suspension_layout: "PushrodDoubleWishbone",
    front_suspension_layout: "PushrodDoubleWishbone",
    rear_suspension_layout: "PushrodDoubleWishbone",
    fuel_system: "StandardTank",
    brake_system: "StandardCaliper",
    transmission: "SixSpeedSequential",
    hybrid_system: "None",
});
(0, node_test_1.default)("resolveSuspensionSetup uses part baselines and damper defaults", () => {
    const setup = (0, chassis_setup_1.resolveSuspensionSetup)(baseBuild(), [pushrodFront, pushrodRear], "Hypercar");
    strict_1.default.equal(setup.frontRideHeightMm, 40);
    strict_1.default.equal(setup.rearRideHeightMm, 40);
    strict_1.default.equal(setup.frontSpringNm, 135000);
    strict_1.default.equal(setup.rearSpringNm, 150000);
    strict_1.default.equal(setup.frontArbStiffness, 1);
    strict_1.default.equal(setup.frontDamperBump, chassis_setup_1.DEFAULT_DAMPER_CLICKS);
});
(0, node_test_1.default)("resolveSuspensionSetup respects build overrides", () => {
    const build = {
        ...baseBuild(),
        front_ride_height_mm: 44,
        front_spring_nm: 140000,
        front_arb_stiffness: 1.15,
        front_damper_bump: 10,
    };
    const setup = (0, chassis_setup_1.resolveSuspensionSetup)(build, [pushrodFront, pushrodRear], "Hypercar");
    strict_1.default.equal(setup.frontRideHeightMm, 44);
    strict_1.default.equal(setup.frontSpringNm, 140000);
    strict_1.default.equal(setup.frontArbStiffness, 1.15);
    strict_1.default.equal(setup.frontDamperBump, 10);
});
(0, node_test_1.default)("clampSuspensionSetup enforces class ride height and spring windows", () => {
    const build = baseBuild();
    const parts = [pushrodFront, pushrodRear];
    const clamped = (0, chassis_setup_1.clampSuspensionSetup)({
        frontRideHeightMm: 10,
        rearRideHeightMm: 99,
        frontSpringNm: 50000,
        rearSpringNm: 500000,
        frontArbStiffness: 0.5,
        rearArbStiffness: 2,
        frontDamperBump: 0,
        frontDamperRebound: 20,
        rearDamperBump: 8,
        rearDamperRebound: 8,
    }, build, parts, "Hypercar");
    const rh = chassis_setup_1.RIDE_HEIGHT_LIMITS.Hypercar;
    strict_1.default.equal(clamped.frontRideHeightMm, rh.min);
    strict_1.default.equal(clamped.rearRideHeightMm, rh.max);
    const frontSpring = (0, chassis_setup_1.springRateRange)(135000);
    strict_1.default.equal(clamped.frontSpringNm, frontSpring.min);
    strict_1.default.equal(clamped.rearSpringNm, (0, chassis_setup_1.springRateRange)(150000).max);
    strict_1.default.equal(clamped.frontArbStiffness, chassis_setup_1.ARB_STIFFNESS_LIMITS.min);
    strict_1.default.equal(clamped.rearArbStiffness, chassis_setup_1.ARB_STIFFNESS_LIMITS.max);
    strict_1.default.equal(clamped.frontDamperBump, 1);
    strict_1.default.equal(clamped.frontDamperRebound, 15);
});
(0, node_test_1.default)("validateSuspensionSetup rejects out-of-range tuning", () => {
    const build = {
        ...baseBuild(),
        front_ride_height_mm: 20,
    };
    const err = (0, chassis_setup_1.validateSuspensionSetup)(build, undefined, "Hypercar", [pushrodFront, pushrodRear]);
    strict_1.default.match(err ?? "", /Front ride height/);
});
(0, node_test_1.default)("validateSuspensionSetup accepts normalized build", () => {
    const normalized = (0, chassis_setup_1.normalizeCarBuild)(baseBuild(), "Hypercar", {
        suspension: [pushrodFront, pushrodRear],
    });
    const err = (0, chassis_setup_1.validateSuspensionSetup)(normalized, undefined, "Hypercar", [pushrodFront, pushrodRear]);
    strict_1.default.equal(err, null);
});
(0, node_test_1.default)("normalizeCarBuild fills suspension slider defaults", () => {
    const normalized = (0, chassis_setup_1.normalizeCarBuild)(baseBuild(), "Hypercar", {
        suspension: [pushrodFront, pushrodRear],
    });
    strict_1.default.equal(normalized.front_ride_height_mm, 40);
    strict_1.default.equal(normalized.rear_ride_height_mm, 40);
    strict_1.default.equal(normalized.front_damper_bump, chassis_setup_1.DEFAULT_DAMPER_CLICKS);
    strict_1.default.equal(normalized.front_arb_stiffness, 1);
});
(0, node_test_1.default)("springRateRange is ±25% in 1000 N/m steps", () => {
    const range = (0, chassis_setup_1.springRateRange)(135000);
    strict_1.default.equal(range.step, 1000);
    strict_1.default.equal(range.min, 102000);
    strict_1.default.equal(range.max, 168000);
});
