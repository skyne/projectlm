import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import fs from "node:fs";
import type { CarBuildPayload, PartOptionPayload } from "../ws/protocol";
import { compileCarStats } from "./carStats";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function parsePartCatalog(): Record<string, PartOptionPayload[]> {
  const catalogPath = path.join(repoRoot, "configs/part_catalog.txt");
  const partsBySlot: Record<string, PartOptionPayload[]> = {};
  let prefix = "";
  let partType = "";
  let mass = 0;
  let stats: Record<string, number> = {};

  const flush = () => {
    if (!prefix || !partType) return;
    const slot =
      prefix === "brake"
        ? "brake"
        : prefix === "fuel_system"
          ? "fuel_system"
          : prefix;
    if (!partsBySlot[slot]) partsBySlot[slot] = [];
    partsBySlot[slot].push({
      slot: slot as PartOptionPayload["slot"],
      partType,
      fullId: `${prefix}.${partType}`,
      displayName: partType,
      mass,
      stats: { ...stats },
    });
  };

  for (const line of fs.readFileSync(catalogPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("attach.")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const left = trimmed.slice(0, eq);
    const val = parseFloat(trimmed.slice(eq + 1));
    const segments = left.split(".");
    if (segments.length < 3) continue;
    const p = segments[0]!;
    const t = segments[1]!;
    const key = segments.slice(2).join(".");
    if (p !== prefix || t !== partType) {
      flush();
      prefix = p;
      partType = t;
      stats = {};
      mass = 0;
    }
    if (key === "mass") mass = val;
    else if (!Number.isNaN(val)) stats[key] = val;
  }
  flush();
  return partsBySlot;
}

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
    aspiration: "TwinParallel",
    drivetrain: "Mechanical",
  },
});

const fuelCellBuild = (): CarBuildPayload => ({
  ...baseBuild(),
  rear_aero_type: "WinglessGroundEffect",
  diffuser_type: "DoubleDeckerDiffuser",
  exhaust_type: "None",
  hybrid_system: "None",
  transmission: "SingleSpeedEDrive",
  fuel_system: "HydrogenTank",
  engine: {
    engine_layout: "V6",
    fuel_type: "Hydrogen",
    energy_converter: "FuelCell",
    cylinders: 6,
    bore: 0.08,
    stroke: 0.06,
    max_rpm: 12000,
    peak_torque_nm: 630,
    peak_torque_rpm: 10200,
    base_vibration: 0.2,
    aspiration: "NA",
    drivetrain: "FullEV",
    generator_kw: 420,
    buffer_size: 0.5,
  },
});

