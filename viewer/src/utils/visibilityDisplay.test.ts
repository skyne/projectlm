import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatVisibilityKm,
  shouldHighlightVisibility,
  visibilityLevel,
} from "./visibilityDisplay.ts";

describe("visibilityDisplay", () => {
  it("classifies visibility bands", () => {
    assert.equal(visibilityLevel(10), "good");
    assert.equal(visibilityLevel(5), "moderate");
    assert.equal(visibilityLevel(2), "poor");
    assert.equal(visibilityLevel(1), "critical");
  });

  it("formats km with one decimal", () => {
    assert.equal(formatVisibilityKm(1.23), "1.2 km");
  });

  it("highlights below 8 km", () => {
    assert.equal(shouldHighlightVisibility(7.9), true);
    assert.equal(shouldHighlightVisibility(8), false);
  });
});
