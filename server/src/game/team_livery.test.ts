import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidLogoDataUrl,
  normalizeTeamLivery,
} from "./team_livery";

describe("team_livery", () => {
  it("normalizes colors and pattern", () => {
    const livery = normalizeTeamLivery({
      primary: "#112233",
      secondary: "#aabbcc",
      pattern: "dual_stripe",
    });
    assert.ok(livery);
    assert.equal(livery.pattern, "dual_stripe");
    assert.equal(livery.logoDataUrl, null);
  });

  it("rejects invalid colors and oversized logos", () => {
    assert.equal(normalizeTeamLivery({ primary: "red", secondary: "#fff" }), null);
    const huge = `data:image/png;base64,${"A".repeat(100_000)}`;
    assert.equal(isValidLogoDataUrl(huge), false);
    const tiny = "data:image/png;base64,AAAA";
    assert.equal(isValidLogoDataUrl(tiny), true);
  });
});