describe("exhaust_diffuser compileCarStats", () => {
  const partsBySlot = parsePartCatalog();

  it("defaults match omitting diffuser/exhaust fields", () => {
    const explicit = compileCarStats(baseBuild(), partsBySlot, { classId: "Hypercar" });
    const legacy = compileCarStats(
      { ...baseBuild(), diffuser_type: undefined, exhaust_type: undefined },
      partsBySlot,
      { classId: "Hypercar" },
    );
    assert.equal(explicit.totalDownforceCl, legacy.totalDownforceCl);
    assert.equal(explicit.totalDragCd, legacy.totalDragCd);
    assert.equal(explicit.calculatedTotalMass, legacy.calculatedTotalMass);
  });

  it("blown exhaust increases downforce with high-DF diffuser", () => {
    const plain = compileCarStats(
      {
        ...baseBuild(),
        diffuser_type: "HighDownforceDiffuser",
        exhaust_type: "SideExitTwin",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    const blown = compileCarStats(
      {
        ...baseBuild(),
        diffuser_type: "HighDownforceDiffuser",
        exhaust_type: "BlownDiffuser",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    assert.ok(blown.totalDownforceCl > plain.totalDownforceCl);
    const gain = blown.totalDownforceCl - plain.totalDownforceCl;
    assert.ok(gain > 0.12 && gain < 0.3, `cl gain ${gain}`);
  });

  it("balance: wingless beats low-drag trim on downforce", () => {
    const lowDrag = compileCarStats(
      {
        ...baseBuild(),
        front_aero_type: "LowDragNose",
        rear_aero_type: "StandardWingLowDrag",
        diffuser_type: "FlatFloor",
        exhaust_type: "TopExitBodywork",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    const wingless = compileCarStats(
      {
        ...baseBuild(),
        front_aero_type: "LowDragNose",
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "WinglessBaseline",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    assert.ok(wingless.totalDragCd < lowDrag.totalDragCd);
    assert.ok(wingless.totalDownforceCl > lowDrag.totalDownforceCl);
  });

  it("wingless baseline floor restores competitive aero totals", () => {
    const wingless = compileCarStats(
      {
        ...baseBuild(),
        front_aero_type: "LowDragNose",
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "WinglessBaseline",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    assert.ok(wingless.totalDownforceCl > 5.5);
    assert.ok(wingless.totalDragCd < 0.58);
  });

  it("wingless double-decker with blown exhaust beats baseline downforce", () => {
    const baseline = compileCarStats(
      {
        ...baseBuild(),
        front_aero_type: "LowDragNose",
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "WinglessBaseline",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    const quali = compileCarStats(
      {
        ...baseBuild(),
        front_aero_type: "LowDragNose",
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "DoubleDeckerDiffuser",
        exhaust_type: "BlownDiffuser",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    assert.ok(quali.totalDownforceCl > baseline.totalDownforceCl);
    assert.ok(quali.totalDragCd > baseline.totalDragCd);
  });

  it("diesel DPF costs power vs side-exit", () => {
    const diesel = {
      ...baseBuild().engine!,
      fuel_type: "Diesel" as const,
    };
    const sideExit = compileCarStats(
      { ...baseBuild(), engine: diesel, exhaust_type: "SideExitTwin" },
      partsBySlot,
      { classId: "Hypercar" },
    );
    const dpf = compileCarStats(
      { ...baseBuild(), engine: diesel, exhaust_type: "DieselDPF" },
      partsBySlot,
      { classId: "Hypercar" },
    );
    assert.ok(dpf.peakHorsepower < sideExit.peakHorsepower);
    const ratio = dpf.peakHorsepower / sideExit.peakHorsepower;
    assert.ok(ratio > 0.85 && ratio < 0.95, `power ratio ${ratio}`);
  });

  it("fuel cell active underbody closes quali gap vs ICE blown", () => {
    const sealed = compileCarStats(fuelCellBuild(), partsBySlot, {
      classId: "Hypercar",
    });
    const active = compileCarStats(
      { ...fuelCellBuild(), exhaust_type: "ActiveUnderbody" },
      partsBySlot,
      { classId: "Hypercar" },
    );
    const iceQuali = compileCarStats(
      {
        ...baseBuild(),
        front_aero_type: "LowDragNose",
        rear_aero_type: "WinglessGroundEffect",
        diffuser_type: "DoubleDeckerDiffuser",
        exhaust_type: "BlownDiffuser",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );

    assert.ok(active.totalDownforceCl > sealed.totalDownforceCl);
    const activeRatio = active.totalDownforceCl / active.totalDragCd;
    const sealedRatio = sealed.totalDownforceCl / sealed.totalDragCd;
    assert.ok(activeRatio - sealedRatio > 0.8, `spread ${activeRatio - sealedRatio}`);
    assert.ok(
      activeRatio / (iceQuali.totalDownforceCl / iceQuali.totalDragCd) > 0.95,
    );
  });

  it("fuel cell le mans trim uses low-drag underfloor", () => {
    const lemans = compileCarStats(
      {
        ...fuelCellBuild(),
        diffuser_type: "FlatFloor",
        exhaust_type: "LowDragUnderfloor",
      },
      partsBySlot,
      { classId: "Hypercar" },
    );
    const quali = compileCarStats(
      { ...fuelCellBuild(), exhaust_type: "ActiveUnderbody" },
      partsBySlot,
      { classId: "Hypercar" },
    );
    assert.ok(lemans.totalDragCd < quali.totalDragCd);
    assert.ok(
      quali.totalDownforceCl / quali.totalDragCd -
        lemans.totalDownforceCl / lemans.totalDragCd >
        1.5,
    );
  });
});
