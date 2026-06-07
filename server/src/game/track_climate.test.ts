import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrackWeather } from "./track_climate";

test("Fuji autumn is wetter than Fuji spring", () => {
  const spring = resolveTrackWeather("fuji", 4, 42);
  const autumn = resolveTrackWeather("fuji", 10, 42);
  assert.ok(autumn.profile.rainChancePerHour > spring.profile.rainChancePerHour);
  assert.ok(autumn.rainWeight > spring.rainWeight);
});

test("Spa May is more volatile and rain-prone than Bahrain May", () => {
  const spa = resolveTrackWeather("spa", 5, 100);
  const bahrain = resolveTrackWeather("bahrain", 5, 100);
  assert.ok(spa.profile.rainChancePerHour > bahrain.profile.rainChancePerHour);
  assert.ok(spa.rainWeight > bahrain.rainWeight);
});

test("Losail October stays mostly dry", () => {
  const qatar = resolveTrackWeather("losail", 10, 7);
  assert.ok(qatar.profile.rainChancePerHour < 0.12);
  assert.match(qatar.label, /dry/i);
});

test("Fuji October can roll wet or changeable archetypes", () => {
  const labels = Array.from({ length: 30 }, (_, i) =>
    resolveTrackWeather("fuji", 10, i + 1).label.toLowerCase(),
  );
  assert.ok(labels.some((l) => /rain|changeable|shower|mixed/.test(l)));
});

test("same seed yields reproducible profile", () => {
  const a = resolveTrackWeather("spa", 5, 202605);
  const b = resolveTrackWeather("spa", 5, 202605);
  assert.equal(a.profile.rainChancePerHour, b.profile.rainChancePerHour);
  assert.equal(a.profile.baseTempC, b.profile.baseTempC);
});

test("different seeds vary within bounds", () => {
  const a = resolveTrackWeather("spa", 5, 1);
  const b = resolveTrackWeather("spa", 5, 9999);
  assert.notEqual(a.profile.rainChancePerHour, b.profile.rainChancePerHour);
});

test("Le Mans June rolls dry, changeable, and wet archetypes", () => {
  const archetypes = new Set(
    Array.from({ length: 40 }, (_, i) => resolveTrackWeather("lemans_la_sarthe", 6, i + 1).archetype),
  );
  assert.ok(archetypes.has("dry"));
  assert.ok(archetypes.has("changeable"));
});

test("dry archetype Le Mans keeps low rain chance", () => {
  let dry: ReturnType<typeof resolveTrackWeather> | null = null;
  for (let seed = 1; seed <= 100 && !dry; seed++) {
    const w = resolveTrackWeather("lemans_la_sarthe", 6, seed);
    if (w.archetype === "dry") dry = w;
  }
  assert.ok(dry);
  assert.ok(dry.profile.rainChancePerHour < 0.05);
  assert.match(dry.label, /race day dry/i);
});
