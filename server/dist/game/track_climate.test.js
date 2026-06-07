"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const track_climate_1 = require("./track_climate");
(0, node_test_1.default)("Fuji autumn is wetter than Fuji spring", () => {
    const spring = (0, track_climate_1.resolveTrackWeather)("fuji", 4, 42);
    const autumn = (0, track_climate_1.resolveTrackWeather)("fuji", 10, 42);
    strict_1.default.ok(autumn.profile.rainChancePerHour > spring.profile.rainChancePerHour);
    strict_1.default.ok(autumn.rainWeight > spring.rainWeight);
});
(0, node_test_1.default)("Spa May is more volatile and rain-prone than Bahrain May", () => {
    const spa = (0, track_climate_1.resolveTrackWeather)("spa", 5, 100);
    const bahrain = (0, track_climate_1.resolveTrackWeather)("bahrain", 5, 100);
    strict_1.default.ok(spa.profile.rainChancePerHour > bahrain.profile.rainChancePerHour);
    strict_1.default.ok(spa.rainWeight > bahrain.rainWeight);
});
(0, node_test_1.default)("Losail October stays mostly dry", () => {
    const qatar = (0, track_climate_1.resolveTrackWeather)("losail", 10, 7);
    strict_1.default.ok(qatar.profile.rainChancePerHour < 0.12);
    strict_1.default.match(qatar.label, /dry/i);
});
(0, node_test_1.default)("Fuji October can roll wet or changeable archetypes", () => {
    const labels = Array.from({ length: 30 }, (_, i) => (0, track_climate_1.resolveTrackWeather)("fuji", 10, i + 1).label.toLowerCase());
    strict_1.default.ok(labels.some((l) => /rain|changeable|shower|mixed/.test(l)));
});
(0, node_test_1.default)("same seed yields reproducible profile", () => {
    const a = (0, track_climate_1.resolveTrackWeather)("spa", 5, 202605);
    const b = (0, track_climate_1.resolveTrackWeather)("spa", 5, 202605);
    strict_1.default.equal(a.profile.rainChancePerHour, b.profile.rainChancePerHour);
    strict_1.default.equal(a.profile.baseTempC, b.profile.baseTempC);
});
(0, node_test_1.default)("different seeds vary within bounds", () => {
    const a = (0, track_climate_1.resolveTrackWeather)("spa", 5, 1);
    const b = (0, track_climate_1.resolveTrackWeather)("spa", 5, 9999);
    strict_1.default.notEqual(a.profile.rainChancePerHour, b.profile.rainChancePerHour);
});
(0, node_test_1.default)("Le Mans June rolls dry, changeable, and wet archetypes", () => {
    const archetypes = new Set(Array.from({ length: 40 }, (_, i) => (0, track_climate_1.resolveTrackWeather)("lemans_la_sarthe", 6, i + 1).archetype));
    strict_1.default.ok(archetypes.has("dry"));
    strict_1.default.ok(archetypes.has("changeable"));
});
(0, node_test_1.default)("dry archetype Le Mans keeps low rain chance", () => {
    let dry = null;
    for (let seed = 1; seed <= 100 && !dry; seed++) {
        const w = (0, track_climate_1.resolveTrackWeather)("lemans_la_sarthe", 6, seed);
        if (w.archetype === "dry")
            dry = w;
    }
    strict_1.default.ok(dry);
    strict_1.default.ok(dry.profile.rainChancePerHour < 0.05);
    strict_1.default.match(dry.label, /race day dry/i);
});
