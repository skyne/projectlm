import type { DriverMarketListingPayload, StaffMemberPayload } from "../ws_protocol";
import {
  ensureCatalogDriverId,
  inferTier,
  type DriverProfilePayload,
} from "./driver_catalog";
import type { DriverMarketListing } from "./driver_market";
import { MAX_DRIVER_ROSTER, validateDriverMarketSigning } from "./driver_market";

export type NegotiationKind =
  | "driver_employment"
  | "driver_buyout"
  | "staff_employment"
  | "sponsor_partnership"
  | "inter_team_agreement"
  | "regulatory_petition";

export type InterTeamAgreementSubtype = "joint_testing" | "tech_share";

export type NegotiationStatus =
  | "open"
  | "countered"
  | "pending_response"
  | "accepted"
  | "rejected"
  | "expired"
  | "withdrawn";

export type NegotiationMood = "keen" | "neutral" | "annoyed" | "walkaway";

export interface NegotiationParty {
  id: string;
  role: "initiator" | "counterparty" | "observer";
  displayName: string;
}

export interface NegotiationTerms {
  signingFee?: number;
  salaryPerRace?: number;
  contractSeasons?: number;
  bonusPerWin?: number;
  bonusPerPodium?: number;
  releaseClause?: number;
  seatGuarantee?: "primary" | "reserve" | "none";
  buyoutToTeam?: number;
  /** Sponsor deal overrides */
  perRaceIncome?: number;
  podiumBonus?: number;
  winBonus?: number;
  topFiveBonus?: number;
  rdPointsPerRace?: number;
  brandingTier?: "title" | "major" | "minor";
  /** Inter-team agreements */
  agreementSubtype?: InterTeamAgreementSubtype;
  partnerTeam?: string;
  sharedTrackId?: string;
  testDays?: number;
  costContribution?: number;
  techSharePartIds?: string[];
  /** Regulatory petitions */
  ruleProposalId?: string;
  exceptionClassId?: string;
  powerCapDelta?: number;
  petitionFee?: number;
}

export interface NegotiationHistoryEntry {
  round: number;
  from: string;
  terms: NegotiationTerms;
  note?: string;
}

export interface NegotiationSession {
  id: string;
  kind: NegotiationKind;
  status: NegotiationStatus;
  parties: NegotiationParty[];
  subjectRef: string;
  anchorTerms: NegotiationTerms;
  currentOffer: NegotiationTerms;
  lastCounterOffer?: NegotiationTerms;
  patience: number;
  rounds: number;
  maxRounds: number;
  expiresAtRound: number;
  history: NegotiationHistoryEntry[];
  counterpartyMood: NegotiationMood;
  /** Set when buyout must be paid to a rival team. */
  releasingTeam?: string;
  /** Optional car assignment for staff deals. */
  staffCarId?: string;
  /** Resolved off-week for rival/regulator responses. */
  asyncResolution?: boolean;
}

export interface ActiveAgreement {
  id: string;
  kind: InterTeamAgreementSubtype | "regulatory_exception";
  partnerTeam?: string;
  signedRound: number;
  expiresAtRound: number;
  terms: NegotiationTerms;
  /** Game hook not wired yet — agreement is recorded only. */
  stubPending?: boolean;
  stubNote?: string;
}

export interface RuleChangeVote {
  id: string;
  proposalId: string;
  proposalLabel: string;
  initiatedRound: number;
  resolvesAtRound: number;
  yesVotes: number;
  noVotes: number;
  abstain: number;
  status: "open" | "passed" | "failed";
  playerVote?: "yes" | "no";
}

export interface RegulatoryException {
  id: string;
  classId: string;
  powerCapDelta: number;
  grantedRound: number;
  expiresAtRound: number;
  label: string;
}

export interface RegulatoryState {
  activeRegulationId: string;
  pendingVotes: RuleChangeVote[];
  grantedExceptions: RegulatoryException[];
}

export interface NegotiatedSponsorDeal {
  offerId: string;
  name: string;
  signedRound: number;
  expiresSeasonYear: number;
  signingFeePaid: number;
  perRaceIncome: number;
  podiumBonus: number;
  winBonus: number;
  topFiveBonus: number;
  rdPointsPerRace: number;
}

