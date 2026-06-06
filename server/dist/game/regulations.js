"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.regulatoryProfile = regulatoryProfile;
exports.maxDriverStintSeconds = maxDriverStintSeconds;
const DEFAULTS = {
    maxDriverStintHours: 4.5,
    powerCapHp: 700,
};
const BY_CLASS = {
    Hypercar: { maxDriverStintHours: 4.5, powerCapHp: 700 },
    LMP2: { maxDriverStintHours: 4.5, powerCapHp: 440 },
    LMGT3: { maxDriverStintHours: 4.0, powerCapHp: 420 },
};
function regulatoryProfile(classId) {
    return BY_CLASS[classId] ?? DEFAULTS;
}
function maxDriverStintSeconds(classId) {
    return regulatoryProfile(classId).maxDriverStintHours * 3600;
}
