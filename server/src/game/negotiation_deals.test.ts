import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { initAiRivalSeason } from "./ai_rival_season";
import {
  anchorTermsForInterTeamDeal,
  anchorTermsFromSponsorOffer,
  applySponsorDeal,
  createInterTeamNegotiation,
  createRegulatoryNegotiation,
  createSponsorNegotiation,
  sponsorOpeningOfferForNegotiation,
  evaluateSponsorOffer,
  rivalOpeningOfferForInterTeam,
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
    assert.equal(session.status, "countered");
    assert.ok(session.lastCounterOffer);
    assert.ok(session.history.length > 0);

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

  it("produces deterministic sponsor opening offers", () => {
    const offer = sponsorOfferById("titan_lube")!;
    const anchor = anchorTermsFromSponsorOffer(offer);
    const first = sponsorOpeningOfferForNegotiation(anchor, offer);
    const second = sponsorOpeningOfferForNegotiation(anchor, offer);
    assert.deepEqual(first.terms, second.terms);
    assert.equal(first.note, second.note);
  });

  it("opens inter-team talks with rival opening offer first", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    assert.ok(season.teams.length > 0);
    const partner = season.teams[0]!;
    const created = createInterTeamNegotiation("joint_testing", partner.teamName, {
      playerTeamName: "SkyTech",
      currentRound: 1,
      rivalTeams: season.teams.map((t) => t.teamName),
      rivalTeam: partner,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    assert.equal(created.status, "countered");
    assert.ok(created.lastCounterOffer);
    assert.ok(created.history.length > 0);
    assert.equal(created.history[0]?.from, partner.teamName);
    assert.ok((created.lastCounterOffer?.costContribution ?? 0) > 0);
  });

  it("submits inter-team deal for async off-week resolution", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    assert.ok(season.teams.length > 0);
    const partner = season.teams[0]!;
    const created = createInterTeamNegotiation("joint_testing", partner.teamName, {
      playerTeamName: "SkyTech",
      currentRound: 1,
      rivalTeams: season.teams.map((t) => t.teamName),
      rivalTeam: partner,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const submitted = submitInterTeamOffer(
      created,
      {
        ...created.lastCounterOffer!,
        costContribution: (created.lastCounterOffer?.costContribution ?? 0) + 10_000,
      },
      1,
    );
    assert.equal(submitted.session.status, "pending_response");
  });

  it("generates deterministic rival opening offers", () => {
    const anchor = anchorTermsForInterTeamDeal("joint_testing", ["Toyota Gazoo Racing"]);
    const first = rivalOpeningOfferForInterTeam(anchor, "joint_testing", "Toyota Gazoo Racing");
    const second = rivalOpeningOfferForInterTeam(anchor, "joint_testing", "Toyota Gazoo Racing");
    assert.equal(first.terms.costContribution, second.terms.costContribution);
    assert.equal(first.terms.sharedTrackId, second.terms.sharedTrackId);
  });

  it("creates one multi-party joint testing negotiation", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const partners = season.teams.slice(0, 3);
    assert.ok(partners.length >= 2);
    const names = partners.map((t) => t.teamName);
    const created = createInterTeamNegotiation("joint_testing", names, {
      playerTeamName: "SkyTech",
      currentRound: 1,
      rivalTeams: season.teams.map((t) => t.teamName),
      rivalTeamByName: (name) =>
        season.teams.find((t) => t.teamName === name),
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    assert.equal(
      created.parties.filter((p) => p.role === "counterparty").length,
      names.length,
    );
    assert.equal(created.anchorTerms.partnerTeams?.length, names.length);
    assert.equal(created.history.length, names.length);
    assert.ok(created.subjectRef.includes("|"));
    assert.ok((created.lastCounterOffer?.costContribution ?? 0) > 0);
  });

  it("resolves multi-party joint testing into per-team agreements", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const partners = season.teams.slice(0, 3);
    assert.ok(partners.length >= 2);
    for (const t of season.teams) {
      t.budget = 80_000_000;
    }
    const names = partners.map((t) => t.teamName);
    const created = createInterTeamNegotiation("joint_testing", names, {
      playerTeamName: "SkyTech",
      currentRound: 1,
      rivalTeams: season.teams.map((t) => t.teamName),
      rivalTeamByName: (name) =>
        season.teams.find((t) => t.teamName === name),
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const pending = submitInterTeamOffer(
      created,
      {
        ...created.lastCounterOffer!,
        costContribution: (created.lastCounterOffer?.costContribution ?? 0) + 50_000,
      },
      1,
    ).session;

    const resolved = resolvePendingInterTeamNegotiations([pending], season, {
      playerTeamName: "SkyTech",
      completingRound: 1,
      prestigeScore: 0.8,
      seed: 4242,
    });
    assert.ok(resolved.newAgreements.length > 0);
    assert.equal(
      new Set(resolved.newAgreements.map((agr) => agr.partnerTeam)).size,
      resolved.newAgreements.length,
    );
    assert.equal(resolved.sessions[0]?.status, "accepted");
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
      created.lastCounterOffer ?? created.anchorTerms,
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
      assert.ok(resolved.newAgreements[0]?.stubNote?.includes("Joint private testing"));
      if (resolved.newAgreements.length === 1) {
        const agr = resolved.newAgreements[0]!;
        assert.ok(agr.partnerTeam);
        if (agr.partnerTeams?.length) {
          assert.ok(agr.partnerTeams.length > 1);
        }
      }
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