export interface EmploymentContract {
  entityId: string;
  entityKind: "driver" | "staff";
  teamName: string;
  signedRound: number;
  expiresSeasonYear: number;
  signingFeePaid: number;
  salaryPerRace: number;
  bonuses?: { win?: number; podium?: number };
  releaseClause?: number;
  seatGuarantee?: string;
  sourceListingId?: string;
}

export interface DriverNegotiationContext {
  listing: DriverMarketListing | DriverMarketListingPayload;
  playerTeamName: string;
  currentRound: number;
  seasonYear: number;
  prestigeScore: number;
  requiresBuyout: boolean;
  minBuyout: number;
  releasingTeam?: string;
}

export interface ApplyDriverDealInput {
  repoRoot: string;
  teamName: string;
  currentRound: number;
  seasonYear: number;
  budget: number;
  roster: DriverProfilePayload[];
  driverMarket: DriverMarketListingPayload[];
  rosterOverrides?: Record<string, DriverProfilePayload[]>;
  employmentContracts: EmploymentContract[];
}

export interface ApplyDriverDealResult {
  budget: number;
  roster: DriverProfilePayload[];
  driverMarket: DriverMarketListingPayload[];
  employmentContracts: EmploymentContract[];
  signedDriverId: string;
  totalCost: number;
}

const DEFAULT_CONTRACT_SEASONS = 2;
const MAX_NEGOTIATION_ROUNDS = 5;
const NEGOTIATION_ROUND_WINDOW = 2;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundMoney(n: number): number {
  return Math.round(n);
}

