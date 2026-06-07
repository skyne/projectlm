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

export const CONFIG_SLOT_LABELS: Record<string, string> = {
  chassis: "Chassis",
  front_aero: "Front Aero",
  rear_aero: "Rear Aero",
  cooling: "Cooling",
  wheel_package: "Wheels & Tyres",
  suspension: "Suspension",
  fuel_system: "Fuel System",
  brake_system: "Brakes",
  transmission: "Transmission",
  hybrid_system: "Hybrid / ERS",
  engine: "Engine",
};

export type AssemblyConflict =
  | {
      kind: "requires";
      triggerSlot: string;
      triggerPart: string;
      otherSlot: string;
      otherPart: string;
      requiredPart: string;
    }
  | {
      kind: "requires_any";
      triggerSlot: string;
      triggerPart: string;
      otherSlot: string;
      otherPart: string;
      allowedParts: string[];
    }
  | {
      kind: "wingless_nose";
      otherPart: string;
    }
  | {
      kind: "hydrogen_fuel";
      otherPart: string;
    }
  | {
      kind: "fuel_cell_hybrid";
      otherPart: string;
    }
  | {
      kind: "fuel_cell_transmission";
      otherPart: string;
    }
  | {
      kind: "fuel_cell_drivetrain";
      otherPart: string;
    }
  | {
      kind: "h2_rex_blocked";
    };

function buildFieldValue(build: CarBuildPayload, configSlot: string): string {
  const field = BUILD_FIELD_BY_CONFIG_SLOT[configSlot];
  if (!field) return "";
  const value = build[field];
  return typeof value === "string" ? value : "";
}

function findFuelSystemConflict(
  build: CarBuildPayload,
): AssemblyConflict | null {
  if (
    build.fuel_system === "HydrogenTank" &&
    build.engine?.fuel_type !== "Hydrogen"
  ) {
    return {
      kind: "hydrogen_fuel",
      otherPart: build.engine?.fuel_type ?? "Gasoline",
    };
  }
  const eng = build.engine;
  if (eng?.fuel_type === "Hydrogen" && eng.energy_converter === "FuelCell") {
    if (build.hybrid_system && build.hybrid_system !== "None") {
      return { kind: "fuel_cell_hybrid", otherPart: build.hybrid_system };
    }
    if (build.transmission && build.transmission !== "SingleSpeedEDrive") {
      return { kind: "fuel_cell_transmission", otherPart: build.transmission };
    }
    if (eng.drivetrain && eng.drivetrain !== "FullEV") {
      return { kind: "fuel_cell_drivetrain", otherPart: eng.drivetrain };
    }
  }
  if (eng?.fuel_type === "Hydrogen" && eng.drivetrain === "RangeExtender") {
    return { kind: "h2_rex_blocked" };
  }
  return null;
}

function findWinglessNoseConflict(
  build: CarBuildPayload,
): AssemblyConflict | null {
  if (
    build.rear_aero_type === "WinglessGroundEffect" &&
    build.front_aero_type !== "LowDragNose" &&
    build.front_aero_type !== "LowDragNoseSlim"
  ) {
    return {
      kind: "wingless_nose",
      otherPart: build.front_aero_type,
    };
  }
  return null;
}

export function findAssemblyConflict(
  build: CarBuildPayload,
  rules: AssemblyRulePayload[],
): AssemblyConflict | null {
  for (const rule of rules) {
    if (buildFieldValue(build, rule.ifSlot) !== rule.ifPart) continue;

    const other = buildFieldValue(build, rule.requiresSlot);
    if (rule.kind === "requires") {
      if (other !== rule.requiresPart) {
        return {
          kind: "requires",
          triggerSlot: rule.ifSlot,
          triggerPart: rule.ifPart,
          otherSlot: rule.requiresSlot,
          otherPart: other,
          requiredPart: rule.requiresPart,
        };
      }
    } else if (!rule.requiresAnyParts.includes(other)) {
      return {
        kind: "requires_any",
        triggerSlot: rule.ifSlot,
        triggerPart: rule.ifPart,
        otherSlot: rule.requiresSlot,
        otherPart: other,
        allowedParts: rule.requiresAnyParts,
      };
    }
  }

  return findWinglessNoseConflict(build) ?? findFuelSystemConflict(build);
}

