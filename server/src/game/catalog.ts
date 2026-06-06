import * as fs from "fs";
import * as path from "path";
import type { EngineBuildPayload } from "../ws_protocol";
import {
  DRIVER_POINT_POOL,
  DRIVER_STAT_DEFS,
  loadLeMansDriverCatalog,
  type DriverStatDef,
} from "./driver_catalog";
import { buildDriverMarketPreview } from "./driver_market";
import { loadCarPlatforms } from "./car_marketplace";
import { fleetRulesPayload } from "./fleet";
import { cylindersForLayout } from "./engine_model";
import { sponsorOffersPayload } from "./economy";
import { loadAssemblyRules, type AssemblyRule } from "./part_compatibility";

export type PartSlot =
  | "chassis"
  | "front_aero"
  | "rear_aero"
  | "cooling"
  | "wheel_package"
  | "suspension"
  | "fuel_system"
  | "brake"
  | "transmission"
  | "hybrid";

export interface ClassInfo {
  id: string;
  displayName: string;
  description: string;
  powerCapHp: number;
  minWeightKg: number;
  maxWeightKg: number;
  maxStintHours: number;
  templateCarPath: string;
}

export interface PartOption {
  slot: PartSlot;
  partType: string;
  fullId: string;
  displayName: string;
  mass: number;
  stats: Record<string, number>;
}

export interface StaffCandidate {
  role: string;
  name: string;
  skill: number;
  salary: number;
}

export interface GameCatalogPayload {
  classes: ClassInfo[];
  partsBySlot: Record<PartSlot, PartOption[]>;
  staffCandidates: StaffCandidate[];
  sponsorOffers: ReturnType<typeof sponsorOffersPayload>;
  carPlatforms: ReturnType<typeof loadCarPlatforms>;
  fleetRules: ReturnType<typeof fleetRulesPayload>;
  driverStatDefs: DriverStatDef[];
  driverPointPool: number;
  lemansDriverCount: number;
  driverMarketPreview: ReturnType<typeof buildDriverMarketPreview>;
  defaultEngines: Record<string, EngineBuildPayload>;
  assemblyRules: AssemblyRule[];
}

const CLASS_DESCRIPTIONS: Record<string, string> = {
  Hypercar:
    "Top-tier hybrid prototypes. Maximum pace, complex energy recovery, and the highest development ceiling.",
  LMP2:
    "Spec-balanced prototype class. Consistent lap times, lower cost, ideal for learning race strategy.",
  LMGT3:
    "Production-based GT machinery. Heavy BoP, high downforce, and tight pack racing at endurance events.",
};

const SLOT_FROM_PREFIX: Record<string, PartSlot> = {
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
};

const CAR_FIELD_BY_SLOT: Record<PartSlot, string> = {
  chassis: "chassis_type",
  front_aero: "front_aero_type",
  rear_aero: "rear_aero_type",
  cooling: "cooling_pack",
  wheel_package: "wheel_package",
  suspension: "suspension_layout",
  fuel_system: "fuel_system",
  brake: "brake_system",
  transmission: "transmission",
  hybrid: "hybrid_system",
};

