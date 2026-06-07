"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const track_climate_1 = require("./game/track_climate");
const weather_model_1 = require("./weather_model");
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
(0, node_test_1.default)("scheduled rain starts when forecast countdown reaches zero", () => {
    const weather = (0, weather_model_1.initWeatherState)("changeable", 0.05, 21);
    weather.phase = "Dry";
    weather.forecastRainInSeconds = 600;
    const profile = (0, weather_model_1.weatherProfileForId)("changeable");
    (0, weather_model_1.advanceWeatherDeterministic)(weather, profile, 600, 600);
    strict_1.default.ok(["LightRain", "HeavyRain"].includes(weather.phase));
    strict_1.default.ok(weather.rainIntensity >= 0.2);
    strict_1.default.ok(weather.forecastRainInSeconds < 0);
});
(0, node_test_1.default)("buildWeatherForecast matches scheduled rain at +10 minutes", () => {
    const weather = (0, weather_model_1.initWeatherState)("changeable", 0.05, 21);
    weather.phase = "Dry";
    weather.forecastRainInSeconds = 600;
    const profile = (0, weather_model_1.weatherProfileForId)("changeable");
    const forecast = (0, weather_model_1.buildWeatherForecast)(weather, profile, 0, 12, 10);
    strict_1.default.ok(forecast.length >= 2);
    strict_1.default.equal(forecast[0].phase, "Dry");
    strict_1.default.ok(forecast[1].phase === "LightRain" || forecast[1].phase === "HeavyRain");
    strict_1.default.ok(forecast[1].rainIntensity >= 0.2);
});
(0, node_test_1.default)("forecast can be scheduled at changeable base wetness", () => {
    const weather = (0, weather_model_1.initWeatherState)("changeable", 0, 0);
    const profile = (0, weather_model_1.weatherProfileForId)("changeable");
    let rolls = 0;
    const result = (0, weather_model_1.tickWeatherState)(weather, profile, 0.1, 0.1, () => {
        rolls += 1;
        // Skip immediate rain roll, allow forecast scheduling roll.
        return rolls === 1 ? 1 : 0;
    });
    strict_1.default.equal(result.forecastScheduled, true);
    strict_1.default.ok(weather.forecastRainInSeconds > 0);
});
(0, node_test_1.default)("tickWeatherState delivers rain after forecast elapses", () => {
    const weather = (0, weather_model_1.initWeatherState)("changeable", 0.05, 21);
    weather.phase = "Dry";
    weather.forecastRainInSeconds = 600;
    const profile = (0, weather_model_1.weatherProfileForId)("changeable");
    for (let t = 0; t < 600; t += 0.1) {
        (0, weather_model_1.tickWeatherState)(weather, profile, t + 0.1, 0.1, () => 1);
    }
    strict_1.default.equal(weather.phase, "LightRain");
    strict_1.default.ok(weather.trackWetness > 0.05);
});
(0, node_test_1.default)("rain showers end and track can dry out during a long session", () => {
    let changeableSeed = -1;
    for (let seed = 1; seed <= 50; seed++) {
        if ((0, track_climate_1.resolveTrackWeather)("lemans_la_sarthe", 6, seed).archetype === "changeable") {
            changeableSeed = seed;
            break;
        }
    }
    strict_1.default.ok(changeableSeed > 0);
    const resolved = (0, track_climate_1.resolveTrackWeather)("lemans_la_sarthe", 6, changeableSeed);
    const profile = resolved.profile;
    const weather = (0, weather_model_1.initWeatherState)("lemans_la_sarthe:6", 0, profile.baseTempC);
    weather.trackWetness = profile.baseWetness;
    const rnd = mulberry32(changeableSeed);
    const dt = 0.1;
    const duration = 24 * 3600;
    let dryingPhases = 0;
    for (let t = 0; t < duration; t += dt) {
        const prev = weather.phase;
        (0, weather_model_1.tickWeatherState)(weather, profile, t, dt, rnd);
        if (weather.phase === "Drying" && prev !== "Drying")
            dryingPhases += 1;
    }
    strict_1.default.ok(dryingPhases > 0, "expected at least one drying phase after showers");
    strict_1.default.ok(weather.trackWetness < 0.85, "24h Le Mans should not always end fully soaked");
});
(0, node_test_1.default)("dry archetype Le Mans usually finishes with modest wetness", () => {
    let drySeed = -1;
    for (let seed = 1; seed <= 100; seed++) {
        if ((0, track_climate_1.resolveTrackWeather)("lemans_la_sarthe", 6, seed).archetype === "dry") {
            drySeed = seed;
            break;
        }
    }
    strict_1.default.ok(drySeed > 0);
    const resolved = (0, track_climate_1.resolveTrackWeather)("lemans_la_sarthe", 6, drySeed);
    const profile = resolved.profile;
    const weather = (0, weather_model_1.initWeatherState)("lemans_la_sarthe:6", 0, profile.baseTempC);
    weather.trackWetness = profile.baseWetness;
    const rnd = mulberry32(drySeed);
    const dt = 0.1;
    const duration = 24 * 3600;
    for (let t = 0; t < duration; t += dt) {
        (0, weather_model_1.tickWeatherState)(weather, profile, t, dt, rnd);
    }
    strict_1.default.ok(weather.trackWetness < 0.35);
    strict_1.default.ok(["Dry", "Cloudy", "Drying"].includes(weather.phase));
});
