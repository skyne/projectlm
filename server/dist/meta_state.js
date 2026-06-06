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
const car_setup_1 = require("./game/car_setup");
const staff_1 = require("./game/staff");
const SAVE_PATH = "data/game_save.json";
class MetaStateManager {
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
        this.state = null;
    }
    get hasGame() {
        return this.state !== null;
    }
    getState() {
        return this.state ? structuredClone(this.state) : null;
    }
    load() {
        const abs = path.join(this.repoRoot, SAVE_PATH);
        if (!fs.existsSync(abs))
            return false;
        const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
        const fleet = raw.fleet ?? [];
        const fleetIds = fleet.map((car) => car.id);
        const rawStaff = raw.staff ?? [];
        const { staff, migrated } = (0, staff_1.migrateStaffToPerCar)(rawStaff, fleetIds);
        const unlockedParts = raw.unlockedParts ?? [];
        const weekendSession = raw.weekendSession ?? "practice";
        this.state = {
            teamName: String(raw.teamName ?? "Player Team"),
            currentRound: Number(raw.currentRound ?? 0),
            weekendSession: car_setup_1.WEEKEND_SESSION_ORDER.includes(weekendSession)
                ? weekendSession
                : "practice",
            weekendTireCompound: String(raw.weekendTireCompound ?? "Medium"),
            playerCarId: String(raw.playerCarId ?? fleet[0]?.id ?? "car-1"),
            playerEntryId: String(raw.playerEntryId ?? "entry-1"),
            calendar: raw.calendar ?? [],
            fleet: fleet.map((car) => ({
                ...car,
                setup: (0, car_setup_1.clampSetup)(car.setup ?? (0, car_setup_1.defaultCarSetup)(car.classId)),
            })),
            qualiResults: raw.qualiResults ?? [],
            activeCarId: String(raw.activeCarId ?? raw.playerCarId ?? fleet[0]?.id ?? "car-1"),
            budget: Number(raw.budget ?? 0),
            rdPoints: Number(raw.rdPoints ?? 0),
            lastRacePayout: Number(raw.lastRacePayout ?? 0),
            staff,
            unlockedParts,
        };
        if (migrated)
            this.save();
        return true;
    }
    save() {
        if (!this.state)
            return;
        const abs = path.join(this.repoRoot, SAVE_PATH);
        const existing = fs.existsSync(abs)
            ? JSON.parse(fs.readFileSync(abs, "utf8"))
            : {};
        const merged = {
            ...existing,
            ...this.state,
            fleet: this.state.fleet,
            qualiResults: this.state.qualiResults,
            weekendSession: this.state.weekendSession,
            staff: this.state.staff,
            unlockedParts: this.state.unlockedParts,
        };
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, JSON.stringify(merged, null, 2), "utf8");
    }
    currentEvent() {
        if (!this.state)
            return null;
        return (this.state.calendar.find((e) => e.round === this.state.currentRound) ??
            null);
    }
    setCarSetup(carId, setup) {
        if (!this.state)
            return false;
        const car = this.state.fleet.find((c) => c.id === carId);
        if (!car)
            return false;
        car.setup = (0, car_setup_1.clampSetup)(setup);
        this.save();
        return true;
    }
    setActiveCar(carId) {
        if (!this.state)
            return false;
        if (!this.state.fleet.some((c) => c.id === carId))
            return false;
        this.state.activeCarId = carId;
        this.save();
        return true;
    }
    setWeekendTire(compound) {
        if (!this.state)
            return;
        this.state.weekendTireCompound = compound;
        this.save();
    }
    recordQualiResults(results) {
        if (!this.state)
            return;
        this.state.qualiResults = results;
        this.save();
    }
    advanceWeekendSession() {
        if (!this.state)
            return null;
        const idx = car_setup_1.WEEKEND_SESSION_ORDER.indexOf(this.state.weekendSession);
        if (idx < 0 || idx >= car_setup_1.WEEKEND_SESSION_ORDER.length - 1)
            return null;
        this.state.weekendSession = car_setup_1.WEEKEND_SESSION_ORDER[idx + 1];
        this.save();
        return this.state.weekendSession;
    }
    completeRound() {
        if (!this.state)
            return;
        const event = this.currentEvent();
        if (event)
            event.completed = true;
        this.state.currentRound += 1;
        this.state.weekendSession = "practice";
        this.state.qualiResults = [];
        this.save();
    }
    recordRaceOutcome(playerEntryId, results) {
        if (!this.state)
            return;
        const player = results.find((r) => r.entryId === playerEntryId);
        if (!player)
            return;
        const payoutByPosition = [0, 250000, 180000, 140000, 110000, 90000];
        const payout = player.retired ? 25000 : (payoutByPosition[player.position] ?? 50000);
        const rdGain = player.retired ? 1 : Math.max(1, 6 - Math.min(player.position, 6));
        this.state.budget = (this.state.budget ?? 0) + payout;
        this.state.rdPoints = (this.state.rdPoints ?? 0) + rdGain;
        this.state.lastRacePayout = payout;
        const event = this.currentEvent();
        if (event && !player.retired && player.position <= 3) {
            event.championshipPoints = (event.championshipPoints ?? 0) + Math.max(0, 8 - player.position * 2);
        }
        this.save();
    }
    reopenWeekend() {
        if (!this.state)
            return;
        this.state.weekendSession = "practice";
        this.state.qualiResults = [];
        this.save();
    }
    getStaffForCar(carId) {
        if (!this.state)
            return [];
        return (0, staff_1.staffForCar)(this.state.staff, carId);
    }
}
exports.MetaStateManager = MetaStateManager;