function humanizePartName(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

function parsePartCatalog(repoRoot: string): Map<string, PartOption> {
  const catalogPath = path.join(repoRoot, "configs/part_catalog.txt");
  const parts = new Map<string, PartOption>();
  if (!fs.existsSync(catalogPath)) return parts;

  let currentPrefix = "";
  let currentType = "";
  let stats: Record<string, number> = {};
  let mass = 0;

  const flush = () => {
    if (!currentPrefix || !currentType) return;
    const slot = SLOT_FROM_PREFIX[currentPrefix];
    if (!slot) return;
    parts.set(`${currentPrefix}.${currentType}`, {
      slot,
      partType: currentType,
      fullId: `${currentPrefix}.${currentType}`,
      displayName: humanizePartName(currentType),
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

    const prefix = segments[0];
    const partType = segments[1];
    const statKey = segments.slice(2).join(".");

    if (prefix !== currentPrefix || partType !== currentType) {
      flush();
      currentPrefix = prefix;
      currentType = partType;
      stats = {};
      mass = 0;
    }

    if (statKey === "mass") mass = val;
    else if (!Number.isNaN(val)) stats[statKey] = val;
  }
  flush();
  return parts;
}

function parseClassRules(repoRoot: string): ClassInfo[] {
  const rulesPath = path.join(repoRoot, "configs/class_rules.txt");
  if (!fs.existsSync(rulesPath)) return [];

  const classes: ClassInfo[] = [];
  let current: Partial<ClassInfo> & { legal?: Record<string, string[]> } = {};

  const flush = () => {
    if (!current.id) return;
    classes.push({
      id: current.id,
      displayName: current.displayName ?? current.id,
      description: CLASS_DESCRIPTIONS[current.id] ?? "",
      powerCapHp: current.powerCapHp ?? 0,
      minWeightKg: current.minWeightKg ?? 0,
      maxWeightKg: current.maxWeightKg ?? 0,
      maxStintHours: current.maxStintHours ?? 0,
      templateCarPath: current.templateCarPath ?? "",
    });
  };

  for (const line of fs.readFileSync(rulesPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();

    if (key === "class") {
      flush();
      current = { id: val, legal: {} };
    } else if (key === "display_name") current.displayName = val;
    else if (key === "power_cap_hp") current.powerCapHp = parseFloat(val);
    else if (key === "min_weight_kg") current.minWeightKg = parseFloat(val);
    else if (key === "max_weight_kg") current.maxWeightKg = parseFloat(val);
    else if (key === "max_driver_stint_hours") current.maxStintHours = parseFloat(val);
    else if (key === "template_car") current.templateCarPath = val;
  }
  flush();
  return classes;
}

const STAFF_POOL: Array<{ role: string; names: string[] }> = [
  { role: "engineer", names: ["Marie Chen", "Luca Rossi", "Yuki Tanaka", "Elena Voss"] },
  { role: "mechanic", names: ["Jean Dupont", "Marcus Webb", "Sofia Reyes", "Tom Becker"] },
  { role: "strategist", names: ["Sam Okoye", "Priya Sharma", "Oliver Kent", "Ines Alvarez"] },
];

const ENGINE_KEYS = new Set([
  "engine_layout",
  "fuel_type",
  "cylinders",
  "bore",
  "stroke",
  "max_rpm",
  "peak_torque_nm",
  "peak_torque_rpm",
  "base_vibration",
  "aspiration",
  "drivetrain",
  "generator_kw",
]);

export function parseEngineFromTemplate(
  repoRoot: string,
  templatePath: string,
): EngineBuildPayload | null {
  const abs = path.join(repoRoot, templatePath);
  if (!fs.existsSync(abs)) return null;

  const raw: Record<string, string> = {};
  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (ENGINE_KEYS.has(key)) raw[key] = val;
  }

  if (!raw.engine_layout) return null;

  const layout = raw.engine_layout;
  return {
    engine_layout: layout,
    fuel_type: raw.fuel_type ?? "Gasoline",
    cylinders: raw.cylinders
      ? parseInt(raw.cylinders, 10)
      : cylindersForLayout(layout),
    bore: parseFloat(raw.bore ?? "0.096"),
    stroke: parseFloat(raw.stroke ?? "0.080"),
    max_rpm: parseInt(raw.max_rpm ?? "8000", 10),
    peak_torque_nm: parseFloat(raw.peak_torque_nm ?? "500"),
    peak_torque_rpm: parseInt(raw.peak_torque_rpm ?? "6500", 10),
    base_vibration: parseFloat(raw.base_vibration ?? "1.0"),
    aspiration: raw.aspiration,
    drivetrain: raw.drivetrain,
    generator_kw: raw.generator_kw ? parseFloat(raw.generator_kw) : undefined,
  };
}

export function generateStaffCandidates(): StaffCandidate[] {
  const out: StaffCandidate[] = [];
  for (const pool of STAFF_POOL) {
    for (const name of pool.names) {
      const seed = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const skill = 62 + (seed % 28);
      out.push({
        role: pool.role,
        name,
        skill,
        salary: 120000 + skill * 1500,
      });
    }
  }
  return out;
}

export function loadGameCatalog(repoRoot: string): GameCatalogPayload {
  const allParts = parsePartCatalog(repoRoot);
  const classes = parseClassRules(repoRoot);

  const partsBySlot = {} as Record<PartSlot, PartOption[]>;
  for (const slot of Object.keys(SLOT_FROM_PREFIX) as PartSlot[]) {
    partsBySlot[slot] = [...allParts.values()].filter((p) => p.slot === slot);
  }

  const lemansDrivers = loadLeMansDriverCatalog(repoRoot);
  let lemansDriverCount = 0;
  for (const roster of lemansDrivers.values()) lemansDriverCount += roster.length;

  const defaultEngines: Record<string, EngineBuildPayload> = {};
  for (const cls of classes) {
    if (!cls.templateCarPath) continue;
    const engine = parseEngineFromTemplate(repoRoot, cls.templateCarPath);
    if (engine) defaultEngines[cls.id] = engine;
  }

  return {
    classes,
    partsBySlot,
    staffCandidates: generateStaffCandidates(),
    sponsorOffers: sponsorOffersPayload(),
    carPlatforms: loadCarPlatforms(repoRoot),
    fleetRules: fleetRulesPayload(),
    driverStatDefs: DRIVER_STAT_DEFS,
    driverPointPool: DRIVER_POINT_POOL,
    lemansDriverCount,
    driverMarketPreview: buildDriverMarketPreview(repoRoot),
    defaultEngines,
    assemblyRules: loadAssemblyRules(repoRoot),
  };
}

export function defaultBuildForClass(
  repoRoot: string,
  classId: string,
): Record<string, string> | null {
  const classes = parseClassRules(repoRoot);
  const info = classes.find((c) => c.id === classId);
  if (!info?.templateCarPath) return null;

  const abs = path.join(repoRoot, info.templateCarPath);
  if (!fs.existsSync(abs)) return null;

  const build: Record<string, string> = { carName: `${classId} Race Car` };
  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "car_name") build.carName = val;
    else if (Object.values(CAR_FIELD_BY_SLOT).includes(key)) build[key] = val;
    else if (ENGINE_KEYS.has(key)) build[key] = val;
  }
  return build;
}

export { CAR_FIELD_BY_SLOT, SLOT_FROM_PREFIX };

export function defaultWheelPackageForClass(classId: string): string {
  if (classId === "LMGT3") return "GT3Front20Rear21";
  if (classId === "LMP2") return "LMP2Oreca18";
  return "Hypercar18Standard";
}

export function defaultSuspensionForClass(classId: string): string {
  if (classId === "LMGT3") return "DoubleWishboneGT3";
  if (classId === "LMP2") return "OrecaLMP2Spec";
  return "PushrodDoubleWishbone";
}
