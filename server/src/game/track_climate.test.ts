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

test("Fuji October label mentions rain likelihood", () => {
  const fuji = resolveTrackWeather("fuji", 10, 99);
  assert.match(fuji.label.toLowerCase(), /rain|changeable|shower/);
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
