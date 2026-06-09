"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const negotiations_1 = require("./negotiations");
const sampleDriver = {
    id: "drv-test-1",
    name: "Test Driver",
    nationality: "GB",
    tier: "Gold",
    dryPace: 85,
    wetPace: 80,
    consistency: 82,
    overtaking: 78,
    defending: 76,
    trafficManagement: 80,
    rollingStart: 78,
    standingStart: 76,
    setupFeedback: 74,
    tireManagement: 80,
    fuelSaving: 76,
    composure: 82,
    nightPace: 78,
    rainRadar: 72,
    stamina: 80,
    maxStintHours: 3,
};
function prospectListing(overrides) {
    return {
        id: "prospect-test-1",
        source: "prospect",
        driver: sampleDriver,
        signingFee: 120000,
        salaryPerRace: 7200,
        tagline: "Prospect",
        ...overrides,
    };
}
(0, node_test_1.describe)("negotiations", () => {
    (0, node_test_1.it)("creates a driver employment session with anchor terms from listing", () => {
        const listing = prospectListing();
        const session = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.3,
        });
        strict_1.default.ok(!("error" in session));
        if ("error" in session)
            return;
        strict_1.default.equal(session.kind, "driver_employment");
        strict_1.default.equal(session.status, "countered");
        strict_1.default.equal(session.anchorTerms.signingFee, 120000);
        strict_1.default.equal(session.anchorTerms.salaryPerRace, 7200);
        strict_1.default.ok(session.lastCounterOffer);
        strict_1.default.ok(session.history.length > 0);
        strict_1.default.ok((session.lastCounterOffer?.signingFee ?? 0) >= 120000);
    });
    (0, node_test_1.it)("produces deterministic driver opening offers", () => {
        const listing = prospectListing();
        const ctx = (0, negotiations_1.buildDriverNegotiationContext)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.3,
        });
        const anchor = (0, negotiations_1.anchorTermsFromDriverListing)(listing);
        const first = (0, negotiations_1.driverOpeningOfferForNegotiation)(anchor, listing, ctx);
        const second = (0, negotiations_1.driverOpeningOfferForNegotiation)(anchor, listing, ctx);
        strict_1.default.deepEqual(first.terms, second.terms);
        strict_1.default.equal(first.note, second.note);
    });
    (0, node_test_1.it)("uses driver_buyout kind for active WEC listings", () => {
        const listing = prospectListing({
            id: "wec-active-1",
            source: "wec_active",
            contractedTeam: "Toyota Gazoo",
            signingFee: 400000,
            salaryPerRace: 24000,
        });
        const session = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 1,
            seasonYear: 2026,
            prestigeScore: 0.5,
        });
        strict_1.default.ok(!("error" in session));
        if ("error" in session)
            return;
        strict_1.default.equal(session.kind, "driver_buyout");
        strict_1.default.equal(session.releasingTeam, "Toyota Gazoo");
        strict_1.default.ok((session.anchorTerms.buyoutToTeam ?? 0) > 0);
    });
    (0, node_test_1.it)("accepts a generous offer at anchor terms for prospects", () => {
        const listing = prospectListing();
        const session = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.4,
        });
        strict_1.default.ok(!("error" in session));
        if ("error" in session)
            return;
        const ctx = (0, negotiations_1.buildDriverNegotiationContext)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.4,
        });
        const result = (0, negotiations_1.evaluateDriverOffer)(session, (0, negotiations_1.anchorTermsFromDriverListing)(listing), ctx);
        strict_1.default.equal(result.accepted, true);
        strict_1.default.equal(result.session.status, "accepted");
    });
    (0, node_test_1.it)("counters when signing fee is far below anchor", () => {
        const listing = prospectListing();
        const created = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.1,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const ctx = (0, negotiations_1.buildDriverNegotiationContext)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.1,
        });
        const lowOffer = {
            signingFee: 40000,
            salaryPerRace: 3000,
            contractSeasons: 1,
            seatGuarantee: "reserve",
        };
        const result = (0, negotiations_1.evaluateDriverOffer)(created, lowOffer, ctx);
        strict_1.default.equal(result.accepted, false);
        strict_1.default.equal(result.session.status, "countered");
        strict_1.default.ok(result.session.lastCounterOffer);
        strict_1.default.ok((result.session.lastCounterOffer?.signingFee ?? 0) > lowOffer.signingFee);
    });
    (0, node_test_1.it)("rejects buyout below minimum for active WEC drivers", () => {
        const listing = prospectListing({
            source: "wec_active",
            contractedTeam: "Porsche Penske",
            signingFee: 500000,
            salaryPerRace: 30000,
        });
        const created = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 3,
            seasonYear: 2026,
            prestigeScore: 0.6,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const ctx = (0, negotiations_1.buildDriverNegotiationContext)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 3,
            seasonYear: 2026,
            prestigeScore: 0.6,
        });
        const minBuyout = (0, negotiations_1.computeMinBuyout)(listing);
        const insult = {
            ...(0, negotiations_1.anchorTermsFromDriverListing)(listing),
            buyoutToTeam: Math.round(minBuyout * 0.4),
        };
        const result = (0, negotiations_1.evaluateDriverOffer)(created, insult, ctx);
        strict_1.default.equal(result.accepted, false);
        strict_1.default.ok(result.session.status === "countered" || result.session.status === "rejected");
    });
    (0, node_test_1.it)("accepts counter-offer when player accepts driver terms", () => {
        const listing = prospectListing();
        const created = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.2,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const ctx = (0, negotiations_1.buildDriverNegotiationContext)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 2,
            seasonYear: 2026,
            prestigeScore: 0.2,
        });
        const countered = (0, negotiations_1.evaluateDriverOffer)(created, { signingFee: 50000, salaryPerRace: 2000, contractSeasons: 1 }, ctx);
        strict_1.default.ok(countered.session.lastCounterOffer);
        const accepted = (0, negotiations_1.acceptCounterOffer)(countered.session, ctx);
        strict_1.default.equal(accepted.accepted, true);
    });
    (0, node_test_1.it)("expires open negotiations after deadline round", () => {
        const listing = prospectListing();
        const created = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 1,
            seasonYear: 2026,
            prestigeScore: 0.2,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const expired = (0, negotiations_1.expireNegotiations)([created], created.expiresAtRound + 1);
        strict_1.default.equal(expired[0]?.status, "expired");
    });
    (0, node_test_1.it)("tracks listing ids with open negotiations for rival market protection", () => {
        const listing = prospectListing();
        const created = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: "Sky Racing",
            currentRound: 1,
            seasonYear: 2026,
            prestigeScore: 0.2,
        });
        strict_1.default.ok(!("error" in created));
        if ("error" in created)
            return;
        const ids = (0, negotiations_1.listingIdsWithOpenNegotiations)([created]);
        strict_1.default.ok(ids.has(listing.id));
    });
    (0, node_test_1.it)("computes driver payroll from employment contracts", () => {
        const payroll = (0, negotiations_1.computeDriverPayroll)([
            {
                entityId: "d1",
                entityKind: "driver",
                teamName: "Sky Racing",
                signedRound: 1,
                expiresSeasonYear: 2028,
                signingFeePaid: 100000,
                salaryPerRace: 12000,
            },
            {
                entityId: "d2",
                entityKind: "driver",
                teamName: "Sky Racing",
                signedRound: 1,
                expiresSeasonYear: 2028,
                signingFeePaid: 80000,
                salaryPerRace: 8000,
            },
        ], "Sky Racing");
        strict_1.default.equal(payroll, 20000);
    });
    (0, node_test_1.it)("synthesizes employment contracts for legacy saves", () => {
        const contracts = (0, negotiations_1.synthesizeEmploymentContracts)({
            teamName: "Legacy Team",
            seasonYear: 2026,
            currentRound: 4,
            driverRoster: [sampleDriver],
            staff: [],
        });
        strict_1.default.equal(contracts.length, 1);
        strict_1.default.equal(contracts[0]?.entityKind, "driver");
        strict_1.default.ok((contracts[0]?.salaryPerRace ?? 0) > 0);
    });
});
