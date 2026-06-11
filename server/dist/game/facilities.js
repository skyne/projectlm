"use strict";
/** HQ facility tiers — gate which part categories can be developed in-house. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FACILITY_DEFS = void 0;
exports.canDevelopCategory = canDevelopCategory;
exports.defaultFacilities = defaultFacilities;
exports.facilityTrainingMultiplier = facilityTrainingMultiplier;
exports.FACILITY_DEFS = {
    wind_tunnel: { label: "Wind tunnel", categories: ["aero"], buildCost: 2500000 },
    carbon_fab: { label: "Carbon fabrication", categories: ["chassis"], buildCost: 3000000 },
    design_studio: {
        label: "Design studio",
        categories: ["chassis"],
        buildCost: 1500000,
    },
    dyno_cell: { label: "Dyno / test cell", categories: ["powertrain"], buildCost: 2000000 },
    composite_shop: {
        label: "Composite shop",
        categories: ["bodywork", "cooling"],
        buildCost: 1200000,
    },
};
/** Chassis dev needs carbon fab + design studio at tier ≥ 1. */
function canDevelopCategory(facilities, category) {
    const byId = new Map(facilities.map((f) => [f.id, f.tier]));
    const tier = (id) => byId.get(id) ?? 0;
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
function defaultFacilities() {
    return Object.keys(exports.FACILITY_DEFS).map((id) => ({
        id,
        tier: 0,
    }));
}
function facilityTrainingMultiplier(facilities) {
    let mult = 1;
    if ((facilities.find((f) => f.id === "wind_tunnel")?.tier ?? 0) >= 1)
        mult += 0.1;
    if ((facilities.find((f) => f.id === "dyno_cell")?.tier ?? 0) >= 1)
        mult += 0.1;
    return mult;
}