export function formatAssemblyConflict(
  conflict: AssemblyConflict,
  resolvePartName: (configSlot: string, partType: string) => string,
  editingConfigSlot: string,
  candidatePart: string,
): string {
  const slotLabel = (slot: string) => CONFIG_SLOT_LABELS[slot] ?? slot;
  const partLabel = (slot: string, partType: string) =>
    resolvePartName(slot, partType);

  if (conflict.kind === "hydrogen_fuel") {
    const fuel = partLabel("engine", conflict.otherPart);
    return `Requires hydrogen powertrain — current fuel: ${fuel}`;
  }

  if (conflict.kind === "fuel_cell_hybrid") {
    return "Fuel cell powertrain cannot use a separate hybrid system";
  }
  if (conflict.kind === "fuel_cell_transmission") {
    return "Hydrogen fuel cell requires SingleSpeedEDrive transmission";
  }
  if (conflict.kind === "fuel_cell_drivetrain") {
    return "Hydrogen fuel cell requires FullEV drivetrain";
  }
  if (conflict.kind === "h2_rex_blocked") {
    return "Hydrogen range-extender is not supported; use fuel cell instead";
  }

  if (conflict.kind === "wingless_nose") {
    const rear = partLabel("rear_aero", "WinglessGroundEffect");
    if (editingConfigSlot === "front_aero") {
      return `Conflicts with ${rear} (Rear Aero) — wingless package needs a low-drag nose`;
    }
    const front = partLabel("front_aero", conflict.otherPart);
    return `Not compatible with ${front} (Front Aero) — wingless package needs a low-drag nose`;
  }

  const triggerLabel = partLabel(conflict.triggerSlot, conflict.triggerPart);
  const otherLabel = partLabel(conflict.otherSlot, conflict.otherPart);
  const triggerSlotLabel = slotLabel(conflict.triggerSlot);
  const otherSlotLabel = slotLabel(conflict.otherSlot);

  if (conflict.kind === "requires") {
    const requiredLabel = partLabel(conflict.otherSlot, conflict.requiredPart);
    if (
      conflict.triggerSlot === editingConfigSlot &&
      conflict.triggerPart === candidatePart
    ) {
      return `Requires ${requiredLabel} (${otherSlotLabel}) — fitted: ${otherLabel}`;
    }
    return `Conflicts with ${triggerLabel} (${triggerSlotLabel}) — requires ${requiredLabel} (${otherSlotLabel})`;
  }

  const allowed = conflict.allowedParts
    .map((partType) => partLabel(conflict.otherSlot, partType))
    .join(" or ");

  if (
    conflict.triggerSlot === editingConfigSlot &&
    conflict.triggerPart === candidatePart
  ) {
    return `Requires ${allowed} (${otherSlotLabel}) — fitted: ${otherLabel}`;
  }

  return `Conflicts with ${triggerLabel} (${triggerSlotLabel}) — requires ${allowed}`;
}

export function validateAssemblyCompatibility(
  build: CarBuildPayload,
  rules: AssemblyRulePayload[],
): string | null {
  const conflict = findAssemblyConflict(build, rules);
  if (!conflict) return null;

  if (conflict.kind === "wingless_nose") {
    return "Wingless rear package requires a low-drag nose";
  }
  if (conflict.kind === "hydrogen_fuel") {
    return "Hydrogen tank requires Hydrogen fuel in the powertrain";
  }
  if (conflict.kind === "fuel_cell_hybrid") {
    return "Fuel cell powertrain cannot use a separate hybrid system";
  }
  if (conflict.kind === "fuel_cell_transmission") {
    return "Hydrogen fuel cell requires SingleSpeedEDrive transmission";
  }
  if (conflict.kind === "fuel_cell_drivetrain") {
    return "Hydrogen fuel cell requires FullEV drivetrain";
  }
  if (conflict.kind === "h2_rex_blocked") {
    return "Hydrogen range-extender is not supported; use fuel cell instead";
  }
  if (conflict.kind === "requires") {
    return `${conflict.triggerPart} requires ${conflict.requiredPart} on ${conflict.otherSlot}`;
  }
  return `${conflict.triggerPart} is not compatible with ${conflict.otherPart} on ${conflict.otherSlot}`;
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
  return findAssemblyConflict(preview, rules) === null;
}

export function describePartIncompatibility(
  build: CarBuildPayload,
  slot: PartSlot,
  candidatePart: string,
  rules: AssemblyRulePayload[],
  resolvePartName: (configSlot: string, partType: string) => string,
): string | null {
  const configSlot = CONFIG_SLOT_BY_PART_SLOT[slot];
  const field = BUILD_FIELD_BY_CONFIG_SLOT[configSlot];
  if (!field) return null;
  const preview = { ...build, [field]: candidatePart };
  const conflict = findAssemblyConflict(preview, rules);
  if (!conflict) return null;
  return formatAssemblyConflict(
    conflict,
    resolvePartName,
    configSlot,
    candidatePart,
  );
}
