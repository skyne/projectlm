import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceWeatherDeterministic,
  buildWeatherForecast,
  initWeatherState,
  tickWeatherState,
  weatherProfileForId,
} from "./weather_model";

test("scheduled rain starts when forecast countdown reaches zero", () => {
  const weather = initWeatherState("changeable", 0.05, 21);
  weather.phase = "Dry";
  weather.forecastRainInSeconds = 600;
  const profile = weatherProfileForId("changeable");

  advanceWeatherDeterministic(weather, profile, 600, 600);

  assert.ok(["LightRain", "HeavyRain"].includes(weather.phase));
  assert.ok(weather.rainIntensity >= 0.2);
  assert.ok(weather.forecastRainInSeconds < 0);
});

test("buildWeatherForecast matches scheduled rain at +10 minutes", () => {
  const weather = initWeatherState("changeable", 0.05, 21);
  weather.phase = "Dry";
  weather.forecastRainInSeconds = 600;
  const profile = weatherProfileForId("changeable");

  const forecast = buildWeatherForecast(weather, profile, 0, 12, 10);

  assert.ok(forecast.length >= 2);
  assert.equal(forecast[0].phase, "Dry");
  assert.ok(forecast[1].phase === "LightRain" || forecast[1].phase === "HeavyRain");
  assert.ok(forecast[1].rainIntensity >= 0.2);
});

test("forecast can be scheduled at changeable base wetness", () => {
  const weather = initWeatherState("changeable", 0, 0);
  const profile = weatherProfileForId("changeable");
  let rolls = 0;

  const result = tickWeatherState(weather, profile, 0.1, 0.1, () => {
    rolls += 1;
    // Skip immediate rain roll, allow forecast scheduling roll.
    return rolls === 1 ? 1 : 0;
  });

  assert.equal(result.forecastScheduled, true);
  assert.ok(weather.forecastRainInSeconds > 0);
});

test("tickWeatherState delivers rain after forecast elapses", () => {
  const weather = initWeatherState("changeable", 0.05, 21);
  weather.phase = "Dry";
  weather.forecastRainInSeconds = 600;
  const profile = weatherProfileForId("changeable");

  for (let t = 0; t < 600; t += 0.1) {
    tickWeatherState(weather, profile, t + 0.1, 0.1, () => 1);
  }

  assert.equal(weather.phase, "LightRain");
  assert.ok(weather.trackWetness > 0.05);
});
