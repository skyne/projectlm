import * as fs from "fs";
import * as path from "path";
import {
  clampSetup,
  defaultCarSetup,
  WEEKEND_SESSION_ORDER,
  type CarSessionSetup,
  type WeekendSessionType,
} from "./game/car_setup";
import type { CarBuildPayload } from "./game/car_builder";
import type { CalendarEvent, QualiResult } from "./game/race_builder";
import {
  migrateStaffToPerCar,
  staffForCar,
  type StaffMember,
} from "./game/staff";

export interface FleetCarMeta {
  id: string;
  carNumber: string;
  classId: string;
  build: CarBuildPayload;
  carConfigPath: string;
  setup?: CarSessionSetup;
}

export interface MetaStatePayload {
  teamName: string;
  currentRound: number;
  weekendSession: WeekendSessionType;
  weekendTireCompound: string;
  playerCarId: string;
  playerEntryId: string;
  calendar: CalendarEvent[];
  fleet: FleetCarMeta[];
  qualiResults: QualiResult[];
  activeCarId: string;
  budget?: number;
  rdPoints?: number;
  lastRacePayout?: number;
  staff: StaffMember[];
  unlockedParts: string[];
}

const SAVE_PATH = "data/game_save.json";

export class MetaStateManager {
  private state: MetaStatePayload | null = null;

  constructor(private readonly repoRoot: string) {}

  get hasGame(): boolean {
    return this.state !== null;
  }

  getState(): MetaStatePayload | null {
    return this.state ? structuredClone(this.state) : null;
  }

  load(): boolean {
    const abs = path.join(this.repoRoot, SAVE_PATH);
    if (!fs.existsSync(abs)) return false;

    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
    const fleet = (raw.fleet as FleetCarMeta[] | undefined) ?? [];
    const fleetIds = fleet.map((car) => car.id);
    const rawStaff = (raw.staff as StaffMember[] | undefined) ?? [];
    const { staff, migrated } = migrateStaffToPerCar(rawStaff, fleetIds);
    const unlockedParts = (raw.unlockedParts as string[] | undefined) ?? [];
    const weekendSession =
      (raw.weekendSession as WeekendSessionType | undefined) ?? "practice";

    this.state = {
      teamName: String(raw.teamName ?? "Player Team"),
      currentRound: Number(raw.currentRound ?? 0),
      weekendSession: WEEKEND_SESSION_ORDER.includes(weekendSession)
        ? weekendSession
        : "practice",
      weekendTireCompound: String(raw.weekendTireCompound ?? "Medium"),
      playerCarId: String(raw.playerCarId ?? fleet[0]?.id ?? "car-1"),
      playerEntryId: String(raw.playerEntryId ?? "entry-1"),
      calendar: (raw.calendar as CalendarEvent[]) ?? [],
      fleet: fleet.map((car) => ({
        ...car,
        setup: clampSetup(car.setup ?? defaultCarSetup(car.classId)),
      })),
      qualiResults: (raw.qualiResults as QualiResult[]) ?? [],
      activeCarId: String(raw.activeCarId ?? raw.playerCarId ?? fleet[0]?.id ?? "car-1"),
      budget: Number(raw.budget ?? 0),
      rdPoints: Number(raw.rdPoints ?? 0),
      lastRacePayout: Number(raw.lastRacePayout ?? 0),
      staff,
      unlockedParts,
    };
    if (migrated) this.save();
    return true;
  }

  save(): void {
    if (!this.state) return;
    const abs = path.join(this.repoRoot, SAVE_PATH);
    const existing = fs.existsSync(abs)
      ? (JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>)
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

  currentEvent(): CalendarEvent | null {
    if (!this.state) return null;
    return (
      this.state.calendar.find((e) => e.round === this.state!.currentRound) ??
      null
    );
  }

  setCarSetup(carId: string, setup: CarSessionSetup): boolean {
    if (!this.state) return false;
    const car = this.state.fleet.find((c) => c.id === carId);
    if (!car) return false;
    car.setup = clampSetup(setup);
    this.save();
    return true;
  }

  setActiveCar(carId: string): boolean {
    if (!this.state) return false;
    if (!this.state.fleet.some((c) => c.id === carId)) return false;
    this.state.activeCarId = carId;
    this.save();
    return true;
  }

  setWeekendTire(compound: string): void {
    if (!this.state) return;
    this.state.weekendTireCompound = compound;
    this.save();
  }

  recordQualiResults(results: QualiResult[]): void {
    if (!this.state) return;
    this.state.qualiResults = results;
    this.save();
  }

  advanceWeekendSession(): WeekendSessionType | null {
    if (!this.state) return null;
    const idx = WEEKEND_SESSION_ORDER.indexOf(this.state.weekendSession);
    if (idx < 0 || idx >= WEEKEND_SESSION_ORDER.length - 1) return null;
    this.state.weekendSession = WEEKEND_SESSION_ORDER[idx + 1];
    this.save();
    return this.state.weekendSession;
  }

  completeRound(): void {
    if (!this.state) return;
    const event = this.currentEvent();
    if (event) event.completed = true;
    this.state.currentRound += 1;
    this.state.weekendSession = "practice";
    this.state.qualiResults = [];
    this.save();
  }

  recordRaceOutcome(
    playerEntryId: string,
    results: Array<{ entryId: string; position: number; retired?: boolean }>,
  ): void {
    if (!this.state) return;
    const player = results.find((r) => r.entryId === playerEntryId);
    if (!player) return;

    const payoutByPosition = [0, 250_000, 180_000, 140_000, 110_000, 90_000];
    const payout =
      player.retired ? 25_000 : (payoutByPosition[player.position] ?? 50_000);
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

  reopenWeekend(): void {
    if (!this.state) return;
    this.state.weekendSession = "practice";
    this.state.qualiResults = [];
    this.save();
  }

  getStaffForCar(carId: string): StaffMember[] {
    if (!this.state) return [];
    return staffForCar(this.state.staff, carId);
  }
}
