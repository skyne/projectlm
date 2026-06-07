import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MetaStatePayload } from "../ws_protocol";
import {
  buildSeasonSummary,
  computeSeasonEndPayouts,
  computeTeamChampionshipPayout,
  finalizeSeasonSummary,
  isSeasonCalendarComplete,
} from "./season_end";

function meta(partial: Partial<MetaStatePayload>): MetaStatePayload {
  return {
    teamName: "Test Team",
    budget: 1_000_000,
    rdPoints: 100,
    playerEntryId: "entry-1",
    seasonYear: 2026,
    currentRound: 8,
    staff: [],
    unlockedParts: [],
    calendar: [],
    setupComplete: true,
    ...partial,
  };
}

describe("season_end", () => {
  it("detects a finished scoring calendar", () => {
    const calendar = [
      { round: 0, trackId: "paul_ricard", format: "test", eventType: "test" as const, completed: false, championshipPoints: 0 },
      { round: 1, trackId: "imola", format: "6h", eventType: "race" as const, completed: true, championshipPoints: 25 },
      { round: 2, trackId: "spa", format: "6h", eventType: "race" as const, completed: true, championshipPoints: 18 },
    ];
    assert.equal(isSeasonCalendarComplete(calendar), true);
    assert.equal(isSeasonCalendarComplete([{ ...calendar[1], completed: false }]), false);
  });

  it("builds class standings and player positions", () => {
    const summary = buildSeasonSummary(
      meta({
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
              championshipPoints: 50,
              racesScored: 2,
              arc: null,
              lastRoundPoints: 0,
              driversSigned: 0,
            },
            {
              teamName: "Test Team",
              primaryClassId: "Hypercar",
              budget: 1,
              rdTier: 1,
              engineerSkill: 80,
              form: 0,
              championshipPoints: 12,
              racesScored: 1,
              arc: "underdog",
              lastRoundPoints: 12,
              driversSigned: 0,
              isPlayerTeam: true,
            },
          ],
          drivers: [],
        },
      }),
    );
    assert.ok(summary);
    assert.equal(summary!.playerTeamPositions.Hypercar, 2);
    assert.equal(summary!.teamStandings.Hypercar[0]!.teamName, "Toyota");
  });

  it("computes scaled championship payouts and completion bonus", () => {
    const summary = buildSeasonSummary(
      meta({
        calendar: [
          { round: 1, trackId: "imola", format: "6h", eventType: "race", completed: true, championshipPoints: 12 },
        ],
        aiRivalSeason: {
          seasonYear: 2026,
          teams: [
            {
              teamName: "Test Team",
              primaryClassId: "Hypercar",
              budget: 1,
              rdTier: 1,
              engineerSkill: 80,
              form: 0,
              championshipPoints: 12,
              racesScored: 1,
              arc: null,
              lastRoundPoints: 12,
              driversSigned: 0,
              isPlayerTeam: true,
            },
          ],
          drivers: [],
        },
      }),
    )!;
    const { totalPayout, payouts } = computeSeasonEndPayouts(meta({ calendar: summary ? [{ round: 1, trackId: "imola", format: "6h", eventType: "race", completed: true, championshipPoints: 12 }] : [] }), summary);
    assert.equal(computeTeamChampionshipPayout(2, "Hypercar"), 2_000_000);
    assert.ok(totalPayout >= 2_000_000 + 500_000);
    assert.ok(payouts.some((p) => p.label.includes("completion bonus")));
  });

  it("finalizes a full summary with payout lines", () => {
    const finalized = finalizeSeasonSummary(
      meta({
        calendar: [
          { round: 1, trackId: "imola", format: "6h", eventType: "race", completed: true, championshipPoints: 25 },
        ],
        aiRivalSeason: {
          seasonYear: 2026,
          teams: [
            {
              teamName: "Test Team",
              primaryClassId: "Hypercar",
              budget: 1,
              rdTier: 1,
              engineerSkill: 80,
              form: 0,
              championshipPoints: 25,
              racesScored: 1,
              arc: null,
              lastRoundPoints: 25,
              driversSigned: 0,
              isPlayerTeam: true,
            },
          ],
          drivers: [],
        },
      }),
    );
    assert.ok(finalized);
    assert.equal(finalized!.playerTeamPositions.Hypercar, 1);
    assert.ok(finalized!.totalPayout > 0);
  });
});
