import assert from "node:assert/strict";
import test from "node:test";
import type { CarBuildPayload, PartOptionPayload } from "../ws_protocol";
import {
  ARB_STIFFNESS_LIMITS,
  DEFAULT_DAMPER_CLICKS,
  RIDE_HEIGHT_LIMITS,
  clampSuspensionSetup,
  normalizeCarBuild,
  resolveSuspensionSetup,
  springRateRange,
  validateSuspensionSetup,
} from "./chassis_setup";

const pushrodFront: PartOptionPayload = {
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

const pushrodRear: PartOptionPayload = {
  ...pushrodFront,
  stats: {
    front_spring: 135000,
    rear_spring: 150000,
    ride_height: 0.042,
    roll_stiffness: 1.05,
  },
};

const baseBuild = (): CarBuildPayload => ({
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

test("resolveSuspensionSetup uses part baselines and damper defaults", () => {
  const setup = resolveSuspensionSetup(
    baseBuild(),
    [pushrodFront, pushrodRear],
    "Hypercar",
  );
  assert.equal(setup.frontRideHeightMm, 40);
  assert.equal(setup.rearRideHeightMm, 40);
  assert.equal(setup.frontSpringNm, 135000);
  assert.equal(setup.rearSpringNm, 150000);
  assert.equal(setup.frontArbStiffness, 1);
  assert.equal(setup.frontDamperBump, DEFAULT_DAMPER_CLICKS);
});

test("resolveSuspensionSetup respects build overrides", () => {
  const build = {
    ...baseBuild(),
    front_ride_height_mm: 44,
    front_spring_nm: 140000,
    front_arb_stiffness: 1.15,
    front_damper_bump: 10,
  };
  const setup = resolveSuspensionSetup(build, [pushrodFront, pushrodRear], "Hypercar");
  assert.equal(setup.frontRideHeightMm, 44);
  assert.equal(setup.frontSpringNm, 140000);
  assert.equal(setup.frontArbStiffness, 1.15);
  assert.equal(setup.frontDamperBump, 10);
});

test("clampSuspensionSetup enforces class ride height and spring windows", () => {
  const build = baseBuild();
  const parts = [pushrodFront, pushrodRear];
  const clamped = clampSuspensionSetup(
    {
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
    },
    build,
    parts,
    "Hypercar",
  );
  const rh = RIDE_HEIGHT_LIMITS.Hypercar;
  assert.equal(clamped.frontRideHeightMm, rh.min);
  assert.equal(clamped.rearRideHeightMm, rh.max);

  const frontSpring = springRateRange(135000);
  assert.equal(clamped.frontSpringNm, frontSpring.min);
  assert.equal(clamped.rearSpringNm, springRateRange(150000).max);

  assert.equal(clamped.frontArbStiffness, ARB_STIFFNESS_LIMITS.min);
  assert.equal(clamped.rearArbStiffness, ARB_STIFFNESS_LIMITS.max);
  assert.equal(clamped.frontDamperBump, 1);
  assert.equal(clamped.frontDamperRebound, 15);
});

test("validateSuspensionSetup rejects out-of-range tuning", () => {
  const build = {
    ...baseBuild(),
    front_ride_height_mm: 20,
  };
  const err = validateSuspensionSetup(
    build,
    undefined,
    "Hypercar",
    [pushrodFront, pushrodRear],
  );
  assert.match(err ?? "", /Front ride height/);
});

test("validateSuspensionSetup accepts normalized build", () => {
  const normalized = normalizeCarBuild(baseBuild(), "Hypercar", {
    suspension: [pushrodFront, pushrodRear],
  });
  const err = validateSuspensionSetup(
    normalized,
    undefined,
    "Hypercar",
    [pushrodFront, pushrodRear],
  );
  assert.equal(err, null);
});

test("normalizeCarBuild fills suspension slider defaults", () => {
  const normalized = normalizeCarBuild(baseBuild(), "Hypercar", {
    suspension: [pushrodFront, pushrodRear],
  });
  assert.equal(normalized.front_ride_height_mm, 40);
  assert.equal(normalized.rear_ride_height_mm, 40);
  assert.equal(normalized.front_damper_bump, DEFAULT_DAMPER_CLICKS);
  assert.equal(normalized.front_arb_stiffness, 1);
});

test("springRateRange is ±25% in 1000 N/m steps", () => {
  const range = springRateRange(135000);
  assert.equal(range.step, 1000);
  assert.equal(range.min, 102000);
  assert.equal(range.max, 168000);
});
