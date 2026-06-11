import { randomUUID } from "crypto";
import type { CarBuildPayload, FleetCarPayload } from "../ws_protocol";
import { BUILD_FIELD_BY_CONFIG_SLOT } from "./part_compatibility";
import type { PartCategory } from "./facilities";
import {
  newPartInstance,
  type PartInstance,
  type PartInstanceSource,
} from "./part_instances";

/** Config slot → facility category for R&D gating. */
const SLOT_CATEGORY: Record<string, PartCategory> = {
  chassis: "chassis",
  front_aero: "aero",
  rear_aero: "aero",
  diffuser: "aero",
  exhaust: "powertrain",
  cooling: "cooling",
  wheel_package: "bodywork",
  suspension: "chassis",
  fuel_system: "powertrain",
  brake: "chassis",
  transmission: "powertrain",
  hybrid: "powertrain",
};

/** CarBuild field keys that are not installable parts. */
const SKIP_BUILD_FIELDS = new Set(["carName", "engine"]);

function catalogPrefixForConfigSlot(slot: string): string {
  if (slot === "brake_system") return "brake";
  return slot;
}

export function partTypesFromBuild(
  build: CarBuildPayload,
): Array<{ slot: string; catalogId: string }> {
  const rows: Array<{ slot: string; catalogId: string }> = [];
  for (const [configSlot, field] of Object.entries(BUILD_FIELD_BY_CONFIG_SLOT)) {
    if (SKIP_BUILD_FIELDS.has(field)) continue;
    const partType = build[field];
    if (typeof partType !== "string" || !partType.trim()) continue;
    if (partType === "None") continue;
    const slot = catalogPrefixForConfigSlot(configSlot);
    rows.push({ slot, catalogId: `${slot}.${partType}` });
  }
  return rows;
}

export function partSourceForCar(car: FleetCarPayload): PartInstanceSource {
  if (car.acquisition === "privateer") return "licensed";
  return "inhouse";
}

/** Add owned part instances for any catalog parts on fleet builds not yet tracked. */
export function mergePartInstancesFromFleet(
  existing: PartInstance[],
  fleet: FleetCarPayload[],
): PartInstance[] {
  const byCatalog = new Map(existing.map((p) => [p.catalogId, p]));
  for (const car of fleet) {
    const source = partSourceForCar(car);
    for (const row of partTypesFromBuild(car.build)) {
      if (byCatalog.has(row.catalogId)) continue;
      const category = SLOT_CATEGORY[row.slot] ?? "chassis";
      const inst = newPartInstance(row.catalogId, row.slot, category, source);
      inst.id = `part-${row.catalogId.replace(/\./g, "-")}-${randomUUID().slice(0, 8)}`;
      byCatalog.set(row.catalogId, inst);
    }
  }
  return [...byCatalog.values()];
}
