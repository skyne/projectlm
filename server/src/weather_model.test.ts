import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrackWeather } from "./game/track_climate";
import {
  advanceWeatherDeterministic,
  buildWeatherForecast,
  initWeatherState,
  tickWeatherState,
  weatherProfileForId,
} from "./weather_model";

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

test("rain showers end and track can dry out during a long session", () => {
  let changeableSeed = -1;
  for (let seed = 1; seed <= 50; seed++) {
    if (resolveTrackWeather("lemans_la_sarthe", 6, seed).archetype === "changeable") {
      changeableSeed = seed;
      break;
    }
  }
  assert.ok(changeableSeed > 0);

  const resolved = resolveTrackWeather("lemans_la_sarthe", 6, changeableSeed);
  const profile = resolved.profile;
  const weather = initWeatherState("lemans_la_sarthe:6", 0, profile.baseTempC);
  weather.trackWetness = profile.baseWetness;
  const rnd = mulberry32(changeableSeed);
  const dt = 0.1;
  const duration = 24 * 3600;

  let dryingPhases = 0;
  for (let t = 0; t < duration; t += dt) {
    const prev = weather.phase;
    tickWeatherState(weather, profile, t, dt, rnd);
    if (weather.phase === "Drying" && prev !== "Drying") dryingPhases += 1;
  }

  assert.ok(dryingPhases > 0, "expected at least one drying phase after showers");
  assert.ok(weather.trackWetness < 0.85, "24h Le Mans should not always end fully soaked");
});

test("dry archetype Le Mans usually finishes with modest wetness", () => {
  let drySeed = -1;
  for (let seed = 1; seed <= 100; seed++) {
    if (resolveTrackWeather("lemans_la_sarthe", 6, seed).archetype === "dry") {
      drySeed = seed;
      break;
    }
  }
  assert.ok(drySeed > 0);

  const resolved = resolveTrackWeather("lemans_la_sarthe", 6, drySeed);
  const profile = resolved.profile;
  const weather = initWeatherState("lemans_la_sarthe:6", 0, profile.baseTempC);
  weather.trackWetness = profile.baseWetness;
  const rnd = mulberry32(drySeed);
  const dt = 0.1;
  const duration = 24 * 3600;

  for (let t = 0; t < duration; t += dt) {
    tickWeatherState(weather, profile, t, dt, rnd);
  }

  assert.ok(weather.trackWetness < 0.35);
  assert.ok(["Dry", "Cloudy", "Drying"].includes(weather.phase));
});

test("dry phase track temp runs above air temp", () => {
  const weather = initWeatherState("hot_dry", 0, 32);
  const profile = weatherProfileForId("hot_dry");

  for (let t = 0; t < 3600; t += 10) {
    advanceWeatherDeterministic(weather, profile, t, 10);
  }

  assert.ok(weather.trackTempC > weather.ambientTempC);
  assert.ok(weather.visibilityKm >= 8);
  assert.ok(weather.windSpeedMs > 0);
});

test("rain lowers visibility and cools track toward air", () => {
  const weather = initWeatherState("wet", 0.4, 16);
  weather.phase = "HeavyRain";
  weather.rainIntensity = 0.8;
  const profile = weatherProfileForId("wet");
  const visBefore = weather.visibilityKm;
  const trackBefore = weather.trackTempC;

  advanceWeatherDeterministic(weather, profile, 600, 600);

  assert.ok(weather.visibilityKm < visBefore);
  assert.ok(weather.trackTempC <= trackBefore + 1);
});

test("forecast includes track temp wind and visibility", () => {
  const weather = initWeatherState("changeable", 0.05, 21);
  const profile = weatherProfileForId("changeable");
  const forecast = buildWeatherForecast(weather, profile, 0, 3, 10);

  assert.ok(forecast[0].trackTempC != null);
  assert.ok(forecast[0].windSpeedMs > 0);
  assert.ok(forecast[0].visibilityKm > 0);
});

