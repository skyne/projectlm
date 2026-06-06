import type { CarBuildPayload } from "../ws_protocol";
import { loadGameCatalog, type PartSlot } from "../game/catalog";

export const BUILD_PART_FIELDS: Array<keyof CarBuildPayload> = [
  "chassis_type",
  "front_aero_type",
  "rear_aero_type",
  "cooling_pack",
  "wheel_package",
  "suspension_layout",
  "fuel_system",
  "brake_system",
  "transmission",
  "hybrid_system",
];

const FIELD_TO_SLOT: Partial<Record<keyof CarBuildPayload, PartSlot>> = {
  chassis_type: "chassis",
  front_aero_type: "front_aero",
  rear_aero_type: "rear_aero",
  cooling_pack: "cooling",
  wheel_package: "wheel_package",
  suspension_layout: "suspension",
  fuel_system: "fuel_system",
  brake_system: "brake",
  transmission: "transmission",
  hybrid_system: "hybrid",
};

function isRdLocked(fullId: string, unlocked: Set<string>): boolean {
  if (fullId === "brake.CarbonCeramic" && !unlocked.has("brake.CarbonCeramic")) {
    return true;
  }
  if (fullId === "tire.Soft" && !unlocked.has("tire.Soft")) {
    return true;
  }
  return false;
}

export function resolvePartTypeForField(
  repoRoot: string,
  field: keyof CarBuildPayload,
  rawValue: string,
  unlockedParts: string[],
): string | null {
  const slot = FIELD_TO_SLOT[field];
  if (!slot) return null;
  const catalog = loadGameCatalog(repoRoot);
  const parts = catalog.partsBySlot[slot] ?? [];
  const unlocked = new Set(unlockedParts);
  const needle = rawValue.trim().toLowerCase();
  if (!needle) return null;

  const candidates = parts.filter((p) => !isRdLocked(p.fullId, unlocked));

  const exact = candidates.find((p) => p.partType.toLowerCase() === needle);
  if (exact) return exact.partType;

  const byId = candidates.find(
    (p) =>
      p.fullId.toLowerCase() === needle ||
      p.fullId.toLowerCase().endsWith(`.${needle}`),
  );
  if (byId) return byId.partType;

  const byName = candidates.find((p) => p.displayName.toLowerCase() === needle);
  if (byName) return byName.partType;

  const partial = candidates.find(
    (p) =>
      p.partType.toLowerCase().includes(needle) ||
      needle.includes(p.partType.toLowerCase()) ||
      p.displayName.toLowerCase().includes(needle),
  );
  return partial?.partType ?? null;
}

export function compactCatalogForGarage(
  repoRoot: string,
  classId: string,
  unlockedParts: string[],
): Record<string, string[]> {
  const catalog = loadGameCatalog(repoRoot);
  const unlocked = new Set(unlockedParts);
  const out: Record<string, string[]> = {};
  for (const [slot, parts] of Object.entries(catalog.partsBySlot)) {
    out[slot] = parts.map((p) => {
      const locked = isRdLocked(p.fullId, unlocked);
      return `${p.partType} (${p.displayName}, ${p.mass}kg)${locked ? " [R&D LOCKED]" : ""}`;
    });
  }
  const classInfo = catalog.classes.find((c) => c.id === classId);
  return {
    class: [classInfo?.displayName ?? classId],
    powerCapHp: [String(classInfo?.powerCapHp ?? 0)],
    weightWindowKg: [
      `${classInfo?.minWeightKg ?? 0}-${classInfo?.maxWeightKg ?? 0}`,
    ],
    ...out,
  };
}

export function normalizeGarageChanges(
  repoRoot: string,
  raw: Record<string, unknown> | undefined,
  unlockedParts: string[],
): Partial<CarBuildPayload> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<CarBuildPayload> = {};
  for (const key of BUILD_PART_FIELDS) {
    const val = raw[key];
    if (typeof val !== "string" || !val.trim()) continue;
    const resolved = resolvePartTypeForField(repoRoot, key, val, unlockedParts);
    if (resolved) (out as Record<string, string>)[key] = resolved;
  }
  const numericKeys: Array<keyof CarBuildPayload> = [
    "front_ride_height_mm",
    "rear_ride_height_mm",
    "front_spring_nm",
    "rear_spring_nm",
    "front_arb_stiffness",
    "rear_arb_stiffness",
    "front_damper_bump",
    "front_damper_rebound",
    "rear_damper_bump",
    "rear_damper_rebound",
    "front_camber_deg",
    "rear_camber_deg",
    "front_toe_deg",
    "rear_toe_deg",
    "final_drive_ratio",
  ];
  for (const key of numericKeys) {
    const val = raw[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      (out as Record<string, number>)[key] = val;
    }
  }
  return out;
}
