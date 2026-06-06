"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILD_PART_FIELDS = void 0;
exports.resolvePartTypeForField = resolvePartTypeForField;
exports.compactCatalogForGarage = compactCatalogForGarage;
exports.normalizeGarageChanges = normalizeGarageChanges;
const catalog_1 = require("../game/catalog");
exports.BUILD_PART_FIELDS = [
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
const FIELD_TO_SLOT = {
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
function isRdLocked(fullId, unlocked) {
    if (fullId === "brake.CarbonCeramic" && !unlocked.has("brake.CarbonCeramic")) {
        return true;
    }
    if (fullId === "tire.Soft" && !unlocked.has("tire.Soft")) {
        return true;
    }
    return false;
}
function resolvePartTypeForField(repoRoot, field, rawValue, unlockedParts) {
    const slot = FIELD_TO_SLOT[field];
    if (!slot)
        return null;
    const catalog = (0, catalog_1.loadGameCatalog)(repoRoot);
    const parts = catalog.partsBySlot[slot] ?? [];
    const unlocked = new Set(unlockedParts);
    const needle = rawValue.trim().toLowerCase();
    if (!needle)
        return null;
    const candidates = parts.filter((p) => !isRdLocked(p.fullId, unlocked));
    const exact = candidates.find((p) => p.partType.toLowerCase() === needle);
    if (exact)
        return exact.partType;
    const byId = candidates.find((p) => p.fullId.toLowerCase() === needle ||
        p.fullId.toLowerCase().endsWith(`.${needle}`));
    if (byId)
        return byId.partType;
    const byName = candidates.find((p) => p.displayName.toLowerCase() === needle);
    if (byName)
        return byName.partType;
    const partial = candidates.find((p) => p.partType.toLowerCase().includes(needle) ||
        needle.includes(p.partType.toLowerCase()) ||
        p.displayName.toLowerCase().includes(needle));
    return partial?.partType ?? null;
}
function compactCatalogForGarage(repoRoot, classId, unlockedParts) {
    const catalog = (0, catalog_1.loadGameCatalog)(repoRoot);
    const unlocked = new Set(unlockedParts);
    const out = {};
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
function normalizeGarageChanges(repoRoot, raw, unlockedParts) {
    if (!raw || typeof raw !== "object")
        return {};
    const out = {};
    for (const key of exports.BUILD_PART_FIELDS) {
        const val = raw[key];
        if (typeof val !== "string" || !val.trim())
            continue;
        const resolved = resolvePartTypeForField(repoRoot, key, val, unlockedParts);
        if (resolved)
            out[key] = resolved;
    }
    return out;
}
