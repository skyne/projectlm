import * as fs from "fs";
import * as path from "path";
import type { CarBuildPayload } from "../ws_protocol";
import {
  EV_ONLY_OUTLET_PARTS,
  isElectricDriveOutletBuild,
  isEvLegalOutlet,
} from "./ev_outlet";

/** Config slot names in part_compatibility.txt → CarBuildPayload fields. */
export const BUILD_FIELD_BY_CONFIG_SLOT: Record<string, keyof CarBuildPayload> = {
  chassis: "chassis_type",
  front_aero: "front_aero_type",
  rear_aero: "rear_aero_type",
  diffuser: "diffuser_type",
  exhaust: "exhaust_type",
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
  if (typeof value === "string" && value) return value;
  if (field === "diffuser_type") return "StockFloor";
  if (field === "exhaust_type") return "TwinOutletSide";
  return "";
}

function validateFuelSystemPowertrain(build: CarBuildPayload): string | null {
  if (
    build.fuel_system === "HydrogenTank" &&
    build.engine?.fuel_type !== "Hydrogen"
  ) {
    return "Hydrogen tank requires Hydrogen fuel in the powertrain";
  }
  const eng = build.engine;
  if (eng?.fuel_type === "Hydrogen" && eng.energy_converter === "FuelCell") {
    if (build.hybrid_system && build.hybrid_system !== "None") {
      return "Fuel cell powertrain cannot use a separate hybrid system";
    }
    if (build.transmission && build.transmission !== "SingleSpeedEDrive") {
      return "Hydrogen fuel cell requires SingleSpeedEDrive transmission";
    }
    if (eng.drivetrain && eng.drivetrain !== "FullEV") {
      return "Hydrogen fuel cell requires FullEV drivetrain";
    }
  }
  if (eng?.fuel_type === "Hydrogen" && eng.drivetrain === "RangeExtender") {
    return "Hydrogen range-extender is not supported; use fuel cell instead";
  }
  return null;
}

const DPF_EXHAUST_PARTS = new Set(["DieselDPF", "DieselDPFSport"]);

function validateExhaustPowertrain(build: CarBuildPayload): string | null {
  const exhaust = build.exhaust_type ?? "TwinOutletSide";
  const eng = build.engine;
  if (DPF_EXHAUST_PARTS.has(exhaust) && eng?.fuel_type !== "Diesel") {
    return "Diesel DPF exhaust requires Diesel fuel in the powertrain";
  }
  const isEv = isElectricDriveOutletBuild(eng);
  if (isEv && !isEvLegalOutlet(exhaust)) {
    return "E-drive powertrain requires an underbody outlet package";
  }
  if (!isEv && (exhaust === "None" || EV_ONLY_OUTLET_PARTS.has(exhaust))) {
    return "Combustion powertrain requires an exhaust system";
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
    build.front_aero_type !== "LowDragNose" &&
    build.front_aero_type !== "LowDragNoseSlim"
  ) {
    return "Wingless rear package requires a low-drag nose";
  }

  if (
    build.rear_aero_type === "WinglessGroundEffect" &&
    (build.diffuser_type ?? "StockFloor") === "StockFloor"
  ) {
    return "Wingless rear requires a diffuser floor package";
  }

  const exhaustErr = validateExhaustPowertrain(build);
  if (exhaustErr) return exhaustErr;

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
