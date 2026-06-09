"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInterTeamSubjectRef = parseInterTeamSubjectRef;
exports.encodeInterTeamSubjectRef = encodeInterTeamSubjectRef;
exports.interTeamPartnerTeams = interTeamPartnerTeams;
exports.anchorTermsFromSponsorOffer = anchorTermsFromSponsorOffer;
exports.sponsorOpeningOfferForNegotiation = sponsorOpeningOfferForNegotiation;
exports.createSponsorNegotiation = createSponsorNegotiation;
exports.evaluateSponsorOffer = evaluateSponsorOffer;
exports.applySponsorDeal = applySponsorDeal;
exports.synthesizeSponsorDeals = synthesizeSponsorDeals;
exports.rivalOpeningOfferForInterTeam = rivalOpeningOfferForInterTeam;
exports.anchorTermsForInterTeamDeal = anchorTermsForInterTeamDeal;
exports.createInterTeamNegotiation = createInterTeamNegotiation;
exports.submitInterTeamOffer = submitInterTeamOffer;
exports.resolvePendingInterTeamNegotiations = resolvePendingInterTeamNegotiations;
exports.createRegulatoryNegotiation = createRegulatoryNegotiation;
exports.submitRegulatoryPetition = submitRegulatoryPetition;
exports.resolvePendingRegulatoryNegotiations = resolvePendingRegulatoryNegotiations;
exports.resolveOpenVotes = resolveOpenVotes;
exports.resolveAsyncNegotiations = resolveAsyncNegotiations;
exports.listRivalTeamNames = listRivalTeamNames;
exports.negotiationAsyncSeed = negotiationAsyncSeed;
exports.ensureRegulatoryState = ensureRegulatoryState;
exports.describeActiveAgreement = describeActiveAgreement;
exports.sponsorOffersCatalog = sponsorOffersCatalog;
const regulations_1 = require("./regulations");
const economy_1 = require("./economy");
const negotiations_1 = require("./negotiations");
const ASYNC_NEGOTIATION_ROUNDS = 3;
const JOINT_TEST_TRACK_IDS = [
    "lemans_la_sarthe",
    "spa",
    "monza",
    "paul_ricard",
    "imola",
    "fuji",
    "cota",
    "bahrain",
];
const TRACK_LABELS = {
    lemans_la_sarthe: "Circuit de la Sarthe",
    spa: "Spa-Francorchamps",
    monza: "Monza",
    paul_ricard: "Paul Ricard",
    imola: "Imola",
    fuji: "Fuji Speedway",
    cota: "Circuit of the Americas",
    bahrain: "Bahrain",
    sao_paulo: "Interlagos",
    losail: "Lusail",
};
function trackLabel(trackId) {
    return TRACK_LABELS[trackId] ?? trackId.replace(/_/g, " ");
}
function roundMoney(n) {
    return Math.round(n);
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}
function isNegotiationActive(session) {
    return (session.status === "open" ||
        session.status === "countered" ||
        session.status === "pending_response");
}
function hasOpenNegotiation(existing, subjectRef) {
    return Boolean(existing?.some((n) => n.subjectRef === subjectRef && isNegotiationActive(n)));
}
function parseInterTeamSubjectRef(subjectRef) {
    const sep = subjectRef.indexOf(":");
    if (sep <= 0)
        return null;
    const subtype = subjectRef.slice(0, sep);
    if (subtype !== "joint_testing" && subtype !== "tech_share")
        return null;
    const raw = subjectRef.slice(sep + 1).trim();
    if (!raw)
        return null;
    const partnerTeams = raw
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean);
    if (!partnerTeams.length)
        return null;
    if (subtype === "tech_share" && partnerTeams.length !== 1)
        return null;
    return { subtype, partnerTeams };
}
function encodeInterTeamSubjectRef(subtype, partnerTeams) {
    const teams = subtype === "joint_testing" && partnerTeams.length > 1
        ? [...partnerTeams].sort((a, b) => a.localeCompare(b))
        : partnerTeams;
    return `${subtype}:${teams.join("|")}`;
}
function interTeamPartnerTeams(session) {
    if (session.anchorTerms.partnerTeams?.length) {
        return session.anchorTerms.partnerTeams;
    }
    if (session.anchorTerms.partnerTeam) {
        return [session.anchorTerms.partnerTeam];
    }
    return session.parties
        .filter((p) => p.role === "counterparty")
        .map((p) => p.displayName);
}
function partnerTeamKey(name) {
    return name.trim().toLowerCase();
}
function hasOverlappingInterTeamNegotiation(existing, subjectRef, partnerTeams) {
    const keys = new Set(partnerTeams.map(partnerTeamKey));
    return Boolean(existing?.some((n) => {
        if (n.kind !== "inter_team_agreement" || !isNegotiationActive(n)) {
            return false;
        }
        if (n.subjectRef === subjectRef)
            return true;
        return interTeamPartnerTeams(n).some((team) => keys.has(partnerTeamKey(team)));
    }));
}
function slugifyTeamName(name) {
    return name.replace(/\s+/g, "-").toLowerCase();
}
function pickPreferredTrack(trackVotes) {
    let bestTrack = "lemans_la_sarthe";
    let bestVotes = -1;
    for (const [trackId, votes] of trackVotes) {
        if (votes > bestVotes) {
            bestTrack = trackId;
            bestVotes = votes;
        }
    }
    return bestTrack;
}
function aggregateCounterpartyMood(moods) {
    if (moods.includes("walkaway") || moods.includes("annoyed"))
        return "annoyed";
    if (moods.includes("neutral"))
        return "neutral";
    return "keen";
}
function anchorTermsFromSponsorOffer(offer) {
    return {
        signingFee: offer.signingFee,
        perRaceIncome: offer.perRaceIncome,
        podiumBonus: offer.podiumBonus,
        winBonus: offer.winBonus,
        topFiveBonus: offer.topFiveBonus,
        rdPointsPerRace: offer.rdPointsPerRace,
        contractSeasons: 2,
        brandingTier: offer.signingFee >= 300000
            ? "title"
            : offer.signingFee >= 150000
                ? "major"
                : "minor",
    };
}
function sponsorOpeningOfferForNegotiation(anchor, offer) {
    const rnd = seeded((0, negotiations_1.negotiationSeed)(offer.id, "sponsor-opening", 0));
    const incomeBump = 1.04 + rnd() * 0.08;
    const signingBump = 1.06 + rnd() * 0.12;
    const perRaceIncome = roundMoney((anchor.perRaceIncome ?? 0) * incomeBump);
    const signingFee = roundMoney((anchor.signingFee ?? 0) * signingBump);
    const podiumBonus = roundMoney((anchor.podiumBonus ?? 0) * (1.05 + rnd() * 0.1));
    const winBonus = roundMoney((anchor.winBonus ?? 0) * (1.05 + rnd() * 0.1));
    const contractSeasons = rnd() > 0.35 ? 2 : 3;
    const note = `${offer.name} asks for ${formatMoneyNote(signingFee)} signing, ${formatMoneyNote(perRaceIncome)} per race, and ${formatMoneyNote(podiumBonus)} podium bonuses over ${contractSeasons} season(s).`;
    return {
        terms: {
            ...anchor,
            perRaceIncome,
            signingFee,
            podiumBonus,
            winBonus,
            contractSeasons,
        },
        note,
        mood: signingBump > 1.12 ? "neutral" : "keen",
    };
}
function createSponsorNegotiation(offerId, options) {
    const offer = (0, economy_1.sponsorOfferById)(offerId);
    if (!offer)
        return { error: "Unknown sponsor offer" };
    if (hasOpenNegotiation(options.existing, offerId)) {
        return { error: "You already have an open negotiation with this sponsor" };
    }
    const anchor = anchorTermsFromSponsorOffer(offer);
    const opening = sponsorOpeningOfferForNegotiation(anchor, offer);
    const patience = offer.signingFee >= 300000 ? 60 : offer.signingFee >= 150000 ? 72 : 82;
    return {
        id: `neg-sponsor-${offerId}`,
        kind: "sponsor_partnership",
        status: "countered",
        parties: [
            { id: "player", role: "initiator", displayName: options.playerTeamName },
            { id: offer.id, role: "counterparty", displayName: offer.name },
        ],
        subjectRef: offerId,
        anchorTerms: anchor,
        currentOffer: { ...opening.terms },
        lastCounterOffer: { ...opening.terms },
        patience: patience + Math.round(options.prestigeScore * 12),
        rounds: 0,
        maxRounds: 5,
        expiresAtRound: options.currentRound + 2,
        history: [
            {
                round: options.currentRound,
                from: offer.name,
                terms: { ...opening.terms },
                note: opening.note,
            },
        ],
        counterpartyMood: opening.mood,
        asyncResolution: false,
    };
}
function scoreSponsorOffer(offer, anchor, prestigeScore) {
    const income = offer.perRaceIncome ?? 0;
    const signing = offer.signingFee ?? 0;
    const anchorIncome = anchor.perRaceIncome ?? 1;
    const anchorSigning = anchor.signingFee ?? 1;
    let score = (income / anchorIncome) * 0.5 + (signing / anchorSigning) * 0.35;
    score += prestigeScore * 0.1;
    if ((offer.contractSeasons ?? 1) >= (anchor.contractSeasons ?? 2)) {
        score += 0.05;
    }
    return score;
}
function evaluateSponsorOffer(session, offer, ctx) {
    if (session.status !== "open" &&
        session.status !== "countered") {
        return { session, accepted: false, note: "Negotiation is closed" };
    }
    const next = {
        ...session,
        currentOffer: { ...offer },
        rounds: session.rounds + 1,
        history: [
            ...session.history,
            { round: ctx.currentRound, from: "player", terms: { ...offer } },
        ],
    };
    const anchor = session.anchorTerms;
    const meetsAsking = (offer.perRaceIncome ?? 0) >= (anchor.perRaceIncome ?? 0) &&
        (offer.signingFee ?? 0) >= (anchor.signingFee ?? 0);
    const score = scoreSponsorOffer(offer, anchor, ctx.prestigeScore);
    if (meetsAsking || score >= 0.95) {
        next.status = "accepted";
        next.counterpartyMood = "keen";
        next.lastCounterOffer = { ...offer };
        return {
            session: next,
            accepted: true,
            note: `${ctx.offer.name} accepts the partnership`,
        };
    }
    const patienceDrop = score >= 0.85 ? 10 : 18;
    next.patience = Math.max(0, next.patience - patienceDrop);
    if (next.patience <= 0 || next.rounds >= next.maxRounds) {
        next.status = "rejected";
        next.counterpartyMood = "walkaway";
        return {
            session: next,
            accepted: false,
            note: `${ctx.offer.name} ends talks`,
        };
    }
    next.status = "countered";
    next.counterpartyMood = score >= 0.8 ? "neutral" : "annoyed";
    next.lastCounterOffer = {
        signingFee: roundMoney(Math.max(offer.signingFee ?? 0, (anchor.signingFee ?? 0) * 1.08)),
        perRaceIncome: roundMoney(Math.max(offer.perRaceIncome ?? 0, (anchor.perRaceIncome ?? 0) * 1.06)),
        podiumBonus: anchor.podiumBonus,
        winBonus: anchor.winBonus,
        topFiveBonus: anchor.topFiveBonus,
        rdPointsPerRace: anchor.rdPointsPerRace,
        contractSeasons: anchor.contractSeasons,
        brandingTier: anchor.brandingTier,
    };
    next.history.push({
        round: ctx.currentRound,
        from: ctx.offer.id,
        terms: { ...next.lastCounterOffer },
        note: "Brand wants improved visibility package",
    });
    return {
        session: next,
        accepted: false,
        note: "Counter-offer received",
    };
}
function applySponsorDeal(session, offer, input) {
    if (session.status !== "accepted") {
        return { error: "Negotiation not accepted" };
    }
    if (input.sponsors.length >= input.maxSlots) {
        return { error: `Maximum ${input.maxSlots} sponsor contracts` };
    }
    if (input.sponsors.some((s) => s.offerId === offer.id)) {
        return { error: "Already contracted with this sponsor" };
    }
    const terms = session.lastCounterOffer ?? session.currentOffer;
    const signingFee = terms.signingFee ?? offer.signingFee;
    if (input.budget < signingFee) {
        return {
            error: `Insufficient budget (need $${signingFee.toLocaleString()})`,
        };
    }
    const deal = {
        offerId: offer.id,
        name: offer.name,
        signedRound: input.currentRound,
        expiresSeasonYear: input.seasonYear + (terms.contractSeasons ?? 2),
        signingFeePaid: signingFee,
        perRaceIncome: terms.perRaceIncome ?? offer.perRaceIncome,
        podiumBonus: terms.podiumBonus ?? offer.podiumBonus,
        winBonus: terms.winBonus ?? offer.winBonus,
        topFiveBonus: terms.topFiveBonus ?? offer.topFiveBonus,
        rdPointsPerRace: terms.rdPointsPerRace ?? offer.rdPointsPerRace,
    };
    return {
        budget: input.budget - signingFee,
        sponsors: [...input.sponsors, deal],
    };
}
function synthesizeSponsorDeals(sponsors, negotiated, seasonYear) {
    if (negotiated?.length)
        return negotiated;
    const deals = [];
    for (const s of sponsors ?? []) {
        const offer = (0, economy_1.sponsorOfferById)(s.offerId);
        if (!offer)
            continue;
        deals.push({
            offerId: s.offerId,
            name: s.name,
            signedRound: s.signedRound,
            expiresSeasonYear: seasonYear + 2,
            signingFeePaid: offer.signingFee,
            perRaceIncome: offer.perRaceIncome,
            podiumBonus: offer.podiumBonus,
            winBonus: offer.winBonus,
            topFiveBonus: offer.topFiveBonus,
            rdPointsPerRace: offer.rdPointsPerRace,
        });
    }
    return deals;
}
function rivalOpeningOfferForInterTeam(anchor, subtype, partnerTeam, rival) {
    const seed = (0, negotiations_1.negotiationSeed)(partnerTeam, `${subtype}-opening`, 0);
    const rnd = seeded(seed);
    const formBump = rival ? clamp(rival.form * 0.04, -0.05, 0.1) : 0;
    const budgetTight = rival && rival.budget < (anchor.costContribution ?? 200000) * 2;
    const costMultiplier = subtype === "tech_share"
        ? 1.1 + rnd() * 0.1 + formBump
        : 1.08 + rnd() * 0.14 + formBump;
    const costContribution = roundMoney((anchor.costContribution ?? 180000) * costMultiplier);
    if (subtype === "tech_share") {
        const note = budgetTight
            ? `${partnerTeam} asks for ${formatMoneyNote(costContribution)} to share tyre and aero data — they are budget-conscious but interested.`
            : `${partnerTeam} opens at ${formatMoneyNote(costContribution)} for a one-season technology-sharing package.`;
        return {
            terms: { ...anchor, costContribution },
            note,
            mood: budgetTight ? "annoyed" : costMultiplier > 1.16 ? "neutral" : "keen",
        };
    }
    const testDays = clamp((anchor.testDays ?? 2) + (rnd() > 0.55 ? 1 : 0), 1, 5);
    const testHoursPerDay = clamp((anchor.testHoursPerDay ?? 8) + (rnd() > 0.6 ? 4 : 0), 1, 24);
    const sharedTrackId = JOINT_TEST_TRACK_IDS[Math.floor(rnd() * JOINT_TEST_TRACK_IDS.length)] ??
        anchor.sharedTrackId ??
        "lemans_la_sarthe";
    const hoursLabel = testHoursPerDay >= 24
        ? `${testDays} full day${testDays === 1 ? "" : "s"} (24 h each)`
        : `${testDays} day${testDays === 1 ? "" : "s"} × ${testHoursPerDay} h`;
    const note = `${partnerTeam} proposes ${hoursLabel} at ${trackLabel(sharedTrackId)} with ${formatMoneyNote(costContribution)} from your budget.`;
    return {
        terms: { ...anchor, costContribution, testDays, testHoursPerDay, sharedTrackId },
        note,
        mood: costMultiplier > 1.18 ? "neutral" : rival && rival.form > 0.6 ? "keen" : "neutral",
    };
}
function formatMoneyNote(n) {
    return `$${n.toLocaleString("en-US")}`;
}
function anchorTermsForInterTeamDeal(subtype, partnerTeams) {
    const partnerTeam = partnerTeams[0] ?? "";
    if (subtype === "tech_share") {
        return {
            agreementSubtype: subtype,
            partnerTeam,
            partnerTeams: partnerTeams.length > 1 ? partnerTeams : undefined,
            techSharePartIds: ["tire.Medium"],
            costContribution: 250000,
            contractSeasons: 1,
        };
    }
    return {
        agreementSubtype: subtype,
        partnerTeam,
        partnerTeams: partnerTeams.length > 1 ? partnerTeams : undefined,
        sharedTrackId: "lemans_la_sarthe",
        testDays: 2,
        testHoursPerDay: 8,
        costContribution: 180000,
        contractSeasons: 1,
    };
}
function buildInterTeamOpening(subtype, partnerTeams, anchor, options) {
    if (partnerTeams.length === 1) {
        const partnerTeam = partnerTeams[0];
        const opening = rivalOpeningOfferForInterTeam(anchor, subtype, partnerTeam, options.rivalTeamByName(partnerTeam));
        return {
            terms: { ...opening.terms, partnerTeams: undefined },
            history: [
                {
                    round: options.currentRound,
                    from: partnerTeam,
                    terms: { ...opening.terms },
                    note: opening.note,
                },
            ],
            mood: opening.mood,
        };
    }
    const history = [];
    const moods = [];
    let maxCost = 0;
    let maxDays = 1;
    let maxHoursPerDay = 1;
    const trackVotes = new Map();
    for (const partnerTeam of partnerTeams) {
        const teamAnchor = {
            ...anchor,
            partnerTeam,
            partnerTeams,
        };
        const opening = rivalOpeningOfferForInterTeam(teamAnchor, subtype, partnerTeam, options.rivalTeamByName(partnerTeam));
        history.push({
            round: options.currentRound,
            from: partnerTeam,
            terms: { ...opening.terms },
            note: opening.note,
        });
        moods.push(opening.mood);
        maxCost = Math.max(maxCost, opening.terms.costContribution ?? 0);
        maxDays = Math.max(maxDays, opening.terms.testDays ?? 1);
        maxHoursPerDay = Math.max(maxHoursPerDay, opening.terms.testHoursPerDay ?? 8);
        const trackId = opening.terms.sharedTrackId ?? "lemans_la_sarthe";
        trackVotes.set(trackId, (trackVotes.get(trackId) ?? 0) + 1);
    }
    const sharedTrackId = pickPreferredTrack(trackVotes);
    const terms = {
        ...anchor,
        partnerTeam: partnerTeams[0],
        partnerTeams,
        costContribution: maxCost,
        testDays: maxDays,
        testHoursPerDay: maxHoursPerDay,
        sharedTrackId,
    };
    return {
        terms,
        history,
        mood: aggregateCounterpartyMood(moods),
    };
}
function createInterTeamNegotiation(subtype, partnerTeamsInput, options) {
    const partnerTeams = (Array.isArray(partnerTeamsInput) ? partnerTeamsInput : [partnerTeamsInput])
        .map((t) => t.trim())
        .filter(Boolean);
    if (!partnerTeams.length) {
        return { error: "At least one partner team is required" };
    }
    if (subtype === "tech_share" && partnerTeams.length !== 1) {
        return { error: "Technology sharing is limited to one partner team" };
    }
    const subjectRef = encodeInterTeamSubjectRef(subtype, partnerTeams);
    if (hasOverlappingInterTeamNegotiation(options.existing, subjectRef, partnerTeams)) {
        return { error: "You already have open talks with one of these teams" };
    }
    const rivalKeys = new Set(options.rivalTeams.map(partnerTeamKey));
    for (const partnerTeam of partnerTeams) {
        if (!rivalKeys.has(partnerTeamKey(partnerTeam))) {
            return { error: `Unknown rival team: ${partnerTeam}` };
        }
        if (partnerTeamKey(partnerTeam) === partnerTeamKey(options.playerTeamName)) {
            return { error: "Cannot negotiate with your own team" };
        }
    }
    const rivalTeamByName = options.rivalTeamByName ??
        ((name) => options.rivalTeam?.teamName.trim().toLowerCase() === name.trim().toLowerCase()
            ? options.rivalTeam
            : undefined);
    const anchor = anchorTermsForInterTeamDeal(subtype, partnerTeams);
    const opening = buildInterTeamOpening(subtype, partnerTeams, anchor, {
        currentRound: options.currentRound,
        rivalTeamByName,
    });
    const idSuffix = partnerTeams.length > 1
        ? partnerTeams.map(slugifyTeamName).sort().join("-")
        : slugifyTeamName(partnerTeams[0]);
    return {
        id: `neg-inter-${subtype}-${idSuffix}`,
        kind: "inter_team_agreement",
        status: "countered",
        parties: [
            { id: "player", role: "initiator", displayName: options.playerTeamName },
            ...partnerTeams.map((team) => ({
                id: `team:${team}`,
                role: "counterparty",
                displayName: team,
            })),
        ],
        subjectRef,
        anchorTerms: anchor,
        currentOffer: { ...opening.terms },
        lastCounterOffer: { ...opening.terms },
        patience: 70,
        rounds: 0,
        maxRounds: ASYNC_NEGOTIATION_ROUNDS,
        expiresAtRound: options.currentRound + 4,
        history: opening.history,
        counterpartyMood: opening.mood,
        asyncResolution: true,
    };
}
function submitInterTeamOffer(session, offer, currentRound) {
    if (session.status !== "open" && session.status !== "countered") {
        return { session, accepted: false, note: "Negotiation is closed" };
    }
    const partnerTeams = interTeamPartnerTeams(session);
    const normalizedOffer = {
        ...offer,
        partnerTeams: partnerTeams.length > 1 ? partnerTeams : offer.partnerTeams,
        partnerTeam: offer.partnerTeam ?? partnerTeams[0],
    };
    const next = {
        ...session,
        currentOffer: { ...normalizedOffer },
        status: "pending_response",
        rounds: session.rounds + 1,
        history: [
            ...session.history,
            {
                round: currentRound,
                from: "player",
                terms: { ...normalizedOffer },
                note: partnerTeams.length > 1
                    ? `Proposal sent to ${partnerTeams.length} teams — awaiting responses`
                    : "Proposal sent — awaiting rival response",
            },
        ],
        counterpartyMood: "neutral",
    };
    return {
        session: next,
        accepted: false,
        note: partnerTeams.length > 1
            ? "Rivals are reviewing your proposal"
            : "Rival is reviewing your proposal",
    };
}
function rivalTeamByName(season, teamName) {
    const key = teamName.trim().toLowerCase();
    return season.teams.find((t) => t.teamName.trim().toLowerCase() === key);
}
function rivalAcceptanceScore(team, offer, anchor, playerPrestige) {
    const contribution = offer.costContribution ?? 0;
    const anchorCost = anchor.costContribution ?? 1;
    let score = contribution / anchorCost;
    score += clamp(team.form * 0.05, -0.15, 0.15);
    score += playerPrestige * 0.12;
    if (team.budget < contribution * 1.2)
        score -= 0.25;
    if (offer.agreementSubtype === "tech_share")
        score -= 0.08;
    return score;
}
function pushInterTeamAgreement(newAgreements, headlines, session, partnerTeams, offer, completingRound, playerTeamName) {
    const subtype = offer.agreementSubtype ?? "joint_testing";
    const jointTesting = subtype === "joint_testing";
    const teams = [...partnerTeams].filter(Boolean);
    if (!teams.length)
        return;
    const sortedTeams = [...teams].sort((a, b) => a.localeCompare(b));
    const primaryPartner = sortedTeams[0];
    const bundled = sortedTeams.length > 1;
    const partnerLabel = bundled ? sortedTeams.join(" + ") : primaryPartner;
    const agreement = {
        id: bundled
            ? `agr-${session.id}-bundle-${completingRound}`
            : `agr-${session.id}-${slugifyTeamName(primaryPartner)}`,
        kind: subtype,
        partnerTeam: primaryPartner,
        partnerTeams: bundled ? sortedTeams : undefined,
        signedRound: completingRound,
        expiresAtRound: completingRound + (offer.contractSeasons ?? 1) * 3,
        terms: {
            ...offer,
            partnerTeam: primaryPartner,
            partnerTeams: bundled ? sortedTeams : undefined,
        },
        stubPending: !jointTesting,
        stubNote: jointTesting
            ? bundled
                ? `Joint private testing with ${partnerLabel} — all partners must join the same session`
                : `Joint private testing with ${primaryPartner} — include them when scheduling a test`
            : stubNoteForAgreement(subtype),
    };
    newAgreements.push(agreement);
    headlines.push(`${partnerLabel} agree to ${subtype === "joint_testing" ? "joint private testing" : "technology sharing"} with ${playerTeamName}`);
}
function resolveSingleInterTeamNegotiation(session, partner, season, options, rnd) {
    const rival = rivalTeamByName(season, partner);
    if (!rival) {
        return {
            session: {
                ...session,
                status: "rejected",
                counterpartyMood: "walkaway",
                history: [
                    ...session.history,
                    {
                        round: options.completingRound,
                        from: partner,
                        terms: session.currentOffer,
                        note: "Team unavailable",
                    },
                ],
            },
            agreements: [],
            headlines: [],
        };
    }
    const offer = session.currentOffer;
    const teamAnchor = {
        ...session.anchorTerms,
        partnerTeam: partner,
    };
    const score = rivalAcceptanceScore(rival, offer, teamAnchor, options.prestigeScore);
    const acceptThreshold = 0.92 + rnd() * 0.12;
    if (score >= acceptThreshold) {
        const agreements = [];
        const headlines = [];
        pushInterTeamAgreement(agreements, headlines, session, [partner], offer, options.completingRound, options.playerTeamName);
        return {
            session: {
                ...session,
                status: "accepted",
                counterpartyMood: "keen",
                lastCounterOffer: { ...offer },
                history: [
                    ...session.history,
                    {
                        round: options.completingRound,
                        from: partner,
                        terms: { ...offer },
                        note: "Agreement accepted",
                    },
                ],
            },
            agreements,
            headlines,
        };
    }
    if (score >= acceptThreshold - 0.15) {
        const counter = {
            ...offer,
            costContribution: roundMoney((offer.costContribution ?? 0) * (1.08 + rnd() * 0.06)),
        };
        return {
            session: {
                ...session,
                status: "countered",
                counterpartyMood: "neutral",
                lastCounterOffer: counter,
                history: [
                    ...session.history,
                    {
                        round: options.completingRound,
                        from: partner,
                        terms: counter,
                        note: "Counter-proposal — higher cost share requested",
                    },
                ],
            },
            agreements: [],
            headlines: [],
        };
    }
    return {
        session: {
            ...session,
            status: "rejected",
            counterpartyMood: "walkaway",
            history: [
                ...session.history,
                {
                    round: options.completingRound,
                    from: partner,
                    terms: offer,
                    note: "Proposal declined",
                },
            ],
        },
        agreements: [],
        headlines: [],
    };
}
function resolveMultiPartyInterTeamNegotiation(session, partnerTeams, season, options, rnd) {
    const offer = session.currentOffer;
    const history = [...session.history];
    const agreements = [];
    const headlines = [];
    const accepted = [];
    const rejected = [];
    const counters = [];
    const moods = [];
    for (const partner of partnerTeams) {
        const rival = rivalTeamByName(season, partner);
        if (!rival) {
            rejected.push(partner);
            moods.push("walkaway");
            history.push({
                round: options.completingRound,
                from: partner,
                terms: offer,
                note: "Team unavailable",
            });
            continue;
        }
        const teamAnchor = {
            ...session.anchorTerms,
            partnerTeam: partner,
            partnerTeams,
        };
        const score = rivalAcceptanceScore(rival, offer, teamAnchor, options.prestigeScore);
        const acceptThreshold = 0.92 + rnd() * 0.12;
        if (score >= acceptThreshold) {
            accepted.push(partner);
            moods.push("keen");
            history.push({
                round: options.completingRound,
                from: partner,
                terms: { ...offer },
                note: "Agreement accepted",
            });
            continue;
        }
        if (score >= acceptThreshold - 0.15) {
            const counter = {
                ...offer,
                partnerTeam: partner,
                partnerTeams,
                costContribution: roundMoney((offer.costContribution ?? 0) * (1.08 + rnd() * 0.06)),
            };
            counters.push(counter);
            moods.push("neutral");
            history.push({
                round: options.completingRound,
                from: partner,
                terms: counter,
                note: "Counter-proposal — higher cost share requested",
            });
            continue;
        }
        rejected.push(partner);
        moods.push("walkaway");
        history.push({
            round: options.completingRound,
            from: partner,
            terms: offer,
            note: "Proposal declined",
        });
    }
    if (counters.length > 0) {
        const highestCounter = counters.reduce((best, counter) => (counter.costContribution ?? 0) > (best.costContribution ?? 0)
            ? counter
            : best);
        return {
            session: {
                ...session,
                status: "countered",
                counterpartyMood: aggregateCounterpartyMood(moods),
                lastCounterOffer: {
                    ...highestCounter,
                    partnerTeams,
                    partnerTeam: partnerTeams[0],
                },
                history,
            },
            agreements,
            headlines,
        };
    }
    if (accepted.length > 0) {
        pushInterTeamAgreement(agreements, headlines, session, accepted, { ...offer, partnerTeams: accepted, partnerTeam: accepted[0] }, options.completingRound, options.playerTeamName);
        const partial = accepted.length < partnerTeams.length;
        return {
            session: {
                ...session,
                status: "accepted",
                counterpartyMood: aggregateCounterpartyMood(moods),
                lastCounterOffer: { ...offer, partnerTeams: accepted, partnerTeam: accepted[0] },
                history: partial
                    ? [
                        ...history,
                        {
                            round: options.completingRound,
                            from: "player",
                            terms: offer,
                            note: `Partial deal — testing with ${accepted.join(", ")}${rejected.length ? `; declined: ${rejected.join(", ")}` : ""}`,
                        },
                    ]
                    : history,
            },
            agreements,
            headlines,
        };
    }
    return {
        session: {
            ...session,
            status: "rejected",
            counterpartyMood: "walkaway",
            history,
        },
        agreements: [],
        headlines: [],
    };
}
function resolvePendingInterTeamNegotiations(sessions, season, options) {
    const rnd = seeded(options.seed);
    const newAgreements = [];
    const headlines = [];
    const updated = sessions.map((session) => {
        if (session.kind !== "inter_team_agreement" ||
            session.status !== "pending_response") {
            return session;
        }
        const partnerTeams = interTeamPartnerTeams(session);
        if (!partnerTeams.length)
            return session;
        const resolved = partnerTeams.length > 1
            ? resolveMultiPartyInterTeamNegotiation(session, partnerTeams, season, options, rnd)
            : resolveSingleInterTeamNegotiation(session, partnerTeams[0], season, options, rnd);
        newAgreements.push(...resolved.agreements);
        headlines.push(...resolved.headlines);
        return resolved.session;
    });
    return { sessions: updated, newAgreements, headlines };
}
function stubNoteForAgreement(subtype) {
    switch (subtype) {
        case "joint_testing":
            return "+25% private test XP per joint-testing partner";
        case "tech_share":
            return "Shared parts unlock pending — R&D integration stub only";
        default:
            return "Agreement recorded — gameplay hook pending";
    }
}
function createRegulatoryNegotiation(proposal, options) {
    const subjectRef = proposal.id;
    if (hasOpenNegotiation(options.existing, subjectRef)) {
        return { error: "This petition is already in progress" };
    }
    const anchor = {
        ruleProposalId: proposal.id,
        petitionFee: proposal.petitionFee,
        exceptionClassId: proposal.targetClassId,
        powerCapDelta: proposal.powerCapDelta,
        contractSeasons: 1,
    };
    return {
        id: `neg-reg-${proposal.id}`,
        kind: "regulatory_petition",
        status: "open",
        parties: [
            { id: "player", role: "initiator", displayName: options.playerTeamName },
            {
                id: regulations_1.REGULATORY_ENTITY_ID,
                role: "counterparty",
                displayName: "Automobile Club Regulation Board",
            },
        ],
        subjectRef,
        anchorTerms: anchor,
        currentOffer: { ...anchor },
        patience: 100,
        rounds: 0,
        maxRounds: 2,
        expiresAtRound: options.currentRound + 3,
        history: [],
        counterpartyMood: "neutral",
        asyncResolution: true,
    };
}
function submitRegulatoryPetition(session, offer, currentRound) {
    if (session.status !== "open" && session.status !== "countered") {
        return { session, accepted: false, note: "Negotiation is closed" };
    }
    const next = {
        ...session,
        currentOffer: { ...offer },
        status: "pending_response",
        rounds: session.rounds + 1,
        history: [
            ...session.history,
            {
                round: currentRound,
                from: "player",
                terms: { ...offer },
                note: "Petition filed — ACR review pending",
            },
        ],
    };
    return {
        session: next,
        accepted: false,
        note: "Regulator is reviewing your petition",
    };
}
function resolvePendingRegulatoryNegotiations(sessions, regulatory, season, options) {
    const rnd = seeded(options.seed);
    const headlines = [];
    const newAgreements = [];
    let nextRegulatory = { ...regulatory, pendingVotes: [...regulatory.pendingVotes] };
    const updated = sessions.map((session) => {
        if (session.kind !== "regulatory_petition" ||
            session.status !== "pending_response") {
            return session;
        }
        const proposalId = session.currentOffer.ruleProposalId ?? session.subjectRef;
        const proposal = regulations_1.RULE_CHANGE_PROPOSALS.find((p) => p.id === proposalId);
        if (!proposal) {
            return { ...session, status: "rejected" };
        }
        if (proposal.kind === "rule_vote") {
            const vote = tallyRuleVote(proposal, season, options, rnd);
            nextRegulatory.pendingVotes.push(vote);
            headlines.push(`ACR opens vote: ${proposal.label} (${vote.yesVotes} yes / ${vote.noVotes} no)`);
            return {
                ...session,
                status: "accepted",
                counterpartyMood: "neutral",
                history: [
                    ...session.history,
                    {
                        round: options.completingRound,
                        from: regulations_1.REGULATORY_ENTITY_ID,
                        terms: session.currentOffer,
                        note: `Vote scheduled — resolves round ${vote.resolvesAtRound}`,
                    },
                ],
            };
        }
        const fee = session.currentOffer.petitionFee ?? proposal.petitionFee;
        const acceptChance = 0.35 + rnd() * 0.25;
        if (rnd() > acceptChance) {
            return {
                ...session,
                status: "rejected",
                counterpartyMood: "annoyed",
                history: [
                    ...session.history,
                    {
                        round: options.completingRound,
                        from: regulations_1.REGULATORY_ENTITY_ID,
                        terms: session.currentOffer,
                        note: "Exception denied",
                    },
                ],
            };
        }
        const exception = {
            id: `exc-${proposal.id}-${options.completingRound}`,
            proposalId: proposal.id,
            classId: proposal.targetClassId ?? "Hypercar",
            powerCapDelta: proposal.powerCapDelta ?? 0,
            grantedRound: options.completingRound,
            expiresAtRound: options.completingRound + 4,
            label: proposal.label,
        };
        nextRegulatory = {
            ...nextRegulatory,
            grantedExceptions: [...nextRegulatory.grantedExceptions, exception],
        };
        const agreement = {
            id: exception.id,
            kind: "regulatory_exception",
            signedRound: options.completingRound,
            expiresAtRound: exception.expiresAtRound,
            terms: { ...session.currentOffer },
            stubPending: Boolean(proposal.powerCapDelta),
            stubNote: proposal.powerCapDelta
                ? "BoP exception recorded — runtime class rules hook applies delta when wired"
                : undefined,
        };
        newAgreements.push(agreement);
        headlines.push(`ACR grants temporary exception: ${proposal.label}`);
        return {
            ...session,
            status: "accepted",
            counterpartyMood: "keen",
            history: [
                ...session.history,
                {
                    round: options.completingRound,
                    from: regulations_1.REGULATORY_ENTITY_ID,
                    terms: session.currentOffer,
                    note: "Exception granted (BoP hook pending for power cap changes)",
                },
            ],
        };
    });
    nextRegulatory = resolveOpenVotes(nextRegulatory, options.completingRound);
    return {
        sessions: updated,
        regulatory: nextRegulatory,
        newAgreements,
        headlines,
    };
}
function tallyRuleVote(proposal, season, options, rnd) {
    let yes = 1;
    let no = 0;
    let abstain = 0;
    for (const team of season.teams) {
        if (team.isPlayerTeam)
            continue;
        const roll = rnd();
        const factoryBoost = team.teamName.toLowerCase().includes("toyota") ? 0.1 : 0;
        const pointsBias = clamp(team.championshipPoints / 200, 0, 0.2);
        if (roll < 0.42 + factoryBoost + pointsBias)
            yes++;
        else if (roll < 0.78)
            no++;
        else
            abstain++;
    }
    return {
        id: `vote-${proposal.id}-${options.completingRound}`,
        proposalId: proposal.id,
        proposalLabel: proposal.label,
        initiatedRound: options.completingRound,
        resolvesAtRound: options.completingRound + 2,
        yesVotes: yes,
        noVotes: no,
        abstain,
        status: "open",
        playerVote: "yes",
    };
}
function resolveOpenVotes(regulatory, currentRound) {
    const pendingVotes = regulatory.pendingVotes.map((vote) => {
        if (vote.status !== "open" || currentRound < vote.resolvesAtRound) {
            return vote;
        }
        const passed = vote.yesVotes > vote.noVotes;
        return {
            ...vote,
            status: passed ? "passed" : "failed",
        };
    });
    return { ...regulatory, pendingVotes };
}
function resolveAsyncNegotiations(sessions, season, regulatory, options) {
    const inter = resolvePendingInterTeamNegotiations(sessions, season, options);
    const reg = resolvePendingRegulatoryNegotiations(inter.sessions, regulatory, season, options);
    return {
        sessions: reg.sessions,
        regulatory: reg.regulatory,
        newAgreements: [...inter.newAgreements, ...reg.newAgreements],
        headlines: [...inter.headlines, ...reg.headlines],
    };
}
function listRivalTeamNames(season, playerTeamName) {
    const playerKey = playerTeamName.trim().toLowerCase();
    return season.teams
        .filter((t) => t.teamName.trim().toLowerCase() !== playerKey)
        .map((t) => t.teamName)
        .slice(0, 12);
}
function negotiationAsyncSeed(teamName, completingRound) {
    return (0, negotiations_1.negotiationSeed)(teamName, `async-${completingRound}`, completingRound);
}
function ensureRegulatoryState(regulatory, currentRound) {
    const base = regulatory ?? (0, regulations_1.defaultRegulatoryState)(currentRound);
    return resolveOpenVotes(base, currentRound);
}
/** Stub hook — apply agreement bonuses when private testing / tech share sim exists. */
function describeActiveAgreement(agreement) {
    if (agreement.stubPending && agreement.stubNote)
        return agreement.stubNote;
    switch (agreement.kind) {
        case "joint_testing":
            return `Joint testing with ${agreement.partnerTeam} (${agreement.terms.testDays ?? 1} days)`;
        case "tech_share":
            return `Tech share with ${agreement.partnerTeam}`;
        case "regulatory_exception":
            return agreement.terms.ruleProposalId ?? "Regulatory exception";
        default:
            return "Active agreement";
    }
}
function sponsorOffersCatalog() {
    return economy_1.SPONSOR_OFFERS;
}
