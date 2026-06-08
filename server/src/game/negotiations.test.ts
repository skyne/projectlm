import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DriverMarketListingPayload } from "../ws_protocol";
import {
  acceptCounterOffer,
  anchorTermsFromDriverListing,
  computeDriverPayroll,
  computeMinBuyout,
  createDriverNegotiation,
  evaluateDriverOffer,
  buildDriverNegotiationContext,
  expireNegotiations,
  listingIdsWithOpenNegotiations,
  synthesizeEmploymentContracts,
} from "./negotiations";

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

function prospectListing(
  overrides?: Partial<DriverMarketListingPayload>,
): DriverMarketListingPayload {
  return {
    id: "prospect-test-1",
    source: "prospect",
    driver: sampleDriver,
    signingFee: 120_000,
    salaryPerRace: 7_200,
    tagline: "Prospect",
    ...overrides,
  };
}

describe("negotiations", () => {
  it("creates a driver employment session with anchor terms from listing", () => {
    const listing = prospectListing();
    const session = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.3,
    });
    assert.ok(!("error" in session));
    if ("error" in session) return;
    assert.equal(session.kind, "driver_employment");
    assert.equal(session.status, "open");
    assert.equal(session.anchorTerms.signingFee, 120_000);
    assert.equal(session.anchorTerms.salaryPerRace, 7_200);
  });

  it("uses driver_buyout kind for active WEC listings", () => {
    const listing = prospectListing({
      id: "wec-active-1",
      source: "wec_active",
      contractedTeam: "Toyota Gazoo",
      signingFee: 400_000,
      salaryPerRace: 24_000,
    });
    const session = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 1,
      seasonYear: 2026,
      prestigeScore: 0.5,
    });
    assert.ok(!("error" in session));
    if ("error" in session) return;
    assert.equal(session.kind, "driver_buyout");
    assert.equal(session.releasingTeam, "Toyota Gazoo");
    assert.ok((session.anchorTerms.buyoutToTeam ?? 0) > 0);
  });

  it("accepts a generous offer at anchor terms for prospects", () => {
    const listing = prospectListing();
    const session = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.4,
    });
    assert.ok(!("error" in session));
    if ("error" in session) return;

    const ctx = buildDriverNegotiationContext(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.4,
    });
    const result = evaluateDriverOffer(
      session,
      anchorTermsFromDriverListing(listing),
      ctx,
    );
    assert.equal(result.accepted, true);
    assert.equal(result.session.status, "accepted");
  });

  it("counters when signing fee is far below anchor", () => {
    const listing = prospectListing();
    const created = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.1,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const ctx = buildDriverNegotiationContext(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.1,
    });
    const lowOffer = {
      signingFee: 40_000,
      salaryPerRace: 3_000,
      contractSeasons: 1,
      seatGuarantee: "reserve" as const,
    };
    const result = evaluateDriverOffer(created, lowOffer, ctx);
    assert.equal(result.accepted, false);
    assert.equal(result.session.status, "countered");
    assert.ok(result.session.lastCounterOffer);
    assert.ok(
      (result.session.lastCounterOffer?.signingFee ?? 0) > lowOffer.signingFee,
    );
  });

  it("rejects buyout below minimum for active WEC drivers", () => {
    const listing = prospectListing({
      source: "wec_active",
      contractedTeam: "Porsche Penske",
      signingFee: 500_000,
      salaryPerRace: 30_000,
    });
    const created = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 3,
      seasonYear: 2026,
      prestigeScore: 0.6,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const ctx = buildDriverNegotiationContext(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 3,
      seasonYear: 2026,
      prestigeScore: 0.6,
    });
    const minBuyout = computeMinBuyout(listing);
    const insult = {
      ...anchorTermsFromDriverListing(listing),
      buyoutToTeam: Math.round(minBuyout * 0.4),
    };
    const result = evaluateDriverOffer(created, insult, ctx);
    assert.equal(result.accepted, false);
    assert.ok(
      result.session.status === "countered" || result.session.status === "rejected",
    );
  });

  it("accepts counter-offer when player accepts driver terms", () => {
    const listing = prospectListing();
    const created = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.2,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const ctx = buildDriverNegotiationContext(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 2,
      seasonYear: 2026,
      prestigeScore: 0.2,
    });
    const countered = evaluateDriverOffer(
      created,
      { signingFee: 50_000, salaryPerRace: 2_000, contractSeasons: 1 },
      ctx,
    );
    assert.ok(countered.session.lastCounterOffer);
    const accepted = acceptCounterOffer(countered.session, ctx);
    assert.equal(accepted.accepted, true);
  });

  it("expires open negotiations after deadline round", () => {
    const listing = prospectListing();
    const created = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 1,
      seasonYear: 2026,
      prestigeScore: 0.2,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const expired = expireNegotiations([created], created.expiresAtRound + 1);
    assert.equal(expired[0]?.status, "expired");
  });

  it("tracks listing ids with open negotiations for rival market protection", () => {
    const listing = prospectListing();
    const created = createDriverNegotiation(listing, {
      playerTeamName: "Sky Racing",
      currentRound: 1,
      seasonYear: 2026,
      prestigeScore: 0.2,
    });
    assert.ok(!("error" in created));
    if ("error" in created) return;

    const ids = listingIdsWithOpenNegotiations([created]);
    assert.ok(ids.has(listing.id));
  });

  it("computes driver payroll from employment contracts", () => {
    const payroll = computeDriverPayroll(
      [
        {
          entityId: "d1",
          entityKind: "driver",
          teamName: "Sky Racing",
          signedRound: 1,
          expiresSeasonYear: 2028,
          signingFeePaid: 100_000,
          salaryPerRace: 12_000,
        },
        {
          entityId: "d2",
          entityKind: "driver",
          teamName: "Sky Racing",
          signedRound: 1,
          expiresSeasonYear: 2028,
          signingFeePaid: 80_000,
          salaryPerRace: 8_000,
        },
      ],
      "Sky Racing",
    );
    assert.equal(payroll, 20_000);
  });

  it("synthesizes employment contracts for legacy saves", () => {
    const contracts = synthesizeEmploymentContracts({
      teamName: "Legacy Team",
      seasonYear: 2026,
      currentRound: 4,
      driverRoster: [sampleDriver],
      staff: [],
    });
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0]?.entityKind, "driver");
    assert.ok((contracts[0]?.salaryPerRace ?? 0) > 0);
  });
});
