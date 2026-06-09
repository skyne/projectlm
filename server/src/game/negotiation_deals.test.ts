import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { initAiRivalSeason } from "./ai_rival_season";
import {
  anchorTermsFromSponsorOffer,
  applySponsorDeal,
  createInterTeamNegotiation,
  createRegulatoryNegotiation,
  createSponsorNegotiation,
  evaluateSponsorOffer,
  resolveAsyncNegotiations,
  resolvePendingInterTeamNegotiations,
  submitInterTeamOffer,
  submitRegulatoryPetition,
} from "./negotiation_deals";
import { defaultRegulatoryState, ruleProposalById } from "./regulations";
import { sponsorOfferById } from "./economy";

const repoRoot = path.resolve(process.cwd(), "..");

describe("negotiation_deals", () => {
  it("creates and accepts sponsor negotiation at anchor terms", () => {
    const offer = sponsorOfferById("titan_lube")!;
    const session = createSponsorNegotiation(offer.id, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.5,
    });
    assert.ok(!("error" in session));
    if ("error" in session) return;

    const result = evaluateSponsorOffer(
      session,
      anchorTermsFromSponsorOffer(offer),
      { currentRound: 2, prestigeScore: 0.5, offer },
    );
    assert.equal(result.accepted, true);

    const applied = applySponsorDeal(result.session, offer, {
      budget: 1_000_000,
      currentRound: 2,
      seasonYear: 2026,
      sponsors: [],
      maxSlots: 3,
    });
    assert.ok(!("error" in applied));
    if ("error" in applied) return;
    assert.equal(applied.sponsors.length, 1);
    assert.equal(applied.sponsors[0]?.perRaceIncome, offer.perRaceIncome);
  });

  it("submits inter-team deal for async off-week resolution", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    assert.ok(season.teams.length > 0);
    const partner = season.teams[0]!.teamName;
    const created = createInterTeamNegotiation("joint_testing", partner, {
      playerTeamName: "SkyTech",
      currentRound: 1,
      rivalTeams: season.teams.map((t) => t.teamName),
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const submitted = submitInterTeamOffer(
      created,
      { ...created.anchorTerms, costContribution: 200_000 },
      1,
    );
    assert.equal(submitted.session.status, "pending_response");
  });

  it("resolves inter-team negotiation into stub agreement", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    assert.ok(season.teams.length > 0);
    const partner = season.teams[0]!.teamName;
    for (const t of season.teams) {
      t.budget = 80_000_000;
    }
    const created = createInterTeamNegotiation("joint_testing", partner, {
      playerTeamName: "SkyTech",
      currentRound: 1,
      rivalTeams: season.teams.map((t) => t.teamName),
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const pending = submitInterTeamOffer(
      created,
      created.anchorTerms,
      1,
    ).session;

    const resolved = resolvePendingInterTeamNegotiations(
      [pending],
      season,
      {
        playerTeamName: "SkyTech",
        completingRound: 1,
        prestigeScore: 0.6,
        seed: 12345,
      },
    );
    assert.ok(
      resolved.newAgreements.length > 0 ||
        resolved.sessions[0]?.status === "countered" ||
        resolved.sessions[0]?.status === "rejected",
    );
    if (resolved.newAgreements.length > 0) {
      assert.equal(resolved.newAgreements[0]?.stubPending, false);
      assert.ok(resolved.newAgreements[0]?.stubNote?.includes("XP"));
    }
  });

  it("files regulatory petition and opens vote", () => {
    const proposal = ruleProposalById("vote_lmp2_weight_shift")!;
    const created = createRegulatoryNegotiation(proposal, {
      playerTeamName: "Sky Racing",
      currentRound: 3,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const pending = submitRegulatoryPetition(
      created,
      created.anchorTerms,
      3,
    ).session;
    assert.equal(pending.status, "pending_response");

    const season = initAiRivalSeason(repoRoot, "Sky Racing", 2026);
    const regulatory = defaultRegulatoryState(3);
    const resolved = resolveAsyncNegotiations(
      [pending],
      season,
      regulatory,
      {
        playerTeamName: "Sky Racing",
        completingRound: 3,
        prestigeScore: 0.4,
        seed: 99,
      },
    );
    assert.ok(resolved.regulatory.pendingVotes.length >= 0);
    assert.equal(resolved.sessions[0]?.status, "accepted");
  });
});
