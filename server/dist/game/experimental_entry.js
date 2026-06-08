"use strict";
/** Experimental (EXP) fleet entry constants and helpers. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXP_SPONSOR_BONUS_FACTOR = exports.EXP_RD_MULTIPLIER = exports.EXP_FAN_EXPOSURE_BASE = exports.EXP_OPS_FEE = exports.EXP_PRIVATEER_UNIT_MULTIPLIER = exports.EXP_COPY_UNIT_MULTIPLIER = exports.EXP_MANUFACTURER_UNIT_MULTIPLIER = exports.EXP_PRIVATEER_PROGRAMME_FEE = exports.EXP_HYPERCAR_STANDALONE_COPIES = exports.EXP_HYPERCAR_MFG_MAX_COPIES = exports.EXP_MAX_COPIES_PRIVATEER = exports.EXP_MAX_COPIES_MANUFACTURER = void 0;
exports.fleetEntryMode = fleetEntryMode;
exports.isExperimentalCar = isExperimentalCar;
exports.experimentalRulesPayload = experimentalRulesPayload;
exports.maxExperimentalCopies = maxExperimentalCopies;
exports.minExperimentalCopies = minExperimentalCopies;
exports.computePrototypeExposureFee = computePrototypeExposureFee;
exports.newExperimentalProgramId = newExperimentalProgramId;
exports.EXP_MAX_COPIES_MANUFACTURER = 3;
exports.EXP_MAX_COPIES_PRIVATEER = 2;
/** One prototype mule on top of the mandatory homologated Hypercar pair. */
exports.EXP_HYPERCAR_MFG_MAX_COPIES = 1;
/** Standalone EXP Hypercar programme (no homologated HC team) — matched pair of mules. */
exports.EXP_HYPERCAR_STANDALONE_COPIES = 2;
exports.EXP_PRIVATEER_PROGRAMME_FEE = 20000000;
exports.EXP_MANUFACTURER_UNIT_MULTIPLIER = 1.3;
exports.EXP_COPY_UNIT_MULTIPLIER = 0.95;
exports.EXP_PRIVATEER_UNIT_MULTIPLIER = 1.15;
exports.EXP_OPS_FEE = 55000;
exports.EXP_FAN_EXPOSURE_BASE = 50000;
exports.EXP_RD_MULTIPLIER = 1.5;
exports.EXP_SPONSOR_BONUS_FACTOR = 0.5;
function fleetEntryMode(car) {
    return car.entryMode ?? "homologated";
}
function isExperimentalCar(car) {
    return fleetEntryMode(car) === "experimental";
}
function experimentalRulesPayload() {
    return {
        maxCopiesManufacturer: exports.EXP_MAX_COPIES_MANUFACTURER,
        maxCopiesPrivateer: exports.EXP_MAX_COPIES_PRIVATEER,
        hypercarManufacturerExpMax: exports.EXP_HYPERCAR_MFG_MAX_COPIES,
        hypercarStandaloneExpCopies: exports.EXP_HYPERCAR_STANDALONE_COPIES,
        privateerProgrammeFee: exports.EXP_PRIVATEER_PROGRAMME_FEE,
        manufacturerUnitMultiplier: exports.EXP_MANUFACTURER_UNIT_MULTIPLIER,
        copyUnitMultiplier: exports.EXP_COPY_UNIT_MULTIPLIER,
        privateerUnitMultiplier: exports.EXP_PRIVATEER_UNIT_MULTIPLIER,
        opsFee: exports.EXP_OPS_FEE,
        fanExposureBase: exports.EXP_FAN_EXPOSURE_BASE,
        rdMultiplier: exports.EXP_RD_MULTIPLIER,
    };
}
function maxExperimentalCopies(affiliation, classId, options) {
    if (classId === "Hypercar") {
        if (options?.hypercarMfgException) {
            return exports.EXP_HYPERCAR_MFG_MAX_COPIES;
        }
        return exports.EXP_HYPERCAR_STANDALONE_COPIES;
    }
    return affiliation === "manufacturer"
        ? exports.EXP_MAX_COPIES_MANUFACTURER
        : exports.EXP_MAX_COPIES_PRIVATEER;
}
function minExperimentalCopies(affiliation, classId, options) {
    if (classId === "Hypercar") {
        if (options?.hypercarMfgException) {
            return 1;
        }
        return exports.EXP_HYPERCAR_STANDALONE_COPIES;
    }
    return 1;
}
/** Fan/media payout for finishing an experimental entry (overall race position). */
function computePrototypeExposureFee(racePosition) {
    if (racePosition < 1)
        return 0;
    const bonus = Math.max(0, 20 - racePosition) * 2500;
    return exports.EXP_FAN_EXPOSURE_BASE + bonus;
}
function newExperimentalProgramId(classId) {
    return `exp-${classId}-${Date.now()}`;
}
