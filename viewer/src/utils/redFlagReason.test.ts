import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RaceControlPayload } from "../ws/protocol";
import { deriveRedFlagReason } from "./redFlagReason.ts";

describe("deriveRedFlagReason", () => {
  it("returns null when not in red flag", () => {
    assert.equal(deriveRedFlagReason({ flagPhase: "green" } as RaceControlPayload), null);
  });

  it("prefers server reason when present", () => {
    assert.equal(
      deriveRedFlagReason({
        flagPhase: "red_flag",
        redFlagReason: "Visibility too low (1.0 km)",
      } as RaceControlPayload),
      "Visibility too low (1.0 km)",
    );
  });

  it("infers visibility cause only below sim deploy threshold", () => {
    assert.match(
      deriveRedFlagReason({
        redFlagActive: true,
        visibilityKm: 0.45,
      } as RaceControlPayload) ?? "",
      /0\.5 km|0\.4 km/,
    );
    assert.equal(
      deriveRedFlagReason({
        redFlagActive: true,
        visibilityKm: 0.8,
        weatherPhase: "HeavyRain",
      } as RaceControlPayload),
      "Session stopped — red flag",
    );
  });

  it("infers obstruction cause when visibility is normal heavy-rain band", () => {
    assert.match(
      deriveRedFlagReason({
        redFlagActive: true,
        visibilityKm: 0.8,
        obstructionsOnTrack: 2,
      } as RaceControlPayload) ?? "",
      /Track blocked \(2 obstructions\)/,
    );
  });
});
