/**
 * Garage compile sweep — "one setup wins all?" balance check.
 * For each powertrain family, sweeps legal front × rear × diffuser × exhaust
 * combos through compileCarStats and reports the winner for:
 *   best Cl/Cd, lowest Cd, max HP.
 * Run: npx tsx tools/benchmark/garage_compile_sweep.mts
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { CarBuildPayload, PartOptionPayload } from "../../viewer/src/ws/protocol";
import { compileCarStats } from "../../viewer/src/utils/carStats";
import { validateAssemblyCompatibility } from "../../viewer/src/utils/partCompatibility";
import { loadAssemblyRules } from "../../server/src/game/part_compatibility";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parsePartCatalog(): Record<string, PartOptionPayload[]> {
  const catalogPath = path.join(repoRoot, "configs/part_catalog.txt");
  const partsBySlot: Record<string, PartOptionPayload[]> = {};
  let prefix = "";
  let partType = "";
  let mass = 0;
  let stats: Record<string, number> = {};
  const flush = () => {
    if (!prefix || !partType) return;
    const slot = prefix;
    (partsBySlot[slot] ??= []).push({
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
    const [p, t] = [segments[0]!, segments[1]!];
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

const partsBySlot = parsePartCatalog();
const rules = loadAssemblyRules(repoRoot);

// Hypercar class legal lists (mirrors class_rules.txt Hypercar section).
function legal(slot: string): string[] {
  return (partsBySlot[slot] ?? []).map((p) => p.partType);
}

type Family = {
  tag: string;
  build: Omit<CarBuildPayload, "front_aero_type" | "rear_aero_type" | "diffuser_type" | "exhaust_type">;
};

const ENGINES: Record<string, CarBuildPayload["engine"]> = {
  "Gas-ICE": {
    engine_layout: "V8", fuel_type: "Gasoline", cylinders: 8, bore: 0.092,
    stroke: 0.078, max_rpm: 8800, peak_torque_nm: 720, peak_torque_rpm: 6200,
    base_vibration: 0.4, aspiration: "TwinParallel", drivetrain: "ParallelHybrid",
  } as CarBuildPayload["engine"],
  Diesel: {
    engine_layout: "V8", fuel_type: "Diesel", cylinders: 8, bore: 0.094,
    stroke: 0.09, max_rpm: 5200, peak_torque_nm: 1080, peak_torque_rpm: 4200,
    base_vibration: 0.55, aspiration: "TwinParallel", drivetrain: "ParallelHybrid",
  } as CarBuildPayload["engine"],
  "H2-FC": {
    engine_layout: "V6", fuel_type: "Hydrogen", energy_converter: "FuelCell",
    cylinders: 6, bore: 0.08, stroke: 0.06, max_rpm: 12000, peak_torque_nm: 630,
    peak_torque_rpm: 10200, base_vibration: 0.2, aspiration: "NA",
    drivetrain: "FullEV", generator_kw: 420, buffer_size: 0.55,
  } as CarBuildPayload["engine"],
  BEV: {
    engine_layout: "V6", fuel_type: "Electric", cylinders: 6, bore: 0.08,
    stroke: 0.06, max_rpm: 14000, peak_torque_nm: 720, peak_torque_rpm: 9000,
    base_vibration: 0.1, aspiration: "NA", drivetrain: "FullEV",
  } as CarBuildPayload["engine"],
  REX: {
    engine_layout: "I4", fuel_type: "Electric", cylinders: 4, bore: 0.086,
    stroke: 0.08, max_rpm: 6500, peak_torque_nm: 380, peak_torque_rpm: 4800,
    base_vibration: 0.8, aspiration: "NA", drivetrain: "RangeExtender",
    generator_kw: 480,
  } as CarBuildPayload["engine"],
  "H2-ICE": {
    engine_layout: "V8", fuel_type: "Hydrogen", energy_converter: "Combustion",
    cylinders: 8, bore: 0.09, stroke: 0.076, max_rpm: 9200, peak_torque_nm: 640,
    peak_torque_rpm: 6400, base_vibration: 0.45, aspiration: "TwinParallel",
    drivetrain: "FrontAxleHybrid",
  } as CarBuildPayload["engine"],
};

const FAMILIES: Family[] = [
  {
    tag: "Gas-ICE",
    build: {
      carName: "GasICE", chassis_type: "LMDhDallara",
      suspension_layout: "PushrodDoubleWishbone", cooling_pack: "MaxFlowEndurance",
      wheel_package: "Hypercar18Standard", fuel_system: "LeMans110L",
      brake_system: "BremboHypercar", transmission: "XtracP1359",
      hybrid_system: "LMDh50kW", engine: ENGINES["Gas-ICE"]!,
    } as Family["build"],
  },
  {
    tag: "Diesel",
    build: {
      carName: "Diesel", chassis_type: "LMDhDallara",
      suspension_layout: "PushrodDoubleWishbone", cooling_pack: "MaxFlowEndurance",
      wheel_package: "Hypercar18Standard", fuel_system: "LeMans110L",
      brake_system: "BremboHypercar", transmission: "XtracP1359",
      hybrid_system: "LMDh50kW", engine: ENGINES["Diesel"]!,
    } as Family["build"],
  },
  {
    tag: "H2-ICE",
    build: {
      carName: "H2ICE", chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone", cooling_pack: "MaxFlowEndurance",
      wheel_package: "Hypercar18Standard", fuel_system: "HydrogenTank",
      brake_system: "BremboHypercar", transmission: "XtracP1359",
      hybrid_system: "HypercarHV", engine: ENGINES["H2-ICE"]!,
    } as Family["build"],
  },
  {
    tag: "H2-FC",
    build: {
      carName: "H2FC", chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone", cooling_pack: "MaxFlowEndurance",
      wheel_package: "Hypercar18Standard", fuel_system: "HydrogenTank",
      brake_system: "BremboHypercar", transmission: "SingleSpeedEDrive",
      hybrid_system: "None", engine: ENGINES["H2-FC"]!,
    } as Family["build"],
  },
  {
    tag: "REX",
    build: {
      carName: "REX", chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone", cooling_pack: "MaxFlowEndurance",
      wheel_package: "Hypercar18Standard", fuel_system: "BatteryPackEndurance",
      brake_system: "BremboHypercar", transmission: "SingleSpeedEDrive",
      hybrid_system: "None", engine: ENGINES["REX"]!,
    } as Family["build"],
  },
  {
    tag: "BEV",
    build: {
      carName: "BEV", chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone", cooling_pack: "MaxFlowEndurance",
      wheel_package: "Hypercar18Standard", fuel_system: "BatteryPackEndurance",
      brake_system: "BremboHypercar", transmission: "SingleSpeedEDrive",
      hybrid_system: "None", engine: ENGINES["BEV"]!,
    } as Family["build"],
  },
];

const fronts = legal("front_aero");
const rears = legal("rear_aero");
const diffusers = legal("diffuser");
const exhausts = legal("exhaust");

const capOptions = { powerCapHp: 680, minWeightKg: 1030, classId: "Hypercar" };

for (const fam of FAMILIES) {
  type Row = {
    combo: string;
    clcd: number;
    cd: number;
    hp: number;
  };
  const rows: Row[] = [];
  for (const front of fronts)
    for (const rear of rears)
      for (const diff of diffusers)
        for (const ex of exhausts) {
          const build = {
            ...fam.build,
            front_aero_type: front,
            rear_aero_type: rear,
            diffuser_type: diff,
            exhaust_type: ex,
          } as CarBuildPayload;
          if (validateAssemblyCompatibility(build, rules)) continue;
          let stats;
          try {
            stats = compileCarStats(build, partsBySlot, capOptions);
          } catch {
            continue;
          }
          if (!stats.totalDragCd || stats.totalDragCd <= 0) continue;
          rows.push({
            combo: `${front} + ${rear} + ${diff} + ${ex}`,
            clcd: stats.totalDownforceCl / stats.totalDragCd,
            cd: stats.totalDragCd,
            hp: stats.peakHorsepower,
          });
        }
  if (!rows.length) {
    console.log(`\n## ${fam.tag}: no legal combos compiled!`);
    continue;
  }
  const bestClcd = rows.reduce((a, b) => (b.clcd > a.clcd ? b : a));
  const lowestCd = rows.reduce((a, b) => (b.cd < a.cd ? b : a));
  const maxHp = rows.reduce((a, b) => (b.hp > a.hp ? b : a));
  const oneWinsAll =
    bestClcd.combo === lowestCd.combo && lowestCd.combo === maxHp.combo;
  console.log(`\n## ${fam.tag} (${rows.length} legal combos)`);
  console.log(`  Best Cl/Cd : ${bestClcd.combo}  (${bestClcd.clcd.toFixed(3)})`);
  console.log(`  Lowest Cd  : ${lowestCd.combo}  (${lowestCd.cd.toFixed(3)})`);
  console.log(`  Max HP     : ${maxHp.combo}  (${maxHp.hp.toFixed(0)} hp)`);
  console.log(`  One combo wins all three? ${oneWinsAll ? "YES — red flag" : "no"}`);
}
