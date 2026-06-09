import * as fs from "fs";
import * as path from "path";
import type {
  BuyCarPayload,
  CalendarEventPayload,
  CarBuildPayload,
  CreateTeamPayload,
  MetaStatePayload,
  SeasonStartSnapshotPayload,
  CarSessionBriefing,
  StartRoundPayload,
  StartPrivateTestPayload,
  TeamCreationDraftPayload,
  TeamCreationWizardStep,
  AiRivalSeasonPayload,
  DriverMarketListingPayload,
  StaffMarketListingPayload,
  StaffRole,
} from "./ws_protocol";
import { mergeBriefingDefaults } from "./game/briefing_tactics";
import { GameStateStore } from "./game_state";
import { loadCarPlatforms } from "./game/car_marketplace";
import {
  activeFleetCar,
  alignProgrammeBuilds,
  buyCarCost,
  cloneCarBuild,
  createFleetCars,
  migrateLegacyMeta,
  normalizeQuantity,
  sameFleetProgramme,
  validateBuyCar,
  validateFleetRegulations,
} from "./game/fleet";
import {
  validateCarBuild,
  writeAllFleetConfigs,
  writeFleetCarConfig,
  writePlayerCarConfig,
} from "./game/car_builder";
import { validateTrackPreset } from "./game/weekend_setup";
import {
  appliesWeekendSchedule,
  canStartWeekendSession,
  nextWeekendSession,
  type QualifyingResult,
  type WeekendSessionType,
} from "./game/weekend_sessions";
import {
  applyPrivateTestProgression,
  type ProgressionSummary,
} from "./game/progression";
import {
  buildPrivateTestProgress,
  collectPrivateTestParticipants,
  consolidateJointTestingAgreements,
  fulfillJointTestingAgreement,
  jointTestCampaignComplete,
  jointTestSessionPlan,
  nextJointTestSessionIndex,
  pendingJointTestingBundles,
  privateTestPayloadFromProgress,
} from "./game/private_test";
import {
  assignUnassignedDriversToCars,
  defaultDriverAssignments,
  ensureDriverIds,
  sanitizeAssignedDriverIds,
  validateCustomDriver,
  validateDriverStats,
  validateExclusiveDriverAssignments,
  type DriverProfilePayload,
} from "./game/driver_catalog";
import {
  buildDriverMarket,
  DRIVER_MARKET_REFRESH_COST,
  findMarketListing,
  marketSeedForRound,
} from "./game/driver_market";
import {
  applyPlayerTeamRoundResult,
  initAiRivalSeason,
  initDriverStandings,
  resolveAiDriverMarketBids,
  resolveAiSeasonTick,
  resolveDriverChampionshipTick,
  syncPlayerDriversToStandings,
  type RaceResultForSeason,
} from "./game/ai_rival_season";
import type { SessionEntryRosters } from "./game/driver_catalog";
import {
  repairCarCondition,
  snapshotToCarCondition,
} from "./game/car_condition";
import type { CarSnapshot } from "./ws_protocol";
import {
  computeRaceFinances,
  MAX_SPONSOR_SLOTS,
  sponsorOfferById,
  staffSigningCost,
  staffSeveranceCost,
  STARTING_BUDGET,
} from "./game/economy";
import {
  defaultWecCalendarPayload,
  migrateWecCalendar,
  nextCalendarRound,
} from "./game/track_catalog";
import {
  finalizeSeasonSummary,
  isSeasonCalendarComplete,
} from "./game/season_end";
import {
  assignStaffToCar,
  findVacantCarsForRole,
  isStaffSlotFilled,
  migrateStaffToPerCar,
  staffForCar,
  type StaffMember,
} from "./game/staff";
import {
  buildStaffMarket,
  findStaffMarketListing,
  STAFF_MARKET_REFRESH_COST,
  staffMarketSeedForRound,
} from "./game/staff_market";
import {
  DEFAULT_LIVERY_PATTERN,
  isValidLogoDataUrl,
  normalizeTeamLivery,
  type TeamLiveryPayload,
} from "./game/team_livery";
import {
  acceptCounterOffer,
  anchorTermsFromDriverListing,
  applyDriverDeal,
  buildDriverNegotiationContext,
  computePrestigeScore,
  createDriverNegotiation,
  evaluateDriverOffer,
  expireNegotiations,
  findDriverListing,
  listingIdsWithOpenNegotiations,
  synthesizeEmploymentContracts,
  withdrawNegotiation,
  type NegotiationSession,
  type NegotiationTerms,
} from "./game/negotiations";
import type {
  NegotiationKind,
  NegotiationTermsPayload,
  SponsorContractPayload,
} from "./ws_protocol";
import {
  anchorTermsFromSponsorOffer,
  applySponsorDeal,
  createInterTeamNegotiation,
  createRegulatoryNegotiation,
  createSponsorNegotiation,
  ensureRegulatoryState,
  evaluateSponsorOffer,
  negotiationAsyncSeed,
  parseInterTeamSubjectRef,
  resolveAsyncNegotiations,
  submitInterTeamOffer,
  submitRegulatoryPetition,
  synthesizeSponsorDeals,
} from "./game/negotiation_deals";
import {
  notifyNewAgreementStubs,
  privateTestXpMultiplier,
} from "./game/agreement_hooks";
import { ruleProposalById } from "./game/regulations";
import {
  isNegotiationKindAsync,
  type InterTeamAgreementSubtype,
} from "./game/negotiations";

interface ParsedStaff {
  role: string;
  name: string;
  skill: number;
}

interface ParsedCalendar {
  round: number;
  trackId: string;
  format: string;
  eventType?: "test" | "race";
  eventName?: string;
  completed: boolean;
  championshipPoints: number;
}

function trim(s: string): string {
  return s.trim();
}

function splitCsv(value: string): string[] {
  return value.split(",").map(trim).filter(Boolean);
}

function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

function isValidWizardStep(step: string): step is TeamCreationWizardStep {
  return (
    step === "identity" ||
    step === "livery" ||
    step === "firstCar" ||
    step === "staff" ||
    step === "drivers" ||
    step === "confirm"
  );
}

function parseConfigFile(repoRoot: string): MetaStatePayload {
  const configPath = path.join(repoRoot, "configs/team_config.txt");
  const defaults: MetaStatePayload = {
    teamName: "ProjectLM Racing",
    budget: STARTING_BUDGET,
    rdPoints: 100,
    playerEntryId: "entry-1",
    seasonYear: 2026,
    currentRound: 0,
    staff: [],
    sponsors: [],
    unlockedParts: ["tire.Medium", "brake.StandardCaliper"],
    calendar: defaultWecCalendarPayload(),
    setupComplete: false,
    teamCreationDraft: null,
    playerClassId: "Hypercar",
    teamColors: { primary: "#d4a843", secondary: "#1a2a44" },
    teamLivery: defaultTeamLiveryState(),
    carBuild: null,
    fleet: [],
    activeCarId: "",
    driverRoster: [],
    weekendTireCompound: "Medium",
    trackSetupPresets: {},
  };

  if (!fs.existsSync(configPath)) return defaults;

  const staff: ParsedStaff[] = [];
  const calendar: ParsedCalendar[] = [];
  let teamName = defaults.teamName;
  let budget = defaults.budget;
  let rdPoints = defaults.rdPoints;
  let playerEntryId = defaults.playerEntryId;
  let seasonYear = defaults.seasonYear;
  let currentRound = defaults.currentRound;
  let unlockedParts: string[] = [];

  for (const line of fs.readFileSync(configPath, "utf8").split("\n")) {
    const trimmed = trim(line);
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trim(trimmed.slice(0, eq));
    const value = trim(trimmed.slice(eq + 1));

    if (key === "team_name") teamName = value;
    else if (key === "budget") budget = Number(value);
    else if (key === "rd_points") rdPoints = Number(value);
    else if (key === "player_entry") playerEntryId = value;
    else if (key === "season_year") seasonYear = Number(value);
    else if (key === "current_round") currentRound = Number(value);
    else if (key === "unlocked_parts") unlockedParts = splitCsv(value);
    else if (key === "staff") {
      const fields = splitCsv(value);
      if (fields.length >= 3) {
        staff.push({
          role: fields[0],
          name: fields[1],
          skill: Number(fields[2]),
        });
      }
    } else if (key === "calendar") {
      const fields = splitCsv(value);
      if (fields.length >= 3) {
        const eventType =
          fields[4] === "test" ? "test" : fields[4] === "race" ? "race" : undefined;
        calendar.push({
          round: Number(fields[0]),
          trackId: fields[1],
          format: fields[2],
          completed: fields[3] === "true" || fields[3] === "1",
          eventType,
          eventName: fields[5] || undefined,
          championshipPoints: 0,
        });
      }
    }
  }

  return {
    teamName,
    budget,
    rdPoints,
    playerEntryId,
    seasonYear,
    currentRound,
    staff,
    unlockedParts,
    calendar: calendar.length > 0 ? calendar : defaultWecCalendarPayload(),
  };
}

function applyCalendarMigration(state: MetaStatePayload): void {
  const migrated = migrateWecCalendar(state.calendar);
  if (!migrated) return;
  state.calendar = migrated.calendar;
  state.currentRound = migrated.currentRound;
}

function applyStaffMigration(state: MetaStatePayload, store: GameStateStore): void {
  const fleetIds = (state.fleet ?? []).map((c) => c.id);
  const { staff, migrated } = migrateStaffToPerCar(
    (state.staff ?? []) as StaffMember[],
    fleetIds,
  );
  if (migrated) {
    state.staff = staff;
    store.save(state);
  }
}

function syncLegacyFields(state: MetaStatePayload): void {
  const active = activeFleetCar(state);
  if (active) {
    state.playerClassId = active.classId;
    state.carBuild = { ...active.build };
  }
  syncTeamLiveryFields(state);
}

