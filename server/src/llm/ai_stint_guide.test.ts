import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiStintGuide } from "./ai_stint_guide";
import type { CarSnapshot } from "../ws_protocol";

const snap: CarSnapshot = {
  entryId: "ai-1",
  teamName: "Toyota Racing",
  carNumber: "7",
  classId: "Hypercar",
  lap: 1,
  distance: 0,
  normalizedT: 0,
  speed: 0,
  rpm: 0,
  fuel: 100,
  tireWear: 0,
  tireCompound: "medium",
  engineHealth: 100,
  sectorIndex: 0,
  racePosition: 2,
  classPosition: 2,
  inPit: false,
  retired: false,
  currentLapTime: 0,
  currentSectorTime: 0,
  lastLapTime: 230,
  bestLapTime: 230,
  gapToLeader: 5,
  currentLapSectorTimes: [],
  lapHistory: [],
  position: { x: 0, y: 0, z: 0 },
  tangent: { x: 1, y: 0, z: 0 },
  pitCount: 0,
};

describe("AiStintGuide", () => {
  it("seeds fallback stint plans when LLM is disabled", () => {
    const prev = process.env.AI_STINT_LLM;
    process.env.AI_STINT_LLM = "0";
    try {
      const guide = new AiStintGuide();
      guide.observe([snap], new Set(["entry-1"]), {
        trackName: "Le Mans",
        targetDurationSeconds: 21_600,
        raceTimeSec: 0,
      });
      const plan = guide.getPlan("ai-1");
      assert.ok(plan);
      assert.equal(plan!.entryId, "ai-1");
      assert.ok(plan!.compound);
    } finally {
      if (prev === undefined) delete process.env.AI_STINT_LLM;
      else process.env.AI_STINT_LLM = prev;
    }
  });
});
