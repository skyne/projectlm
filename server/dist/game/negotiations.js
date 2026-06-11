"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.driverOpeningOfferForNegotiation = driverOpeningOfferForNegotiation;
exports.negotiationSeed = negotiationSeed;
exports.anchorTermsFromDriverListing = anchorTermsFromDriverListing;
exports.computeMinBuyout = computeMinBuyout;
exports.computePrestigeScore = computePrestigeScore;
exports.buildDriverNegotiationContext = buildDriverNegotiationContext;
exports.createDriverNegotiation = createDriverNegotiation;
exports.evaluateDriverOffer = evaluateDriverOffer;
exports.acceptCounterOffer = acceptCounterOffer;
exports.withdrawNegotiation = withdrawNegotiation;
exports.expireNegotiations = expireNegotiations;
exports.isNegotiationKindAsync = isNegotiationKindAsync;
exports.listingIdsWithOpenNegotiations = listingIdsWithOpenNegotiations;
exports.applyDriverDeal = applyDriverDeal;
exports.synthesizeEmploymentContracts = synthesizeEmploymentContracts;
exports.computeDriverPayroll = computeDriverPayroll;
exports.findDriverListing = findDriverListing;
const driver_catalog_1 = require("./driver_catalog");
const driver_market_1 = require("./driver_market");
const DEFAULT_CONTRACT_SEASONS = 2;
const MAX_NEGOTIATION_ROUNDS = 5;
const NEGOTIATION_ROUND_WINDOW = 2;
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function roundMoney(n) {
    return Math.round(n);
}
function seededFromHash(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}
function formatMoneyNote(n) {
    return `$${n.toLocaleString("en-US")}`;
}
function driverOpeningOfferForNegotiation(anchor, listing, ctx) {
    const rnd = seededFromHash(negotiationSeed(listing.id, "driver-opening", 0));
    const tierMul = listing.driver.tier === "Platinum"
        ? 1.12
        : listing.driver.tier === "Gold"
            ? 1.08
            : 1.04;
    const signingFee = roundMoney((anchor.signingFee ?? 0) * (tierMul + rnd() * 0.08));
    const salaryPerRace = roundMoney((anchor.salaryPerRace ?? 0) * (tierMul + rnd() * 0.06));
    const contractSeasons = rnd() > 0.4 ? 2 : 3;
    let buyoutToTeam = anchor.buyoutToTeam;
    let note = `${listing.driver.name} asks for ${formatMoneyNote(signingFee)} signing and ${formatMoneyNote(salaryPerRace)} per race over ${contractSeasons} season(s).`;
    if (ctx.requiresBuyout) {
        buyoutToTeam = roundMoney(Math.max(ctx.minBuyout, (anchor.buyoutToTeam ?? ctx.minBuyout) * (1.05 + rnd() * 0.12)));
        note += ` ${ctx.releasingTeam} wants ${formatMoneyNote(buyoutToTeam)} release fee.`;
    }
    const mood = listing.driver.tier === "Platinum"
        ? "neutral"
        : listing.source === "prospect" || listing.source === "free_agent"
            ? "keen"
            : "neutral";
    return {
        terms: {
            ...anchor,
            signingFee,
            salaryPerRace,
            contractSeasons,
            seatGuarantee: "primary",
            buyoutToTeam,
        },
        note,
        mood,
    };
}
function negotiationSeed(teamName, subjectRef, round) {
    let hash = (round + 9127) * 2654435761;
    const key = `${teamName}:${subjectRef}`;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 37 + key.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
}
function anchorTermsFromDriverListing(listing) {
    return {
        signingFee: listing.signingFee,
        salaryPerRace: listing.salaryPerRace,
        contractSeasons: DEFAULT_CONTRACT_SEASONS,
        seatGuarantee: "primary",
        buyoutToTeam: listing.source === "wec_active"
            ? roundMoney(listing.signingFee * 0.55)
            : undefined,
    };
}
function computeMinBuyout(listing) {
    const base = listing.signingFee;
    const tierMul = listing.driver.tier === "Platinum"
        ? 1.4
        : listing.driver.tier === "Gold"
            ? 1.2
            : 1.0;
    return roundMoney(base * 0.5 * tierMul);
}
function computePrestigeScore(championshipPoints, fleetClassId) {
    let score = clamp(championshipPoints / 120, 0, 1);
    if (fleetClassId === "Hypercar")
        score += 0.15;
    else if (fleetClassId === "LMP2")
        score += 0.05;
    return clamp(score, 0, 1);
}
function buildDriverNegotiationContext(listing, options) {
    const requiresBuyout = listing.source === "wec_active" && Boolean(listing.contractedTeam);
    return {
        listing,
        playerTeamName: options.playerTeamName,
        currentRound: options.currentRound,
        seasonYear: options.seasonYear,
        prestigeScore: options.prestigeScore,
        requiresBuyout,
        minBuyout: requiresBuyout ? computeMinBuyout(listing) : 0,
        releasingTeam: listing.contractedTeam,
    };
}
function negotiationKindForListing(listing) {
    return listing.source === "wec_active" && listing.contractedTeam
        ? "driver_buyout"
        : "driver_employment";
}
function createDriverNegotiation(listing, options) {
    if (options.existing?.some((n) => n.subjectRef === listing.id &&
        (n.status === "open" || n.status === "countered"))) {
        return { error: "You already have an open negotiation for this listing" };
    }
    const kind = negotiationKindForListing(listing);
    const anchor = anchorTermsFromDriverListing(listing);
    const ctx = buildDriverNegotiationContext(listing, options);
    const patienceBase = listing.source === "wec_retired" ? 75 : listing.source === "wec_active" ? 65 : 85;
    const parties = [
        { id: "player", role: "initiator", displayName: options.playerTeamName },
        {
            id: (0, driver_catalog_1.ensureCatalogDriverId)(listing.driver).id,
            role: "counterparty",
            displayName: listing.driver.name,
        },
    ];
    if (ctx.releasingTeam) {
        parties.push({
            id: `team:${ctx.releasingTeam}`,
            role: "observer",
            displayName: ctx.releasingTeam,
        });
    }
    const opening = driverOpeningOfferForNegotiation(anchor, listing, ctx);
    return {
        id: `neg-${kind}-${listing.id}`,
        kind,
        status: "countered",
        parties,
        subjectRef: listing.id,
        anchorTerms: anchor,
        currentOffer: { ...opening.terms },
        lastCounterOffer: { ...opening.terms },
        patience: patienceBase + Math.round(ctx.prestigeScore * 10),
        rounds: 0,
        maxRounds: MAX_NEGOTIATION_ROUNDS,
        expiresAtRound: options.currentRound + NEGOTIATION_ROUND_WINDOW,
        history: [
            {
                round: options.currentRound,
                from: listing.driver.name,
                terms: { ...opening.terms },
                note: opening.note,
            },
        ],
        counterpartyMood: opening.mood,
        releasingTeam: ctx.releasingTeam,
    };
}
function sourcePatiencePenalty(listing) {
    switch (listing.source) {
        case "wec_active":
            return 22;
        case "wec_retired":
            return 18;
        case "free_agent":
            return 14;
        default:
            return 12;
    }
}
function scoreDriverOffer(offer, anchor, ctx) {
    const salary = offer.salaryPerRace ?? 0;
    const signing = offer.signingFee ?? 0;
    const anchorSalary = anchor.salaryPerRace ?? 1;
    const anchorSigning = anchor.signingFee ?? 1;
    let score = (salary / anchorSalary) * 0.42 +
        (signing / anchorSigning) * 0.33 +
        clamp(((offer.contractSeasons ?? 1) - 1) * 0.06, 0, 0.12);
    score += ctx.prestigeScore * 0.08;
    if (offer.seatGuarantee === "primary")
        score += 0.04;
    if (offer.seatGuarantee === "reserve")
        score -= 0.08;
    if (ctx.requiresBuyout) {
        const buyout = offer.buyoutToTeam ?? 0;
        const ratio = buyout / Math.max(1, ctx.minBuyout);
        if (ratio < 0.8)
            return -1;
        score += clamp(ratio - 0.8, 0, 0.4) * 0.5;
    }
    const driver = ctx.listing.driver;
    if (driver.tier === "Platinum")
        score -= 0.05;
    if (listingSource(ctx.listing) === "prospect")
        score += 0.06;
    if (listingSource(ctx.listing) === "free_agent")
        score += 0.04;
    return score;
}
function listingSource(listing) {
    return listing.source;
}
function counterFromAnchor(anchor, current) {
    return {
        signingFee: roundMoney(Math.max(current.signingFee ?? 0, (anchor.signingFee ?? 0) * 1.05)),
        salaryPerRace: roundMoney(Math.max(current.salaryPerRace ?? 0, (anchor.salaryPerRace ?? 0) * 1.04)),
        contractSeasons: Math.max(current.contractSeasons ?? 1, anchor.contractSeasons ?? DEFAULT_CONTRACT_SEASONS),
        seatGuarantee: anchor.seatGuarantee ?? "primary",
        buyoutToTeam: roundMoney(Math.max(current.buyoutToTeam ?? 0, anchor.buyoutToTeam ?? 0)),
        bonusPerPodium: anchor.bonusPerPodium,
        bonusPerWin: anchor.bonusPerWin,
        releaseClause: anchor.releaseClause,
    };
}
function evaluateDriverOffer(session, offer, ctx) {
    if (session.status !== "open" && session.status !== "countered") {
        return { session, accepted: false, note: "Negotiation is closed" };
    }
    const next = {
        ...session,
        currentOffer: { ...offer },
        rounds: session.rounds + 1,
        history: [
            ...session.history,
            {
                round: ctx.currentRound,
                from: "player",
                terms: { ...offer },
            },
        ],
    };
    const anchor = session.anchorTerms;
    const meetsAsking = (offer.signingFee ?? 0) >= (anchor.signingFee ?? 0) &&
        (offer.salaryPerRace ?? 0) >= (anchor.salaryPerRace ?? 0) &&
        (offer.contractSeasons ?? 1) >= (anchor.contractSeasons ?? 1) &&
        (!ctx.requiresBuyout || (offer.buyoutToTeam ?? 0) >= ctx.minBuyout);
    const score = scoreDriverOffer(offer, anchor, ctx);
    if (meetsAsking || score >= 0.96) {
        next.status = "accepted";
        next.counterpartyMood = "keen";
        next.lastCounterOffer = { ...offer };
        return {
            session: next,
            accepted: true,
            note: `${ctx.listing.driver.name} accepts your offer`,
        };
    }
    if (score < 0) {
        next.patience = Math.max(0, next.patience - sourcePatiencePenalty(ctx.listing));
        next.counterpartyMood = "annoyed";
        next.status = next.patience <= 0 ? "rejected" : "countered";
        next.lastCounterOffer = counterFromAnchor(session.anchorTerms, offer);
        next.history.push({
            round: ctx.currentRound,
            from: ctx.releasingTeam ?? "counterparty",
            terms: { ...next.lastCounterOffer },
            note: ctx.requiresBuyout && (offer.buyoutToTeam ?? 0) < ctx.minBuyout
                ? `${ctx.releasingTeam} rejects the buyout fee`
                : "Offer too low",
        });
        return {
            session: next,
            accepted: false,
            note: next.status === "rejected" ? "Negotiation collapsed" : "Counter-offer received",
        };
    }
    const patienceDrop = score >= 0.9 ? 8 : score >= 0.8 ? 14 : sourcePatiencePenalty(ctx.listing);
    next.patience = Math.max(0, next.patience - patienceDrop);
    next.counterpartyMood =
        next.patience <= 25 ? "annoyed" : score >= 0.88 ? "neutral" : "annoyed";
    if (next.patience <= 0 || next.rounds >= next.maxRounds) {
        next.status = "rejected";
        next.counterpartyMood = "walkaway";
        return {
            session: next,
            accepted: false,
            note: `${ctx.listing.driver.name} walks away from talks`,
        };
    }
    next.status = "countered";
    next.lastCounterOffer = counterFromAnchor(session.anchorTerms, offer);
    next.history.push({
        round: ctx.currentRound,
        from: (0, driver_catalog_1.ensureCatalogDriverId)(ctx.listing.driver).id,
        terms: { ...next.lastCounterOffer },
        note: "Needs improved terms",
    });
    return {
        session: next,
        accepted: false,
        note: "Counter-offer received",
    };
}
function acceptCounterOffer(session, ctx) {
    if (session.status !== "open" && session.status !== "countered") {
        return { session, accepted: false, note: "Negotiation is closed" };
    }
    const terms = session.lastCounterOffer ?? session.anchorTerms;
    const next = {
        ...session,
        status: "accepted",
        counterpartyMood: "keen",
        currentOffer: { ...terms },
        lastCounterOffer: { ...terms },
        history: [
            ...session.history,
            {
                round: ctx.currentRound,
                from: "player",
                terms: { ...terms },
                note: "Accepted their terms",
            },
        ],
    };
    return {
        session: next,
        accepted: true,
        note: `${ctx.listing.driver.name} deal agreed`,
    };
}
function withdrawNegotiation(session) {
    return { ...session, status: "withdrawn", counterpartyMood: "neutral" };
}
function expireNegotiations(sessions, currentRound) {
    return sessions.map((s) => {
        if ((s.status === "open" ||
            s.status === "countered" ||
            s.status === "pending_response") &&
            currentRound > s.expiresAtRound) {
            return { ...s, status: "expired", counterpartyMood: "walkaway" };
        }
        return s;
    });
}
function isNegotiationKindAsync(kind) {
    return kind === "inter_team_agreement" || kind === "regulatory_petition";
}
function listingIdsWithOpenNegotiations(sessions) {
    const ids = new Set();
    for (const s of sessions ?? []) {
        if (s.status === "open" || s.status === "countered") {
            ids.add(s.subjectRef);
        }
    }
    return ids;
}
function applyDriverDeal(session, listing, input) {
    if (session.status !== "accepted") {
        return { error: "Negotiation not accepted" };
    }
    const terms = session.lastCounterOffer ?? session.currentOffer;
    const signingFee = terms.signingFee ?? listing.signingFee;
    const salaryPerRace = terms.salaryPerRace ?? listing.salaryPerRace;
    const buyout = terms.buyoutToTeam ?? 0;
    const totalCost = signingFee + buyout;
    const rosterCap = (0, driver_market_1.maxDriverRosterForFleet)(input.fleetCarCount ?? 1);
    if (input.roster.length >= rosterCap) {
        return {
            error: `Roster full (${(0, driver_market_1.driverRosterCapMessage)(input.fleetCarCount ?? 1, rosterCap)})`,
        };
    }
    const contractErr = (0, driver_market_1.validateDriverMarketSigning)(listing, input.teamName, input.roster, input.repoRoot, input.rosterOverrides);
    if (contractErr && listing.source !== "wec_active") {
        return { error: contractErr };
    }
    if (input.budget < totalCost) {
        return {
            error: `Insufficient budget (need $${totalCost.toLocaleString()})`,
        };
    }
    const signed = (0, driver_catalog_1.ensureCatalogDriverId)(listing.driver);
    const driverId = signed.id;
    const roster = [
        ...input.roster,
        { ...signed, tier: (0, driver_catalog_1.inferTier)(signed), origin: "signed" },
    ];
    const contract = {
        entityId: driverId,
        entityKind: "driver",
        teamName: input.teamName,
        signedRound: input.currentRound,
        expiresSeasonYear: input.seasonYear + (terms.contractSeasons ?? DEFAULT_CONTRACT_SEASONS),
        signingFeePaid: signingFee,
        salaryPerRace,
        bonuses: {
            win: terms.bonusPerWin,
            podium: terms.bonusPerPodium,
        },
        releaseClause: terms.releaseClause,
        seatGuarantee: terms.seatGuarantee,
        sourceListingId: listing.id,
    };
    return {
        budget: input.budget - totalCost,
        roster,
        driverMarket: input.driverMarket.filter((l) => l.id !== listing.id),
        employmentContracts: [...input.employmentContracts, contract],
        signedDriverId: driverId,
        totalCost,
    };
}
function synthesizeEmploymentContracts(state) {
    if (state.employmentContracts?.length) {
        return state.employmentContracts;
    }
    const contracts = [];
    for (const d of state.driverRoster ?? []) {
        const id = d.id?.trim();
        if (!id)
            continue;
        contracts.push({
            entityId: id,
            entityKind: "driver",
            teamName: state.teamName,
            signedRound: 0,
            expiresSeasonYear: state.seasonYear + DEFAULT_CONTRACT_SEASONS,
            signingFeePaid: 0,
            salaryPerRace: roundMoney(40000 + (d.dryPace ?? 70) * 400),
        });
    }
    for (const s of state.staff ?? []) {
        if (!s.id || !s.salaryPerRace)
            continue;
        contracts.push({
            entityId: s.id,
            entityKind: "staff",
            teamName: state.teamName,
            signedRound: 0,
            expiresSeasonYear: state.seasonYear + DEFAULT_CONTRACT_SEASONS,
            signingFeePaid: 0,
            salaryPerRace: s.salaryPerRace,
        });
    }
    return contracts;
}
function computeDriverPayroll(contracts, teamName) {
    return contracts
        .filter((c) => c.entityKind === "driver" &&
        c.teamName.toLowerCase() === teamName.trim().toLowerCase())
        .reduce((sum, c) => sum + c.salaryPerRace, 0);
}
function findDriverListing(market, listingId) {
    return market?.find((l) => l.id === listingId) ?? null;
}
