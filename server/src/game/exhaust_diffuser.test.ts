import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import type { CarBuildPayload } from "../ws_protocol";
import { loadGameCatalog } from "./catalog";
import {
  loadAssemblyRules,
  validateAssemblyCompatibility,
} from "./part_compatibility";

const repoRoot = path.resolve(process.cwd(), "..");

const baseBuild = (): CarBuildPayload => ({
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

describe("exhaust_diffuser catalog and compatibility", () => {
  const rules = loadAssemblyRules(repoRoot);
  const catalog = loadGameCatalog(repoRoot);

  it("loads diffuser and exhaust parts", () => {
    assert.ok(catalog.partsBySlot.diffuser.length >= 8);
    assert.ok(catalog.partsBySlot.exhaust.length >= 8);
    assert.ok(
      catalog.partsBySlot.diffuser.some((p) => p.partType === "HighDownforceDiffuser"),
    );
    assert.ok(
      catalog.partsBySlot.exhaust.some((p) => p.partType === "BlownDiffuser"),
    );
  });

  it("wingless rear rejects stock floor and accepts floor diffusers", () => {
    const stockErr = validateAssemblyCompatibility(
      {
        ...baseBuild(),
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "StockFloor",
      },
      rules,
    );
    assert.match(stockErr ?? "", /diffuser floor|not compatible with StockFloor/i);

    const floorErr = validateAssemblyCompatibility(
      {
        ...baseBuild(),
        rear_aero_type: "WinglessGroundEffect",
        front_aero_type: "LowDragNose",
        diffuser_type: "HighDownforceDiffuser",
      },
      rules,
    );
    assert.equal(floorErr, null);
  });

  it("blown exhaust requires active diffuser floor", () => {
    const err = validateAssemblyCompatibility(
      {
        ...baseBuild(),
        diffuser_type: "FlatFloor",
        exhaust_type: "BlownDiffuser",
      },
      rules,
    );
    assert.ok(err);
  });

  it("DPF exhaust requires diesel fuel", () => {
    const err = validateAssemblyCompatibility(
      {
        ...baseBuild(),
        exhaust_type: "DieselDPF",
      },
      rules,
    );
    assert.match(err ?? "", /Diesel/i);
  });

  it("fuel cell rejects ICE exhaust and accepts underbody outlets", () => {
    const fcEngine = {
      ...baseBuild().engine!,
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

    const iceErr = validateAssemblyCompatibility(
      { ...fcBase, exhaust_type: "SideExitTwin" },
      rules,
    );
    assert.match(iceErr ?? "", /underbody outlet/i);

    const activeErr = validateAssemblyCompatibility(
      {
        ...fcBase,
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "FlatFloor",
        exhaust_type: "ActiveUnderbody",
      },
      rules,
    );
    assert.ok(activeErr);

    const qualiErr = validateAssemblyCompatibility(
      {
        ...fcBase,
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "DoubleDeckerDiffuser",
        exhaust_type: "ActiveUnderbody",
      },
      rules,
    );
    assert.equal(qualiErr, null);
  });

  it("combustion rejects e-drive outlet parts", () => {
    const err = validateAssemblyCompatibility(
      {
        ...baseBuild(),
        diffuser_type: "HighDownforceDiffuser",
        exhaust_type: "ActiveUnderbody",
      },
      rules,
    );
    assert.match(err ?? "", /exhaust system/i);
  });
});
