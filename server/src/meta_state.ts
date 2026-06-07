import * as fs from "fs";
import * as path from "path";
import type {
  BuyCarPayload,
  CarBuildPayload,
  CreateTeamPayload,
  MetaStatePayload,
  StartRoundPayload,
  TeamCreationDraftPayload,
  TeamCreationWizardStep,
  AiRivalSeasonPayload,
  DriverMarketListingPayload,
} from "./ws_protocol";
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
  assignUnassignedDriversToCars,
  defaultDriverAssignments,
  ensureCatalogDriverId,
  ensureDriverIds,
  sanitizeAssignedDriverIds,
  validateCustomDriver,
  validateDriverStats,
  validateExclusiveDriverAssignments,
  inferTier,
  type DriverProfilePayload,
} from "./game/driver_catalog";
import {
  buildDriverMarket,
  DRIVER_MARKET_REFRESH_COST,
  findMarketListing,
  marketSeedForRound,
  MAX_DRIVER_ROSTER,
  validateDriverMarketSigning,
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
import {
  computeRaceFinances,
  MAX_SPONSOR_SLOTS,
  sponsorOfferById,
  staffSigningCost,
  STARTING_BUDGET,
} from "./game/economy";
import {
  defaultWecCalendarPayload,
  migrateWecCalendar,
  nextCalendarRound,
} from "./game/track_catalog";
import {
  migrateStaffToPerCar,
  staffForCar,
  type StaffMember,
} from "./game/staff";

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

export class MetaStateManager {
  private state: MetaStatePayload;
  private readonly store: GameStateStore;
  /** Round completed by the most recent finish; cleared on start_round or reopen. */
  private lastCompletedRound: number | null = null;
  /** Snapshots taken before off-week AI resolution — restored on reopenRound. */
  private preRoundAiRivalSeason: AiRivalSeasonPayload | null = null;
  private preRoundDriverMarket: DriverMarketListingPayload[] | null = null;

  constructor(private readonly repoRoot: string) {
    this.store = new GameStateStore(repoRoot);
    const defaults = parseConfigFile(repoRoot);
    this.state = migrateLegacyMeta(this.store.load(defaults));
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
  }

  getState(): MetaStatePayload {
    let changed = false;
    if (this.ensureDriverMarketChanged()) changed = true;
    const before = this.state.aiRivalSeason?.teams.length ?? 0;
    this.ensureAiRivalSeason();
    if ((this.state.aiRivalSeason?.teams.length ?? 0) !== before) changed = true;
    if (changed) this.store.save(this.state);
    return structuredClone(this.state);
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
        repoRoot: this.repoRoot,
        raceResults,
        scoring,
        playerTeamName: this.state.teamName,
        playerRoster: this.state.driverRoster ?? [],
        playerFleet: this.state.fleet ?? [],
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
    );
    this.state.driverMarket = resolved.market;
    if (resolved.signedIds.length > 0) {
      console.log(`[ai_rivals] ${resolved.note}`);
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

  validateFleetForRace(): string | null {
    return validateFleetRegulations(this.state.fleet ?? []);
  }

  hireStaff(role: string, name: string, skill: number): MetaStatePayload {
    const clamped = Math.min(100, Math.max(1, skill));
    const cost = staffSigningCost(clamped);
    if (this.state.budget < cost) return this.getState();
    const carId =
      this.state.activeCarId ||
      this.state.playerCarId ||
      this.state.fleet?.[0]?.id ||
      "";
    this.state.staff.push({
      role,
      name,
      skill: clamped,
      assignedCarId: carId || undefined,
      status: "active",
    });
    this.state.budget -= cost;
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

    return this.persist();
  }

  completeRound(
    position: number,
    classId: string,
    raceResults?: RaceResultForSeason[],
  ): MetaStatePayload {
    const completingRound = this.state.currentRound;
    const event = this.state.calendar.find(
      (e) => e.round === completingRound,
    );
    if (!event || event.completed) return this.getState();

    const scoring = event.eventType !== "test" && event.format !== "test";
    const finances = computeRaceFinances(
      position,
      classId,
      event.format,
      this.state.sponsors ?? [],
      this.state.staff,
      { scoring },
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
    this.preRoundAiRivalSeason = structuredClone(this.state.aiRivalSeason!);
    this.preRoundDriverMarket = structuredClone(this.state.driverMarket ?? []);
    this.resolveAiOffWeek(raceResults, event.format, scoring, completingRound);
    return this.persist();
  }

  signSponsor(offerId: string): MetaStatePayload | { error: string } {
    const offer = sponsorOfferById(offerId);
    if (!offer) return { error: "Unknown sponsor offer" };

    const sponsors = this.state.sponsors ?? [];
    if (sponsors.length >= MAX_SPONSOR_SLOTS) {
      return { error: `Maximum ${MAX_SPONSOR_SLOTS} sponsor contracts` };
    }
    if (sponsors.some((s) => s.offerId === offerId)) {
      return { error: "Already contracted with this sponsor" };
    }
    if (this.state.budget < offer.signingFee) {
      return {
        error: `Insufficient budget (need $${offer.signingFee.toLocaleString()})`,
      };
    }

    this.state.budget -= offer.signingFee;
    this.state.sponsors = [
      ...sponsors,
      {
        offerId: offer.id,
        name: offer.name,
        signedRound: this.state.currentRound,
      },
    ];
    return this.persist();
  }

  dropSponsor(offerId: string): MetaStatePayload | { error: string } {
    const sponsors = this.state.sponsors ?? [];
    if (!sponsors.some((s) => s.offerId === offerId)) {
      return { error: "No active contract with this sponsor" };
    }
    this.state.sponsors = sponsors.filter((s) => s.offerId !== offerId);
    return this.persist();
  }

  createTeam(payload: CreateTeamPayload): MetaStatePayload | null {
    const name = payload.teamName.trim();
    if (name.length < 2 || name.length > 40) return null;
    if (!payload.firstCar || payload.staff.length < 3) return null;
    if (!payload.driverRoster || payload.driverRoster.length < 1) return null;
    for (const driver of payload.driverRoster) {
      const err = validateCustomDriver(driver);
      if (err) return null;
    }

    const staffCost = payload.staff.reduce(
      (sum, s) => sum + 120000 + s.skill * 1500,
      0,
    );

    const firstCarErr = validateBuyCar(this.repoRoot, {
      ...this.state,
      budget: Math.max(0, STARTING_BUDGET - staffCost),
    }, payload.firstCar);
    if (firstCarErr) return null;

    const firstCars = createFleetCars(
      this.repoRoot,
      name,
      payload.firstCar,
      [],
    );
    if (firstCars.length === 0) return null;

    const firstCarCost = buyCarCost(this.repoRoot, payload.firstCar) ?? 0;
    const firstCar = firstCars[0];

    this.state.teamName = name;
    this.state.teamColors = {
      primary: payload.primaryColor,
      secondary: payload.secondaryColor,
    };
    this.state.staff = payload.staff.map((s) => ({
      role: s.role,
      name: s.name,
      skill: Math.min(100, Math.max(1, s.skill)),
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
    for (const driver of draft.driverRoster ?? []) {
      const err = validateCustomDriver(driver);
      if (err) return { error: err };
    }

    this.state.teamCreationDraft = {
      step: draft.step,
      teamName: draft.teamName.slice(0, 40),
      primaryColor: draft.primaryColor,
      secondaryColor: draft.secondaryColor,
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
      if (car.classId !== active.classId || car.id === active.id) continue;
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
    colors: { primary: string; secondary: string },
  ): MetaStatePayload | null {
    if (!isValidHexColor(colors.primary) || !isValidHexColor(colors.secondary)) {
      return null;
    }
    this.state.teamColors = {
      primary: colors.primary,
      secondary: colors.secondary,
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

  signDriverContract(listingId: string): MetaStatePayload | { error: string } {
    if (!this.state.setupComplete) {
      return { error: "Found your team before signing drivers" };
    }
    this.ensureDriverMarketChanged();
    const listing = findMarketListing(this.state.driverMarket, listingId);
    if (!listing) {
      return { error: "That driver is no longer on the market" };
    }

    const roster = this.state.driverRoster ?? [];
    if (roster.length >= MAX_DRIVER_ROSTER) {
      return { error: `Roster full (${MAX_DRIVER_ROSTER} drivers maximum)` };
    }
    const contractErr = validateDriverMarketSigning(
      listing,
      this.state.teamName,
      roster,
      this.repoRoot,
      this.state.aiRivalSeason?.rosterOverrides,
    );
    if (contractErr) return { error: contractErr };
    if (this.state.budget < listing.signingFee) {
      return {
        error: `Insufficient budget (need $${listing.signingFee.toLocaleString()} signing fee)`,
      };
    }

    const statErr = validateDriverStats(listing.driver);
    if (statErr) return { error: statErr };

    this.state.budget -= listing.signingFee;
    const signed = ensureCatalogDriverId(listing.driver);
    roster.push({
      ...signed,
      tier: inferTier(signed),
    });
    this.state.driverRoster = ensureDriverIds(roster);
    this.state.driverMarket = (this.state.driverMarket ?? []).filter(
      (l) => l.id !== listingId,
    );

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

    return this.persist();
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
    this.state = migrateLegacyMeta({
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
      carBuild: null,
      staff: [],
      sponsors: [],
      unlockedParts: ["tire.Medium", "brake.StandardCaliper"],
      budget: defaults.budget,
      rdPoints: defaults.rdPoints,
      currentRound: 0,
      calendar: defaultWecCalendarPayload(),
      carBuildGuidePending: false,
      weekendTireCompound: "Medium",
    });
    for (const event of this.state.calendar) {
      event.completed = false;
      event.championshipPoints = 0;
    }
    return this.persist();
  }
}
