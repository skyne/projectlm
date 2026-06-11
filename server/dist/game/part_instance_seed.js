"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partTypesFromBuild = partTypesFromBuild;
exports.partSourceForCar = partSourceForCar;
exports.mergePartInstancesFromFleet = mergePartInstancesFromFleet;
const crypto_1 = require("crypto");
const part_compatibility_1 = require("./part_compatibility");
const part_instances_1 = require("./part_instances");
/** Config slot → facility category for R&D gating. */
const SLOT_CATEGORY = {
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
function catalogPrefixForConfigSlot(slot) {
    if (slot === "brake_system")
        return "brake";
    return slot;
}
function partTypesFromBuild(build) {
    const rows = [];
    for (const [configSlot, field] of Object.entries(part_compatibility_1.BUILD_FIELD_BY_CONFIG_SLOT)) {
        if (SKIP_BUILD_FIELDS.has(field))
            continue;
        const partType = build[field];
        if (typeof partType !== "string" || !partType.trim())
            continue;
        if (partType === "None")
            continue;
        const slot = catalogPrefixForConfigSlot(configSlot);
        rows.push({ slot, catalogId: `${slot}.${partType}` });
    }
    return rows;
}
function partSourceForCar(car) {
    if (car.acquisition === "privateer")
        return "licensed";
    return "inhouse";
}
/** Add owned part instances for any catalog parts on fleet builds not yet tracked. */
function mergePartInstancesFromFleet(existing, fleet) {
    const byCatalog = new Map(existing.map((p) => [p.catalogId, p]));
    for (const car of fleet) {
        const source = partSourceForCar(car);
        for (const row of partTypesFromBuild(car.build)) {
            if (byCatalog.has(row.catalogId))
                continue;
            const category = SLOT_CATEGORY[row.slot] ?? "chassis";
            const inst = (0, part_instances_1.newPartInstance)(row.catalogId, row.slot, category, source);
            inst.id = `part-${row.catalogId.replace(/\./g, "-")}-${(0, crypto_1.randomUUID)().slice(0, 8)}`;
            byCatalog.set(row.catalogId, inst);
        }
    }
    return [...byCatalog.values()];
}
