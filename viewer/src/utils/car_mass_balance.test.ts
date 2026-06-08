import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { compileCarStats } from "./carStats";
import {
  encodePowertrainBuild,
  defaultUiState,
  resolveEngineAssemblyMassKg,
  resolvePowertrainTraits,
} from "./powertrain_traits";
import type { PartOptionPayload } from "../ws/protocol";

function loadParts(): Record<string, PartOptionPayload[]> {
  const catalogPath = path.join(
    import.meta.dirname,
    "../../../configs/part_catalog.txt",
  );
  const partsBySlot: Record<string, PartOptionPayload[]> = {};
  const slotMap: Record<string, string> = {
    chassis: "chassis",
    front_aero: "front_aero",
    rear_aero: "rear_aero",
    cooling: "cooling",
    wheel_package: "wheel_package",
    suspension: "suspension",
    fuel_system: "fuel_system",
    brake: "brake",
    transmission: "transmission",
    hybrid: "hybrid",
    diffuser: "diffuser",
    exhaust: "exhaust",
  };
  for (const line of fs.readFileSync(catalogPath, "utf8").split("\n")) {
    const m = line.match(/^(\w+)\.([^.]+)\.(\w+)=(.+)$/);
    if (!m) continue;
    const [, slot, partType, key, val] = m;
    const mapped = slotMap[slot];
    if (!mapped) continue;
    if (!partsBySlot[mapped]) partsBySlot[mapped] = [];
    let part = partsBySlot[mapped].find((p) => p.partType === partType);
    if (!part) {
      part = {
        slot: mapped as PartOptionPayload["slot"],
        partType,
        fullId: `${slot}.${partType}`,
        displayName: partType,
        mass: 0,
        stats: {},
      };
      partsBySlot[mapped].push(part);
    }
    if (key === "mass") part.mass = parseFloat(val);
    else if (!Number.isNaN(parseFloat(val))) part.stats[key] = parseFloat(val);
  }
  return partsBySlot;
}

describe("car mass balance", () => {
  const partsBySlot = loadParts();

  it("orders fuel cell mass with capacity", () => {
    const byType = Object.fromEntries(
      partsBySlot.fuel_system.map((p) => [p.partType, p]),
    );
    assert.ok(byType.LeMans90L.mass < byType.StandardTank.mass);
    assert.ok(byType.StandardTank.mass < byType.LeMans110L.mass);
    assert.ok(byType.LeMans95L.mass > byType.LeMans90L.mass);
    assert.ok(byType.LeMans110L.mass > byType.LeMans95L.mass);
  });

  it("counts ICE hybrid hardware once when hybrid part is fitted", () => {
    const engine = encodePowertrainBuild(
      {
        ...defaultUiState("Hypercar"),
        fuel: "Gasoline",
        layout: "V8",
        aspiration: "TwinParallel",
        drivetrain: "ParallelHybrid",
        powerTargetHp: 680,
      },
      "Hypercar",
    );
    const traits = resolvePowertrainTraits(engine, "Hypercar");
    const hybridPart = partsBySlot.hybrid.find((p) => p.partType === "LMDh50kW")!;
    const assembly = resolveEngineAssemblyMassKg(traits, hybridPart.mass);
    assert.equal(assembly, traits.engineMassKg);
    assert.ok(hybridPart.mass > 0);
  });

  it("keeps representative Hypercar builds near the 1030–1090 kg band", () => {
    const engine = encodePowertrainBuild(
      {
        ...defaultUiState("Hypercar"),
        fuel: "Gasoline",
        layout: "V8",
        aspiration: "TwinParallel",
        drivetrain: "ParallelHybrid",
        powerTargetHp: 680,
        blockSize: 0.5,
      },
      "Hypercar",
    );
    const bmw = compileCarStats(
      {
        chassis_type: "LMDhDallara",
        front_aero_type: "LowDragNose",
        rear_aero_type: "StandardWing",
        cooling_pack: "MaxFlowEndurance",
        wheel_package: "Hypercar18Standard",
        suspension_layout: "PushrodDoubleWishbone",
        fuel_system: "LeMans110L",
        brake_system: "BremboHypercar",
        transmission: "XtracP1359",
        hybrid_system: "LMDh50kW",
        diffuser_type: "StockFloor",
        exhaust_type: "TwinOutletSide",
        engine,
        duct_airflow: 1,
      },
      partsBySlot,
      {
        classId: "Hypercar",
        minWeightKg: 1030,
        maxWeightKg: 1090,
        assemblyMassOffsetKg: 0,
        powerCapHp: 680,
      },
    );
    assert.ok(
      bmw.rawTotalMass >= 1030 && bmw.rawTotalMass <= 1115,
      `BMW template raw mass ${bmw.rawTotalMass}`,
    );
    assert.equal(bmw.calculatedTotalMass, Math.max(1030, bmw.rawTotalMass));
  });
});
