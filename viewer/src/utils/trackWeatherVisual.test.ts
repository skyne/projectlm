import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTrackTimePhase,
  resolveTrackWeatherVisual,
} from "./trackWeatherVisual.ts";

describe("resolveTrackTimePhase", () => {
  it("maps summer months", () => {
    assert.equal(resolveTrackTimePhase(7), "summer");
  });

  it("maps winter months", () => {
    assert.equal(resolveTrackTimePhase(12), "winter");
    assert.equal(resolveTrackTimePhase(1), "winter");
  });

  it("defaults to neutral", () => {
    assert.equal(resolveTrackTimePhase(4), "neutral");
    assert.equal(resolveTrackTimePhase(undefined), "neutral");
  });
});

describe("resolveTrackWeatherVisual", () => {
  it("ramps overlay with rain and wetness", () => {
    const dry = resolveTrackWeatherVisual({ rainIntensity: 0, trackWetness: 0 } as never);
    assert.equal(dry.rainActive, false);
    assert.equal(dry.wetActive, false);

    const rainy = resolveTrackWeatherVisual({
      rainIntensity: 0.8,
      trackWetness: 0.6,
    } as never);
    assert.equal(rainy.rainActive, true);
    assert.equal(rainy.wetActive, true);
    assert.ok(rainy.overlayOpacity > dry.overlayOpacity);
    assert.ok(rainy.overlayOpacity <= 0.35);
    assert.ok(rainy.asphaltSheen >= 0.6);
  });

  it("adds fog when visibility is low", () => {
    const clear = resolveTrackWeatherVisual({ visibilityKm: 10 } as never);
    const foggy = resolveTrackWeatherVisual({ visibilityKm: 2 } as never);
    assert.equal(clear.fog, 0);
    assert.ok(foggy.fog > 0);
    assert.ok(foggy.overlayOpacity > clear.overlayOpacity);
  });
});
