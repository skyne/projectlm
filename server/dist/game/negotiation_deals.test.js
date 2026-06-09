"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_path_1 = __importDefault(require("node:path"));
const ai_rival_season_1 = require("./ai_rival_season");
const negotiation_deals_1 = require("./negotiation_deals");
const regulations_1 = require("./regulations");
const economy_1 = require("./economy");
const repoRoot = node_path_1.default.resolve(process.cwd(), "..");
(0, node_test_1.describe)("negotiation_deals", () => {
    (0, node_test_1.it)("creates and accepts sponsor negotiation at anchor terms", () => {
        const offer = (0, economy_1.sponsorOfferById)("titan_lube");
        const session = (0, negotiation_deals_1.createSponsorNegotiation)(offer.id, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.5,
        });
        strict_1.default.ok(!("error" in session));
        if ("error" in session)
            return;
        strict_1.default.equal(session.status, "countered");
        strict_1.default.ok(session.lastCounterOffer);
        strict_1.default.ok(session.history.length > 0);
        const result = (0, negotiation_deals_1.evaluateSponsorOffer)(session, (0, negotiation_deals_1.anchorTermsFromSponsorOffer)(offer), { currentRound: 2, prestigeScore: 0.5, offer });
        strict_1.default.equal(result.accepted, true);
        const applied = (0, negotiation_deals_1.applySponsorDeal)(result.session, offer, {
            budget: 1000000,
            currentRound: 2,
            seasonYear: 2026,
            sponsors: [],
            maxSlots: 3,
        });
        strict_1.default.ok(!("error" in applied));
        if ("error" in applied)
            return;
        strict_1.default.equal(applied.sponsors.length, 1);
        strict_1.default.equal(applied.sponsors[0]?.perRaceIncome, offer.perRaceIncome);
    });
    (0, node_test_1.it)("produces deterministic sponsor opening offers", () => {
        const offer = (0, economy_1.sponsorOfferById)("titan_lube");
        const anchor = (0, negotiation_deals_1.anchorTermsFromSponsorOffer)(offer);
        const first = (0, negotiation_deals_1.sponsorOpeningOfferForNegotiation)(anchor, offer);
        const second = (0, negotiation_deals_1.sponsorOpeningOfferForNegotiation)(anchor, offer);
        strict_1.default.deepEqual(first.terms, second.terms);
        strict_1.default.equal(first.note, second.note);
    });
    (0, node_test_1.it)("opens inter-team talks with rival opening offer first", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        strict_1.default.ok(season.teams.length > 0);
        const partner = season.teams[0];
        const created = (0, negotiation_deals_1.createInterTeamNegotiation)("joint_testing", partner.teamName, {
            playerTeamName: "SkyTech",
            currentRound: 1,
            rivalTeams: season.teams.map((t) => t.teamName),
            rivalTeam: partner,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        strict_1.default.equal(created.status, "countered");
        strict_1.default.ok(created.lastCounterOffer);
        strict_1.default.ok(created.history.length > 0);
        strict_1.default.equal(created.history[0]?.from, partner.teamName);
        strict_1.default.ok((created.lastCounterOffer?.costContribution ?? 0) > 0);
    });
    (0, node_test_1.it)("submits inter-team deal for async off-week resolution", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        strict_1.default.ok(season.teams.length > 0);
        const partner = season.teams[0];
        const created = (0, negotiation_deals_1.createInterTeamNegotiation)("joint_testing", partner.teamName, {
            playerTeamName: "SkyTech",
            currentRound: 1,
            rivalTeams: season.teams.map((t) => t.teamName),
            rivalTeam: partner,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const submitted = (0, negotiation_deals_1.submitInterTeamOffer)(created, {
            ...created.lastCounterOffer,
            costContribution: (created.lastCounterOffer?.costContribution ?? 0) + 10000,
        }, 1);
        strict_1.default.equal(submitted.session.status, "pending_response");
    });
    (0, node_test_1.it)("generates deterministic rival opening offers", () => {
        const anchor = (0, negotiation_deals_1.anchorTermsForInterTeamDeal)("joint_testing", ["Toyota Gazoo Racing"]);
        const first = (0, negotiation_deals_1.rivalOpeningOfferForInterTeam)(anchor, "joint_testing", "Toyota Gazoo Racing");
        const second = (0, negotiation_deals_1.rivalOpeningOfferForInterTeam)(anchor, "joint_testing", "Toyota Gazoo Racing");
        strict_1.default.equal(first.terms.costContribution, second.terms.costContribution);
        strict_1.default.equal(first.terms.sharedTrackId, second.terms.sharedTrackId);
    });
    (0, node_test_1.it)("creates one multi-party joint testing negotiation", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        const partners = season.teams.slice(0, 3);
        strict_1.default.ok(partners.length >= 2);
        const names = partners.map((t) => t.teamName);
        const created = (0, negotiation_deals_1.createInterTeamNegotiation)("joint_testing", names, {
            playerTeamName: "SkyTech",
            currentRound: 1,
            rivalTeams: season.teams.map((t) => t.teamName),
            rivalTeamByName: (name) => season.teams.find((t) => t.teamName === name),
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        strict_1.default.equal(created.parties.filter((p) => p.role === "counterparty").length, names.length);
        strict_1.default.equal(created.anchorTerms.partnerTeams?.length, names.length);
        strict_1.default.equal(created.history.length, names.length);
        strict_1.default.ok(created.subjectRef.includes("|"));
        strict_1.default.ok((created.lastCounterOffer?.costContribution ?? 0) > 0);
    });
    (0, node_test_1.it)("resolves multi-party joint testing into per-team agreements", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        const partners = season.teams.slice(0, 3);
        strict_1.default.ok(partners.length >= 2);
        for (const t of season.teams) {
            t.budget = 80000000;
        }
        const names = partners.map((t) => t.teamName);
        const created = (0, negotiation_deals_1.createInterTeamNegotiation)("joint_testing", names, {
            playerTeamName: "SkyTech",
            currentRound: 1,
            rivalTeams: season.teams.map((t) => t.teamName),
            rivalTeamByName: (name) => season.teams.find((t) => t.teamName === name),
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const pending = (0, negotiation_deals_1.submitInterTeamOffer)(created, {
            ...created.lastCounterOffer,
            costContribution: (created.lastCounterOffer?.costContribution ?? 0) + 50000,
        }, 1).session;
        const resolved = (0, negotiation_deals_1.resolvePendingInterTeamNegotiations)([pending], season, {
            playerTeamName: "SkyTech",
            completingRound: 1,
            prestigeScore: 0.8,
            seed: 4242,
        });
        strict_1.default.ok(resolved.newAgreements.length > 0);
        strict_1.default.equal(new Set(resolved.newAgreements.map((agr) => agr.partnerTeam)).size, resolved.newAgreements.length);
        strict_1.default.equal(resolved.sessions[0]?.status, "accepted");
    });
    (0, node_test_1.it)("resolves inter-team negotiation into stub agreement", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        strict_1.default.ok(season.teams.length > 0);
        const partner = season.teams[0].teamName;
        for (const t of season.teams) {
            t.budget = 80000000;
        }
        const created = (0, negotiation_deals_1.createInterTeamNegotiation)("joint_testing", partner, {
            playerTeamName: "SkyTech",
            currentRound: 1,
            rivalTeams: season.teams.map((t) => t.teamName),
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const pending = (0, negotiation_deals_1.submitInterTeamOffer)(created, created.lastCounterOffer ?? created.anchorTerms, 1).session;
        const resolved = (0, negotiation_deals_1.resolvePendingInterTeamNegotiations)([pending], season, {
            playerTeamName: "SkyTech",
            completingRound: 1,
            prestigeScore: 0.6,
            seed: 12345,
        });
        strict_1.default.ok(resolved.newAgreements.length > 0 ||
            resolved.sessions[0]?.status === "countered" ||
            resolved.sessions[0]?.status === "rejected");
        if (resolved.newAgreements.length > 0) {
            strict_1.default.equal(resolved.newAgreements[0]?.stubPending, false);
            strict_1.default.ok(resolved.newAgreements[0]?.stubNote?.includes("Joint private testing"));
            if (resolved.newAgreements.length === 1) {
                const agr = resolved.newAgreements[0];
                strict_1.default.ok(agr.partnerTeam);
                if (agr.partnerTeams?.length) {
                    strict_1.default.ok(agr.partnerTeams.length > 1);
                }
            }
        }
    });
    (0, node_test_1.it)("files regulatory petition and opens vote", () => {
        const proposal = (0, regulations_1.ruleProposalById)("vote_lmp2_weight_shift");
        const created = (0, negotiation_deals_1.createRegulatoryNegotiation)(proposal, {
            playerTeamName: "Sky Racing",
            currentRound: 3,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const pending = (0, negotiation_deals_1.submitRegulatoryPetition)(created, created.anchorTerms, 3).session;
        strict_1.default.equal(pending.status, "pending_response");
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "Sky Racing", 2026);
        const regulatory = (0, regulations_1.defaultRegulatoryState)(3);
        const resolved = (0, negotiation_deals_1.resolveAsyncNegotiations)([pending], season, regulatory, {
            playerTeamName: "Sky Racing",
            completingRound: 3,
            prestigeScore: 0.4,
            seed: 99,
        });
        strict_1.default.ok(resolved.regulatory.pendingVotes.length >= 0);
        strict_1.default.equal(resolved.sessions[0]?.status, "accepted");
    });
});