function syncTeamLiveryFields(state: MetaStatePayload): void {
  if (state.teamLivery) {
    state.teamColors = {
      primary: state.teamLivery.primary,
      secondary: state.teamLivery.secondary,
    };
    return;
  }
  if (state.teamColors) {
    const migrated = normalizeTeamLivery(state.teamColors);
    if (migrated) state.teamLivery = migrated;
  }
}

function defaultTeamLiveryState(): TeamLiveryPayload {
  return {
    primary: "#d4a843",
    secondary: "#1a2a44",
    pattern: DEFAULT_LIVERY_PATTERN,
    logoDataUrl: null,
  };
}

/** Repair saves that claim setup is done but are missing core career data. */
export function normalizeSetupState(state: MetaStatePayload): MetaStatePayload {
  if (state.setupComplete !== true) {
    return { ...state, setupComplete: false, carBuildGuidePending: false };
  }

  const fleet = state.fleet ?? [];
  const staffCount = state.staff?.length ?? 0;
  const driverCount = state.driverRoster?.length ?? 0;
  if (fleet.length === 0 || staffCount < 3 || driverCount < 1) {
    return {
      ...state,
      setupComplete: false,
      carBuildGuidePending: false,
      fleet: [],
      activeCarId: "",
      playerCarId: "",
      carBuild: null,
    };
  }

  return state;
}

function clearRuntimeConfigs(repoRoot: string): void {
  const relPaths = [
    "configs/runtime/player_car.txt",
    "configs/runtime/drivers.txt",
    "configs/runtime/entries.txt",
    "configs/runtime/staff.txt",
    "configs/runtime/race.txt",
  ];
  for (const rel of relPaths) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  const fleetDir = path.join(repoRoot, "configs/runtime/fleet");
  if (fs.existsSync(fleetDir)) {
    for (const file of fs.readdirSync(fleetDir)) {
      if (file.endsWith(".txt")) fs.unlinkSync(path.join(fleetDir, file));
    }
  }
}

function platformTemplateMap(repoRoot: string): Map<string, string> {
  return new Map(
    loadCarPlatforms(repoRoot).map((p) => [p.id, p.templatePath]),
  );
}

function resetCalendarEvents(calendar: CalendarEventPayload[]): void {
  for (const event of calendar) {
    event.completed = false;
    event.championshipPoints = 0;
    event.prizeMoney = undefined;
    event.rdPointsEarned = undefined;
  }
}

export function buildSeasonStartSnapshot(
  state: MetaStatePayload,
): SeasonStartSnapshotPayload {
  return {
    seasonYear: state.seasonYear,
    budget: state.budget,
    rdPoints: state.rdPoints,
    sponsors: structuredClone(state.sponsors ?? []),
    unlockedParts: [...state.unlockedParts],
    calendar: structuredClone(state.calendar),
    currentRound: state.currentRound,
    fleet: structuredClone(state.fleet ?? []),
    driverRoster: structuredClone(state.driverRoster ?? []),
    staff: structuredClone(state.staff),
    driverMarket: structuredClone(state.driverMarket ?? []),
    driverMarketRefreshCount: state.driverMarketRefreshCount ?? 0,
    driverMarketRound: state.driverMarketRound ?? state.currentRound,
    staffMarket: structuredClone(state.staffMarket ?? []),
    staffMarketRefreshCount: state.staffMarketRefreshCount ?? 0,
    staffMarketRound: state.staffMarketRound ?? state.currentRound,
    negotiations: structuredClone(state.negotiations ?? []),
    employmentContracts: structuredClone(state.employmentContracts ?? []),
    sponsorDeals: structuredClone(state.sponsorDeals ?? []),
    activeAgreements: structuredClone(state.activeAgreements ?? []),
    regulatoryState: structuredClone(state.regulatoryState),
    aiRivalSeason: structuredClone(state.aiRivalSeason!),
    weekendTireCompound: state.weekendTireCompound ?? "Medium",
    trackSetupPresets: structuredClone(state.trackSetupPresets ?? {}),
  };
}

function applySeasonStartSnapshot(
  state: MetaStatePayload,
  snap: SeasonStartSnapshotPayload,
): void {
  state.budget = snap.budget;
  state.rdPoints = snap.rdPoints;
  state.sponsors = structuredClone(snap.sponsors);
  state.unlockedParts = [...snap.unlockedParts];
  state.calendar = structuredClone(snap.calendar);
  state.currentRound = snap.currentRound;
  state.fleet = structuredClone(snap.fleet);
  state.driverRoster = structuredClone(snap.driverRoster);
  state.staff = structuredClone(snap.staff);
  state.driverMarket = structuredClone(snap.driverMarket);
  state.driverMarketRefreshCount = snap.driverMarketRefreshCount;
  state.driverMarketRound = snap.driverMarketRound;
  state.staffMarket = structuredClone(snap.staffMarket ?? []);
  state.staffMarketRefreshCount = snap.staffMarketRefreshCount ?? 0;
  state.staffMarketRound = snap.staffMarketRound ?? snap.currentRound;
  state.negotiations = structuredClone(snap.negotiations ?? []);
  state.employmentContracts = structuredClone(snap.employmentContracts ?? []);
  state.sponsorDeals = structuredClone(snap.sponsorDeals ?? []);
  state.activeAgreements = structuredClone(snap.activeAgreements ?? []);
  state.regulatoryState = structuredClone(snap.regulatoryState);
  state.aiRivalSeason = structuredClone(snap.aiRivalSeason);
  state.weekendTireCompound = snap.weekendTireCompound ?? "Medium";
  state.trackSetupPresets = structuredClone(snap.trackSetupPresets ?? {});
}

export class MetaStateManager {
  private state: MetaStatePayload;
  private readonly store: GameStateStore;
  /** Round completed by the most recent finish; cleared on start_round or reopen. */
  private lastCompletedRound: number | null = null;
  /** Snapshots taken before off-week AI resolution — restored on reopenRound. */
  private preRoundAiRivalSeason: AiRivalSeasonPayload | null = null;
  private preRoundDriverMarket: DriverMarketListingPayload[] | null = null;
  private preRoundStaffMarket: StaffMarketListingPayload[] | null = null;

  constructor(private readonly repoRoot: string) {
    this.store = new GameStateStore(repoRoot);
    const defaults = parseConfigFile(repoRoot);
    const migrated = migrateLegacyMeta(this.store.load(defaults));
    const normalized = normalizeSetupState(migrated);
    this.state = normalized;
    if (migrated.setupComplete === true && !normalized.setupComplete) {
      this.store.save(normalized);
    }
    applyCalendarMigration(this.state);
    applyStaffMigration(this.state, this.store);
    if (this.state.fleet?.length && alignProgrammeBuilds(this.state.fleet)) {
      writeAllFleetConfigs(
        this.repoRoot,
        this.state,
        platformTemplateMap(this.repoRoot),
      );
      this.store.save(this.state);
    }
    syncLegacyFields(this.state);
    if (this.ensureSeasonFinalized()) {
      this.store.save(this.state);
    }
  }

  getState(): MetaStatePayload {
    let changed = false;
    this.ensureEmploymentContracts();
    this.ensureSponsorDeals();
    this.ensureRegulatoryState();
    const expired = expireNegotiations(
      this.state.negotiations ?? [],
      this.state.currentRound,
    );
    if (
      JSON.stringify(expired) !== JSON.stringify(this.state.negotiations ?? [])
    ) {
      this.state.negotiations = expired;
      changed = true;
    }
    if (this.hasPendingAsyncNegotiations()) {
      this.resolvePendingAsyncNegotiations(this.state.currentRound);
      changed = true;
    }
    if (this.ensureDriverMarketChanged()) changed = true;
    if (this.ensureStaffMarketChanged()) changed = true;
    const before = this.state.aiRivalSeason?.teams.length ?? 0;
    this.ensureAiRivalSeason();
    if ((this.state.aiRivalSeason?.teams.length ?? 0) !== before) changed = true;
    if (this.ensureSeasonFinalized()) changed = true;
    const consolidated = consolidateJointTestingAgreements(
      this.state.activeAgreements ?? [],
    );
    if (
      JSON.stringify(consolidated) !==
      JSON.stringify(this.state.activeAgreements ?? [])
    ) {
      this.state.activeAgreements = consolidated;
      changed = true;
    }
    if (changed) this.store.save(this.state);
    return structuredClone(this.state);
  }

  isSeasonComplete(): boolean {
    return this.state.seasonComplete === true;
  }

  seasonStartBlockedReason(): string | null {
    if (this.state.seasonComplete) {
      return "Season complete — review results and start the next season";
    }
    if (isSeasonCalendarComplete(this.state.calendar)) {
      return "Season complete — review results and start the next season";
    }
    const event = this.state.calendar.find(
      (e) => e.round === this.state.currentRound,
    );
    if (event?.completed) {
      return "This round is already complete";
    }
    return null;
  }

