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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const game_state_1 = require("./game_state");
const car_marketplace_1 = require("./game/car_marketplace");
const fleet_1 = require("./game/fleet");
const car_builder_1 = require("./game/car_builder");
const weekend_setup_1 = require("./game/weekend_setup");
const driver_catalog_1 = require("./game/driver_catalog");
const driver_market_1 = require("./game/driver_market");
const economy_1 = require("./game/economy");
const track_catalog_1 = require("./game/track_catalog");
const staff_1 = require("./game/staff");
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
class MetaStateManager {
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
        /** Round completed by the most recent finish; cleared on start_round or reopen. */
        this.lastCompletedRound = null;
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
    }
    getState() {
        if (this.ensureDriverMarketChanged()) {
            this.store.save(this.state);
        }
        return structuredClone(this.state);
    }
    persist() {
        syncLegacyFields(this.state);
        this.ensureDriverMarketChanged();
        this.store.save(this.state);
        return structuredClone(this.state);
    }
    regenerateDriverMarket() {
        const refreshCount = this.state.driverMarketRefreshCount ?? 0;
        const seed = (0, driver_market_1.marketSeedForRound)(this.state.teamName, this.state.currentRound, refreshCount);
        this.state.driverMarket = (0, driver_market_1.buildDriverMarket)(this.repoRoot, {
            seed,
            playerTeamName: this.state.teamName,
            existingRoster: this.state.driverRoster ?? [],
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
        this.lastCompletedRound = null;
        this.regenerateDriverMarket();
        return this.persist();
    }
    completeRound(position, classId) {
        const completingRound = this.state.currentRound;
        const event = this.state.calendar.find((e) => e.round === completingRound);
        if (!event || event.completed)
            return this.getState();
        const scoring = event.eventType !== "test" && event.format !== "test";
        const finances = (0, economy_1.computeRaceFinances)(position, classId, event.format, this.state.sponsors ?? [], this.state.staff, { scoring });
        event.completed = true;
        event.championshipPoints = finances.championshipPoints;
        event.prizeMoney = finances.netEarnings;
        event.rdPointsEarned = finances.rdPointsEarned;
        this.state.budget += finances.netEarnings;
        this.state.rdPoints += finances.rdPointsEarned;
        const nextRound = (0, track_catalog_1.nextCalendarRound)(this.state.calendar, completingRound);
        if (nextRound !== null) {
            this.state.currentRound = nextRound;
        }
        this.lastCompletedRound = completingRound;
        this.regenerateDriverMarket();
        return this.persist();
    }
    signSponsor(offerId) {
        const offer = (0, economy_1.sponsorOfferById)(offerId);
        if (!offer)
            return { error: "Unknown sponsor offer" };
        const sponsors = this.state.sponsors ?? [];
        if (sponsors.length >= economy_1.MAX_SPONSOR_SLOTS) {
            return { error: `Maximum ${economy_1.MAX_SPONSOR_SLOTS} sponsor contracts` };
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
        this.state.driverRoster = payload.driverRoster.map((d) => ({ ...d }));
        const driverIndices = (0, driver_catalog_1.allDriverIndices)(this.state.driverRoster.length);
        for (const car of firstCars) {
            car.assignedDriverIndices = [...driverIndices];
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
        this.regenerateDriverMarket();
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
        const driverIndices = (0, driver_catalog_1.allDriverIndices)(this.state.driverRoster?.length ?? 0);
        for (const car of cars) {
            car.assignedDriverIndices = [...driverIndices];
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
    saveCarBuild(build) {
        const active = (0, fleet_1.activeFleetCar)(this.state);
        if (!active)
            return { error: "No active car in your fleet" };
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
        this.state.driverRoster = roster.map((d) => ({ ...d }));
        if (assignments && this.state.fleet?.length) {
            for (const car of this.state.fleet) {
                if (!(car.id in assignments))
                    continue;
                const sanitized = (0, driver_catalog_1.sanitizeAssignedIndices)(assignments[car.id], roster.length);
                if (sanitized.length < 1) {
                    return {
                        error: `Car #${car.carNumber} must have at least one assigned driver`,
                    };
                }
                car.assignedDriverIndices = sanitized;
            }
        }
        else if (this.state.fleet?.length) {
            for (const car of this.state.fleet) {
                car.assignedDriverIndices = (0, driver_catalog_1.sanitizeAssignedIndices)(car.assignedDriverIndices, roster.length);
                if (!car.assignedDriverIndices.length) {
                    car.assignedDriverIndices = (0, driver_catalog_1.allDriverIndices)(roster.length);
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
    signDriverContract(listingId) {
        if (!this.state.setupComplete) {
            return { error: "Found your team before signing drivers" };
        }
        this.ensureDriverMarketChanged();
        const listing = (0, driver_market_1.findMarketListing)(this.state.driverMarket, listingId);
        if (!listing) {
            return { error: "That driver is no longer on the market" };
        }
        const roster = this.state.driverRoster ?? [];
        if (roster.length >= driver_market_1.MAX_DRIVER_ROSTER) {
            return { error: `Roster full (${driver_market_1.MAX_DRIVER_ROSTER} drivers maximum)` };
        }
        const nameKey = listing.driver.name.trim().toLowerCase();
        if (roster.some((d) => d.name.trim().toLowerCase() === nameKey)) {
            return { error: `${listing.driver.name} is already on your roster` };
        }
        if (this.state.budget < listing.signingFee) {
            return {
                error: `Insufficient budget (need $${listing.signingFee.toLocaleString()} signing fee)`,
            };
        }
        const statErr = (0, driver_catalog_1.validateDriverStats)(listing.driver);
        if (statErr)
            return { error: statErr };
        this.state.budget -= listing.signingFee;
        roster.push({ ...listing.driver, tier: (0, driver_catalog_1.inferTier)(listing.driver) });
        this.state.driverRoster = roster;
        this.state.driverMarket = (this.state.driverMarket ?? []).filter((l) => l.id !== listingId);
        const newIdx = roster.length - 1;
        for (const car of this.state.fleet ?? []) {
            const indices = (0, driver_catalog_1.sanitizeAssignedIndices)(car.assignedDriverIndices, roster.length);
            if (!indices.includes(newIdx))
                indices.push(newIdx);
            car.assignedDriverIndices = [...indices].sort((a, b) => a - b);
        }
        return this.persist();
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
