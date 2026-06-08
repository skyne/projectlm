"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaStateManager = void 0;
exports.buildSeasonStartSnapshot = buildSeasonStartSnapshot;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const game_state_1 = require("./game_state");
const car_marketplace_1 = require("./game/car_marketplace");
const fleet_1 = require("./game/fleet");
const car_builder_1 = require("./game/car_builder");
const weekend_setup_1 = require("./game/weekend_setup");
const weekend_sessions_1 = require("./game/weekend_sessions");
const driver_catalog_1 = require("./game/driver_catalog");
const driver_market_1 = require("./game/driver_market");
const ai_rival_season_1 = require("./game/ai_rival_season");
const car_condition_1 = require("./game/car_condition");
const economy_1 = require("./game/economy");
const track_catalog_1 = require("./game/track_catalog");
const season_end_1 = require("./game/season_end");
const staff_1 = require("./game/staff");
const negotiations_1 = require("./game/negotiations");
const negotiation_deals_1 = require("./game/negotiation_deals");
const agreement_hooks_1 = require("./game/agreement_hooks");
const regulations_1 = require("./game/regulations");
const negotiations_2 = require("./game/negotiations");
function trim(s) {
    return s.trim();
}
function splitCsv(value) {
    return value.split(",").map(trim).filter(Boolean);
}
function isValidHexColor(color) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}
function isValidWizardStep(step) {
    return (step === "identity" ||
        step === "livery" ||
        step === "firstCar" ||
        step === "staff" ||
        step === "drivers" ||
        step === "confirm");
}
function parseConfigFile(repoRoot) {
    const configPath = path.join(repoRoot, "configs/team_config.txt");
    const defaults = {
        teamName: "ProjectLM Racing",
        budget: economy_1.STARTING_BUDGET,
        rdPoints: 100,
        playerEntryId: "entry-1",
        seasonYear: 2026,
        currentRound: 0,
        staff: [],
        sponsors: [],
        unlockedParts: ["tire.Medium", "brake.StandardCaliper"],
        calendar: (0, track_catalog_1.defaultWecCalendarPayload)(),
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
    if (!fs.existsSync(configPath))
        return defaults;
    const staff = [];
    const calendar = [];
    let teamName = defaults.teamName;
    let budget = defaults.budget;
    let rdPoints = defaults.rdPoints;
    let playerEntryId = defaults.playerEntryId;
    let seasonYear = defaults.seasonYear;
    let currentRound = defaults.currentRound;
    let unlockedParts = [];
    for (const line of fs.readFileSync(configPath, "utf8").split("\n")) {
        const trimmed = trim(line);
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0)
            continue;
        const key = trim(trimmed.slice(0, eq));
        const value = trim(trimmed.slice(eq + 1));
        if (key === "team_name")
            teamName = value;
        else if (key === "budget")
            budget = Number(value);
        else if (key === "rd_points")
            rdPoints = Number(value);
        else if (key === "player_entry")
            playerEntryId = value;
        else if (key === "season_year")
            seasonYear = Number(value);
        else if (key === "current_round")
            currentRound = Number(value);
        else if (key === "unlocked_parts")
            unlockedParts = splitCsv(value);
        else if (key === "staff") {
            const fields = splitCsv(value);
            if (fields.length >= 3) {
                staff.push({
                    role: fields[0],
                    name: fields[1],
                    skill: Number(fields[2]),
                });
            }
        }
        else if (key === "calendar") {
            const fields = splitCsv(value);
            if (fields.length >= 3) {
                const eventType = fields[4] === "test" ? "test" : fields[4] === "race" ? "race" : undefined;
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
        calendar: calendar.length > 0 ? calendar : (0, track_catalog_1.defaultWecCalendarPayload)(),
    };
}
function applyCalendarMigration(state) {
    const migrated = (0, track_catalog_1.migrateWecCalendar)(state.calendar);
    if (!migrated)
        return;
    state.calendar = migrated.calendar;
    state.currentRound = migrated.currentRound;
}
function applyStaffMigration(state, store) {
    const fleetIds = (state.fleet ?? []).map((c) => c.id);
    const { staff, migrated } = (0, staff_1.migrateStaffToPerCar)((state.staff ?? []), fleetIds);
    if (migrated) {
        state.staff = staff;
        store.save(state);
    }
}
function syncLegacyFields(state) {
    const active = (0, fleet_1.activeFleetCar)(state);
    if (active) {
        state.playerClassId = active.classId;
        state.carBuild = { ...active.build };
    }
}
function clearRuntimeConfigs(repoRoot) {
    const relPaths = [
        "configs/runtime/player_car.txt",
        "configs/runtime/drivers.txt",
        "configs/runtime/entries.txt",
        "configs/runtime/staff.txt",
        "configs/runtime/race.txt",
    ];
    for (const rel of relPaths) {
        const abs = path.join(repoRoot, rel);
        if (fs.existsSync(abs))
            fs.unlinkSync(abs);
    }
    const fleetDir = path.join(repoRoot, "configs/runtime/fleet");
    if (fs.existsSync(fleetDir)) {
        for (const file of fs.readdirSync(fleetDir)) {
            if (file.endsWith(".txt"))
                fs.unlinkSync(path.join(fleetDir, file));
        }
    }
}
function platformTemplateMap(repoRoot) {
    return new Map((0, car_marketplace_1.loadCarPlatforms)(repoRoot).map((p) => [p.id, p.templatePath]));
}
function resetCalendarEvents(calendar) {
    for (const event of calendar) {
        event.completed = false;
        event.championshipPoints = 0;
        event.prizeMoney = undefined;
        event.rdPointsEarned = undefined;
    }
}
function buildSeasonStartSnapshot(state) {
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
        negotiations: structuredClone(state.negotiations ?? []),
        employmentContracts: structuredClone(state.employmentContracts ?? []),
        sponsorDeals: structuredClone(state.sponsorDeals ?? []),
        activeAgreements: structuredClone(state.activeAgreements ?? []),
        regulatoryState: structuredClone(state.regulatoryState),
        aiRivalSeason: structuredClone(state.aiRivalSeason),
        weekendTireCompound: state.weekendTireCompound ?? "Medium",
        trackSetupPresets: structuredClone(state.trackSetupPresets ?? {}),
    };
}
function applySeasonStartSnapshot(state, snap) {
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
    state.negotiations = structuredClone(snap.negotiations ?? []);
    state.employmentContracts = structuredClone(snap.employmentContracts ?? []);
    state.sponsorDeals = structuredClone(snap.sponsorDeals ?? []);
    state.activeAgreements = structuredClone(snap.activeAgreements ?? []);
    state.regulatoryState = structuredClone(snap.regulatoryState);
    state.aiRivalSeason = structuredClone(snap.aiRivalSeason);
    state.weekendTireCompound = snap.weekendTireCompound ?? "Medium";
    state.trackSetupPresets = structuredClone(snap.trackSetupPresets ?? {});
}
class MetaStateManager {
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
        /** Round completed by the most recent finish; cleared on start_round or reopen. */
        this.lastCompletedRound = null;
        /** Snapshots taken before off-week AI resolution — restored on reopenRound. */
        this.preRoundAiRivalSeason = null;
        this.preRoundDriverMarket = null;
        this.store = new game_state_1.GameStateStore(repoRoot);
        const defaults = parseConfigFile(repoRoot);
        this.state = (0, fleet_1.migrateLegacyMeta)(this.store.load(defaults));
        applyCalendarMigration(this.state);
        applyStaffMigration(this.state, this.store);
        if (this.state.fleet?.length && (0, fleet_1.alignProgrammeBuilds)(this.state.fleet)) {
            (0, car_builder_1.writeAllFleetConfigs)(this.repoRoot, this.state, platformTemplateMap(this.repoRoot));
            this.store.save(this.state);
        }
        syncLegacyFields(this.state);
        if (this.ensureSeasonFinalized()) {
            this.store.save(this.state);
        }
    }
    getState() {
        let changed = false;
        this.ensureEmploymentContracts();
        this.ensureSponsorDeals();
        this.ensureRegulatoryState();
        const expired = (0, negotiations_1.expireNegotiations)(this.state.negotiations ?? [], this.state.currentRound);
        if (JSON.stringify(expired) !== JSON.stringify(this.state.negotiations ?? [])) {
            this.state.negotiations = expired;
            changed = true;
        }
        if (this.ensureDriverMarketChanged())
            changed = true;
        const before = this.state.aiRivalSeason?.teams.length ?? 0;
        this.ensureAiRivalSeason();
        if ((this.state.aiRivalSeason?.teams.length ?? 0) !== before)
            changed = true;
        if (this.ensureSeasonFinalized())
            changed = true;
        if (changed)
            this.store.save(this.state);
        return structuredClone(this.state);
    }
    isSeasonComplete() {
        return this.state.seasonComplete === true;
    }
    seasonStartBlockedReason() {
        if (this.state.seasonComplete) {
            return "Season complete — review results and start the next season";
        }
        if ((0, season_end_1.isSeasonCalendarComplete)(this.state.calendar)) {
            return "Season complete — review results and start the next season";
        }
        const event = this.state.calendar.find((e) => e.round === this.state.currentRound);
        if (event?.completed) {
            return "This round is already complete";
        }
        return null;
    }
    finalizeSeasonIfReady() {
        if (!this.state.setupComplete) {
            return { error: "Complete team setup first" };
        }
        if (!(0, season_end_1.isSeasonCalendarComplete)(this.state.calendar)) {
            return { error: "Season still in progress" };
        }
        if (!this.state.seasonComplete) {
            this.finalizeSeason();
            return this.persist();
        }
        return this.getState();
    }
    ensureSeasonFinalized() {
        if (!this.state.setupComplete ||
            this.state.seasonComplete ||
            !(0, season_end_1.isSeasonCalendarComplete)(this.state.calendar)) {
            return false;
        }
        this.finalizeSeason();
        return true;
    }
    finalizeSeason() {
        this.ensureAiRivalSeason();
        const summary = (0, season_end_1.finalizeSeasonSummary)(this.state);
        if (!summary)
            return;
        if (summary.totalPayout > 0) {
            this.state.budget += summary.totalPayout;
        }
        this.state.seasonSummary = summary;
        this.state.seasonComplete = true;
    }
    startNextSeason() {
        if (!this.state.setupComplete) {
            return { error: "Complete team setup first" };
        }
        this.ensureSeasonFinalized();
        if (!this.state.seasonComplete) {
            return { error: "Finish the current season before starting a new one" };
        }
        this.state.seasonYear += 1;
        this.state.calendar = (0, track_catalog_1.defaultWecCalendarPayload)();
        this.state.currentRound = 0;
        this.state.weekendProgress = undefined;
        this.state.seasonComplete = false;
        this.state.seasonSummary = undefined;
        this.lastCompletedRound = null;
        this.preRoundAiRivalSeason = null;
        this.preRoundDriverMarket = null;
        this.state.aiRivalSeason = (0, ai_rival_season_1.initAiRivalSeason)(this.repoRoot, this.state.teamName, this.state.seasonYear);
        (0, ai_rival_season_1.syncPlayerDriversToStandings)(this.state.aiRivalSeason, this.state.teamName, this.state.driverRoster ?? [], this.state.fleet ?? []);
        this.regenerateDriverMarket();
        this.captureSeasonStartSnapshot();
        return this.persist();
    }
    restartSeason() {
        if (!this.state.setupComplete) {
            return { error: "Complete team setup first" };
        }
        const snap = this.state.seasonStartSnapshot;
        if (snap && snap.seasonYear === this.state.seasonYear) {
            applySeasonStartSnapshot(this.state, snap);
        }
        else {
            resetCalendarEvents(this.state.calendar);
            this.state.currentRound = 0;
            this.state.aiRivalSeason = (0, ai_rival_season_1.initAiRivalSeason)(this.repoRoot, this.state.teamName, this.state.seasonYear);
            (0, ai_rival_season_1.syncPlayerDriversToStandings)(this.state.aiRivalSeason, this.state.teamName, this.state.driverRoster ?? [], this.state.fleet ?? []);
            this.regenerateDriverMarket();
        }
        this.state.weekendProgress = undefined;
        this.state.seasonComplete = false;
        this.state.seasonSummary = undefined;
        this.lastCompletedRound = null;
        this.preRoundAiRivalSeason = null;
        this.preRoundDriverMarket = null;
        if (snap && snap.seasonYear === this.state.seasonYear) {
            (0, car_builder_1.writeAllFleetConfigs)(this.repoRoot, this.state, platformTemplateMap(this.repoRoot));
            (0, car_builder_1.writePlayerCarConfig)(this.repoRoot, this.state);
        }
        syncLegacyFields(this.state);
        return this.persist();
    }
    captureSeasonStartSnapshot() {
        this.ensureAiRivalSeason();
        this.state.seasonStartSnapshot = buildSeasonStartSnapshot(this.state);
    }
    persist() {
        syncLegacyFields(this.state);
        this.ensureAiRivalSeason();
        this.ensureDriverMarketChanged();
        this.store.save(this.state);
        return structuredClone(this.state);
    }
    ensureAiRivalSeason() {
        if (!this.state.setupComplete)
            return;
        if (!this.state.aiRivalSeason ||
            this.state.aiRivalSeason.seasonYear !== this.state.seasonYear) {
            this.state.aiRivalSeason = (0, ai_rival_season_1.initAiRivalSeason)(this.repoRoot, this.state.teamName, this.state.seasonYear);
        }
        if (!this.state.aiRivalSeason.drivers?.length) {
            this.state.aiRivalSeason.drivers = (0, ai_rival_season_1.initDriverStandings)(this.repoRoot, this.state.teamName, this.state.driverRoster ?? [], this.state.fleet ?? []);
        }
        (0, ai_rival_season_1.syncPlayerDriversToStandings)(this.state.aiRivalSeason, this.state.teamName, this.state.driverRoster ?? [], this.state.fleet ?? []);
    }
    resolveAiOffWeek(raceResults, eventFormat, scoring, completingRound, sessionEntryRosters = {}) {
        this.ensureAiRivalSeason();
        const season = this.state.aiRivalSeason;
        if (raceResults?.length) {
            (0, ai_rival_season_1.resolveAiSeasonTick)(season, {
                playerTeamName: this.state.teamName,
                raceResults,
                eventFormat,
                scoring,
            });
            (0, ai_rival_season_1.resolveDriverChampionshipTick)(season, {
                raceResults,
                scoring,
                playerTeamName: this.state.teamName,
                sessionEntryRosters,
            });
        }
        const refreshCount = this.state.driverMarketRefreshCount ?? 0;
        const seed = (0, driver_market_1.marketSeedForRound)(this.state.teamName, completingRound, refreshCount + 1000);
        const resolved = (0, ai_rival_season_1.resolveAiDriverMarketBids)(this.repoRoot, season, this.state.driverMarket ?? [], seed, (0, negotiations_1.listingIdsWithOpenNegotiations)(this.state.negotiations));
        this.state.driverMarket = resolved.market;
        if (resolved.signedIds.length > 0) {
            console.log(`[ai_rivals] ${resolved.note}`);
        }
        this.ensureRegulatoryState();
        const asyncSeed = (0, negotiation_deals_1.negotiationAsyncSeed)(this.state.teamName, completingRound);
        const asyncResult = (0, negotiation_deals_1.resolveAsyncNegotiations)(this.state.negotiations ?? [], season, this.state.regulatoryState, {
            playerTeamName: this.state.teamName,
            completingRound,
            prestigeScore: this.playerPrestigeScore(),
            seed: asyncSeed,
        });
        this.state.negotiations = asyncResult.sessions;
        this.state.regulatoryState = asyncResult.regulatory;
        if (asyncResult.newAgreements.length > 0) {
            this.state.activeAgreements = [
                ...(this.state.activeAgreements ?? []),
                ...asyncResult.newAgreements,
            ];
            for (const note of (0, agreement_hooks_1.notifyNewAgreementStubs)(asyncResult.newAgreements)) {
                console.log(note);
            }
        }
        for (const headline of asyncResult.headlines) {
            console.log(`[negotiations] ${headline}`);
        }
    }
    regenerateDriverMarket() {
        const refreshCount = this.state.driverMarketRefreshCount ?? 0;
        const seed = (0, driver_market_1.marketSeedForRound)(this.state.teamName, this.state.currentRound, refreshCount);
        this.state.driverMarket = (0, driver_market_1.buildDriverMarket)(this.repoRoot, {
            seed,
            playerTeamName: this.state.teamName,
            existingRoster: this.state.driverRoster ?? [],
            rosterOverrides: this.state.aiRivalSeason?.rosterOverrides,
        });
        this.state.driverMarketRound = this.state.currentRound;
    }
    ensureDriverMarketChanged() {
        if (!this.state.setupComplete)
            return false;
        if (!this.state.driverMarket?.length ||
            this.state.driverMarketRound !== this.state.currentRound) {
            this.regenerateDriverMarket();
            return true;
        }
        return false;
    }
    validateFleetForRace() {
        return (0, fleet_1.validateFleetRegulations)(this.state.fleet ?? []);
    }
    hireStaff(role, name, skill) {
        const clamped = Math.min(100, Math.max(1, skill));
        const cost = (0, economy_1.staffSigningCost)(clamped);
        if (this.state.budget < cost)
            return this.getState();
        const carId = this.state.activeCarId ||
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
    getStaffForCar(carId) {
        return (0, staff_1.staffForCar)((this.state.staff ?? []), carId);
    }
    investRd(partId, points) {
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
    clearLastCompletedRound() {
        this.lastCompletedRound = null;
    }
    clearWeekendProgress() {
        this.state.weekendProgress = undefined;
        this.persist();
    }
    resolveWeekendSession(prep, event) {
        if (!(0, weekend_sessions_1.appliesWeekendSchedule)(event.eventType, event.format)) {
            return "race";
        }
        const requested = prep.sessionType;
        if (requested)
            return requested;
        const progress = this.state.weekendProgress;
        if (progress?.round === this.state.currentRound) {
            return (0, weekend_sessions_1.nextWeekendSession)(progress.completedSessions) ?? "race";
        }
        return "practice";
    }
    validateWeekendSessionStart(sessionType) {
        const event = this.state.calendar.find((e) => e.round === this.state.currentRound);
        if (!event)
            return "No calendar event for the current round";
        if (!(0, weekend_sessions_1.appliesWeekendSchedule)(event.eventType, event.format)) {
            return null;
        }
        const completed = this.state.weekendProgress?.round === this.state.currentRound
            ? this.state.weekendProgress.completedSessions
            : [];
        return (0, weekend_sessions_1.canStartWeekendSession)(sessionType, completed);
    }
    persistSessionCarConditions(snapshots, entryToFleetCarId, sessionType) {
        const fleet = [...(this.state.fleet ?? [])];
        let changed = false;
        for (const snap of snapshots) {
            const carId = entryToFleetCarId.get(snap.entryId);
            if (!carId)
                continue;
            const idx = fleet.findIndex((c) => c.id === carId);
            if (idx < 0)
                continue;
            const condition = (0, car_condition_1.snapshotToCarCondition)(snap);
            condition.updatedAtRound = this.state.currentRound;
            condition.updatedAfterSession = sessionType;
            fleet[idx] = { ...fleet[idx], carCondition: condition };
            changed = true;
        }
        if (!changed)
            return this.getState();
        this.state.fleet = fleet;
        return this.persist();
    }
    repairCarCondition(carId, options) {
        const fleet = this.state.fleet ?? [];
        const idx = fleet.findIndex((c) => c.id === carId);
        if (idx < 0)
            return { error: "Car not found in fleet" };
        const car = fleet[idx];
        const next = (0, car_condition_1.repairCarCondition)(car.carCondition, options);
        fleet[idx] = { ...car, carCondition: next };
        this.state.fleet = fleet;
        return this.persist();
    }
    completeWeekendSession(sessionType, qualiResults) {
        const round = this.state.currentRound;
        const progress = this.state.weekendProgress?.round === round
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
    getNextWeekendSessionAfter(sessionType) {
        const event = this.state.calendar.find((e) => e.round === this.state.currentRound);
        if (!event || !(0, weekend_sessions_1.appliesWeekendSchedule)(event.eventType, event.format)) {
            return null;
        }
        const completed = this.state.weekendProgress?.round === this.state.currentRound
            ? [...this.state.weekendProgress.completedSessions]
            : [];
        if (!completed.includes(sessionType)) {
            completed.push(sessionType);
        }
        return (0, weekend_sessions_1.nextWeekendSession)(completed);
    }
    reopenRound(round) {
        if (this.lastCompletedRound !== round)
            return this.getState();
        const event = this.state.calendar.find((e) => e.round === round);
        if (!event?.completed)
            return this.getState();
        if (event.prizeMoney)
            this.state.budget -= event.prizeMoney;
        if (event.rdPointsEarned)
            this.state.rdPoints -= event.rdPointsEarned;
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
        }
        else {
            this.regenerateDriverMarket();
        }
        return this.persist();
    }
    completeRound(position, classId, raceResults, sessionEntryRosters = {}) {
        const completingRound = this.state.currentRound;
        const event = this.state.calendar.find((e) => e.round === completingRound);
        if (!event || event.completed)
            return this.getState();
        const scoring = event.eventType !== "test" && event.format !== "test";
        this.ensureEmploymentContracts();
        this.ensureSponsorDeals();
        const finances = (0, economy_1.computeRaceFinances)(position, classId, event.format, this.sponsorsForFinances(), this.state.staff, {
            scoring,
            employmentContracts: this.state.employmentContracts,
            teamName: this.state.teamName,
        });
        event.completed = true;
        event.championshipPoints = finances.championshipPoints;
        event.prizeMoney = finances.netEarnings;
        event.rdPointsEarned = finances.rdPointsEarned;
        this.state.budget += finances.netEarnings;
        this.state.rdPoints += finances.rdPointsEarned;
        this.state.weekendProgress = undefined;
        const nextRound = (0, track_catalog_1.nextCalendarRound)(this.state.calendar, completingRound);
        if (nextRound !== null) {
            this.state.currentRound = nextRound;
        }
        this.state.negotiations = (0, negotiations_1.expireNegotiations)(this.state.negotiations ?? [], this.state.currentRound);
        this.lastCompletedRound = completingRound;
        this.ensureAiRivalSeason();
        if (scoring) {
            (0, ai_rival_season_1.applyPlayerTeamRoundResult)(this.state.aiRivalSeason, this.state.teamName, classId, finances.championshipPoints);
        }
        this.regenerateDriverMarket();
        this.preRoundAiRivalSeason = structuredClone(this.state.aiRivalSeason);
        this.preRoundDriverMarket = structuredClone(this.state.driverMarket ?? []);
        this.resolveAiOffWeek(raceResults, event.format, scoring, completingRound, sessionEntryRosters);
        if ((0, season_end_1.isSeasonCalendarComplete)(this.state.calendar)) {
            this.finalizeSeason();
        }
        return this.persist();
    }
    signSponsor(offerId) {
        const started = this.startNegotiation("sponsor_partnership", offerId);
        if ("error" in started)
            return started;
        const session = this.state.negotiations?.find((n) => n.subjectRef === offerId &&
            n.kind === "sponsor_partnership" &&
            (n.status === "open" || n.status === "countered"));
        if (!session)
            return { error: "Failed to open sponsor negotiation" };
        const offer = (0, economy_1.sponsorOfferById)(offerId);
        if (!offer)
            return { error: "Unknown sponsor offer" };
        const evaluated = (0, negotiation_deals_1.evaluateSponsorOffer)(session, (0, negotiation_deals_1.anchorTermsFromSponsorOffer)(offer), {
            currentRound: this.state.currentRound,
            prestigeScore: this.playerPrestigeScore(),
            offer,
        });
        this.replaceNegotiation(evaluated.session);
        if (evaluated.accepted) {
            return this.finalizeSponsorNegotiation(evaluated.session, offerId);
        }
        return {
            error: "Sponsor wants to negotiate — use the negotiation panel to adjust terms",
        };
    }
    dropSponsor(offerId) {
        const sponsors = this.state.sponsors ?? [];
        if (!sponsors.some((s) => s.offerId === offerId)) {
            return { error: "No active contract with this sponsor" };
        }
        this.state.sponsors = sponsors.filter((s) => s.offerId !== offerId);
        return this.persist();
    }
    createTeam(payload) {
        const name = payload.teamName.trim();
        if (name.length < 2 || name.length > 40)
            return null;
        if (!payload.firstCar || payload.staff.length < 3)
            return null;
        if (!payload.driverRoster || payload.driverRoster.length < 1)
            return null;
        for (const driver of payload.driverRoster) {
            const err = (0, driver_catalog_1.validateCustomDriver)(driver);
            if (err)
                return null;
        }
        const staffCost = payload.staff.reduce((sum, s) => sum + 120000 + s.skill * 1500, 0);
        const firstCarErr = (0, fleet_1.validateBuyCar)(this.repoRoot, {
            ...this.state,
            budget: Math.max(0, economy_1.STARTING_BUDGET - staffCost),
        }, payload.firstCar);
        if (firstCarErr)
            return null;
        const firstCars = (0, fleet_1.createFleetCars)(this.repoRoot, name, payload.firstCar, []);
        if (firstCars.length === 0)
            return null;
        const firstCarCost = (0, fleet_1.buyCarCost)(this.repoRoot, payload.firstCar) ?? 0;
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
        this.state.budget = Math.max(0, economy_1.STARTING_BUDGET - staffCost - firstCarCost);
        this.state.sponsors = [];
        this.state.rdPoints = 100;
        this.state.currentRound = 0;
        this.state.unlockedParts = ["tire.Medium", "brake.StandardCaliper"];
        this.state.calendar = (0, track_catalog_1.defaultWecCalendarPayload)();
        this.state.fleet = firstCars;
        this.state.activeCarId = firstCar.id;
        this.state.playerCarId = firstCar.id;
        this.state.playerEntryId = "entry-1";
        this.state.driverRoster = (0, driver_catalog_1.ensureDriverIds)(payload.driverRoster.map((d) => ({ ...d })));
        const assignments = (0, driver_catalog_1.defaultDriverAssignments)(this.state.driverRoster, firstCars);
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
        (0, car_builder_1.writeAllFleetConfigs)(this.repoRoot, this.state, platformTemplateMap(this.repoRoot));
        (0, car_builder_1.writePlayerCarConfig)(this.repoRoot, this.state);
        this.state.driverMarketRefreshCount = 0;
        this.state.aiRivalSeason = (0, ai_rival_season_1.initAiRivalSeason)(this.repoRoot, name, this.state.seasonYear);
        (0, ai_rival_season_1.syncPlayerDriversToStandings)(this.state.aiRivalSeason, name, this.state.driverRoster, this.state.fleet);
        this.regenerateDriverMarket();
        this.captureSeasonStartSnapshot();
        return this.persist();
    }
    saveTeamCreationDraft(draft) {
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
            const err = (0, driver_catalog_1.validateCustomDriver)(driver);
            if (err)
                return { error: err };
        }
        this.state.teamCreationDraft = {
            step: draft.step,
            teamName: draft.teamName.slice(0, 40),
            primaryColor: draft.primaryColor,
            secondaryColor: draft.secondaryColor,
            classId: draft.classId.trim() || "Hypercar",
            affiliation: draft.affiliation === "manufacturer" ? "manufacturer" : "privateer",
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
    buyCar(payload) {
        const err = (0, fleet_1.validateBuyCar)(this.repoRoot, this.state, payload);
        if (err)
            return { error: err };
        const cost = (0, fleet_1.buyCarCost)(this.repoRoot, payload) ?? 0;
        const cars = (0, fleet_1.createFleetCars)(this.repoRoot, this.state.teamName, payload, this.state.fleet ?? []);
        if (cars.length !== (0, fleet_1.normalizeQuantity)(payload.quantity)) {
            return { error: "Failed to create car(s)" };
        }
        this.state.budget -= cost;
        this.state.fleet = [...(this.state.fleet ?? []), ...cars];
        if (!this.state.activeCarId)
            this.state.activeCarId = cars[0].id;
        const driverUpdates = (0, driver_catalog_1.assignUnassignedDriversToCars)(this.state.driverRoster ?? [], this.state.fleet ?? [], cars.map((c) => c.id));
        for (const car of cars) {
            const extra = driverUpdates[car.id];
            if (extra?.length) {
                car.assignedDriverIds = [
                    ...(0, driver_catalog_1.sanitizeAssignedDriverIds)(car.assignedDriverIds, this.state.driverRoster ?? []),
                    ...extra,
                ];
            }
            else {
                car.assignedDriverIds =
                    (0, driver_catalog_1.sanitizeAssignedDriverIds)(car.assignedDriverIds, this.state.driverRoster ?? []);
            }
        }
        const templates = platformTemplateMap(this.repoRoot);
        for (const car of cars) {
            (0, car_builder_1.writeFleetCarConfig)(this.repoRoot, this.state.teamName, car, car.platformId ? templates.get(car.platformId) : undefined);
        }
        return this.persist();
    }
    removeCar(carId) {
        const fleet = this.state.fleet ?? [];
        const car = fleet.find((c) => c.id === carId);
        if (!car)
            return { error: "Car not found" };
        const remaining = fleet.filter((c) => c.id !== carId);
        const err = (0, fleet_1.validateFleetRegulations)(remaining);
        if (err && remaining.length > 0)
            return { error: err };
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
        (0, car_builder_1.writeAllFleetConfigs)(this.repoRoot, this.state, platformTemplateMap(this.repoRoot));
        return this.persist();
    }
    setActiveCar(carId) {
        if (!(this.state.fleet ?? []).some((c) => c.id === carId))
            return null;
        this.state.activeCarId = carId;
        (0, car_builder_1.writePlayerCarConfig)(this.repoRoot, this.state);
        return this.persist();
    }
    setPlayerEntry(carId) {
        if (!(this.state.fleet ?? []).some((c) => c.id === carId))
            return null;
        this.state.playerCarId = carId;
        return this.persist();
    }
    saveCarBuild(build, carId) {
        const fleet = this.state.fleet ?? [];
        const active = carId
            ? fleet.find((c) => c.id === carId) ?? null
            : (0, fleet_1.activeFleetCar)(this.state);
        if (!active)
            return { error: "No active car in your fleet" };
        if (carId)
            this.state.activeCarId = carId;
        const err = (0, car_builder_1.validateCarBuild)(this.repoRoot, active.classId, build, this.state.unlockedParts);
        if (err)
            return { error: err };
        active.build = { ...build };
        this.state.carBuildGuidePending = false;
        const templates = platformTemplateMap(this.repoRoot);
        (0, car_builder_1.writeFleetCarConfig)(this.repoRoot, this.state.teamName, active, active.platformId ? templates.get(active.platformId) : undefined);
        for (const car of this.state.fleet ?? []) {
            if (car.classId !== active.classId || car.id === active.id)
                continue;
            car.build = (0, fleet_1.cloneCarBuild)(build);
            (0, car_builder_1.writeFleetCarConfig)(this.repoRoot, this.state.teamName, car, car.platformId ? templates.get(car.platformId) : undefined);
        }
        (0, car_builder_1.writePlayerCarConfig)(this.repoRoot, this.state);
        return this.persist();
    }
    saveTeamColors(colors) {
        if (!isValidHexColor(colors.primary) || !isValidHexColor(colors.secondary)) {
            return null;
        }
        this.state.teamColors = {
            primary: colors.primary,
            secondary: colors.secondary,
        };
        return this.persist();
    }
    saveDriverRoster(roster, assignments) {
        if (roster.length < 1) {
            return { error: "Roster must have at least one driver" };
        }
        for (const d of roster) {
            const err = (0, driver_catalog_1.validateCustomDriver)(d);
            if (err)
                return { error: err };
        }
        this.state.driverRoster = (0, driver_catalog_1.ensureDriverIds)(roster.map((d) => ({ ...d })));
        if (assignments && this.state.fleet?.length) {
            for (const car of this.state.fleet) {
                if (!(car.id in assignments))
                    continue;
                const sanitized = (0, driver_catalog_1.sanitizeAssignedDriverIds)(assignments[car.id], this.state.driverRoster);
                if (sanitized.length < 1) {
                    return {
                        error: `Car #${car.carNumber} must have at least one assigned driver`,
                    };
                }
                car.assignedDriverIds = sanitized;
            }
            const exclusiveErr = (0, driver_catalog_1.validateExclusiveDriverAssignments)(this.state.fleet, this.state.driverRoster);
            if (exclusiveErr)
                return { error: exclusiveErr };
        }
        else if (this.state.fleet?.length) {
            for (const car of this.state.fleet) {
                car.assignedDriverIds = (0, driver_catalog_1.sanitizeAssignedDriverIds)(car.assignedDriverIds, this.state.driverRoster);
            }
            const exclusiveErr = (0, driver_catalog_1.validateExclusiveDriverAssignments)(this.state.fleet, this.state.driverRoster);
            if (exclusiveErr) {
                const defaults = (0, driver_catalog_1.defaultDriverAssignments)(this.state.driverRoster, this.state.fleet);
                for (const car of this.state.fleet) {
                    car.assignedDriverIds = defaults[car.id] ?? car.assignedDriverIds ?? [];
                }
            }
        }
        this.regenerateDriverMarket();
        return this.persist();
    }
    refreshDriverMarket() {
        if (!this.state.setupComplete) {
            return { error: "Found your team before browsing the driver market" };
        }
        if (this.state.budget < driver_market_1.DRIVER_MARKET_REFRESH_COST) {
            return {
                error: `Insufficient budget (need $${driver_market_1.DRIVER_MARKET_REFRESH_COST.toLocaleString()})`,
            };
        }
        this.state.budget -= driver_market_1.DRIVER_MARKET_REFRESH_COST;
        this.state.driverMarketRefreshCount =
            (this.state.driverMarketRefreshCount ?? 0) + 1;
        this.regenerateDriverMarket();
        return this.persist();
    }
    ensureEmploymentContracts() {
        this.state.employmentContracts = (0, negotiations_1.synthesizeEmploymentContracts)({
            teamName: this.state.teamName,
            seasonYear: this.state.seasonYear,
            currentRound: this.state.currentRound,
            driverRoster: this.state.driverRoster,
            staff: this.state.staff,
            employmentContracts: this.state.employmentContracts,
        });
    }
    ensureSponsorDeals() {
        this.state.sponsorDeals = (0, negotiation_deals_1.synthesizeSponsorDeals)(this.state.sponsors, this.state.sponsorDeals, this.state.seasonYear);
        this.syncSponsorsFromDeals();
    }
    ensureRegulatoryState() {
        this.state.regulatoryState = (0, negotiation_deals_1.ensureRegulatoryState)(this.state.regulatoryState, this.state.currentRound);
    }
    syncSponsorsFromDeals() {
        const deals = this.state.sponsorDeals ?? [];
        if (!deals.length)
            return;
        this.state.sponsors = deals.map((d) => ({
            offerId: d.offerId,
            name: d.name,
            signedRound: d.signedRound,
            perRaceIncome: d.perRaceIncome,
            podiumBonus: d.podiumBonus,
            winBonus: d.winBonus,
            topFiveBonus: d.topFiveBonus,
            rdPointsPerRace: d.rdPointsPerRace,
            expiresSeasonYear: d.expiresSeasonYear,
        }));
    }
    sponsorsForFinances() {
        this.ensureSponsorDeals();
        return this.state.sponsors ?? [];
    }
    parseInterTeamSubject(subjectRef) {
        const sep = subjectRef.indexOf(":");
        if (sep <= 0)
            return null;
        const subtype = subjectRef.slice(0, sep);
        if (subtype !== "joint_testing" && subtype !== "tech_share")
            return null;
        const partnerTeam = subjectRef.slice(sep + 1).trim();
        if (!partnerTeam)
            return null;
        return { subtype, partnerTeam };
    }
    rivalTeamNames() {
        this.ensureAiRivalSeason();
        const playerKey = this.state.teamName.trim().toLowerCase();
        return (this.state.aiRivalSeason?.teams ?? [])
            .filter((t) => t.teamName.trim().toLowerCase() !== playerKey)
            .map((t) => t.teamName);
    }
    finalizeSponsorNegotiation(session, offerId) {
        const offer = (0, economy_1.sponsorOfferById)(offerId);
        if (!offer)
            return { error: "Unknown sponsor offer" };
        this.ensureSponsorDeals();
        const applied = (0, negotiation_deals_1.applySponsorDeal)(session, offer, {
            budget: this.state.budget,
            currentRound: this.state.currentRound,
            seasonYear: this.state.seasonYear,
            sponsors: this.state.sponsorDeals ?? [],
            maxSlots: economy_1.MAX_SPONSOR_SLOTS,
        });
        if ("error" in applied)
            return applied;
        this.state.budget = applied.budget;
        this.state.sponsorDeals = applied.sponsors;
        this.syncSponsorsFromDeals();
        this.replaceNegotiation({ ...session, status: "accepted" });
        return this.persist();
    }
    playerPrestigeScore() {
        const playerTeam = this.state.aiRivalSeason?.teams.find((t) => t.isPlayerTeam || t.teamName === this.state.teamName);
        const points = playerTeam?.championshipPoints ?? 0;
        const fleetClass = (0, fleet_1.activeFleetCar)(this.state)?.classId;
        return (0, negotiations_1.computePrestigeScore)(points, fleetClass);
    }
    findNegotiation(negotiationId) {
        return (this.state.negotiations?.find((n) => n.id === negotiationId) ?? null);
    }
    replaceNegotiation(session) {
        const list = [...(this.state.negotiations ?? [])];
        const idx = list.findIndex((n) => n.id === session.id);
        if (idx >= 0)
            list[idx] = session;
        else
            list.push(session);
        this.state.negotiations = list;
    }
    driverListingForNegotiation(subjectRef) {
        return ((0, negotiations_1.findDriverListing)(this.state.driverMarket, subjectRef) ??
            (0, driver_market_1.findMarketListing)(this.state.driverMarket, subjectRef));
    }
    driverNegotiationContext(listing) {
        return (0, negotiations_1.buildDriverNegotiationContext)(listing, {
            playerTeamName: this.state.teamName,
            currentRound: this.state.currentRound,
            seasonYear: this.state.seasonYear,
            prestigeScore: this.playerPrestigeScore(),
        });
    }
    termsFromPayload(terms) {
        return { ...terms };
    }
    finalizeDriverNegotiation(session, listing) {
        const statErr = (0, driver_catalog_1.validateDriverStats)(listing.driver);
        if (statErr)
            return { error: statErr };
        this.ensureEmploymentContracts();
        const applied = (0, negotiations_1.applyDriverDeal)(session, listing, {
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
        if ("error" in applied)
            return applied;
        this.state.budget = applied.budget;
        this.state.driverRoster = (0, driver_catalog_1.ensureDriverIds)(applied.roster);
        this.state.driverMarket = applied.driverMarket;
        this.state.employmentContracts = applied.employmentContracts;
        for (const car of this.state.fleet ?? []) {
            car.assignedDriverIds = (0, driver_catalog_1.sanitizeAssignedDriverIds)(car.assignedDriverIds, this.state.driverRoster);
        }
        this.ensureAiRivalSeason();
        (0, ai_rival_season_1.syncPlayerDriversToStandings)(this.state.aiRivalSeason, this.state.teamName, this.state.driverRoster, this.state.fleet ?? []);
        this.replaceNegotiation({ ...session, status: "accepted" });
        return this.persist();
    }
    startNegotiation(kind, subjectRef) {
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
        let created;
        if (kind === "staff_employment") {
            return {
                error: "Staff contract negotiations are not wired yet — use the staff market when available",
            };
        }
        if (kind === "sponsor_partnership") {
            created = (0, negotiation_deals_1.createSponsorNegotiation)(subjectRef, common);
        }
        else if (kind === "inter_team_agreement") {
            const parsed = this.parseInterTeamSubject(subjectRef);
            if (!parsed) {
                return {
                    error: "subjectRef must be joint_testing:Team or tech_share:Team",
                };
            }
            this.ensureAiRivalSeason();
            created = (0, negotiation_deals_1.createInterTeamNegotiation)(parsed.subtype, parsed.partnerTeam, {
                playerTeamName: this.state.teamName,
                currentRound: this.state.currentRound,
                existing: this.state.negotiations,
                rivalTeams: this.rivalTeamNames(),
            });
        }
        else if (kind === "regulatory_petition") {
            const proposal = (0, regulations_1.ruleProposalById)(subjectRef);
            if (!proposal)
                return { error: "Unknown regulatory proposal" };
            created = (0, negotiation_deals_1.createRegulatoryNegotiation)(proposal, {
                playerTeamName: this.state.teamName,
                currentRound: this.state.currentRound,
                existing: this.state.negotiations,
            });
        }
        else {
            this.ensureDriverMarketChanged();
            const listing = this.driverListingForNegotiation(subjectRef);
            if (!listing) {
                return { error: "That listing is no longer on the market" };
            }
            created = (0, negotiations_1.createDriverNegotiation)(listing, common);
        }
        if ("error" in created)
            return created;
        this.replaceNegotiation(created);
        return this.persist();
    }
    submitNegotiationOffer(negotiationId, terms) {
        const session = this.findNegotiation(negotiationId);
        if (!session)
            return { error: "Unknown negotiation" };
        if (session.status !== "open" &&
            session.status !== "countered") {
            return { error: "Negotiation is closed" };
        }
        const payload = this.termsFromPayload(terms);
        if (session.kind === "sponsor_partnership") {
            const offer = (0, economy_1.sponsorOfferById)(session.subjectRef);
            if (!offer)
                return { error: "Sponsor offer no longer available" };
            const evaluated = (0, negotiation_deals_1.evaluateSponsorOffer)(session, payload, {
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
            const evaluated = (0, negotiation_deals_1.submitInterTeamOffer)(session, payload, this.state.currentRound);
            this.replaceNegotiation(evaluated.session);
            return this.persist();
        }
        if (session.kind === "regulatory_petition") {
            const proposal = (0, regulations_1.ruleProposalById)(session.subjectRef);
            const fee = payload.petitionFee ?? proposal?.petitionFee ?? 0;
            if (fee > 0 && this.state.budget < fee) {
                return {
                    error: `Insufficient budget (need $${fee.toLocaleString()} petition fee)`,
                };
            }
            if (fee > 0)
                this.state.budget -= fee;
            const evaluated = (0, negotiation_deals_1.submitRegulatoryPetition)(session, payload, this.state.currentRound);
            this.replaceNegotiation(evaluated.session);
            return this.persist();
        }
        const listing = this.driverListingForNegotiation(session.subjectRef);
        if (!listing)
            return { error: "Listing no longer available" };
        const ctx = this.driverNegotiationContext(listing);
        const evaluated = (0, negotiations_1.evaluateDriverOffer)(session, payload, ctx);
        this.replaceNegotiation(evaluated.session);
        if (evaluated.accepted) {
            return this.finalizeDriverNegotiation(evaluated.session, listing);
        }
        return this.persist();
    }
    acceptNegotiation(negotiationId) {
        const session = this.findNegotiation(negotiationId);
        if (!session)
            return { error: "Unknown negotiation" };
        if (!session.lastCounterOffer) {
            return { error: "No counter-offer to accept" };
        }
        if (session.kind === "sponsor_partnership") {
            const offer = (0, economy_1.sponsorOfferById)(session.subjectRef);
            if (!offer)
                return { error: "Sponsor offer no longer available" };
            const evaluated = (0, negotiation_deals_1.evaluateSponsorOffer)(session, session.lastCounterOffer, {
                currentRound: this.state.currentRound,
                prestigeScore: this.playerPrestigeScore(),
                offer,
            });
            this.replaceNegotiation(evaluated.session);
            if (!evaluated.accepted) {
                return { error: "Could not finalize at counter-offer terms" };
            }
            return this.finalizeSponsorNegotiation(evaluated.session, offer.id);
        }
        if ((0, negotiations_2.isNegotiationKindAsync)(session.kind)) {
            return {
                error: "Submit a revised offer — async deals resolve after the race weekend",
            };
        }
        const listing = this.driverListingForNegotiation(session.subjectRef);
        if (!listing)
            return { error: "Listing no longer available" };
        const ctx = this.driverNegotiationContext(listing);
        const evaluated = (0, negotiations_1.acceptCounterOffer)(session, ctx);
        this.replaceNegotiation(evaluated.session);
        if (!evaluated.accepted) {
            return { error: "Could not finalize at counter-offer terms" };
        }
        return this.finalizeDriverNegotiation(evaluated.session, listing);
    }
    withdrawNegotiation(negotiationId) {
        const session = this.findNegotiation(negotiationId);
        if (!session)
            return { error: "Unknown negotiation" };
        this.replaceNegotiation((0, negotiations_1.withdrawNegotiation)(session));
        return this.persist();
    }
    signDriverContract(listingId) {
        if (!this.state.setupComplete) {
            return { error: "Found your team before signing drivers" };
        }
        this.ensureDriverMarketChanged();
        const listing = (0, driver_market_1.findMarketListing)(this.state.driverMarket, listingId);
        if (!listing) {
            return { error: "That driver is no longer on the market" };
        }
        const created = (0, negotiations_1.createDriverNegotiation)(listing, {
            playerTeamName: this.state.teamName,
            currentRound: this.state.currentRound,
            seasonYear: this.state.seasonYear,
            prestigeScore: this.playerPrestigeScore(),
            existing: this.state.negotiations,
        });
        if ("error" in created)
            return created;
        this.replaceNegotiation(created);
        const active = created;
        const ctx = this.driverNegotiationContext(listing);
        const offer = (0, negotiations_1.anchorTermsFromDriverListing)(listing);
        const evaluated = (0, negotiations_1.evaluateDriverOffer)(active, offer, ctx);
        this.replaceNegotiation(evaluated.session);
        if (evaluated.accepted) {
            return this.finalizeDriverNegotiation(evaluated.session, listing);
        }
        return {
            error: "Driver wants to negotiate — use the negotiation panel to improve your offer",
        };
    }
    setWeekendTireCompound(compound) {
        const normalized = compound.trim();
        const allowed = new Set(["Soft", "Medium", "Hard"]);
        if (!allowed.has(normalized)) {
            return { error: "Compound must be Soft, Medium, or Hard" };
        }
        this.state.weekendTireCompound = normalized;
        (0, car_builder_1.writePlayerCarConfig)(this.repoRoot, this.state);
        return this.persist();
    }
    applySessionPrep(prep) {
        const round = this.state.calendar.find((e) => e.round === this.state.currentRound);
        if (!round)
            return "No calendar event for the current round";
        const trackId = String(prep.trackId ?? "").trim();
        if (!trackId || trackId !== round.trackId) {
            return "Session prep track does not match the current round";
        }
        for (const entry of prep.carSetups ?? []) {
            const carId = String(entry.carId ?? "").trim();
            const preset = entry.preset;
            if (!carId || !preset)
                return "Each car setup requires carId and preset";
            const car = this.state.fleet?.find((c) => c.id === carId);
            if (!car)
                return `Unknown car: ${carId}`;
            const err = (0, weekend_setup_1.validateTrackPreset)({ ...preset, trackId });
            if (err)
                return `${car.carNumber}: ${err}`;
            if (!car.trackSetupPresets)
                car.trackSetupPresets = {};
            car.trackSetupPresets[trackId] = { ...preset, trackId };
        }
        (0, car_builder_1.writePlayerCarConfig)(this.repoRoot, this.state);
        this.persist();
        return null;
    }
    saveTrackSetupPreset(trackId, preset) {
        const err = (0, weekend_setup_1.validateTrackPreset)({ ...preset, trackId });
        if (err)
            return { error: err };
        if (!this.state.trackSetupPresets)
            this.state.trackSetupPresets = {};
        this.state.trackSetupPresets[trackId] = { ...preset, trackId };
        return this.persist();
    }
    reload() {
        const defaults = parseConfigFile(this.repoRoot);
        this.state = (0, fleet_1.migrateLegacyMeta)(this.store.load(defaults));
        applyCalendarMigration(this.state);
        syncLegacyFields(this.state);
        return this.getState();
    }
    resetNewGame() {
        this.store.delete();
        clearRuntimeConfigs(this.repoRoot);
        const defaults = parseConfigFile(this.repoRoot);
        this.state = (0, fleet_1.migrateLegacyMeta)({
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
            negotiations: [],
            employmentContracts: [],
            sponsorDeals: [],
            activeAgreements: [],
            regulatoryState: undefined,
            carBuild: null,
            staff: [],
            sponsors: [],
            unlockedParts: ["tire.Medium", "brake.StandardCaliper"],
            budget: defaults.budget,
            rdPoints: defaults.rdPoints,
            currentRound: 0,
            calendar: (0, track_catalog_1.defaultWecCalendarPayload)(),
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
exports.MetaStateManager = MetaStateManager;
