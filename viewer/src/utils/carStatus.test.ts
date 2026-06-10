import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CarSnapshot } from "../ws/protocol";
import {
  buildCarConditionTelemetryHtml,
  damageSummaryText,
  hasCarDamage,
  partHealthBand,
  resolveTimingStatusTags,
  renderTimingStatusTagsHtml,
} from "./carStatus";

function baseSnap(overrides: Partial<CarSnapshot> = {}): CarSnapshot {
  return {
    entryId: "e1",
    teamName: "Team",
    carNumber: "1",
    classId: "Hypercar",
    lap: 3,
    distance: 1000,
    normalizedT: 0.2,
    speed: 60,
    rpm: 5000,
    fuel: 80,
    tireWear: 10,
    engineHealth: 100,
    sectorIndex: 1,
    racePosition: 2,
    inPit: false,
    retired: false,
    currentLapTime: 90,
    currentSectorTime: 30,
    lastLapTime: 89,
    bestLapTime: 88,
    gapToLeader: 5,
    currentLapSectorTimes: [],
    lapHistory: [],
    position: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    ...overrides,
  };
}

describe("carStatus", () => {
  it("detects car damage from limp mode and part health", () => {
    assert.equal(hasCarDamage(baseSnap()), false);
    assert.equal(hasCarDamage(baseSnap({ limpMode: "reduced_power" })), true);
    assert.equal(hasCarDamage(baseSnap({ partHealth: { brakes: 70 } })), true);
  });

  it("shows stranded tag for all cars and damage tag only when requested", () => {
    const stranded = resolveTimingStatusTags(baseSnap({ trackStatus: "stranded" }));
    assert.deepEqual(
      stranded.map((t) => t.text),
      ["STR"],
    );

    const damaged = resolveTimingStatusTags(
      baseSnap({ limpMode: "barely_driveable", partHealth: { gearbox: 55 } }),
      { showDamage: true },
    );
    assert.deepEqual(
      damaged.map((t) => t.text),
      ["LIMP", "DMG"],
    );

    const limpOnly = resolveTimingStatusTags(
      baseSnap({ limpMode: "barely_driveable" }),
      { showDamage: false },
    );
    assert.deepEqual(limpOnly.map((t) => t.text), ["LIMP"]);
  });

  it("shows limp tag for all cars on the leaderboard", () => {
    const tags = resolveTimingStatusTags(
      baseSnap({ limpMode: "reduced_power", limpReason: "Engine wear" }),
    );
    assert.deepEqual(tags.map((t) => t.text), ["LIMP"]);
    assert.match(tags[0]!.title, /Reduced power/);
    assert.match(tags[0]!.title, /Engine wear/);
    assert.equal(tags[0]!.className, "status-limp-warn");
  });

  it("prioritizes pit and retired over stranded badges", () => {
    const tags = resolveTimingStatusTags(
      baseSnap({ inPit: true, trackStatus: "stranded" }),
      { showDamage: true },
    );
    assert.deepEqual(tags.map((t) => t.text), ["PIT"]);
  });

  it("builds combined status html", () => {
    const html = renderTimingStatusTagsHtml(
      resolveTimingStatusTags(
        baseSnap({ trackStatus: "stranded", partHealth: { cooling: 60 } }),
        { showDamage: true },
      ),
      "compact-lb-status",
    );
    assert.match(html, /STR/);
    assert.match(html, /DMG/);
  });

  it("classifies part health bands for telemetry", () => {
    assert.equal(partHealthBand(100), "health-ok");
    assert.equal(partHealthBand(98), "status-caution");
    assert.equal(partHealthBand(70), "health-warn");
    assert.equal(partHealthBand(20), "health-critical");
  });

  it("renders full condition diagram when car is undamaged", () => {
    const html = buildCarConditionTelemetryHtml(baseSnap());
    assert.match(html, /Structural load/);
    assert.match(html, /All systems nominal/);
    assert.match(html, /condition-diagram-svg/);
    assert.match(html, /condition-diagram-Hypercar/);
    assert.match(html, /Powertrain/);
    assert.match(html, /Safety cell/);
    assert.match(html, />100%</);
    assert.match(html, /condition-corner-health/);
  });

  it("renders class-specific silhouette and corner damage", () => {
    const html = buildCarConditionTelemetryHtml(
      baseSnap({
        classId: "LMGT3",
        structuralSeverity: 12,
        partHealth: { body_fl: 97.8, brakes: 72 },
        partRepairSec: { body_fl: 6, brakes: 22 },
        engineHealth: 88,
      }),
    );
    assert.match(html, /condition-diagram-LMGT3/);
    assert.match(html, /Structural load/);
    assert.match(html, /condition-corner-fl/);
    assert.match(html, /B98 · S100/);
    assert.match(html, /Brakes &amp; aero/);
    assert.match(html, /Engine/);
    assert.match(html, /88%/);
    assert.match(html, /~22s/);
  });

  it("summarizes damage for telemetry rows", () => {
    const summary = damageSummaryText(
      baseSnap({
        limpMode: "hybrid_only",
        partHealth: { brakes: 72, cooling: 88 },
        tyreDeflation: { fl: "flat" },
      }),
    );
    assert.match(summary, /Brakes 72%/);
    assert.match(summary, /Hybrid only/);
    assert.match(summary, /FL flat/);
  });
});