  finalizeSeasonIfReady(): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Complete team setup first" };
    }
    if (!isSeasonCalendarComplete(this.state.calendar)) {
      return { error: "Season still in progress" };
    }
    if (!this.state.seasonComplete) {
      this.finalizeSeason();
      return this.persist();
    }
    return this.getState();
  }

  private ensureSeasonFinalized(): boolean {
    if (
      !this.state.setupComplete ||
      this.state.seasonComplete ||
      !isSeasonCalendarComplete(this.state.calendar)
    ) {
      return false;
    }
    this.finalizeSeason();
    return true;
  }

  private finalizeSeason(): void {
    this.ensureAiRivalSeason();
    const summary = finalizeSeasonSummary(this.state);
    if (!summary) return;
    if (summary.totalPayout > 0) {
      this.state.budget += summary.totalPayout;
    }
    this.state.seasonSummary = summary;
    this.state.seasonComplete = true;
  }

  startNextSeason(): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Complete team setup first" };
    }
    this.ensureSeasonFinalized();
    if (!this.state.seasonComplete) {
      return { error: "Finish the current season before starting a new one" };
    }

    this.state.seasonYear += 1;
    this.state.calendar = defaultWecCalendarPayload();
    this.state.currentRound = 0;
    this.state.weekendProgress = undefined;
    this.state.seasonComplete = false;
    this.state.seasonSummary = undefined;
    this.lastCompletedRound = null;
    this.preRoundAiRivalSeason = null;
    this.preRoundDriverMarket = null;
    this.preRoundStaffMarket = null;

    this.state.aiRivalSeason = initAiRivalSeason(
      this.repoRoot,
      this.state.teamName,
      this.state.seasonYear,
    );
    syncPlayerDriversToStandings(
      this.state.aiRivalSeason,
      this.state.teamName,
      this.state.driverRoster ?? [],
      this.state.fleet ?? [],
    );
    this.regenerateDriverMarket();
    this.regenerateStaffMarket();
    this.captureSeasonStartSnapshot();
    return this.persist();
  }

  restartSeason(): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Complete team setup first" };
    }

    const snap = this.state.seasonStartSnapshot;
    if (snap && snap.seasonYear === this.state.seasonYear) {
      applySeasonStartSnapshot(this.state, snap);
    } else {
      resetCalendarEvents(this.state.calendar);
      this.state.currentRound = 0;
      this.state.aiRivalSeason = initAiRivalSeason(
        this.repoRoot,
        this.state.teamName,
        this.state.seasonYear,
      );
      syncPlayerDriversToStandings(
        this.state.aiRivalSeason,
        this.state.teamName,
        this.state.driverRoster ?? [],
        this.state.fleet ?? [],
      );
      this.regenerateDriverMarket();
      this.regenerateStaffMarket();
    }

    this.state.weekendProgress = undefined;
    this.state.seasonComplete = false;
    this.state.seasonSummary = undefined;
    this.lastCompletedRound = null;
    this.preRoundAiRivalSeason = null;
    this.preRoundDriverMarket = null;
    this.preRoundStaffMarket = null;

    if (snap && snap.seasonYear === this.state.seasonYear) {
      writeAllFleetConfigs(
        this.repoRoot,
        this.state,
        platformTemplateMap(this.repoRoot),
      );
      writePlayerCarConfig(this.repoRoot, this.state);
    }

    syncLegacyFields(this.state);
    return this.persist();
  }

  private captureSeasonStartSnapshot(): void {
    this.ensureAiRivalSeason();
    this.state.seasonStartSnapshot = buildSeasonStartSnapshot(this.state);
  }

  private persist(): MetaStatePayload {
    syncLegacyFields(this.state);
    this.ensureAiRivalSeason();
    this.ensureDriverMarketChanged();
    this.store.save(this.state);
    return structuredClone(this.state);
  }

  private ensureAiRivalSeason(): void {
    if (!this.state.setupComplete) return;
    if (
      !this.state.aiRivalSeason ||
      this.state.aiRivalSeason.seasonYear !== this.state.seasonYear
    ) {
      this.state.aiRivalSeason = initAiRivalSeason(
        this.repoRoot,
        this.state.teamName,
        this.state.seasonYear,
      );
    }
    if (!this.state.aiRivalSeason.drivers?.length) {
      this.state.aiRivalSeason.drivers = initDriverStandings(
        this.repoRoot,
        this.state.teamName,
        this.state.driverRoster ?? [],
        this.state.fleet ?? [],
      );
    }
    syncPlayerDriversToStandings(
      this.state.aiRivalSeason,
      this.state.teamName,
      this.state.driverRoster ?? [],
      this.state.fleet ?? [],
    );
  }

  private resolveAiOffWeek(
    raceResults: RaceResultForSeason[] | undefined,
    eventFormat: string,
    scoring: boolean,
    completingRound: number,
    sessionEntryRosters: SessionEntryRosters = {},
  ): void {
    this.ensureAiRivalSeason();
    const season = this.state.aiRivalSeason!;
    if (raceResults?.length) {
      resolveAiSeasonTick(season, {
        playerTeamName: this.state.teamName,
        raceResults,
        eventFormat,
        scoring,
      });
      resolveDriverChampionshipTick(season, {
        raceResults,
        scoring,
        playerTeamName: this.state.teamName,
        sessionEntryRosters,
      });
    }

    const refreshCount = this.state.driverMarketRefreshCount ?? 0;
    const seed = marketSeedForRound(
      this.state.teamName,
      completingRound,
      refreshCount + 1000,
    );
    const resolved = resolveAiDriverMarketBids(
      this.repoRoot,
      season,
      this.state.driverMarket ?? [],
      seed,
      listingIdsWithOpenNegotiations(this.state.negotiations),
    );
    this.state.driverMarket = resolved.market;
    if (resolved.signedIds.length > 0) {
      console.log(`[ai_rivals] ${resolved.note}`);
    }

    this.resolvePendingAsyncNegotiations(completingRound);
  }

  private hasPendingAsyncNegotiations(): boolean {
    return (this.state.negotiations ?? []).some(
      (n) =>
        n.status === "pending_response" &&
        (n.kind === "inter_team_agreement" ||
          n.kind === "regulatory_petition"),
    );
  }

  /** Until off-week day progression exists, also called right after async deal submission. */
  private resolvePendingAsyncNegotiations(completingRound: number): void {
    this.ensureAiRivalSeason();
    this.ensureRegulatoryState();
    const season = this.state.aiRivalSeason!;
    const asyncSeed = negotiationAsyncSeed(
      this.state.teamName,
      completingRound,
    );
    const asyncResult = resolveAsyncNegotiations(
      this.state.negotiations ?? [],
      season,
      this.state.regulatoryState!,
      {
        playerTeamName: this.state.teamName,
        completingRound,
        prestigeScore: this.playerPrestigeScore(),
        seed: asyncSeed,
      },
    );
    this.state.negotiations = asyncResult.sessions;
    this.state.regulatoryState = asyncResult.regulatory;
    if (asyncResult.newAgreements.length > 0) {
      const existingIds = new Set(
        (this.state.activeAgreements ?? []).map((agr) => agr.id),
      );
      const freshAgreements = asyncResult.newAgreements.filter(
        (agr) => !existingIds.has(agr.id),
      );
      if (freshAgreements.length > 0) {
        this.state.activeAgreements = [
          ...(this.state.activeAgreements ?? []),
          ...freshAgreements,
        ];
        for (const note of notifyNewAgreementStubs(freshAgreements)) {
          console.log(note);
        }
      }
    }
    for (const headline of asyncResult.headlines) {
      console.log(`[negotiations] ${headline}`);
    }
  }

  private regenerateDriverMarket(): void {
    const refreshCount = this.state.driverMarketRefreshCount ?? 0;
    const seed = marketSeedForRound(
      this.state.teamName,
      this.state.currentRound,
      refreshCount,
    );
    this.state.driverMarket = buildDriverMarket(this.repoRoot, {
      seed,
      playerTeamName: this.state.teamName,
      existingRoster: this.state.driverRoster ?? [],
      rosterOverrides: this.state.aiRivalSeason?.rosterOverrides,
    });
    this.state.driverMarketRound = this.state.currentRound;
  }

  private ensureDriverMarketChanged(): boolean {
    if (!this.state.setupComplete) return false;
    if (
      !this.state.driverMarket?.length ||
      this.state.driverMarketRound !== this.state.currentRound
    ) {
      this.regenerateDriverMarket();
      return true;
    }
    return false;
  }

  private regenerateStaffMarket(): void {
    const refreshCount = this.state.staffMarketRefreshCount ?? 0;
    const seed = staffMarketSeedForRound(
      this.state.teamName,
      this.state.currentRound,
      refreshCount,
    );
    this.state.staffMarket = buildStaffMarket({
      seed,
      existingStaff: this.state.staff ?? [],
    });
    this.state.staffMarketRound = this.state.currentRound;
  }

  private ensureStaffMarketChanged(): boolean {
    if (!this.state.setupComplete) return false;
    if (
      !this.state.staffMarket?.length ||
      this.state.staffMarketRound !== this.state.currentRound
    ) {
      this.regenerateStaffMarket();
      return true;
    }
    return false;
  }

  validateFleetForRace(): string | null {
    return validateFleetRegulations(this.state.fleet ?? []);
  }

  hireStaff(role: string, name: string, skill: number): MetaStatePayload {
    const clamped = Math.min(100, Math.max(1, skill));
    const cost = staffSigningCost(clamped);
    if (this.state.budget < cost) return this.getState();
    const fleetIds = (this.state.fleet ?? []).map((c) => c.id);
    const staffRole = role as StaffRole;
    const vacant = findVacantCarsForRole(
      fleetIds,
      (this.state.staff ?? []) as StaffMember[],
      staffRole,
    );
    const carId = vacant[0];
    if (!carId) return this.getState();

    this.state.staff = assignStaffToCar(
      (this.state.staff ?? []) as StaffMember[],
      carId,
      {
        role: staffRole,
        name,
        skill: clamped,
        salaryPerRace: Math.round(staffSigningCost(clamped) * 0.06),
        morale: 75,
      },
    );
    this.state.budget -= cost;
    return this.persist();
  }

  refreshStaffMarket(): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Found your team before browsing the staff market" };
    }
    if (this.state.budget < STAFF_MARKET_REFRESH_COST) {
      return {
        error: `Insufficient budget (need $${STAFF_MARKET_REFRESH_COST.toLocaleString()})`,
      };
    }
    this.state.budget -= STAFF_MARKET_REFRESH_COST;
    this.state.staffMarketRefreshCount =
      (this.state.staffMarketRefreshCount ?? 0) + 1;
    this.regenerateStaffMarket();
    return this.persist();
  }

  signStaffContract(
    listingId: string,
    carId?: string,
  ): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Found your team before hiring crew" };
    }
    this.ensureStaffMarketChanged();
    const listing = findStaffMarketListing(this.state.staffMarket, listingId);
    if (!listing) {
      return { error: "That crew member is no longer on the market" };
    }

    const fleetIds = (this.state.fleet ?? []).map((c) => c.id);
    if (!fleetIds.length) {
      return { error: "Add a car to your fleet before hiring crew" };
    }

    const staff = (this.state.staff ?? []) as StaffMember[];
    const vacant = findVacantCarsForRole(fleetIds, staff, listing.role);

    let targetCarId = carId?.trim();
    if (targetCarId) {
      if (!fleetIds.includes(targetCarId)) {
        return { error: "Unknown car" };
      }
    } else if (vacant.length) {
      targetCarId = vacant[0];
    } else {
      return {
        error: `Choose a car to replace the current ${listing.role}`,
      };
    }

    const existing = staff.find(
      (s) => s.role === listing.role && s.assignedCarId === targetCarId,
    );
    const replacing = isStaffSlotFilled(existing);
    const severance =
      replacing && existing ? staffSeveranceCost(existing) : 0;
    const totalCost = listing.signingFee + severance;

    if (this.state.budget < totalCost) {
      return {
        error: replacing
          ? `Insufficient budget (need $${totalCost.toLocaleString()} incl. $${severance.toLocaleString()} severance)`
          : `Insufficient budget (need $${listing.signingFee.toLocaleString()} signing fee)`,
      };
    }

    this.state.budget -= totalCost;
    this.state.staff = assignStaffToCar(
      (this.state.staff ?? []) as StaffMember[],
      targetCarId,
      {
        role: listing.role,
        name: listing.name,
        skill: listing.skill,
        experience: listing.experience,
        salaryPerRace: listing.salaryPerRace,
        morale: listing.morale,
        traits: listing.traits,
      },
    );
    this.state.staffMarket = (this.state.staffMarket ?? []).filter(
      (l) => l.id !== listingId,
    );
    return this.persist();
  }

  getStaffForCar(carId: string): StaffMember[] {
    return staffForCar((this.state.staff ?? []) as StaffMember[], carId);
  }

  investRd(partId: string, points: number): MetaStatePayload {
    const cost = points * 10000;
    if (this.state.rdPoints < points || this.state.budget < cost) {
      return this.getState();
    }
    this.state.rdPoints -= points;
    this.state.budget -= cost;
    if (!this.state.unlockedParts.includes(partId)) {
      this.state.unlockedParts.push(partId);
    }
    return this.persist();
  }

  clearLastCompletedRound(): void {
    this.lastCompletedRound = null;
  }

  clearWeekendProgress(): void {
    this.state.weekendProgress = undefined;
    this.persist();
  }

  resolveWeekendSession(
    prep: StartRoundPayload,
    event: { eventType?: "test" | "race"; format: string },
  ): WeekendSessionType {
    if (!appliesWeekendSchedule(event.eventType, event.format)) {
      return "race";
    }
    const requested = prep.sessionType;
    if (requested) return requested;
    const progress = this.state.weekendProgress;
    if (progress?.round === this.state.currentRound) {
      return nextWeekendSession(progress.completedSessions) ?? "race";
    }
    return "practice";
  }

  validateWeekendSessionStart(sessionType: WeekendSessionType): string | null {
    const event = this.state.calendar.find(
      (e) => e.round === this.state.currentRound,
    );
    if (!event) return "No calendar event for the current round";
    if (!appliesWeekendSchedule(event.eventType, event.format)) {
      return null;
    }
    const completed =
      this.state.weekendProgress?.round === this.state.currentRound
        ? this.state.weekendProgress.completedSessions
        : [];
    return canStartWeekendSession(sessionType, completed);
  }


  persistSessionCarConditions(
    snapshots: CarSnapshot[],
    entryToFleetCarId: Map<string, string>,
    sessionType: WeekendSessionType,
  ): MetaStatePayload {
    const fleet = [...(this.state.fleet ?? [])];
    let changed = false;
    for (const snap of snapshots) {
      const carId = entryToFleetCarId.get(snap.entryId);
      if (!carId) continue;
      const idx = fleet.findIndex((c) => c.id === carId);
      if (idx < 0) continue;
      const condition = snapshotToCarCondition(snap);
      condition.updatedAtRound = this.state.currentRound;
      condition.updatedAfterSession = sessionType;
      fleet[idx] = { ...fleet[idx], carCondition: condition };
      changed = true;
    }
    if (!changed) return this.getState();
    this.state.fleet = fleet;
    return this.persist();
  }

  repairCarCondition(
    carId: string,
    options?: { parts?: string[]; rebuild?: boolean; reveal?: boolean },
  ): MetaStatePayload | { error: string } {
    const fleet = this.state.fleet ?? [];
    const idx = fleet.findIndex((c) => c.id === carId);
    if (idx < 0) return { error: "Car not found in fleet" };
    const car = fleet[idx];
    const next = repairCarCondition(car.carCondition, options);
    fleet[idx] = { ...car, carCondition: next };
    this.state.fleet = fleet;
    return this.persist();
  }

  applyPrivateTestPrep(prep: StartPrivateTestPayload): string | null {
    const trackId = String(prep.trackId ?? "").trim();
    if (!trackId) return "Select a track";

    for (const entry of prep.carSetups ?? []) {
      const carId = String(entry.carId ?? "").trim();
      const preset = entry.preset;
      if (!carId || !preset) return "Each car setup requires carId and preset";
      const car = this.state.fleet?.find((c) => c.id === carId);
      if (!car) return `Unknown car: ${carId}`;
      const err = validateTrackPreset({ ...preset, trackId });
      if (err) return `${car.carNumber}: ${err}`;
      if (!car.trackSetupPresets) car.trackSetupPresets = {};
      car.trackSetupPresets[trackId] = { ...preset, trackId };
    }

    writePlayerCarConfig(this.repoRoot, this.state);
    this.persist();
    return null;
  }

  preparePrivateTestStart(
    payload: StartPrivateTestPayload,
  ): { payload: StartPrivateTestPayload } | { error: string } {
    if (!payload.jointAgreementId) {
      this.state.privateTestProgress = undefined;
      return { payload };
    }

    const agreement = pendingJointTestingBundles(this.state).find(
      (agr) => agr.id === payload.jointAgreementId,
    );
    if (!agreement) {
      return { error: "Joint-testing agreement is no longer pending" };
    }

    const plan = jointTestSessionPlan(agreement);
    const sessionIndex = nextJointTestSessionIndex(
      plan,
      this.state.privateTestProgress,
    );
    if (sessionIndex == null) {
      return { error: "Joint-testing campaign already complete" };
    }

    const slot = plan.sessions[sessionIndex];
    if (!slot) {
      return { error: "Joint-testing session plan is invalid" };
    }

    const effectivePayload: StartPrivateTestPayload = {
      ...payload,
      durationHours: slot.durationHours,
      jointPartnerTeams: payload.jointPartnerTeams ?? agreement.partnerTeams,
    };

    if (!this.state.privateTestProgress) {
      this.state.privateTestProgress = buildPrivateTestProgress(
        effectivePayload,
        plan,
      );
    }

    return { payload: effectivePayload };
  }

  continuePrivateTestCampaign():
    | { payload: StartPrivateTestPayload }
    | { error: string }
    | null {
    const progress = this.state.privateTestProgress;
    if (!progress) return null;

    const agreement = pendingJointTestingBundles(this.state).find(
      (agr) => agr.id === progress.jointAgreementId,
    );
    if (!agreement) {
      this.state.privateTestProgress = undefined;
      return { error: "Joint-testing agreement is no longer pending" };
    }

    const plan = jointTestSessionPlan(agreement);
    const payload = privateTestPayloadFromProgress(progress, plan);
    if (!payload) {
      return { error: "Joint-testing campaign already complete" };
    }
    return { payload };
  }

  applyPrivateTestCompletion(
    payload: StartPrivateTestPayload,
    snapshots: CarSnapshot[],
    entryToFleetCarId: Map<string, string>,
  ): { meta: MetaStatePayload; summary: ProgressionSummary } {
    this.persistSessionCarConditions(snapshots, entryToFleetCarId, "practice");

    const { driverIds, staffIds } = collectPrivateTestParticipants(
      this.state,
      payload.carIds,
      payload.driverAssignments,
    );

    const progression = applyPrivateTestProgression(
      this.state.driverRoster ?? [],
      (this.state.staff ?? []) as import("./game/staff").StaffMember[],
      driverIds,
      staffIds,
      payload.durationHours,
      {
        xpMultiplier: privateTestXpMultiplier(
          this.state,
          this.state.currentRound,
          payload.jointPartnerTeams,
        ),
      },
    );

    this.state.driverRoster = progression.drivers;
    this.state.staff = progression.staff;

    if (payload.jointAgreementId) {
      const agreement = pendingJointTestingBundles(this.state).find(
        (agr) => agr.id === payload.jointAgreementId,
      );
      const plan = agreement ? jointTestSessionPlan(agreement) : null;
      let progress = this.state.privateTestProgress;

      if (!progress || progress.jointAgreementId !== payload.jointAgreementId) {
        progress = plan
          ? buildPrivateTestProgress(payload, plan)
          : undefined;
      }

      if (progress && plan) {
        const sessionIndex = nextJointTestSessionIndex(plan, progress);
        if (sessionIndex != null && !progress.completedSessionIndices.includes(sessionIndex)) {
          progress = {
            ...progress,
            completedSessionIndices: [
              ...progress.completedSessionIndices,
              sessionIndex,
            ],
          };
        }

        if (jointTestCampaignComplete(plan, progress)) {
          this.state.activeAgreements = fulfillJointTestingAgreement(
            this.state.activeAgreements ?? [],
            payload.jointAgreementId,
            this.state.currentRound,
          );
          this.state.privateTestProgress = undefined;
        } else {
          this.state.privateTestProgress = progress;
        }
      } else {
        this.state.activeAgreements = fulfillJointTestingAgreement(
          this.state.activeAgreements ?? [],
          payload.jointAgreementId,
          this.state.currentRound,
        );
      }
    }

    return { meta: this.persist(), summary: progression.summary };
  }

  completeWeekendSession(
    sessionType: WeekendSessionType,
    qualiResults?: QualifyingResult[],
  ): MetaStatePayload {
    const round = this.state.currentRound;
    const progress =
      this.state.weekendProgress?.round === round
        ? this.state.weekendProgress
        : { round, completedSessions: [], qualiResults: [] };

    if (!progress.completedSessions.includes(sessionType)) {
      progress.completedSessions = [...progress.completedSessions, sessionType];
    }
    if (sessionType === "qualifying" && qualiResults?.length) {
      progress.qualiResults = qualiResults;
    }
    this.state.weekendProgress = progress;
    return this.persist();
  }

  getNextWeekendSessionAfter(
    sessionType: WeekendSessionType,
  ): WeekendSessionType | null {
    const event = this.state.calendar.find(
      (e) => e.round === this.state.currentRound,
    );
    if (!event || !appliesWeekendSchedule(event.eventType, event.format)) {
      return null;
    }
    const completed =
      this.state.weekendProgress?.round === this.state.currentRound
        ? [...this.state.weekendProgress.completedSessions]
        : [];
    if (!completed.includes(sessionType)) {
      completed.push(sessionType);
    }
    return nextWeekendSession(completed);
  }

  reopenRound(round: number): MetaStatePayload {
    if (this.lastCompletedRound !== round) return this.getState();

    const event = this.state.calendar.find((e) => e.round === round);
    if (!event?.completed) return this.getState();

    if (event.prizeMoney) this.state.budget -= event.prizeMoney;
    if (event.rdPointsEarned) this.state.rdPoints -= event.rdPointsEarned;

    event.completed = false;
    event.championshipPoints = 0;
    event.prizeMoney = undefined;
    event.rdPointsEarned = undefined;
    this.state.currentRound = round;
    this.state.weekendProgress = undefined;
    this.lastCompletedRound = null;

    if (this.preRoundAiRivalSeason) {
      this.state.aiRivalSeason = structuredClone(this.preRoundAiRivalSeason);
      this.preRoundAiRivalSeason = null;
    }
    if (this.preRoundDriverMarket) {
      this.state.driverMarket = structuredClone(this.preRoundDriverMarket);
      this.preRoundDriverMarket = null;
    } else {
      this.regenerateDriverMarket();
    }
    if (this.preRoundStaffMarket) {
      this.state.staffMarket = structuredClone(this.preRoundStaffMarket);
      this.preRoundStaffMarket = null;
    } else {
      this.regenerateStaffMarket();
    }

    return this.persist();
  }

  completeRound(
    position: number,
    classId: string,
    raceResults?: RaceResultForSeason[],
    sessionEntryRosters: SessionEntryRosters = {},
  ): MetaStatePayload {
    const completingRound = this.state.currentRound;
    const event = this.state.calendar.find(
      (e) => e.round === completingRound,
    );
    if (!event || event.completed) return this.getState();

    const scoring = event.eventType !== "test" && event.format !== "test";
    this.ensureEmploymentContracts();
    this.ensureSponsorDeals();
    const finances = computeRaceFinances(
      position,
      classId,
      event.format,
      this.sponsorsForFinances(),
      this.state.staff,
      {
        scoring,
        employmentContracts: this.state.employmentContracts,
        teamName: this.state.teamName,
      },
    );

    event.completed = true;
    event.championshipPoints = finances.championshipPoints;
    event.prizeMoney = finances.netEarnings;
    event.rdPointsEarned = finances.rdPointsEarned;
    this.state.budget += finances.netEarnings;
    this.state.rdPoints += finances.rdPointsEarned;
    this.state.weekendProgress = undefined;

    const nextRound = nextCalendarRound(
      this.state.calendar,
      completingRound,
    );
    if (nextRound !== null) {
      this.state.currentRound = nextRound;
    }
    this.state.negotiations = expireNegotiations(
      this.state.negotiations ?? [],
      this.state.currentRound,
    );
    this.lastCompletedRound = completingRound;
    this.ensureAiRivalSeason();
    if (scoring) {
      applyPlayerTeamRoundResult(
        this.state.aiRivalSeason!,
        this.state.teamName,
        classId,
        finances.championshipPoints,
      );
    }
    this.regenerateDriverMarket();
    this.regenerateStaffMarket();
    this.preRoundAiRivalSeason = structuredClone(this.state.aiRivalSeason!);
    this.preRoundDriverMarket = structuredClone(this.state.driverMarket ?? []);
    this.preRoundStaffMarket = structuredClone(this.state.staffMarket ?? []);
    this.resolveAiOffWeek(
      raceResults,
      event.format,
      scoring,
      completingRound,
      sessionEntryRosters,
    );
    if (isSeasonCalendarComplete(this.state.calendar)) {
      this.finalizeSeason();
    }
    return this.persist();
  }

  signSponsor(offerId: string): MetaStatePayload | { error: string } {
    const started = this.startNegotiation("sponsor_partnership", offerId);
    if ("error" in started) return started;

    const session = this.state.negotiations?.find(
      (n) =>
        n.subjectRef === offerId &&
        n.kind === "sponsor_partnership" &&
        (n.status === "open" || n.status === "countered"),
    );
    if (!session) return { error: "Failed to open sponsor negotiation" };

    const offer = sponsorOfferById(offerId);
    if (!offer) return { error: "Unknown sponsor offer" };

    const evaluated = evaluateSponsorOffer(
      session,
      anchorTermsFromSponsorOffer(offer),
      {
        currentRound: this.state.currentRound,
        prestigeScore: this.playerPrestigeScore(),
        offer,
      },
    );
    this.replaceNegotiation(evaluated.session);
    if (evaluated.accepted) {
      return this.finalizeSponsorNegotiation(evaluated.session, offerId);
    }
    return {
      error:
        "Sponsor wants to negotiate — use the negotiation panel to adjust terms",
    };
  }

  dropSponsor(offerId: string): MetaStatePayload | { error: string } {
    const sponsors = this.state.sponsors ?? [];
    if (!sponsors.some((s) => s.offerId === offerId)) {
      return { error: "No active contract with this sponsor" };
    }
    this.state.sponsors = sponsors.filter((s) => s.offerId !== offerId);
    return this.persist();
  }

  createTeam(payload: CreateTeamPayload): MetaStatePayload | { error: string } {
    const name = payload.teamName.trim();
    if (name.length < 2) {
      return { error: "Team name must be at least 2 characters" };
    }
    if (name.length > 40) {
      return { error: "Team name must be 40 characters or fewer" };
    }
    if (!payload.firstCar) {
      return { error: "Choose a class programme before founding" };
    }
    const staffRoles = new Set(payload.staff.map((s) => s.role));
    const missingStaff = (["engineer", "mechanic", "strategist"] as const).filter(
      (role) => !staffRoles.has(role),
    );
    if (missingStaff.length > 0) {
      return { error: `Hire ${missingStaff.join(", ")} before founding` };
    }
    if (!payload.driverRoster || payload.driverRoster.length < 1) {
      return { error: "Add at least one driver to your line-up" };
    }
    for (const driver of payload.driverRoster) {
      const err = validateCustomDriver(driver);
      if (err) {
        const label = driver.name.trim() || "A driver";
        return { error: `${label}: ${err}` };
      }
    }

    const staffCost = payload.staff.reduce(
      (sum, s) => sum + 120000 + s.skill * 1500,
      0,
    );

    const firstCarErr = validateBuyCar(this.repoRoot, {
      ...this.state,
      budget: Math.max(0, STARTING_BUDGET - staffCost),
    }, payload.firstCar);
    if (firstCarErr) return { error: firstCarErr };

    const firstCars = createFleetCars(
      this.repoRoot,
      name,
      payload.firstCar,
      [],
    );
    if (firstCars.length === 0) {
      return { error: "Failed to create cars for your class programme" };
    }
    if (firstCars.length !== normalizeQuantity(payload.firstCar.quantity)) {
      return {
        error: `Failed to create ${normalizeQuantity(payload.firstCar.quantity)} car(s)`,
      };
    }
    const fleetErr = validateFleetRegulations(firstCars);
    if (fleetErr) return { error: fleetErr };

    const firstCarCost = buyCarCost(this.repoRoot, payload.firstCar) ?? 0;
    const firstCar = firstCars[0];

    this.state.teamName = name;
    const foundedLivery =
      normalizeTeamLivery({
        primary: payload.primaryColor,
        secondary: payload.secondaryColor,
        pattern: payload.liveryPattern,
        logoDataUrl: payload.logoDataUrl ?? null,
      }) ?? defaultTeamLiveryState();
    this.state.teamLivery = foundedLivery;
    this.state.teamColors = {
      primary: foundedLivery.primary,
      secondary: foundedLivery.secondary,
    };
    this.state.staff = payload.staff.map((s) => ({
      role: s.role,
      name: s.name,
      skill: Math.min(100, Math.max(1, s.skill)),
      assignedCarId: firstCar.id,
      status: "active" as const,
    }));
    this.state.budget = Math.max(0, STARTING_BUDGET - staffCost - firstCarCost);
    this.state.sponsors = [];
    this.state.rdPoints = 100;
    this.state.currentRound = 0;
    this.state.unlockedParts = ["tire.Medium", "brake.StandardCaliper"];
    this.state.calendar = defaultWecCalendarPayload();
    this.state.fleet = firstCars;
    this.state.activeCarId = firstCar.id;
    this.state.playerCarId = firstCar.id;
    this.state.playerEntryId = "entry-1";
    this.state.driverRoster = ensureDriverIds(payload.driverRoster.map((d) => ({ ...d })));
    const assignments = defaultDriverAssignments(
      this.state.driverRoster,
      firstCars,
    );
    for (const car of firstCars) {
      car.assignedDriverIds = assignments[car.id] ?? [];
    }
    const migratedStaff = migrateStaffToPerCar(
      this.state.staff as StaffMember[],
      firstCars.map((c) => c.id),
    );
    this.state.staff = migratedStaff.staff;
    this.state.setupComplete = true;
    this.state.teamCreationDraft = null;
    this.state.carBuildGuidePending =
      payload.firstCar.acquisition === "build" ||
      payload.firstCar.affiliation === "manufacturer";

    for (const event of this.state.calendar) {
      event.completed = false;
      event.championshipPoints = 0;
    }

    writeAllFleetConfigs(this.repoRoot, this.state, platformTemplateMap(this.repoRoot));
    writePlayerCarConfig(this.repoRoot, this.state);
    this.state.driverMarketRefreshCount = 0;
    this.state.aiRivalSeason = initAiRivalSeason(
      this.repoRoot,
      name,
      this.state.seasonYear,
    );
    syncPlayerDriversToStandings(
      this.state.aiRivalSeason,
      name,
      this.state.driverRoster,
      this.state.fleet,
    );
    this.regenerateDriverMarket();
    this.regenerateStaffMarket();
    this.captureSeasonStartSnapshot();
    return this.persist();
  }

  saveTeamCreationDraft(
    draft: TeamCreationDraftPayload,
  ): MetaStatePayload | { error: string } {
    if (this.state.setupComplete) {
      return { error: "Team already founded" };
    }
    if (!isValidWizardStep(draft.step)) {
      return { error: "Invalid wizard step" };
    }
    if (draft.teamName.length > 40) {
      return { error: "Team name must be 40 characters or fewer" };
    }
    if (!isValidHexColor(draft.primaryColor)) {
      return { error: "Invalid primary color" };
    }
    if (!isValidHexColor(draft.secondaryColor)) {
      return { error: "Invalid secondary color" };
    }
    if (draft.logoDataUrl && !isValidLogoDataUrl(draft.logoDataUrl)) {
      return { error: "Team logo is invalid or too large" };
    }
    for (const driver of draft.driverRoster ?? []) {
      const err = validateCustomDriver(driver);
      if (err) return { error: err };
    }

    this.state.teamCreationDraft = {
      step: draft.step,
      teamName: draft.teamName.slice(0, 40),
      primaryColor: draft.primaryColor,
      secondaryColor: draft.secondaryColor,
      liveryPattern: draft.liveryPattern ?? DEFAULT_LIVERY_PATTERN,
      logoDataUrl: draft.logoDataUrl ?? null,
      classId: draft.classId.trim() || "Hypercar",
      affiliation:
        draft.affiliation === "manufacturer" ? "manufacturer" : "privateer",
      platformId: draft.platformId ?? "",
      carQuantity: Math.min(6, Math.max(1, draft.carQuantity ?? 1)),
      staff: (draft.staff ?? []).map((s) => ({
        role: s.role,
        name: s.name,
        skill: Math.min(100, Math.max(1, s.skill)),
      })),
      driverRoster: (draft.driverRoster ?? []).map((d) => ({ ...d })),
    };
    return this.persist();
  }

  buyCar(payload: BuyCarPayload): MetaStatePayload | { error: string } {
    const err = validateBuyCar(this.repoRoot, this.state, payload);
    if (err) return { error: err };

    const cost = buyCarCost(this.repoRoot, payload) ?? 0;
    const cars = createFleetCars(
      this.repoRoot,
      this.state.teamName,
      payload,
      this.state.fleet ?? [],
    );
    if (cars.length !== normalizeQuantity(payload.quantity)) {
      return { error: "Failed to create car(s)" };
    }

    this.state.budget -= cost;
    this.state.fleet = [...(this.state.fleet ?? []), ...cars];
    if (!this.state.activeCarId) this.state.activeCarId = cars[0].id;

    const driverUpdates = assignUnassignedDriversToCars(
      this.state.driverRoster ?? [],
      this.state.fleet ?? [],
      cars.map((c) => c.id),
    );
    for (const car of cars) {
      const extra = driverUpdates[car.id];
      if (extra?.length) {
        car.assignedDriverIds = [
          ...sanitizeAssignedDriverIds(car.assignedDriverIds, this.state.driverRoster ?? []),
          ...extra,
        ];
      } else {
        car.assignedDriverIds =
          sanitizeAssignedDriverIds(car.assignedDriverIds, this.state.driverRoster ?? []);
      }
    }

    const templates = platformTemplateMap(this.repoRoot);
    for (const car of cars) {
      writeFleetCarConfig(
        this.repoRoot,
        this.state.teamName,
        car,
        car.platformId ? templates.get(car.platformId) : undefined,
      );
    }
    const migratedStaff = migrateStaffToPerCar(
      (this.state.staff ?? []) as StaffMember[],
      (this.state.fleet ?? []).map((c) => c.id),
    );
    this.state.staff = migratedStaff.staff;
    return this.persist();
  }

  removeCar(carId: string): MetaStatePayload | { error: string } {
    const fleet = this.state.fleet ?? [];
    const car = fleet.find((c) => c.id === carId);
    if (!car) return { error: "Car not found" };

    const remaining = fleet.filter((c) => c.id !== carId);
    const err = validateFleetRegulations(remaining);
    if (err && remaining.length > 0) return { error: err };

    this.state.fleet = remaining;
    if (this.state.activeCarId === carId) {
      this.state.activeCarId = remaining[0]?.id ?? "";
    }
    if (this.state.playerCarId === carId) {
      this.state.playerCarId = remaining[0]?.id ?? "";
    }
    if (remaining.length === 0) {
      this.state.setupComplete = false;
    }

    writeAllFleetConfigs(this.repoRoot, this.state, platformTemplateMap(this.repoRoot));
    return this.persist();
  }

  setActiveCar(carId: string): MetaStatePayload | null {
    if (!(this.state.fleet ?? []).some((c) => c.id === carId)) return null;
    this.state.activeCarId = carId;
    writePlayerCarConfig(this.repoRoot, this.state);
    return this.persist();
  }

  setPlayerEntry(carId: string): MetaStatePayload | null {
    if (!(this.state.fleet ?? []).some((c) => c.id === carId)) return null;
    this.state.playerCarId = carId;
    return this.persist();
  }

  saveCarBuild(
    build: CarBuildPayload,
    carId?: string,
  ): MetaStatePayload | { error: string } {
    const fleet = this.state.fleet ?? [];
    const active = carId
      ? fleet.find((c) => c.id === carId) ?? null
      : activeFleetCar(this.state);
    if (!active) return { error: "No active car in your fleet" };
    if (carId) this.state.activeCarId = carId;

    const err = validateCarBuild(
      this.repoRoot,
      active.classId,
      build,
      this.state.unlockedParts,
    );
    if (err) return { error: err };

    active.build = { ...build };
    this.state.carBuildGuidePending = false;

    const templates = platformTemplateMap(this.repoRoot);
    writeFleetCarConfig(
      this.repoRoot,
      this.state.teamName,
      active,
      active.platformId ? templates.get(active.platformId) : undefined,
    );

    for (const car of this.state.fleet ?? []) {
      if (car.id === active.id || !sameFleetProgramme(car, active)) continue;
      car.build = cloneCarBuild(build);
      writeFleetCarConfig(
        this.repoRoot,
        this.state.teamName,
        car,
        car.platformId ? templates.get(car.platformId) : undefined,
      );
    }

    writePlayerCarConfig(this.repoRoot, this.state);
    return this.persist();
  }

  saveTeamColors(
    colors: {
      primary: string;
      secondary: string;
      pattern?: string;
      logoDataUrl?: string | null;
    },
  ): MetaStatePayload | null {
    const existing = this.state.teamLivery ?? normalizeTeamLivery(this.state.teamColors);
    const livery = normalizeTeamLivery(
      {
        primary: colors.primary,
        secondary: colors.secondary,
        pattern: colors.pattern as TeamLiveryPayload["pattern"] | undefined,
        logoDataUrl:
          colors.logoDataUrl !== undefined
            ? colors.logoDataUrl
            : existing?.logoDataUrl ?? null,
      },
      existing ?? undefined,
    );
    if (!livery) return null;
    this.state.teamLivery = livery;
    this.state.teamColors = {
      primary: livery.primary,
      secondary: livery.secondary,
    };
    return this.persist();
  }

  saveDriverRoster(
    roster: DriverProfilePayload[],
    assignments?: Record<string, string[]>,
  ): MetaStatePayload | { error: string } {
    if (roster.length < 1) {
      return { error: "Roster must have at least one driver" };
    }
    for (const d of roster) {
      const err = validateCustomDriver(d);
      if (err) return { error: err };
    }
    this.state.driverRoster = ensureDriverIds(roster.map((d) => ({ ...d })));

    if (assignments && this.state.fleet?.length) {
      for (const car of this.state.fleet) {
        if (!(car.id in assignments)) continue;
        const sanitized = sanitizeAssignedDriverIds(
          assignments[car.id],
          this.state.driverRoster,
        );
        if (sanitized.length < 1) {
          return {
            error: `Car #${car.carNumber} must have at least one assigned driver`,
          };
        }
        car.assignedDriverIds = sanitized;
      }
      const exclusiveErr = validateExclusiveDriverAssignments(
        this.state.fleet,
        this.state.driverRoster,
      );
      if (exclusiveErr) return { error: exclusiveErr };
    } else if (this.state.fleet?.length) {
      for (const car of this.state.fleet) {
        car.assignedDriverIds = sanitizeAssignedDriverIds(
          car.assignedDriverIds,
          this.state.driverRoster,
        );
      }
      const exclusiveErr = validateExclusiveDriverAssignments(
        this.state.fleet,
        this.state.driverRoster,
      );
      if (exclusiveErr) {
        const defaults = defaultDriverAssignments(
          this.state.driverRoster,
          this.state.fleet,
        );
        for (const car of this.state.fleet) {
          car.assignedDriverIds = defaults[car.id] ?? car.assignedDriverIds ?? [];
        }
      }
    }

    this.regenerateDriverMarket();
    return this.persist();
  }

  refreshDriverMarket(): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Found your team before browsing the driver market" };
    }
    if (this.state.budget < DRIVER_MARKET_REFRESH_COST) {
      return {
        error: `Insufficient budget (need $${DRIVER_MARKET_REFRESH_COST.toLocaleString()})`,
      };
    }
    this.state.budget -= DRIVER_MARKET_REFRESH_COST;
    this.state.driverMarketRefreshCount =
      (this.state.driverMarketRefreshCount ?? 0) + 1;
    this.regenerateDriverMarket();
    return this.persist();
  }

  private ensureEmploymentContracts(): void {
    this.state.employmentContracts = synthesizeEmploymentContracts({
      teamName: this.state.teamName,
      seasonYear: this.state.seasonYear,
      currentRound: this.state.currentRound,
      driverRoster: this.state.driverRoster,
      staff: this.state.staff,
      employmentContracts: this.state.employmentContracts,
    });
  }

  private ensureSponsorDeals(): void {
    this.state.sponsorDeals = synthesizeSponsorDeals(
      this.state.sponsors,
      this.state.sponsorDeals,
      this.state.seasonYear,
    );
    this.syncSponsorsFromDeals();
  }

  private ensureRegulatoryState(): void {
    this.state.regulatoryState = ensureRegulatoryState(
      this.state.regulatoryState,
      this.state.currentRound,
    );
  }

  private syncSponsorsFromDeals(): void {
    const deals = this.state.sponsorDeals ?? [];
    if (!deals.length) return;
    this.state.sponsors = deals.map(
      (d): SponsorContractPayload => ({
        offerId: d.offerId,
        name: d.name,
        signedRound: d.signedRound,
        perRaceIncome: d.perRaceIncome,
        podiumBonus: d.podiumBonus,
        winBonus: d.winBonus,
        topFiveBonus: d.topFiveBonus,
        rdPointsPerRace: d.rdPointsPerRace,
        expiresSeasonYear: d.expiresSeasonYear,
      }),
    );
  }

  private sponsorsForFinances(): SponsorContractPayload[] {
    this.ensureSponsorDeals();
    return this.state.sponsors ?? [];
  }

  private parseInterTeamSubject(
    subjectRef: string,
  ): { subtype: InterTeamAgreementSubtype; partnerTeams: string[] } | null {
    return parseInterTeamSubjectRef(subjectRef);
  }

  private rivalTeamNames(): string[] {
    this.ensureAiRivalSeason();
    const playerKey = this.state.teamName.trim().toLowerCase();
    return (this.state.aiRivalSeason?.teams ?? [])
      .filter((t) => t.teamName.trim().toLowerCase() !== playerKey)
      .map((t) => t.teamName);
  }

  private finalizeSponsorNegotiation(
    session: NegotiationSession,
    offerId: string,
  ): MetaStatePayload | { error: string } {
    const offer = sponsorOfferById(offerId);
    if (!offer) return { error: "Unknown sponsor offer" };

    this.ensureSponsorDeals();
    const applied = applySponsorDeal(session, offer, {
      budget: this.state.budget,
      currentRound: this.state.currentRound,
      seasonYear: this.state.seasonYear,
      sponsors: this.state.sponsorDeals ?? [],
      maxSlots: MAX_SPONSOR_SLOTS,
    });
    if ("error" in applied) return applied;

    this.state.budget = applied.budget;
    this.state.sponsorDeals = applied.sponsors;
    this.syncSponsorsFromDeals();
    this.replaceNegotiation({ ...session, status: "accepted" });
    return this.persist();
  }

  private playerPrestigeScore(): number {
    const playerTeam = this.state.aiRivalSeason?.teams.find(
      (t) => t.isPlayerTeam || t.teamName === this.state.teamName,
    );
    const points = playerTeam?.championshipPoints ?? 0;
    const fleetClass = activeFleetCar(this.state)?.classId;
    return computePrestigeScore(points, fleetClass);
  }

  private findNegotiation(negotiationId: string): NegotiationSession | null {
    return (
      this.state.negotiations?.find((n) => n.id === negotiationId) ?? null
    );
  }

  private replaceNegotiation(session: NegotiationSession): void {
    const list = [...(this.state.negotiations ?? [])];
    const idx = list.findIndex((n) => n.id === session.id);
    if (idx >= 0) list[idx] = session;
    else list.push(session);
    this.state.negotiations = list;
  }

  private driverListingForNegotiation(
    subjectRef: string,
  ): DriverMarketListingPayload | null {
    return (
      findDriverListing(this.state.driverMarket, subjectRef) ??
      findMarketListing(this.state.driverMarket, subjectRef)
    );
  }

  private driverNegotiationContext(
    listing: DriverMarketListingPayload,
  ) {
    return buildDriverNegotiationContext(listing, {
      playerTeamName: this.state.teamName,
      currentRound: this.state.currentRound,
      seasonYear: this.state.seasonYear,
      prestigeScore: this.playerPrestigeScore(),
    });
  }

  private termsFromPayload(terms: NegotiationTermsPayload): NegotiationTerms {
    return { ...terms };
  }

  private finalizeDriverNegotiation(
    session: NegotiationSession,
    listing: DriverMarketListingPayload,
  ): MetaStatePayload | { error: string } {
    const statErr = validateDriverStats(listing.driver);
    if (statErr) return { error: statErr };

    this.ensureEmploymentContracts();
    const applied = applyDriverDeal(session, listing, {
      repoRoot: this.repoRoot,
      teamName: this.state.teamName,
      currentRound: this.state.currentRound,
      seasonYear: this.state.seasonYear,
      budget: this.state.budget,
      roster: this.state.driverRoster ?? [],
      driverMarket: this.state.driverMarket ?? [],
      rosterOverrides: this.state.aiRivalSeason?.rosterOverrides,
      employmentContracts: this.state.employmentContracts ?? [],
    });
    if ("error" in applied) return applied;

    this.state.budget = applied.budget;
    this.state.driverRoster = ensureDriverIds(applied.roster);
    this.state.driverMarket = applied.driverMarket;
    this.state.employmentContracts = applied.employmentContracts;

    for (const car of this.state.fleet ?? []) {
      car.assignedDriverIds = sanitizeAssignedDriverIds(
        car.assignedDriverIds,
        this.state.driverRoster,
      );
    }

    this.ensureAiRivalSeason();
    syncPlayerDriversToStandings(
      this.state.aiRivalSeason!,
      this.state.teamName,
      this.state.driverRoster,
      this.state.fleet ?? [],
    );

    this.replaceNegotiation({ ...session, status: "accepted" });
    return this.persist();
  }

  startNegotiation(
    kind: NegotiationKind,
    subjectRef: string,
  ): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Found your team before negotiating contracts" };
    }

    const prestige = this.playerPrestigeScore();
    const common = {
      playerTeamName: this.state.teamName,
      currentRound: this.state.currentRound,
      seasonYear: this.state.seasonYear,
      prestigeScore: prestige,
      existing: this.state.negotiations,
    };

    let created: NegotiationSession | { error: string };

    if (kind === "staff_employment") {
      return {
        error:
          "Staff contract negotiations are not wired yet — use the staff market when available",
      };
    }

    if (kind === "sponsor_partnership") {
      created = createSponsorNegotiation(subjectRef, common);
    } else if (kind === "inter_team_agreement") {
      const parsed = this.parseInterTeamSubject(subjectRef);
      if (!parsed) {
        return {
          error:
            "subjectRef must be joint_testing:Team or joint_testing:TeamA|TeamB or tech_share:Team",
        };
      }
      this.ensureAiRivalSeason();
      const seasonTeams = this.state.aiRivalSeason?.teams ?? [];
      created = createInterTeamNegotiation(
        parsed.subtype,
        parsed.partnerTeams,
        {
          playerTeamName: this.state.teamName,
          currentRound: this.state.currentRound,
          existing: this.state.negotiations,
          rivalTeams: this.rivalTeamNames(),
          rivalTeamByName: (name) =>
            seasonTeams.find(
              (t) =>
                t.teamName.trim().toLowerCase() === name.trim().toLowerCase(),
            ),
        },
      );
    } else if (kind === "regulatory_petition") {
      const proposal = ruleProposalById(subjectRef);
      if (!proposal) return { error: "Unknown regulatory proposal" };
      created = createRegulatoryNegotiation(proposal, {
        playerTeamName: this.state.teamName,
        currentRound: this.state.currentRound,
        existing: this.state.negotiations,
      });
    } else {
      this.ensureDriverMarketChanged();
      const listing = this.driverListingForNegotiation(subjectRef);
      if (!listing) {
        return { error: "That listing is no longer on the market" };
      }
      created = createDriverNegotiation(listing, common);
    }

    if ("error" in created) return created;
    this.replaceNegotiation(created);
    return this.persist();
  }

  submitNegotiationOffer(
    negotiationId: string,
    terms: NegotiationTermsPayload,
  ): MetaStatePayload | { error: string } {
    const session = this.findNegotiation(negotiationId);
    if (!session) return { error: "Unknown negotiation" };
    if (
      session.status !== "open" &&
      session.status !== "countered"
    ) {
      return { error: "Negotiation is closed" };
    }

    const payload = this.termsFromPayload(terms);

    if (session.kind === "sponsor_partnership") {
      const offer = sponsorOfferById(session.subjectRef);
      if (!offer) return { error: "Sponsor offer no longer available" };
      const evaluated = evaluateSponsorOffer(session, payload, {
        currentRound: this.state.currentRound,
        prestigeScore: this.playerPrestigeScore(),
        offer,
      });
      this.replaceNegotiation(evaluated.session);
      if (evaluated.accepted) {
        return this.finalizeSponsorNegotiation(evaluated.session, offer.id);
      }
      return this.persist();
    }

    if (session.kind === "inter_team_agreement") {
      const fee = payload.costContribution ?? 0;
      if (fee > 0 && this.state.budget < fee) {
        return {
          error: `Insufficient budget (need $${fee.toLocaleString()} contribution)`,
        };
      }
      const evaluated = submitInterTeamOffer(
        session,
        payload,
        this.state.currentRound,
      );
      this.replaceNegotiation(evaluated.session);
      this.resolvePendingAsyncNegotiations(this.state.currentRound);
      return this.persist();
    }

    if (session.kind === "regulatory_petition") {
      const proposal = ruleProposalById(session.subjectRef);
      const fee = payload.petitionFee ?? proposal?.petitionFee ?? 0;
      if (fee > 0 && this.state.budget < fee) {
        return {
          error: `Insufficient budget (need $${fee.toLocaleString()} petition fee)`,
        };
      }
      if (fee > 0) this.state.budget -= fee;
      const evaluated = submitRegulatoryPetition(
        session,
        payload,
        this.state.currentRound,
      );
      this.replaceNegotiation(evaluated.session);
      this.resolvePendingAsyncNegotiations(this.state.currentRound);
      return this.persist();
    }

    const listing = this.driverListingForNegotiation(session.subjectRef);
    if (!listing) return { error: "Listing no longer available" };

    const ctx = this.driverNegotiationContext(listing);
    const evaluated = evaluateDriverOffer(session, payload, ctx);
    this.replaceNegotiation(evaluated.session);

    if (evaluated.accepted) {
      return this.finalizeDriverNegotiation(evaluated.session, listing);
    }
    return this.persist();
  }

  acceptNegotiation(
    negotiationId: string,
  ): MetaStatePayload | { error: string } {
    const session = this.findNegotiation(negotiationId);
    if (!session) return { error: "Unknown negotiation" };
    if (!session.lastCounterOffer) {
      return { error: "No counter-offer to accept" };
    }

    if (session.kind === "sponsor_partnership") {
      const offer = sponsorOfferById(session.subjectRef);
      if (!offer) return { error: "Sponsor offer no longer available" };
      const evaluated = evaluateSponsorOffer(
        session,
        session.lastCounterOffer,
        {
          currentRound: this.state.currentRound,
          prestigeScore: this.playerPrestigeScore(),
          offer,
        },
      );
      this.replaceNegotiation(evaluated.session);
      if (!evaluated.accepted) {
        return { error: "Could not finalize at counter-offer terms" };
      }
      return this.finalizeSponsorNegotiation(evaluated.session, offer.id);
    }

    if (isNegotiationKindAsync(session.kind)) {
      return {
        error: "Submit a revised offer — inter-team and regulatory deals resolve when you submit",
      };
    }

    const listing = this.driverListingForNegotiation(session.subjectRef);
    if (!listing) return { error: "Listing no longer available" };

    const ctx = this.driverNegotiationContext(listing);
    const evaluated = acceptCounterOffer(session, ctx);
    this.replaceNegotiation(evaluated.session);
    if (!evaluated.accepted) {
      return { error: "Could not finalize at counter-offer terms" };
    }
    return this.finalizeDriverNegotiation(evaluated.session, listing);
  }

  withdrawNegotiation(
    negotiationId: string,
  ): MetaStatePayload | { error: string } {
    const session = this.findNegotiation(negotiationId);
    if (!session) return { error: "Unknown negotiation" };
    this.replaceNegotiation(withdrawNegotiation(session));
    return this.persist();
  }

  signDriverContract(listingId: string): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Found your team before signing drivers" };
    }
    this.ensureDriverMarketChanged();
    const listing = findMarketListing(this.state.driverMarket, listingId);
    if (!listing) {
      return { error: "That driver is no longer on the market" };
    }

    const created = createDriverNegotiation(listing, {
      playerTeamName: this.state.teamName,
      currentRound: this.state.currentRound,
      seasonYear: this.state.seasonYear,
      prestigeScore: this.playerPrestigeScore(),
      existing: this.state.negotiations,
    });
    if ("error" in created) return created;
    this.replaceNegotiation(created);
    const active = created;

    const ctx = this.driverNegotiationContext(listing);
    const offer = anchorTermsFromDriverListing(listing);
    const evaluated = evaluateDriverOffer(active, offer, ctx);
    this.replaceNegotiation(evaluated.session);

    if (evaluated.accepted) {
      return this.finalizeDriverNegotiation(evaluated.session, listing);
    }
    return {
      error:
        "Driver wants to negotiate — use the negotiation panel to improve your offer",
    };
  }

  setWeekendTireCompound(compound: string): MetaStatePayload | { error: string } {
    const normalized = compound.trim();
    const allowed = new Set(["Soft", "Medium", "Hard"]);
    if (!allowed.has(normalized)) {
      return { error: "Compound must be Soft, Medium, or Hard" };
    }
    this.state.weekendTireCompound = normalized;
    writePlayerCarConfig(this.repoRoot, this.state);
    return this.persist();
  }

  saveBriefingDefaults(
    trackId: string,
    sessionType: WeekendSessionType,
    briefings: CarSessionBriefing[],
  ): void {
    this.state.briefingDefaults = mergeBriefingDefaults(
      this.state.briefingDefaults,
      trackId,
      sessionType,
      briefings,
    );
    this.persist();
  }

  resolveBriefingDefaults(
    trackId: string,
    sessionType: WeekendSessionType,
  ): CarSessionBriefing[] | undefined {
    const fleet = this.state.fleet ?? [];
    const sessionMap = this.state.briefingDefaults?.[trackId]?.[sessionType];
    if (!sessionMap) return undefined;
    const out: CarSessionBriefing[] = [];
    for (const car of fleet) {
      const briefingId = sessionMap[car.id];
      if (briefingId) out.push({ carId: car.id, briefingId });
    }
    return out.length ? out : undefined;
  }

  applySessionPrep(prep: StartRoundPayload): string | null {
    const round = this.state.calendar.find((e) => e.round === this.state.currentRound);
    if (!round) return "No calendar event for the current round";
    const trackId = String(prep.trackId ?? "").trim();
    if (!trackId || trackId !== round.trackId) {
      return "Session prep track does not match the current round";
    }

    for (const entry of prep.carSetups ?? []) {
      const carId = String(entry.carId ?? "").trim();
      const preset = entry.preset;
      if (!carId || !preset) return "Each car setup requires carId and preset";
      const car = this.state.fleet?.find((c) => c.id === carId);
      if (!car) return `Unknown car: ${carId}`;
      const err = validateTrackPreset({ ...preset, trackId });
      if (err) return `${car.carNumber}: ${err}`;
      if (!car.trackSetupPresets) car.trackSetupPresets = {};
      car.trackSetupPresets[trackId] = { ...preset, trackId };
    }

    writePlayerCarConfig(this.repoRoot, this.state);
    this.persist();
    return null;
  }

  saveTrackSetupPreset(
    trackId: string,
    preset: import("./ws_protocol").TrackSetupPresetPayload,
  ): MetaStatePayload | { error: string } {
    const err = validateTrackPreset({ ...preset, trackId });
    if (err) return { error: err };
    if (!this.state.trackSetupPresets) this.state.trackSetupPresets = {};
    this.state.trackSetupPresets[trackId] = { ...preset, trackId };
    return this.persist();
  }

  reload(): MetaStatePayload {
    const defaults = parseConfigFile(this.repoRoot);
    this.state = migrateLegacyMeta(this.store.load(defaults));
    applyCalendarMigration(this.state);
    syncLegacyFields(this.state);
    return this.getState();
  }

  resetNewGame(): MetaStatePayload {
    this.store.delete();
    clearRuntimeConfigs(this.repoRoot);
    const defaults = parseConfigFile(this.repoRoot);
    this.state = normalizeSetupState(
      migrateLegacyMeta({
        ...structuredClone(defaults),
        setupComplete: false,
        teamCreationDraft: null,
        fleet: [],
        activeCarId: "",
        playerCarId: "",
        driverRoster: [],
        driverMarket: [],
        driverMarketRefreshCount: 0,
        driverMarketRound: 0,
        staffMarket: [],
        staffMarketRefreshCount: 0,
        staffMarketRound: 0,
        negotiations: [],
        employmentContracts: [],
        sponsorDeals: [],
        activeAgreements: [],
        regulatoryState: undefined,
        carBuild: null,
        staff: [],
        sponsors: [],
        unlockedParts: ["tire.Medium", "brake.StandardCaliper"],
        budget: STARTING_BUDGET,
        rdPoints: 100,
        currentRound: 0,
        calendar: defaultWecCalendarPayload(),
        carBuildGuidePending: false,
        weekendTireCompound: "Medium",
        teamName: "ProjectLM Racing",
        teamColors: { primary: "#d4a843", secondary: "#1a2a44" },
        teamLivery: defaultTeamLiveryState(),
        aiRivalSeason: undefined,
        seasonComplete: false,
        seasonSummary: undefined,
      }),
    );
    for (const event of this.state.calendar) {
      event.completed = false;
      event.championshipPoints = 0;
    }
    return this.persist();
  }
}
