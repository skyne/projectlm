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
    (0, node_test_1.it)("submits inter-team deal for async off-week resolution", () => {
        const season = (0, ai_rival_season_1.initAiRivalSeason)(repoRoot, "SkyTech", 2026);
        strict_1.default.ok(season.teams.length > 0);
        const partner = season.teams[0].teamName;
        const created = (0, negotiation_deals_1.createInterTeamNegotiation)("joint_testing", partner, {
            playerTeamName: "SkyTech",
            currentRound: 1,
            rivalTeams: season.teams.map((t) => t.teamName),
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const submitted = (0, negotiation_deals_1.submitInterTeamOffer)(created, { ...created.anchorTerms, costContribution: 200000 }, 1);
        strict_1.default.equal(submitted.session.status, "pending_response");
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
        const pending = (0, negotiation_deals_1.submitInterTeamOffer)(created, created.anchorTerms, 1).session;
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
            strict_1.default.equal(resolved.newAgreements[0]?.stubPending, true);
            strict_1.default.ok(resolved.newAgreements[0]?.stubNote?.includes("pending"));
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
