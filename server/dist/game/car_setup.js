"use strict";
/** Per-session car setup — tunable between practice, quali, and race. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEEKEND_SESSION_ORDER = void 0;
exports.defaultCarSetup = defaultCarSetup;
exports.clampSetup = clampSetup;
exports.previewSetup = previewSetup;
exports.sessionLabel = sessionLabel;
exports.WEEKEND_SESSION_ORDER = [
    "practice",
    "qualifying",
    "race",
];
function defaultCarSetup(classId) {
    const isGt = classId === "LMGT3";
    return {
        frontWingAngle: isGt ? 0.55 : 0.5,
        rearWingAngle: isGt ? 0.6 : 0.52,
        rideHeightMm: isGt ? 48 : 42,
        frontSpringStiffness: isGt ? 120000 : 105000,
        rearSpringStiffness: isGt ? 135000 : 115000,
        frontDamper: 0.5,
        rearDamper: 0.5,
        engineRadiatorOpening: 0.85,
        oilCoolerOpening: 0.75,
        chargeAirCoolerOpening: 0.8,
        gearboxCoolerOpening: 0.65,
    };
}
function clampSetup(setup) {
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    return {
        frontWingAngle: clamp01(setup.frontWingAngle),
        rearWingAngle: clamp01(setup.rearWingAngle),
        rideHeightMm: Math.min(80, Math.max(28, setup.rideHeightMm)),
        frontSpringStiffness: Math.min(220000, Math.max(60000, setup.frontSpringStiffness)),
        rearSpringStiffness: Math.min(240000, Math.max(60000, setup.rearSpringStiffness)),
        frontDamper: clamp01(setup.frontDamper),
        rearDamper: clamp01(setup.rearDamper),
        engineRadiatorOpening: clamp01(setup.engineRadiatorOpening),
        oilCoolerOpening: clamp01(setup.oilCoolerOpening),
        chargeAirCoolerOpening: clamp01(setup.chargeAirCoolerOpening),
        gearboxCoolerOpening: clamp01(setup.gearboxCoolerOpening),
    };
}
function previewSetup(setup) {
    const wingDf = 0.5 * (setup.frontWingAngle + setup.rearWingAngle);
    const wingDrag = 0.5 * (setup.frontWingAngle + setup.rearWingAngle);
    const cooling = 0.45 * setup.engineRadiatorOpening +
        0.2 * setup.oilCoolerOpening +
        0.25 * setup.chargeAirCoolerOpening +
        0.1 * setup.gearboxCoolerOpening;
    const dampers = 0.5 * (setup.frontDamper + setup.rearDamper);
    const springBalance = setup.frontSpringStiffness /
        (setup.frontSpringStiffness + setup.rearSpringStiffness);
    return {
        downforceIndex: Math.round(wingDf * 100),
        dragIndex: Math.round(wingDrag * 100),
        coolingIndex: Math.round(cooling * 100),
        mechanicalGripIndex: Math.round((dampers * 0.6 + springBalance * 0.4) * 100),
    };
}
function sessionLabel(session) {
    switch (session) {
        case "practice":
            return "Free Practice";
        case "qualifying":
            return "Qualifying";
        case "race":
            return "Race";
    }
}
