import * as fs from "fs";
import * as path from "path";
import type { PartSlot } from "./catalog";

/** Config keys in class_rules.txt → garage part slots. */
export const LEGAL_KEY_BY_SLOT: Record<PartSlot, string> = {
  chassis: "legal_chassis",
  front_aero: "legal_front_aero",
  rear_aero: "legal_rear_aero",
  diffuser: "legal_diffuser",
  exhaust: "legal_exhaust",
  cooling: "legal_cooling",
  wheel_package: "legal_wheel_package",
  suspension: "legal_suspension",
  fuel_system: "legal_fuel_system",
  brake: "legal_brakes",
  transmission: "legal_transmission",
  hybrid: "legal_hybrid",
};

export type ClassLegalParts = Partial<Record<PartSlot, string[]>>;

export interface ParsedClassRule {
  id: string;
  displayName: string;
  description?: string;
  powerCapHp: number;
  minWeightKg: number;
  maxWeightKg: number;
  maxStintHours: number;
  templateCarPath: string;
  legalParts: ClassLegalParts;
}

const CLASS_DESCRIPTIONS: Record<string, string> = {
  Hypercar:
    "Top-tier hybrid prototypes. Maximum pace, complex energy recovery, and the highest development ceiling.",
  LMP2:
    "Spec-balanced prototype class. Consistent lap times, lower cost, ideal for learning race strategy.",
  LMGT3:
    "Production-based GT machinery. Heavy BoP, high downforce, and tight pack racing at endurance events.",
};

const LEGAL_PREFIX = "legal_";

function slotFromLegalKey(key: string): PartSlot | null {
  for (const [slot, legalKey] of Object.entries(LEGAL_KEY_BY_SLOT) as Array<
    [PartSlot, string]
  >) {
    if (legalKey === key) return slot;
  }
  return null;
}

function parseLegalParts(raw: Record<string, string[]>): ClassLegalParts {
  const out: ClassLegalParts = {};
  for (const [key, parts] of Object.entries(raw)) {
    const slot = slotFromLegalKey(key);
    if (slot) out[slot] = parts;
  }
  return out;
}

/** Parse all class blocks from class_rules.txt (BoP caps + legal part lists). */
export function loadParsedClassRules(repoRoot: string): ParsedClassRule[] {
  const rulesPath = path.join(repoRoot, "configs/class_rules.txt");
  if (!fs.existsSync(rulesPath)) return [];

  const classes: ParsedClassRule[] = [];
  let current: Partial<ParsedClassRule> & { legalRaw?: Record<string, string[]> } = {
    legalRaw: {},
  };

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
      legalParts: parseLegalParts(current.legalRaw ?? {}),
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
      current = { id: val, legalRaw: {} };
    } else if (key === "display_name") {
      current.displayName = val;
    } else if (key === "power_cap_hp") {
      current.powerCapHp = parseFloat(val);
    } else if (key === "min_weight_kg") {
      current.minWeightKg = parseFloat(val);
    } else if (key === "max_weight_kg") {
      current.maxWeightKg = parseFloat(val);
    } else if (key === "max_driver_stint_hours") {
      current.maxStintHours = parseFloat(val);
    } else if (key === "template_car") {
      current.templateCarPath = val;
    } else if (key.startsWith(LEGAL_PREFIX)) {
      current.legalRaw ??= {};
      current.legalRaw[key] = val.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  flush();
  return classes;
}

export function legalPartsForSlot(
  classInfo: Pick<ParsedClassRule, "legalParts"> | undefined,
  slot: PartSlot,
): Set<string> | undefined {
  const list = classInfo?.legalParts[slot];
  if (!list?.length) return undefined;
  return new Set(list);
}

export function isPartLegalForClass(
  classInfo: Pick<ParsedClassRule, "legalParts"> | undefined,
  slot: PartSlot,
  partType: string,
): boolean {
  const allowed = legalPartsForSlot(classInfo, slot);
  if (!allowed) return true;
  return allowed.has(partType);
}

export function filterPartsForClass<T extends { partType: string }>(
  classInfo: Pick<ParsedClassRule, "legalParts"> | undefined,
  slot: PartSlot,
  parts: T[],
): T[] {
  const allowed = legalPartsForSlot(classInfo, slot);
  if (!allowed) return parts;
  return parts.filter((p) => allowed.has(p.partType));
}

const GARAGE_PART_SLOTS: PartSlot[] = [
  "chassis",
  "front_aero",
  "rear_aero",
  "diffuser",
  "exhaust",
  "cooling",
  "wheel_package",
  "suspension",
  "fuel_system",
  "brake",
  "transmission",
  "hybrid",
];

/** Ensures every class has ≥ minOptions selectable parts per garage slot. */
export function auditClassPartMinimums(
  classes: ParsedClassRule[],
  partsBySlot: Record<PartSlot, { partType: string }[]>,
  minOptions = 3,
): string[] {
  const failures: string[] = [];
  for (const cls of classes) {
    for (const slot of GARAGE_PART_SLOTS) {
      const visible = filterPartsForClass(cls, slot, partsBySlot[slot] ?? []);
      if (visible.length < minOptions) {
        failures.push(
          `${cls.id}.${slot}: ${visible.length} visible (need ${minOptions}) — ${visible.map((p) => p.partType).join(", ") || "none"}`,
        );
      }
    }
  }
  return failures;
}
