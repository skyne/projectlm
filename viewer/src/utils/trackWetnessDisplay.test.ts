import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  displayTrackWetnessPercent,
  formatTrackWetnessConditions,
  formatTrackWetnessRadar,
  trackWetnessBarPercent,
} from "./trackWetnessDisplay.ts";

describe("trackWetnessDisplay", () => {
  it("hides ambient moisture floor", () => {
    assert.equal(displayTrackWetnessPercent(0.01), null);
    assert.equal(formatTrackWetnessConditions(0.01), null);
    assert.equal(formatTrackWetnessRadar(0.01), "track dry");
    assert.equal(trackWetnessBarPercent(0.01), 0);
  });

  it("shows damp track before inter threshold", () => {
    assert.equal(displayTrackWetnessPercent(0.08), 8);
    assert.equal(formatTrackWetnessConditions(0.08), "Wet 8%");
    assert.equal(formatTrackWetnessRadar(0.12), "track 12% wet");
    assert.equal(trackWetnessBarPercent(0.12), 12);
  });

  it("treats values just below the floor as dry", () => {
    assert.equal(displayTrackWetnessPercent(0.049), null);
    assert.equal(displayTrackWetnessPercent(0.05), 5);
  });
});
