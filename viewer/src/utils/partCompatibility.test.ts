import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssemblyRulePayload, CarBuildPayload } from "../ws/protocol";
import {
  describePartIncompatibility,
  findAssemblyConflict,
  formatAssemblyConflict,
  isPartCompatibleWithBuild,
} from "./partCompatibility";

const PART_NAMES: Record<string, Record<string, string>> = {
  front_aero: {
    LowDragNose: "Low Drag Nose",
    HighDownforceSplitter: "High Downforce Splitter",
  },
  rear_aero: {
    WinglessGroundEffect: "Wingless Diffuser",
    StandardWing: "Standard Wing",
  },
  brake_system: {
    CarbonCeramic: "Carbon Ceramic",
  },
  chassis: {
    GT3Spaceframe: "GT3 Spaceframe",
    LMDhDallara: "LMDh Dallara",
  },
  engine: {
    Gasoline: "Gasoline",
    Hydrogen: "Hydrogen",
  },
};

function resolvePartName(configSlot: string, partType: string): string {
  return PART_NAMES[configSlot]?.[partType] ?? partType;
}

const baseBuild: CarBuildPayload = {
  carName: "Test",
  chassis_type: "LMDhDallara",
  front_aero_type: "LowDragNose",
  rear_aero_type: "StandardWing",
  cooling_pack: "Standard",
  wheel_package: "Hypercar18Standard",
  suspension_layout: "DoubleWishbone",
  fuel_system: "StandardTank",
  brake_system: "Steel",
  transmission: "Sequential",
  hybrid_system: "None",
  engine: {
    engine_layout: "V6",
    fuel_type: "Gasoline",
    cylinders: 6,
    displacement_cc: 2500,
    turbo_count: 1,
    hybrid_mj_per_lap: 0,
    drivetrain: "RWD",
  },
};

const winglessRule: AssemblyRulePayload = {
  kind: "requires_any",
  ifSlot: "rear_aero",
  ifPart: "WinglessGroundEffect",
  requiresSlot: "front_aero",
  requiresAnyParts: ["LowDragNose", "LowDragNoseSlim"],
};

describe("partCompatibility", () => {
  it("flags high-DF front aero when wingless rear is fitted", () => {
    const build = {
      ...baseBuild,
      rear_aero_type: "WinglessGroundEffect",
    };
    assert.equal(
      isPartCompatibleWithBuild(build, "front_aero", "HighDownforceSplitter", [
        winglessRule,
      ]),
      false,
    );

    const message = describePartIncompatibility(
      build,
      "front_aero",
      "HighDownforceSplitter",
      [winglessRule],
      resolvePartName,
    );
    assert.match(message ?? "", /Wingless Diffuser \(Rear Aero\)/);
    assert.match(message ?? "", /Low Drag Nose/);
  });

  it("explains carbon brake chassis requirement", () => {
    const carbonRule: AssemblyRulePayload = {
      kind: "requires_any",
      ifSlot: "brake_system",
      ifPart: "CarbonCeramic",
      requiresSlot: "chassis",
      requiresAnyParts: ["LMDhDallara", "LMHInHouse"],
    };
    const build = {
      ...baseBuild,
      chassis_type: "GT3Spaceframe",
      brake_system: "Steel",
    };

    const message = describePartIncompatibility(
      build,
      "brake",
      "CarbonCeramic",
      [carbonRule],
      resolvePartName,
    );
    assert.match(message ?? "", /GT3 Spaceframe/);
    assert.match(message ?? "", /Chassis/);
  });

  it("explains hydrogen tank powertrain requirement", () => {
    const build = {
      ...baseBuild,
      fuel_system: "HydrogenTank",
      engine: { ...baseBuild.engine!, fuel_type: "Gasoline" },
    };
    const conflict = findAssemblyConflict(build, []);
    assert.equal(conflict?.kind, "hydrogen_fuel");
    const message = formatAssemblyConflict(
      conflict!,
      resolvePartName,
      "fuel_system",
      "HydrogenTank",
    );
    assert.match(message, /hydrogen powertrain/i);
    assert.match(message, /Gasoline/);
  });
});
