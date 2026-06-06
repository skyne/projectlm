"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const weather_model_1 = require("./weather_model");
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
