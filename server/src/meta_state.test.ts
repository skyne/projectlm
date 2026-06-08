import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MetaStatePayload } from "./ws_protocol";
import { buildSeasonStartSnapshot } from "./meta_state";

function meta(partial: Partial<MetaStatePayload>): MetaStatePayload {
  return {
    teamName: "Test Team",
    budget: 1_000_000,
    rdPoints: 100,
    playerEntryId: "entry-1",
    seasonYear: 2026,
    currentRound: 0,
    staff: [],
    unlockedParts: ["tire.Medium"],
    calendar: [
      {
        round: 1,
        trackId: "imola",
        format: "6h",
        eventType: "race",
        completed: true,
        championshipPoints: 25,
        prizeMoney: 50_000,
        rdPointsEarned: 5,
      },
    ],
    setupComplete: true,
    fleet: [],
    driverRoster: [],
    driverMarket: [],
    aiRivalSeason: {
      seasonYear: 2026,
      teams: [
        {
          teamName: "Toyota",
          primaryClassId: "Hypercar",
          budget: 1,
          rdTier: 1,
          engineerSkill: 80,
          form: 0,
          championshipPoints: 25,
          racesScored: 1,
          arc: null,
          lastRoundPoints: 25,
          driversSigned: 2,
        },
      ],
      drivers: [],
    },
    ...partial,
  };
}

describe("buildSeasonStartSnapshot", () => {
  it("captures season-start career state including AI rivals", () => {
    const state = meta({ budget: 2_500_000, currentRound: 2 });
    const snap = buildSeasonStartSnapshot(state);

    assert.equal(snap.seasonYear, 2026);
    assert.equal(snap.budget, 2_500_000);
    assert.equal(snap.currentRound, 2);
    assert.equal(snap.aiRivalSeason.teams[0].championshipPoints, 25);
    assert.equal(snap.calendar[0].completed, true);
    assert.notEqual(snap.calendar, state.calendar);
    assert.notEqual(snap.aiRivalSeason, state.aiRivalSeason);
  });
});
