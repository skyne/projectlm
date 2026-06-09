"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EV_ONLY_OUTLET_PARTS = exports.EV_OUTLET_PARTS = void 0;
exports.isElectricDriveOutletBuild = isElectricDriveOutletBuild;
exports.isEvLegalOutlet = isEvLegalOutlet;
exports.normalizeExhaustType = normalizeExhaustType;
/** Legal exhaust / underbody outlet parts for e-drive (BEV + H₂ fuel cell). */
exports.EV_OUTLET_PARTS = new Set([
    "None",
    "ActiveUnderbody",
    "LowDragUnderfloor",
    "ThermalScoop",
    "WakeNeutralBody",
]);
exports.EV_ONLY_OUTLET_PARTS = new Set([
    "ActiveUnderbody",
    "LowDragUnderfloor",
    "ThermalScoop",
    "WakeNeutralBody",
]);
function isElectricDriveOutletBuild(engine) {
    if (!engine)
        return false;
    return (engine.fuel_type === "Electric" ||
        engine.drivetrain === "FullEV" ||
        engine.drivetrain === "RangeExtender" ||
        (engine.fuel_type === "Hydrogen" && engine.energy_converter === "FuelCell"));
}
function isEvLegalOutlet(part) {
    return exports.EV_OUTLET_PARTS.has(part);
}
function normalizeExhaustType(exhaustType, engine) {
    const ev = isElectricDriveOutletBuild(engine);
    const current = exhaustType ?? (ev ? "None" : "TwinOutletSide");
    if (ev) {
        return isEvLegalOutlet(current) ? current : "None";
    }
    if (current === "None" || exports.EV_ONLY_OUTLET_PARTS.has(current)) {
        return "TwinOutletSide";
    }
    return current;
}
