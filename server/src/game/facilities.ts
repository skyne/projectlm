/** HQ facility tiers — gate which part categories can be developed in-house. */

export type FacilityId =
  | "wind_tunnel"
  | "carbon_fab"
  | "design_studio"
  | "dyno_cell"
  | "composite_shop";

export type PartCategory =
  | "aero"
  | "chassis"
  | "powertrain"
  | "bodywork"
  | "cooling";

export interface FacilityState {
  id: FacilityId;
  tier: number; // 0 = not built, 1+ = operational
}

export const FACILITY_DEFS: Record<
  FacilityId,
  { label: string; categories: PartCategory[]; buildCost: number }
> = {
  wind_tunnel: { label: "Wind tunnel", categories: ["aero"], buildCost: 2_500_000 },
  carbon_fab: { label: "Carbon fabrication", categories: ["chassis"], buildCost: 3_000_000 },
  design_studio: {
    label: "Design studio",
    categories: ["chassis"],
    buildCost: 1_500_000,
  },
  dyno_cell: { label: "Dyno / test cell", categories: ["powertrain"], buildCost: 2_000_000 },
  composite_shop: {
    label: "Composite shop",
    categories: ["bodywork", "cooling"],
    buildCost: 1_200_000,
  },
};

/** Chassis dev needs carbon fab + design studio at tier ≥ 1. */
export function canDevelopCategory(
  facilities: FacilityState[],
  category: PartCategory,
): boolean {
  const byId = new Map(facilities.map((f) => [f.id, f.tier]));
  const tier = (id: FacilityId) => byId.get(id) ?? 0;

  switch (category) {
    case "aero":
      return tier("wind_tunnel") >= 1;
    case "chassis":
      return tier("carbon_fab") >= 1 && tier("design_studio") >= 1;
    case "powertrain":
      return tier("dyno_cell") >= 1;
    case "bodywork":
    case "cooling":
      return tier("composite_shop") >= 1;
    default:
      return false;
  }
}

export function defaultFacilities(): FacilityState[] {
  return (Object.keys(FACILITY_DEFS) as FacilityId[]).map((id) => ({
    id,
    tier: 0,
  }));
}

export function facilityTrainingMultiplier(facilities: FacilityState[]): number {
  let mult = 1;
  if ((facilities.find((f) => f.id === "wind_tunnel")?.tier ?? 0) >= 1) mult += 0.1;
  if ((facilities.find((f) => f.id === "dyno_cell")?.tier ?? 0) >= 1) mult += 0.1;
  return mult;
}
