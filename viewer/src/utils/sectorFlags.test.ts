import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatSectorFlagBanner,
  hasLocalSectorFlags,
  resolveActiveSectorFlags,
  sectorFlagTitle,
  sectorFlagTooltip,
} from "./sectorFlags";

describe("sectorFlags", () => {
  it("detects active local sector flags", () => {
    assert.equal(hasLocalSectorFlags([0, 0, 0]), false);
    assert.equal(hasLocalSectorFlags([0, 1, 0]), true);
    assert.equal(hasLocalSectorFlags([2, 0, 0]), true);
  });

  it("resolves sector names with fallback labels", () => {
    assert.deepEqual(resolveActiveSectorFlags([0, 1], ["S1", "Mulsanne"]), [
      { index: 1, level: 1, displayName: "Mulsanne" },
    ]);
    assert.deepEqual(resolveActiveSectorFlags([2]), [{ index: 0, level: 2, displayName: "Sector 1" }]);
  });

  it("formats compact banner labels", () => {
    assert.equal(formatSectorFlagBanner([0, 1, 0], ["S1", "S2", "S3"])?.label, "Yellow Flag — S2");
    assert.equal(
      formatSectorFlagBanner([1, 2, 0], ["S1", "S2", "S3"])?.label,
      "Double Yellow — S2 · Yellow Flag — S1",
    );
    assert.equal(formatSectorFlagBanner([0, 0, 0]), null);
  });

  it("builds marker titles", () => {
    assert.equal(sectorFlagTitle(1, "Tertre Rouge"), "Tertre Rouge — Yellow Flag");
    assert.equal(sectorFlagTitle(2, "Mulsanne"), "Mulsanne — Double Yellow");
  });

  it("builds marker tooltips with incident reasons", () => {
    assert.equal(
      sectorFlagTooltip({
        sectorIndex: 4,
        level: 1,
        displayName: "Sector 5",
        hazards: [{ sectorIndex: 4, kind: "debris" }],
      }),
      "Sector 5 — Yellow Flag — Debris on track",
    );
    assert.equal(
      sectorFlagTooltip({
        sectorIndex: 2,
        level: 2,
        displayName: "Sector 3",
        activeIncidentEntryId: "car-7",
      }),
      "Sector 3 — Double Yellow — Stranded vehicle",
    );
    assert.equal(
      sectorFlagTooltip({ sectorIndex: 0, level: 1, displayName: "Sector 1" }),
      "Sector 1 — Yellow Flag",
    );
  });
});
