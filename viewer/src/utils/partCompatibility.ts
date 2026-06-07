import type {
  AssemblyRulePayload,
  CarBuildPayload,
} from "../ws/protocol";
import type { PartSlot } from "./carStats";

const BUILD_FIELD_BY_CONFIG_SLOT: Record<string, keyof CarBuildPayload> = {
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

/** Viewer part tab → config slot in assembly rules. */
export const CONFIG_SLOT_BY_PART_SLOT: Record<PartSlot, string> = {
  chassis: "chassis",
  front_aero: "front_aero",
  rear_aero: "rear_aero",
  cooling: "cooling",
  wheel_package: "wheel_package",
  suspension: "suspension",
  fuel_system: "fuel_system",
  brake: "brake_system",
  transmission: "transmission",
  hybrid: "hybrid_system",
};

function buildFieldValue(build: CarBuildPayload, configSlot: string): string {
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
  rules: AssemblyRulePayload[],
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

  return validateFuelSystemPowertrain(build);
}

export function isPartCompatibleWithBuild(
  build: CarBuildPayload,
  slot: PartSlot,
  candidatePart: string,
  rules: AssemblyRulePayload[],
): boolean {
  const configSlot = CONFIG_SLOT_BY_PART_SLOT[slot];
  const field = BUILD_FIELD_BY_CONFIG_SLOT[configSlot];
  if (!field) return true;
  const preview = { ...build, [field]: candidatePart };
  return validateAssemblyCompatibility(preview, rules) === null;
}
