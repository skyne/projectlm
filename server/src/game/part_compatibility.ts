import * as fs from "fs";
import * as path from "path";
import type { CarBuildPayload } from "../ws_protocol";

/** Config slot names in part_compatibility.txt → CarBuildPayload fields. */
export const BUILD_FIELD_BY_CONFIG_SLOT: Record<string, keyof CarBuildPayload> = {
  chassis: "chassis_type",
  front_aero: "front_aero_type",
  rear_aero: "rear_aero_type",
  cooling: "cooling_pack",
  wheel_package: "wheel_package",
  suspension: "suspension_layout",
  fuel_system: "fuel_system",
  brake_system: "brake_system",
  transmission: "transmission",
  hybrid_system: "hybrid_system",
};

export interface AssemblyRequiresAnyRule {
  kind: "requires_any";
  ifSlot: string;
  ifPart: string;
  requiresSlot: string;
  requiresAnyParts: string[];
}

export interface AssemblyRequiresRule {
  kind: "requires";
  ifSlot: string;
  ifPart: string;
  requiresSlot: string;
  requiresPart: string;
}

export type AssemblyRule = AssemblyRequiresAnyRule | AssemblyRequiresRule;

function trim(s: string): string {
  return s.trim();
}

export function loadAssemblyRules(repoRoot: string): AssemblyRule[] {
  const file = path.join(repoRoot, "configs/part_compatibility.txt");
  if (!fs.existsSync(file)) return [];

  const rules: AssemblyRule[] = [];
  type ParserState = {
    kind: "requires" | "requires_any";
    ifSlot?: string;
    ifPart?: string;
    requiresSlot?: string;
    requiresPart?: string;
    requiresAnyParts: string[];
  };
  let current: ParserState | null = null;

  const flush = () => {
    if (!current?.ifSlot || !current.ifPart || !current.requiresSlot) {
      current = null;
      return;
    }
    if (current.kind === "requires" && current.requiresPart) {
      rules.push({
        kind: "requires",
        ifSlot: current.ifSlot,
        ifPart: current.ifPart,
        requiresSlot: current.requiresSlot,
        requiresPart: current.requiresPart,
      });
    } else if (current.requiresAnyParts.length > 0) {
      rules.push({
        kind: "requires_any",
        ifSlot: current.ifSlot,
        ifPart: current.ifPart,
        requiresSlot: current.requiresSlot,
        requiresAnyParts: current.requiresAnyParts,
      });
    }
    current = null;
  };

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = trim(line);
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trim(trimmed.slice(0, eq));
    const value = trim(trimmed.slice(eq + 1));

    if (key === "rule") {
      flush();
      current = { kind: "requires_any", requiresAnyParts: [] };
    } else if (!current) {
      continue;
    } else if (key === "if_slot") {
      current.ifSlot = value;
    } else if (key === "if_part") {
      current.ifPart = value;
    } else if (key === "requires_slot") {
      current.requiresSlot = value;
    } else if (key === "requires_part") {
      current.kind = "requires";
      current.requiresPart = value;
    } else if (key === "requires_any_parts") {
      current.kind = "requires_any";
      current.requiresAnyParts = value.split(",").map(trim).filter(Boolean);
    }
  }
  flush();
  return rules;
}

export function buildFieldValue(
  build: CarBuildPayload,
  configSlot: string,
): string {
  const field = BUILD_FIELD_BY_CONFIG_SLOT[configSlot];
  if (!field) return "";
  const value = build[field];
  return typeof value === "string" ? value : "";
}

function validateFuelSystemPowertrain(build: CarBuildPayload): string | null {
  if (
    build.fuel_system === "HydrogenTank" &&
    build.engine?.fuel_type !== "Hydrogen"
  ) {
    return "Hydrogen tank requires Hydrogen fuel in the powertrain";
  }
  return null;
}

export function validateAssemblyCompatibility(
  build: CarBuildPayload,
  rules: AssemblyRule[],
): string | null {
  for (const rule of rules) {
    if (buildFieldValue(build, rule.ifSlot) !== rule.ifPart) continue;

    const other = buildFieldValue(build, rule.requiresSlot);
    if (rule.kind === "requires") {
      if (other !== rule.requiresPart) {
        return `${rule.ifPart} requires ${rule.requiresPart} on ${rule.requiresSlot}`;
      }
    } else if (!rule.requiresAnyParts.includes(other)) {
      return `${rule.ifPart} is not compatible with ${other} on ${rule.requiresSlot}`;
    }
  }

  if (
    build.rear_aero_type === "WinglessGroundEffect" &&
    build.front_aero_type !== "LowDragNose"
  ) {
    return "Wingless rear package requires Low Drag Nose";
  }

  return validateFuelSystemPowertrain(build);
}

/** True when selecting `candidatePart` for `configSlot` keeps the build valid. */
export function isAssemblyPartCompatible(
  build: CarBuildPayload,
  configSlot: string,
  candidatePart: string,
  rules: AssemblyRule[],
): boolean {
  const field = BUILD_FIELD_BY_CONFIG_SLOT[configSlot];
  if (!field) return true;
  const preview = { ...build, [field]: candidatePart };
  return validateAssemblyCompatibility(preview, rules) === null;
}