export function negotiationSeed(
  teamName: string,
  subjectRef: string,
  round: number,
): number {
  let hash = (round + 9127) * 2654435761;
  const key = `${teamName}:${subjectRef}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 37 + key.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

export function anchorTermsFromDriverListing(
  listing: DriverMarketListing | DriverMarketListingPayload,
): NegotiationTerms {
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

export function computeMinBuyout(
  listing: DriverMarketListing | DriverMarketListingPayload,
): number {
  const base = listing.signingFee;
  const tierMul =
    listing.driver.tier === "Platinum"
      ? 1.4
      : listing.driver.tier === "Gold"
        ? 1.2
        : 1.0;
  return roundMoney(base * 0.5 * tierMul);
}

export function computePrestigeScore(
  championshipPoints: number,
  fleetClassId?: string,
): number {
  let score = clamp(championshipPoints / 120, 0, 1);
  if (fleetClassId === "Hypercar") score += 0.15;
  else if (fleetClassId === "LMP2") score += 0.05;
  return clamp(score, 0, 1);
}

export function buildDriverNegotiationContext(
  listing: DriverMarketListing | DriverMarketListingPayload,
  options: {
    playerTeamName: string;
    currentRound: number;
    seasonYear: number;
    prestigeScore: number;
  },
): DriverNegotiationContext {
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

function negotiationKindForListing(
  listing: DriverMarketListing | DriverMarketListingPayload,
): NegotiationKind {
  return listing.source === "wec_active" && listing.contractedTeam
    ? "driver_buyout"
    : "driver_employment";
}

export function createDriverNegotiation(
  listing: DriverMarketListing | DriverMarketListingPayload,
  options: {
    playerTeamName: string;
    currentRound: number;
    seasonYear: number;
    prestigeScore: number;
    existing?: NegotiationSession[];
  },
): NegotiationSession | { error: string } {
  if (
    options.existing?.some(
      (n) =>
        n.subjectRef === listing.id &&
        (n.status === "open" || n.status === "countered"),
    )
  ) {
    return { error: "You already have an open negotiation for this listing" };
  }

  const kind = negotiationKindForListing(listing);
  const anchor = anchorTermsFromDriverListing(listing);
  const ctx = buildDriverNegotiationContext(listing, options);
  const patienceBase =
    listing.source === "wec_retired" ? 75 : listing.source === "wec_active" ? 65 : 85;

  const parties: NegotiationParty[] = [
    { id: "player", role: "initiator", displayName: options.playerTeamName },
    {
      id: ensureCatalogDriverId(listing.driver).id!,
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

  return {
    id: `neg-${kind}-${listing.id}`,
    kind,
    status: "open",
    parties,
    subjectRef: listing.id,
    anchorTerms: anchor,
    currentOffer: { ...anchor },
    patience: patienceBase + Math.round(ctx.prestigeScore * 10),
    rounds: 0,
    maxRounds: MAX_NEGOTIATION_ROUNDS,
    expiresAtRound: options.currentRound + NEGOTIATION_ROUND_WINDOW,
    history: [],
    counterpartyMood: "neutral",
    releasingTeam: ctx.releasingTeam,
  };
}

function sourcePatiencePenalty(
  listing: DriverMarketListing | DriverMarketListingPayload,
): number {
  switch (listing.source) {
    case "wec_active":
      return 22;
    case "wec_retired":
      return 18;
    default:
      return 12;
  }
}

function scoreDriverOffer(
  offer: NegotiationTerms,
  anchor: NegotiationTerms,
  ctx: DriverNegotiationContext,
): number {
  const salary = offer.salaryPerRace ?? 0;
  const signing = offer.signingFee ?? 0;
  const anchorSalary = anchor.salaryPerRace ?? 1;
  const anchorSigning = anchor.signingFee ?? 1;

  let score =
    (salary / anchorSalary) * 0.42 +
    (signing / anchorSigning) * 0.33 +
    clamp(((offer.contractSeasons ?? 1) - 1) * 0.06, 0, 0.12);

  score += ctx.prestigeScore * 0.08;
  if (offer.seatGuarantee === "primary") score += 0.04;
  if (offer.seatGuarantee === "reserve") score -= 0.08;

  if (ctx.requiresBuyout) {
    const buyout = offer.buyoutToTeam ?? 0;
    const ratio = buyout / Math.max(1, ctx.minBuyout);
    if (ratio < 0.8) return -1;
    score += clamp(ratio - 0.8, 0, 0.4) * 0.5;
  }

  const driver = ctx.listing.driver;
  if (driver.tier === "Platinum") score -= 0.05;
  if (listingSource(ctx.listing) === "prospect") score += 0.06;

  return score;
}

function listingSource(
  listing: DriverMarketListing | DriverMarketListingPayload,
): string {
  return listing.source;
}

function counterFromAnchor(
  anchor: NegotiationTerms,
  current: NegotiationTerms,
): NegotiationTerms {
  return {
    signingFee: roundMoney(
      Math.max(current.signingFee ?? 0, (anchor.signingFee ?? 0) * 1.05),
    ),
    salaryPerRace: roundMoney(
      Math.max(current.salaryPerRace ?? 0, (anchor.salaryPerRace ?? 0) * 1.04),
    ),
    contractSeasons: Math.max(
      current.contractSeasons ?? 1,
      anchor.contractSeasons ?? DEFAULT_CONTRACT_SEASONS,
    ),
    seatGuarantee: anchor.seatGuarantee ?? "primary",
    buyoutToTeam: roundMoney(
      Math.max(current.buyoutToTeam ?? 0, anchor.buyoutToTeam ?? 0),
    ),
    bonusPerPodium: anchor.bonusPerPodium,
    bonusPerWin: anchor.bonusPerWin,
    releaseClause: anchor.releaseClause,
  };
}

export interface EvaluateOfferResult {
  session: NegotiationSession;
  accepted: boolean;
  note: string;
}

export function evaluateDriverOffer(
  session: NegotiationSession,
  offer: NegotiationTerms,
  ctx: DriverNegotiationContext,
): EvaluateOfferResult {
  if (session.status !== "open" && session.status !== "countered") {
    return { session, accepted: false, note: "Negotiation is closed" };
  }

  const next: NegotiationSession = {
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
  const meetsAsking =
    (offer.signingFee ?? 0) >= (anchor.signingFee ?? 0) &&
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
      note:
        ctx.requiresBuyout && (offer.buyoutToTeam ?? 0) < ctx.minBuyout
          ? `${ctx.releasingTeam} rejects the buyout fee`
          : "Offer too low",
    });
    return {
      session: next,
      accepted: false,
      note: next.status === "rejected" ? "Negotiation collapsed" : "Counter-offer received",
    };
  }

  const patienceDrop =
    score >= 0.9 ? 8 : score >= 0.8 ? 14 : sourcePatiencePenalty(ctx.listing);
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
    from: ensureCatalogDriverId(ctx.listing.driver).id!,
    terms: { ...next.lastCounterOffer },
    note: "Needs improved terms",
  });
  return {
    session: next,
    accepted: false,
    note: "Counter-offer received",
  };
}

export function acceptCounterOffer(
  session: NegotiationSession,
  ctx: DriverNegotiationContext,
): EvaluateOfferResult {
  const terms = session.lastCounterOffer ?? session.anchorTerms;
  return evaluateDriverOffer(session, terms, ctx);
}

export function withdrawNegotiation(session: NegotiationSession): NegotiationSession {
  return { ...session, status: "withdrawn", counterpartyMood: "neutral" };
}

export function expireNegotiations(
  sessions: NegotiationSession[],
  currentRound: number,
): NegotiationSession[] {
  return sessions.map((s) => {
    if (
      (s.status === "open" ||
        s.status === "countered" ||
        s.status === "pending_response") &&
      currentRound > s.expiresAtRound
    ) {
      return { ...s, status: "expired", counterpartyMood: "walkaway" };
    }
    return s;
  });
}

export function isNegotiationKindAsync(kind: NegotiationKind): boolean {
  return kind === "inter_team_agreement" || kind === "regulatory_petition";
}

export function listingIdsWithOpenNegotiations(
  sessions: NegotiationSession[] | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const s of sessions ?? []) {
    if (s.status === "open" || s.status === "countered") {
      ids.add(s.subjectRef);
    }
  }
  return ids;
}

export function applyDriverDeal(
  session: NegotiationSession,
  listing: DriverMarketListing | DriverMarketListingPayload,
  input: ApplyDriverDealInput,
): ApplyDriverDealResult | { error: string } {
  if (session.status !== "accepted") {
    return { error: "Negotiation not accepted" };
  }

  const terms = session.lastCounterOffer ?? session.currentOffer;
  const signingFee = terms.signingFee ?? listing.signingFee;
  const salaryPerRace = terms.salaryPerRace ?? listing.salaryPerRace;
  const buyout = terms.buyoutToTeam ?? 0;
  const totalCost = signingFee + buyout;

  if (input.roster.length >= MAX_DRIVER_ROSTER) {
    return { error: `Roster full (${MAX_DRIVER_ROSTER} drivers maximum)` };
  }

  const contractErr = validateDriverMarketSigning(
    listing as DriverMarketListing,
    input.teamName,
    input.roster,
    input.repoRoot,
    input.rosterOverrides,
  );
  if (contractErr && listing.source !== "wec_active") {
    return { error: contractErr };
  }

  if (input.budget < totalCost) {
    return {
      error: `Insufficient budget (need $${totalCost.toLocaleString()})`,
    };
  }

  const signed = ensureCatalogDriverId(listing.driver);
  const driverId = signed.id!;
  const roster = [
    ...input.roster,
    { ...signed, tier: inferTier(signed) },
  ];

  const contract: EmploymentContract = {
    entityId: driverId,
    entityKind: "driver",
    teamName: input.teamName,
    signedRound: input.currentRound,
    expiresSeasonYear:
      input.seasonYear + (terms.contractSeasons ?? DEFAULT_CONTRACT_SEASONS),
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

export function synthesizeEmploymentContracts(
  state: {
    teamName: string;
    seasonYear: number;
    currentRound: number;
    driverRoster?: DriverProfilePayload[];
    staff?: StaffMemberPayload[];
    employmentContracts?: EmploymentContract[];
  },
): EmploymentContract[] {
  if (state.employmentContracts?.length) {
    return state.employmentContracts;
  }
  const contracts: EmploymentContract[] = [];
  for (const d of state.driverRoster ?? []) {
    const id = d.id?.trim();
    if (!id) continue;
    contracts.push({
      entityId: id,
      entityKind: "driver",
      teamName: state.teamName,
      signedRound: 0,
      expiresSeasonYear: state.seasonYear + DEFAULT_CONTRACT_SEASONS,
      signingFeePaid: 0,
      salaryPerRace: roundMoney(40_000 + (d.dryPace ?? 70) * 400),
    });
  }
  for (const s of state.staff ?? []) {
    if (!s.id || !s.salaryPerRace) continue;
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

export function computeDriverPayroll(
  contracts: EmploymentContract[],
  teamName: string,
): number {
  return contracts
    .filter(
      (c) =>
        c.entityKind === "driver" &&
        c.teamName.toLowerCase() === teamName.trim().toLowerCase(),
    )
    .reduce((sum, c) => sum + c.salaryPerRace, 0);
}

export function findDriverListing(
  market: DriverMarketListingPayload[] | undefined,
  listingId: string,
): DriverMarketListingPayload | null {
  return market?.find((l) => l.id === listingId) ?? null;
}
