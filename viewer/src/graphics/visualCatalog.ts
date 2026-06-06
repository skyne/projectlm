import type { SpriteSocket } from "./spritePlacement";

export type { SpriteSocket };

export interface CatalogLayer {
  layer: string;
  width: number;
  height: number;
  z?: number;
  layerType?: "chassis_base" | "full_canvas_overlay" | "sprite";
  slot?: string;
  socket?: SpriteSocket;
  compatibleChassis?: string[];
  classId?: string;
  anchor?: { x: number; y: number };
}

export interface VisualCatalog {
  version: number;
  chassis: Record<string, CatalogLayer>;
  front_aero: Record<string, CatalogLayer>;
  rear_aero: Record<string, CatalogLayer>;
  wheel_package: Record<string, CatalogLayer>;
  hybrid_system: Record<string, CatalogLayer>;
}

export interface VisualAssembly {
  version: number;
  canvas: { width: number; height: number; aspectRatio?: string };
  chassisAliases: Record<string, string>;
  layerOrder: Array<{
    slot: string;
    z: number;
    skip?: string[];
    only?: string[];
    except?: string[];
  }>;
}

export interface CarBuildVisual {
  chassis_type: string;
  front_aero_type: string;
  rear_aero_type: string;
  wheel_package?: string;
  hybrid_system: string;
}

/** Map sim build payload fields to compositor layer ids. */
export function carBuildToVisual(build: {
  chassis_type: string;
  front_aero_type: string;
  rear_aero_type: string;
  wheel_package?: string;
  hybrid_system: string;
}): CarBuildVisual {
  return {
    chassis_type: build.chassis_type,
    front_aero_type: build.front_aero_type,
    rear_aero_type: build.rear_aero_type,
    wheel_package: build.wheel_package,
    hybrid_system: build.hybrid_system,
  };
}

const BUILD_KEYS: Record<string, keyof CarBuildVisual> = {
  chassis: "chassis_type",
  front_aero: "front_aero_type",
  rear_aero: "rear_aero_type",
  wheel_package: "wheel_package",
  hybrid_system: "hybrid_system",
};

/** Legacy sim/catalog IDs → current visual_catalog.json keys. */
const VISUAL_PART_ALIASES: Record<string, string> = {
  LMDh500kW: "LMDh50kW",
};

export function resolveChassisId(
  build: CarBuildVisual,
  assembly: VisualAssembly,
): string {
  return assembly.chassisAliases[build.chassis_type] ?? build.chassis_type;
}

export function resolveLayers(
  build: CarBuildVisual,
  catalog: VisualCatalog,
  assembly: VisualAssembly,
): Array<{ z: number; src: string; layer?: CatalogLayer }> {
  const chassisId = resolveChassisId(build, assembly);
  const out: Array<{ z: number; src: string; layer?: CatalogLayer }> = [];

  for (const rule of assembly.layerOrder) {
    const { slot } = rule;
    if (slot === "chassis") {
      const entry = catalog.chassis[chassisId];
      if (entry) out.push({ z: rule.z, src: `/${entry.layer}`, layer: entry });
      continue;
    }

    const key = BUILD_KEYS[slot];
    const partId = key ? build[key] : undefined;
    if (!partId || typeof partId !== "string") continue;
    if (rule.skip?.includes(partId)) continue;
    if (rule.only && !rule.only.includes(partId)) continue;
    if (rule.except?.includes(partId)) continue;

    const bucket = catalog[slot as keyof VisualCatalog];
    if (!bucket || typeof bucket !== "object") continue;
    const resolvedPartId = VISUAL_PART_ALIASES[partId] ?? partId;
    const entry = (bucket as Record<string, CatalogLayer>)[resolvedPartId];
    if (entry) out.push({ z: entry.z ?? rule.z, src: `/${entry.layer}`, layer: entry });
  }

  return out.sort((a, b) => a.z - b.z);
}
