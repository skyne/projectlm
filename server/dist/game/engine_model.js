"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENERGY_CONVERTER_TYPES = exports.DRIVETRAIN_TYPES = exports.ASPIRATION_TYPES = exports.FUEL_TYPES = exports.ENGINE_LAYOUTS = exports.DIESEL_WEIGHT_MULT = exports.ENGINE_WEIGHT_CYL_FACTOR = exports.ENGINE_WEIGHT_COEFF = exports.HP_CONVERSION = void 0;
exports.cylindersForLayout = cylindersForLayout;
exports.displacementLiters = displacementLiters;
exports.peakTorqueNm = peakTorqueNm;
exports.peakHorsepower = peakHorsepower;
exports.engineMassKg = engineMassKg;
exports.validateEngineBuild = validateEngineBuild;
exports.HP_CONVERSION = 7127;
exports.ENGINE_WEIGHT_COEFF = 35;
exports.ENGINE_WEIGHT_CYL_FACTOR = 5;
exports.DIESEL_WEIGHT_MULT = 1.3;
exports.ENGINE_LAYOUTS = [
    "I4", "I6", "V6", "V8", "V10", "V12", "Flat4", "Flat6", "Rotary", "LMP2Spec",
];
exports.FUEL_TYPES = ["Gasoline", "Diesel", "Hydrogen", "Electric"];
exports.ASPIRATION_TYPES = [
    "NA", "Single", "TwinParallel", "TwinSequential", "Quad", "EBoost",
];
exports.DRIVETRAIN_TYPES = [
    "Mechanical", "ParallelHybrid", "FrontAxleHybrid", "RangeExtender", "FullEV",
];
exports.ENERGY_CONVERTER_TYPES = ["Combustion", "FuelCell"];
const LAYOUT_CYLINDERS = {
    I4: 4, I6: 6, V6: 6, V8: 8, V10: 10, V12: 12, Flat4: 4, Flat6: 6, Rotary: 2, LMP2Spec: 8,
};
function cylindersForLayout(layout) {
    return LAYOUT_CYLINDERS[layout] ?? 6;
}
function displacementLiters(engine) {
    const radius = engine.bore / 2;
    const volume = engine.cylinders * Math.PI * radius * radius * engine.stroke;
    return volume * 1000;
}
function peakTorqueNm(engine) {
    if (engine.peak_torque_nm > 0)
        return engine.peak_torque_nm;
    const disp = displacementLiters(engine);
    const boreStroke = engine.bore / Math.max(engine.stroke, 0.001);
    return disp * 105 * Math.sqrt(Math.max(0.5, boreStroke));
}
function peakHorsepower(engine) {
    const torque = peakTorqueNm(engine);
    const rpm = engine.peak_torque_rpm > 0 ? engine.peak_torque_rpm : engine.max_rpm;
    return (torque * rpm) / exports.HP_CONVERSION;
}
function engineMassKg(engine) {
    let mass = displacementLiters(engine) * exports.ENGINE_WEIGHT_COEFF +
        engine.cylinders * exports.ENGINE_WEIGHT_CYL_FACTOR;
    if (engine.fuel_type === "Diesel")
        mass *= exports.DIESEL_WEIGHT_MULT;
    if (engine.drivetrain === "FullEV")
        return 12;
    if (engine.drivetrain === "RangeExtender")
        mass *= 0.85;
    return mass;
}
function validateEngineBuild(engine) {
    const isFuelCell = engine.fuel_type === "Hydrogen" && engine.energy_converter === "FuelCell";
    if (isFuelCell) {
        if (engine.drivetrain !== "FullEV")
            return "Fuel cell requires FullEV drivetrain";
        if (!engine.generator_kw || engine.generator_kw < 200)
            return "Fuel cell stack kW out of range";
        return null;
    }
    /** BEV / battery pack — peak_torque_nm is motor-model fiction (hp×4.2), not ICE Nm. */
    const isBatteryBev = engine.drivetrain === "FullEV" && !isFuelCell;
    if (isBatteryBev) {
        if (engine.max_rpm < 3500 || engine.max_rpm > 13000)
            return "Max RPM out of range";
        return null;
    }
    const isElectricFuel = engine.fuel_type === "Electric";
    if (isElectricFuel) {
        if (engine.drivetrain !== "FullEV" && engine.drivetrain !== "RangeExtender") {
            return "Electric requires FullEV or RangeExtender drivetrain";
        }
        if (engine.drivetrain === "RangeExtender") {
            if (!engine.generator_kw || engine.generator_kw < 120) {
                return "Electric REX generator kW out of range";
            }
            if (engine.bore < 0.04 || engine.bore > 0.12)
                return "Bore out of range";
            if (engine.stroke < 0.03 || engine.stroke > 0.12)
                return "Stroke out of range";
        }
        if (engine.max_rpm < 3500 || engine.max_rpm > 13000)
            return "Max RPM out of range";
        // REX charge path uses generator_kW×3.2 — above ICE cap at max generator.
        if (engine.peak_torque_nm < 100 || engine.peak_torque_nm > 1500) {
            return "Peak torque out of range";
        }
        return null;
    }
    if (!exports.ENGINE_LAYOUTS.includes(engine.engine_layout)) {
        return "Invalid engine layout";
    }
    if (!exports.FUEL_TYPES.includes(engine.fuel_type)) {
        return "Invalid fuel type";
    }
    if (engine.aspiration && !exports.ASPIRATION_TYPES.includes(engine.aspiration)) {
        return "Invalid aspiration";
    }
    if (engine.drivetrain && !exports.DRIVETRAIN_TYPES.includes(engine.drivetrain)) {
        return "Invalid drivetrain";
    }
    const expectedCyl = cylindersForLayout(engine.engine_layout);
    if (engine.cylinders !== expectedCyl) {
        return `${engine.engine_layout} requires ${expectedCyl} cylinders`;
    }
    if (engine.drivetrain !== "FullEV") {
        if (engine.bore < 0.04 || engine.bore > 0.12)
            return "Bore out of range";
        if (engine.stroke < 0.03 || engine.stroke > 0.12)
            return "Stroke out of range";
    }
    if (engine.max_rpm < 3500 || engine.max_rpm > 13000)
        return "Max RPM out of range";
    if (engine.peak_torque_nm < 100 || engine.peak_torque_nm > 1200) {
        return "Peak torque out of range";
    }
    if (engine.peak_torque_rpm < 2500 || engine.peak_torque_rpm > 10000) {
        return "Peak torque RPM out of range";
    }
    if (engine.base_vibration < 0.5 || engine.base_vibration > 1.6) {
        return "Engine stress factor out of range";
    }
    if (engine.engine_layout === "Rotary" && engine.aspiration === "Quad") {
        return "Rotary cannot use quad turbos";
    }
    if (engine.aspiration === "EBoost" && engine.drivetrain === "Mechanical") {
        return "E-Boost requires hybrid or REX drivetrain";
    }
    return null;
}
