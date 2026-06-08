import type { AiRivalSeasonPayload, AiRivalTeamPayload } from "../ws_protocol";
import {
  REGULATORY_ENTITY_ID,
  RULE_CHANGE_PROPOSALS,
  type RuleChangeProposal,
  defaultRegulatoryState,
} from "./regulations";
import {
  SPONSOR_OFFERS,
  sponsorOfferById,
  type SponsorOffer,
} from "./economy";
import type {
  ActiveAgreement,
  EvaluateOfferResult,
  InterTeamAgreementSubtype,
  NegotiatedSponsorDeal,
  NegotiationSession,
  NegotiationTerms,
  RegulatoryException,
  RegulatoryState,
  RuleChangeVote,
} from "./negotiations";
import { negotiationSeed } from "./negotiations";

const ASYNC_NEGOTIATION_ROUNDS = 3;

function roundMoney(n: number): number {
  return Math.round(n);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function hasOpenNegotiation(
  existing: NegotiationSession[] | undefined,
  subjectRef: string,
): boolean {
  return Boolean(
    existing?.some(
      (n) =>
        n.subjectRef === subjectRef &&
        (n.status === "open" ||
          n.status === "countered" ||
          n.status === "pending_response"),
    ),
  );
}

export function anchorTermsFromSponsorOffer(offer: SponsorOffer): NegotiationTerms {
  return {
    signingFee: offer.signingFee,
    perRaceIncome: offer.perRaceIncome,
    podiumBonus: offer.podiumBonus,
    winBonus: offer.winBonus,
    topFiveBonus: offer.topFiveBonus,
    rdPointsPerRace: offer.rdPointsPerRace,
    contractSeasons: 2,
    brandingTier:
      offer.signingFee >= 300_000
        ? "title"
        : offer.signingFee >= 150_000
          ? "major"
          : "minor",
  };
}

export function createSponsorNegotiation(
  offerId: string,
  options: {
    playerTeamName: string;
    currentRound: number;
    seasonYear: number;
    prestigeScore: number;
    existing?: NegotiationSession[];
  },
): NegotiationSession | { error: string } {
  const offer = sponsorOfferById(offerId);
  if (!offer) return { error: "Unknown sponsor offer" };
  if (hasOpenNegotiation(options.existing, offerId)) {
    return { error: "You already have an open negotiation with this sponsor" };
  }

  const anchor = anchorTermsFromSponsorOffer(offer);
  const patience =
    offer.signingFee >= 300_000 ? 60 : offer.signingFee >= 150_000 ? 72 : 82;

  return {
    id: `neg-sponsor-${offerId}`,
    kind: "sponsor_partnership",
    status: "open",
    parties: [
      { id: "player", role: "initiator", displayName: options.playerTeamName },
      { id: offer.id, role: "counterparty", displayName: offer.name },
    ],
    subjectRef: offerId,
    anchorTerms: anchor,
    currentOffer: { ...anchor },
    patience: patience + Math.round(options.prestigeScore * 12),
    rounds: 0,
    maxRounds: 5,
    expiresAtRound: options.currentRound + 2,
    history: [],
    counterpartyMood: "neutral",
    asyncResolution: false,
  };
}

function scoreSponsorOffer(
  offer: NegotiationTerms,
  anchor: NegotiationTerms,
  prestigeScore: number,
): number {
  const income = offer.perRaceIncome ?? 0;
  const signing = offer.signingFee ?? 0;
  const anchorIncome = anchor.perRaceIncome ?? 1;
  const anchorSigning = anchor.signingFee ?? 1;
  let score =
    (income / anchorIncome) * 0.5 + (signing / anchorSigning) * 0.35;
  score += prestigeScore * 0.1;
  if ((offer.contractSeasons ?? 1) >= (anchor.contractSeasons ?? 2)) {
    score += 0.05;
  }
  return score;
}

export function evaluateSponsorOffer(
  session: NegotiationSession,
  offer: NegotiationTerms,
  ctx: { currentRound: number; prestigeScore: number; offer: SponsorOffer },
): EvaluateOfferResult {
  if (
    session.status !== "open" &&
    session.status !== "countered"
  ) {
    return { session, accepted: false, note: "Negotiation is closed" };
  }

  const next: NegotiationSession = {
    ...session,
    currentOffer: { ...offer },
    rounds: session.rounds + 1,
    history: [
      ...session.history,
      { round: ctx.currentRound, from: "player", terms: { ...offer } },
    ],
  };

  const anchor = session.anchorTerms;
  const meetsAsking =
    (offer.perRaceIncome ?? 0) >= (anchor.perRaceIncome ?? 0) &&
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
    signingFee: roundMoney(
      Math.max(offer.signingFee ?? 0, (anchor.signingFee ?? 0) * 1.08),
    ),
    perRaceIncome: roundMoney(
      Math.max(offer.perRaceIncome ?? 0, (anchor.perRaceIncome ?? 0) * 1.06),
    ),
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

export function applySponsorDeal(
  session: NegotiationSession,
  offer: SponsorOffer,
  input: {
    budget: number;
    currentRound: number;
    seasonYear: number;
    sponsors: NegotiatedSponsorDeal[];
    maxSlots: number;
  },
): { budget: number; sponsors: NegotiatedSponsorDeal[] } | { error: string } {
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

  const deal: NegotiatedSponsorDeal = {
    offerId: offer.id,
    name: offer.name,
    signedRound: input.currentRound,
    expiresSeasonYear:
      input.seasonYear + (terms.contractSeasons ?? 2),
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

export function synthesizeSponsorDeals(
  sponsors: Array<{ offerId: string; name: string; signedRound: number }> | undefined,
  negotiated: NegotiatedSponsorDeal[] | undefined,
  seasonYear: number,
): NegotiatedSponsorDeal[] {
  if (negotiated?.length) return negotiated;
  const deals: NegotiatedSponsorDeal[] = [];
  for (const s of sponsors ?? []) {
    const offer = sponsorOfferById(s.offerId);
    if (!offer) continue;
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

export function anchorTermsForInterTeamDeal(
  subtype: InterTeamAgreementSubtype,
  partnerTeam: string,
): NegotiationTerms {
  if (subtype === "tech_share") {
    return {
      agreementSubtype: subtype,
      partnerTeam,
      techSharePartIds: ["tire.Medium"],
      costContribution: 250_000,
      contractSeasons: 1,
    };
  }
  return {
    agreementSubtype: subtype,
    partnerTeam,
    sharedTrackId: "lemans_la_sarthe",
    testDays: 2,
    costContribution: 180_000,
    contractSeasons: 1,
  };
}

export function createInterTeamNegotiation(
  subtype: InterTeamAgreementSubtype,
  partnerTeam: string,
  options: {
    playerTeamName: string;
    currentRound: number;
    existing?: NegotiationSession[];
    rivalTeams: string[];
  },
): NegotiationSession | { error: string } {
  const subjectRef = `${subtype}:${partnerTeam}`;
  if (hasOpenNegotiation(options.existing, subjectRef)) {
    return { error: "You already have open talks with this team" };
  }
  if (
    !options.rivalTeams.some(
      (t) => t.toLowerCase() === partnerTeam.trim().toLowerCase(),
    )
  ) {
    return { error: "Unknown rival team" };
  }
  if (
    partnerTeam.trim().toLowerCase() ===
    options.playerTeamName.trim().toLowerCase()
  ) {
    return { error: "Cannot negotiate with your own team" };
  }

  const anchor = anchorTermsForInterTeamDeal(subtype, partnerTeam);
  return {
    id: `neg-inter-${subtype}-${partnerTeam.replace(/\s+/g, "-").toLowerCase()}`,
    kind: "inter_team_agreement",
    status: "open",
    parties: [
      { id: "player", role: "initiator", displayName: options.playerTeamName },
      { id: `team:${partnerTeam}`, role: "counterparty", displayName: partnerTeam },
    ],
    subjectRef,
    anchorTerms: anchor,
    currentOffer: { ...anchor },
    patience: 70,
    rounds: 0,
    maxRounds: ASYNC_NEGOTIATION_ROUNDS,
    expiresAtRound: options.currentRound + 4,
    history: [],
    counterpartyMood: "neutral",
    asyncResolution: true,
  };
}

export function submitInterTeamOffer(
  session: NegotiationSession,
  offer: NegotiationTerms,
  currentRound: number,
): EvaluateOfferResult {
  if (session.status !== "open" && session.status !== "countered") {
    return { session, accepted: false, note: "Negotiation is closed" };
  }

  const next: NegotiationSession = {
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
        note: "Proposal sent — awaiting rival response",
      },
    ],
    counterpartyMood: "neutral",
  };
  return {
    session: next,
    accepted: false,
    note: "Rival will respond after the next race weekend",
  };
}

function rivalTeamByName(
  season: AiRivalSeasonPayload,
  teamName: string,
): AiRivalTeamPayload | undefined {
  const key = teamName.trim().toLowerCase();
  return season.teams.find((t) => t.teamName.trim().toLowerCase() === key);
}

function rivalAcceptanceScore(
  team: AiRivalTeamPayload,
  offer: NegotiationTerms,
  anchor: NegotiationTerms,
  playerPrestige: number,
): number {
  const contribution = offer.costContribution ?? 0;
  const anchorCost = anchor.costContribution ?? 1;
  let score = contribution / anchorCost;
  score += clamp(team.form * 0.05, -0.15, 0.15);
  score += playerPrestige * 0.12;
  if (team.budget < contribution * 1.2) score -= 0.25;
  if (offer.agreementSubtype === "tech_share") score -= 0.08;
  return score;
}

export function resolvePendingInterTeamNegotiations(
  sessions: NegotiationSession[],
  season: AiRivalSeasonPayload,
  options: {
    playerTeamName: string;
    completingRound: number;
    prestigeScore: number;
    seed: number;
  },
): {
  sessions: NegotiationSession[];
  newAgreements: ActiveAgreement[];
  headlines: string[];
} {
  const rnd = seeded(options.seed);
  const newAgreements: ActiveAgreement[] = [];
  const headlines: string[] = [];

  const updated = sessions.map((session) => {
    if (
      session.kind !== "inter_team_agreement" ||
      session.status !== "pending_response"
    ) {
      return session;
    }

    const partner = session.anchorTerms.partnerTeam ?? session.parties[1]?.displayName;
    if (!partner) return session;

    const rival = rivalTeamByName(season, partner);
    if (!rival) {
      return {
        ...session,
        status: "rejected" as const,
        counterpartyMood: "walkaway" as const,
        history: [
          ...session.history,
          {
            round: options.completingRound,
            from: partner,
            terms: session.currentOffer,
            note: "Team unavailable",
          },
        ],
      };
    }

    const offer = session.currentOffer;
    const score = rivalAcceptanceScore(
      rival,
      offer,
      session.anchorTerms,
      options.prestigeScore,
    );
    const acceptThreshold = 0.92 + rnd() * 0.12;

    if (score >= acceptThreshold) {
      const subtype = offer.agreementSubtype ?? "joint_testing";
      const agreement: ActiveAgreement = {
        id: `agr-${session.id}`,
        kind: subtype,
        partnerTeam: partner,
        signedRound: options.completingRound,
        expiresAtRound:
          options.completingRound + (offer.contractSeasons ?? 1) * 3,
        terms: { ...offer },
        stubPending: true,
        stubNote: stubNoteForAgreement(subtype),
      };
      newAgreements.push(agreement);
      headlines.push(
        `${partner} agrees to ${subtype === "joint_testing" ? "joint private testing" : "technology sharing"} with ${options.playerTeamName}`,
      );
      return {
        ...session,
        status: "accepted" as const,
        counterpartyMood: "keen" as const,
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
      };
    }

    if (score >= acceptThreshold - 0.15) {
      const counter: NegotiationTerms = {
        ...offer,
        costContribution: roundMoney(
          (offer.costContribution ?? 0) * (1.08 + rnd() * 0.06),
        ),
      };
      return {
        ...session,
        status: "countered" as const,
        counterpartyMood: "neutral" as const,
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
      };
    }

    return {
      ...session,
      status: "rejected" as const,
      counterpartyMood: "walkaway" as const,
      history: [
        ...session.history,
        {
          round: options.completingRound,
          from: partner,
          terms: offer,
          note: "Proposal declined",
        },
      ],
    };
  });

  return { sessions: updated, newAgreements, headlines };
}

function stubNoteForAgreement(subtype: InterTeamAgreementSubtype): string {
  switch (subtype) {
    case "joint_testing":
      return "Private test session unlock pending — sim/calendar hook not wired yet";
    case "tech_share":
      return "Shared parts unlock pending — R&D integration stub only";
    default:
      return "Agreement recorded — gameplay hook pending";
  }
}

export function createRegulatoryNegotiation(
  proposal: RuleChangeProposal,
  options: {
    playerTeamName: string;
    currentRound: number;
    existing?: NegotiationSession[];
  },
): NegotiationSession | { error: string } {
  const subjectRef = proposal.id;
  if (hasOpenNegotiation(options.existing, subjectRef)) {
    return { error: "This petition is already in progress" };
  }

  const anchor: NegotiationTerms = {
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
        id: REGULATORY_ENTITY_ID,
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

export function submitRegulatoryPetition(
  session: NegotiationSession,
  offer: NegotiationTerms,
  currentRound: number,
): EvaluateOfferResult {
  if (session.status !== "open" && session.status !== "countered") {
    return { session, accepted: false, note: "Negotiation is closed" };
  }

  const next: NegotiationSession = {
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
    note: "Regulator will respond after the next race weekend",
  };
}

export function resolvePendingRegulatoryNegotiations(
  sessions: NegotiationSession[],
  regulatory: RegulatoryState,
  season: AiRivalSeasonPayload,
  options: {
    playerTeamName: string;
    completingRound: number;
    seed: number;
  },
): {
  sessions: NegotiationSession[];
  regulatory: RegulatoryState;
  newAgreements: ActiveAgreement[];
  headlines: string[];
} {
  const rnd = seeded(options.seed);
  const headlines: string[] = [];
  const newAgreements: ActiveAgreement[] = [];
  let nextRegulatory = { ...regulatory, pendingVotes: [...regulatory.pendingVotes] };

  const updated = sessions.map((session) => {
    if (
      session.kind !== "regulatory_petition" ||
      session.status !== "pending_response"
    ) {
      return session;
    }

    const proposalId =
      session.currentOffer.ruleProposalId ?? session.subjectRef;
    const proposal = RULE_CHANGE_PROPOSALS.find((p) => p.id === proposalId);
    if (!proposal) {
      return { ...session, status: "rejected" as const };
    }

    if (proposal.kind === "rule_vote") {
      const vote = tallyRuleVote(proposal, season, options, rnd);
      nextRegulatory.pendingVotes.push(vote);
      headlines.push(
        `ACR opens vote: ${proposal.label} (${vote.yesVotes} yes / ${vote.noVotes} no)`,
      );
      return {
        ...session,
        status: "accepted" as const,
        counterpartyMood: "neutral" as const,
        history: [
          ...session.history,
          {
            round: options.completingRound,
            from: REGULATORY_ENTITY_ID,
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
        status: "rejected" as const,
        counterpartyMood: "annoyed" as const,
        history: [
          ...session.history,
          {
            round: options.completingRound,
            from: REGULATORY_ENTITY_ID,
            terms: session.currentOffer,
            note: "Exception denied",
          },
        ],
      };
    }

    const exception: RegulatoryException = {
      id: `exc-${proposal.id}-${options.completingRound}`,
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
    const agreement: ActiveAgreement = {
      id: exception.id,
      kind: "regulatory_exception",
      signedRound: options.completingRound,
      expiresAtRound: exception.expiresAtRound,
      terms: { ...session.currentOffer },
      stubPending: true,
      stubNote:
        "BoP exception recorded — runtime class rules hook applies delta when wired",
    };
    newAgreements.push(agreement);
    headlines.push(`ACR grants temporary exception: ${proposal.label}`);

    return {
      ...session,
      status: "accepted" as const,
      counterpartyMood: "keen" as const,
      history: [
        ...session.history,
        {
          round: options.completingRound,
          from: REGULATORY_ENTITY_ID,
          terms: session.currentOffer,
          note: "Exception granted (stub — sim BoP hook pending)",
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

function tallyRuleVote(
  proposal: RuleChangeProposal,
  season: AiRivalSeasonPayload,
  options: { completingRound: number; playerTeamName: string },
  rnd: () => number,
): RuleChangeVote {
  let yes = 1;
  let no = 0;
  let abstain = 0;
  for (const team of season.teams) {
    if (team.isPlayerTeam) continue;
    const roll = rnd();
    const factoryBoost = team.teamName.toLowerCase().includes("toyota") ? 0.1 : 0;
    const pointsBias = clamp(team.championshipPoints / 200, 0, 0.2);
    if (roll < 0.42 + factoryBoost + pointsBias) yes++;
    else if (roll < 0.78) no++;
    else abstain++;
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

export function resolveOpenVotes(
  regulatory: RegulatoryState,
  currentRound: number,
): RegulatoryState {
  const pendingVotes = regulatory.pendingVotes.map((vote) => {
    if (vote.status !== "open" || currentRound < vote.resolvesAtRound) {
      return vote;
    }
    const passed = vote.yesVotes > vote.noVotes;
    return {
      ...vote,
      status: passed ? ("passed" as const) : ("failed" as const),
    };
  });
  return { ...regulatory, pendingVotes };
}

export function resolveAsyncNegotiations(
  sessions: NegotiationSession[],
  season: AiRivalSeasonPayload,
  regulatory: RegulatoryState,
  options: {
    playerTeamName: string;
    completingRound: number;
    prestigeScore: number;
    seed: number;
  },
): {
  sessions: NegotiationSession[];
  regulatory: RegulatoryState;
  newAgreements: ActiveAgreement[];
  headlines: string[];
} {
  const inter = resolvePendingInterTeamNegotiations(sessions, season, options);
  const reg = resolvePendingRegulatoryNegotiations(
    inter.sessions,
    regulatory,
    season,
    options,
  );
  return {
    sessions: reg.sessions,
    regulatory: reg.regulatory,
    newAgreements: [...inter.newAgreements, ...reg.newAgreements],
    headlines: [...inter.headlines, ...reg.headlines],
  };
}

export function listRivalTeamNames(
  season: AiRivalSeasonPayload,
  playerTeamName: string,
): string[] {
  const playerKey = playerTeamName.trim().toLowerCase();
  return season.teams
    .filter((t) => t.teamName.trim().toLowerCase() !== playerKey)
    .map((t) => t.teamName)
    .slice(0, 12);
}

export function negotiationAsyncSeed(
  teamName: string,
  completingRound: number,
): number {
  return negotiationSeed(teamName, `async-${completingRound}`, completingRound);
}

export function ensureRegulatoryState(
  regulatory: RegulatoryState | undefined,
  currentRound: number,
): RegulatoryState {
  const base = regulatory ?? defaultRegulatoryState(currentRound);
  return resolveOpenVotes(base, currentRound);
}

/** Stub hook — apply agreement bonuses when private testing / tech share sim exists. */
export function describeActiveAgreement(agreement: ActiveAgreement): string {
  if (agreement.stubPending && agreement.stubNote) return agreement.stubNote;
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

export function sponsorOffersCatalog(): SponsorOffer[] {
  return SPONSOR_OFFERS;
}
