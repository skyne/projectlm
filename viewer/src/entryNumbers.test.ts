import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CarSnapshot, SessionInitPayload } from "./ws/protocol";
import {
  enrichSnapshots,
  formatMapCarLabel,
  resolveCarNumber,
  setEntryNumbersFromSession,
} from "./entryNumbers";

function snap(partial: Partial<CarSnapshot> & Pick<CarSnapshot, "entryId">): CarSnapshot {
  return {
    entryId: partial.entryId,
    teamName: partial.teamName ?? "Team",
    carNumber: partial.carNumber ?? "",
    classId: partial.classId ?? "Hypercar",
    lap: partial.lap ?? 1,
    distance: partial.distance ?? 0,
    normalizedT: partial.normalizedT ?? 0,
    speed: partial.speed ?? 80,
    rpm: partial.rpm ?? 6000,
    fuel: partial.fuel ?? 50,
    tireWear: partial.tireWear ?? 0,
    engineHealth: partial.engineHealth ?? 100,
    sectorIndex: partial.sectorIndex ?? 0,
    racePosition: partial.racePosition ?? 1,
    inPit: partial.inPit ?? false,
    retired: partial.retired ?? false,
    currentLapTime: partial.currentLapTime ?? 0,
    currentSectorTime: partial.currentSectorTime ?? 0,
    lastLapTime: partial.lastLapTime ?? 0,
    bestLapTime: partial.bestLapTime ?? 0,
    gapToLeader: partial.gapToLeader ?? 0,
    currentLapSectorTimes: partial.currentLapSectorTimes ?? [],
    lapHistory: partial.lapHistory ?? [],
    position: partial.position ?? { x: 0, y: 0, z: 0 },
    tangent: partial.tangent ?? { x: 1, y: 0, z: 0 },
  };
}

describe("entryNumbers", () => {
  it("resolves by entryId not team name when numbers repeat across classes", () => {
    const payload: SessionInitPayload = {
      trackName: "Test",
      targetLaps: 1,
      simTimestep: 0.1,
      playerEntryId: "entry-9",
      entries: [
        { entryId: "entry-9", teamName: "BMW", carNumber: "20", classId: "Hypercar" },
        { entryId: "entry-34", teamName: "GT Team", carNumber: "20", classId: "LMGT3" },
      ],
      carNumberByEntryId: { "entry-9": "20", "entry-34": "20" },
    };
    setEntryNumbersFromSession(payload);

    assert.equal(resolveCarNumber(snap({ entryId: "entry-9", carNumber: "20" })), "20");
    assert.equal(resolveCarNumber(snap({ entryId: "entry-34", carNumber: "20" })), "20");
    assert.equal(
      formatMapCarLabel(snap({ entryId: "entry-9", carNumber: "20", classId: "Hypercar" })),
      "H20",
    );
    assert.equal(
      formatMapCarLabel(snap({ entryId: "entry-34", carNumber: "20", classId: "LMGT3" })),
      "G20",
    );
  });

  it("prefers snapshot carNumber from sim ticks", () => {
    setEntryNumbersFromSession({
      trackName: "Test",
      targetLaps: 1,
      simTimestep: 0.1,
      playerEntryId: "entry-1",
      entries: [{ entryId: "entry-1", teamName: "Solo", carNumber: "99", classId: "Hypercar" }],
      carNumberByEntryId: { "entry-1": "99" },
    });
    const enriched = enrichSnapshots([
      snap({ entryId: "entry-1", carNumber: "7", classId: "Hypercar" }),
    ]);
    assert.equal(enriched[0].carNumber, "7");
  });
});
