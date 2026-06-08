import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FleetCarPayload } from "../ws_protocol";
import {
  buildSpecKey,
  validateFleetRegulations,
  validateBuyCar,
} from "./fleet";
import { defaultBuildForClass } from "./catalog";
import path from "path";

const repoRoot = path.resolve(__dirname, "../../..");

function car(
  id: string,
  classId: string,
  opts: Partial<FleetCarPayload> = {},
): FleetCarPayload {
  const raw = defaultBuildForClass(repoRoot, classId);
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

describe("experimental fleet regulations", () => {
  it("allows homologated and experimental programmes in the same class", () => {
    const hom = car("car-1", "LMP2", { classId: "LMP2" });
    const expBuild = { ...hom.build, front_aero_type: "HighDownforceSplitter" };
    const exp = car("car-2", "LMP2", {
      classId: "LMP2",
      entryMode: "experimental",
      experimentalProgramId: "exp-lmp2-1",
      build: expBuild,
      carNumber: "2",
    });
    assert.equal(validateFleetRegulations([hom, exp]), null);
  });

  it("rejects experimental design matching homologated spec", () => {
    const hom = car("car-1", "LMP2", { classId: "LMP2" });
    const exp = car("car-2", "LMP2", {
      classId: "LMP2",
      entryMode: "experimental",
      experimentalProgramId: "exp-lmp2-1",
      build: { ...hom.build },
      carNumber: "2",
    });
    const err = validateFleetRegulations([hom, exp]);
    assert.ok(err?.includes("different design"));
  });

  it("requires identical builds within experimental programme", () => {
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
    const err = validateFleetRegulations([exp1, exp2]);
    assert.ok(err?.includes("EXP"));
  });
});
