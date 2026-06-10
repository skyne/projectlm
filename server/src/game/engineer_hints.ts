/**
 * Proactive race-engineer hints for managed (player) cars.
 * Fires when critical tyre, fuel, damage, part wear, or weather-tyre mismatch is detected.
 */
import type { CarSnapshot } from "../ws_protocol";
import {
  EMERGENCY_FUEL_FRACTION,
  hasSevereCarIssue,
  needsEmergencyPit,
  type PlannerSnap,
} from "./pitbot/pit_planner";
import {
  INTER_TYRE_THRESHOLD,
  needsWeatherTyreSwap,
  normalizeTyreTread,
  WET_TYRE_THRESHOLD,
  type TyreTread,
} from "../tyre_grip";

export type EngineerHintCategory =
  | "emergency"
  | "fuel"
  | "tyre_wear"
  | "damage"
  | "part_wear"
  | "wrong_tyre";

export interface EngineerHint {
  hintId: string;
  entryId: string;
  carNumber: string;
  category: EngineerHintCategory;
  text: string;
  suggestedCommand?: string;
}

interface ClassFuelProfile {
  fuelCritical: number;
  tireWear: number;
  defaultTank: number;
}

const CLASS_PROFILES: Record<string, ClassFuelProfile> = {
  Hypercar: { fuelCritical: 0.14, tireWear: 0.72, defaultTank: 110 },
  LMP2: { fuelCritical: 0.18, tireWear: 0.74, defaultTank: 110 },
  LMGT3: { fuelCritical: 0.18, tireWear: 0.68, defaultTank: 100 },
};

const DEFAULT_PROFILE = CLASS_PROFILES.LMP2;
const PART_WEAR_THRESHOLD = 78;
const ENGINE_DAMAGE_THRESHOLD = 78;
/** Body panel health below this triggers a damage radio hint (cosmetic scuffs stay silent). */
const HINT_BODY_DAMAGE_THRESHOLD = 85;
const SNOOZE_AFTER_DISMISS_SEC = 90;

function profileFor(classId: string): ClassFuelProfile {
  return CLASS_PROFILES[classId] ?? DEFAULT_PROFILE;
}

function tankCapacity(s: PlannerSnap): number {
  if (s.fuelTankCapacity != null && s.fuelTankCapacity > 0) {
    return s.fuelTankCapacity;
  }
  return profileFor(s.classId).defaultTank;
}

function fuelFraction(s: PlannerSnap): number {
  const tank = tankCapacity(s);
  if (tank <= 0 || s.fuel < 0) return 1;
  return s.fuel / tank;
}

function tyresWorn(s: PlannerSnap): boolean {
  return (s.tireWear ?? 0) >= profileFor(s.classId).tireWear;
}

function tyreTreadFromSnap(s: PlannerSnap): TyreTread {
  return normalizeTyreTread(s.tireCompound);
}

function bodyNeedsHintRepair(s: PlannerSnap): boolean {
  const ph = s.partHealth ?? {};
  for (const key of ["body_fl", "body_fr", "body_rl", "body_rr", "bodyFL", "bodyFR", "bodyRL", "bodyRR"]) {
    const health = ph[key];
    if (health != null && health < HINT_BODY_DAMAGE_THRESHOLD) return true;
  }
  return false;
}

function partWearIssue(s: PlannerSnap): string | null {
  const ph = s.partHealth ?? {};
  let worstKey: string | null = null;
  let worst = 100;
  for (const [key, health] of Object.entries(ph)) {
    if (health == null || health >= PART_WEAR_THRESHOLD) continue;
    const k = key.toLowerCase();
    if (k.startsWith("body")) continue;
    if (health < worst) {
      worst = health;
      worstKey = key;
    }
  }
  return worstKey;
}

function formatPartLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildPitCommand(
  s: PlannerSnap,
  wet: number,
  opts: { fuel?: boolean; tyres?: boolean; repairs?: string[] },
): string {
  const tread = wet >= WET_TYRE_THRESHOLD ? "wet" : wet >= INTER_TYRE_THRESHOLD ? "intermediate" : "slick";
  const compound = tread === "slick" ? "medium" : "medium";
  const parts = ["pit"];
  if (opts.fuel) {
    const add = Math.max(1, Math.ceil(tankCapacity(s) - s.fuel));
    parts.push(`fuel=${add}`);
  } else {
    parts.push("fuel=0");
  }
  if (opts.tyres) {
    parts.push(`compound=${compound}`, `tyre_tread=${tread}`, "tires=all");
  } else {
    parts.push("tires=");
  }
  if (opts.repairs?.length) {
    parts.push(`repairs=${opts.repairs.join(",")}`);
  }
  return parts.join("|");
}

export function evaluateCarHint(
  snap: CarSnapshot,
  trackWetness: number,
): EngineerHint | null {
  const s = snap as PlannerSnap;
  if (s.retired || s.inPit || s.inGarage || s.pitQueued) return null;

  const carNumber = String(s.carNumber ?? "?").replace(/^#/, "");
  const tread = tyreTreadFromSnap(s);
  const fuelPct = fuelFraction(s);
  const profile = profileFor(s.classId);

  if (needsEmergencyPit(s)) {
    const flat = Object.entries(s.tyreDeflation ?? {})
      .filter(([, v]) => v === "flat" || v === "soft")
      .map(([w]) => w.toUpperCase());
    let text = "Critical car condition — box immediately.";
    if (flat.length) {
      text = `Tyre deflation on ${flat.join(", ")} — box this lap for fresh rubber.`;
    } else if (fuelPct <= EMERGENCY_FUEL_FRACTION) {
      text = `Fuel critical at ${(fuelPct * 100).toFixed(0)}% — box now for fuel.`;
    } else if ((s.limpMode ?? "none") !== "none") {
      text = `Car in ${s.limpMode} mode — pit for repairs before continuing.`;
    } else if (s.meatballFlag) {
      text = "Meatball flag — pit immediately for mandatory repairs.";
    }
    return {
      hintId: "",
      entryId: s.entryId,
      carNumber,
      category: "emergency",
      text,
      suggestedCommand: buildPitCommand(s, trackWetness, {
        fuel: fuelPct <= EMERGENCY_FUEL_FRACTION,
        tyres: flat.length > 0,
        repairs: hasSevereCarIssue(s) ? ["engine", "body"] : undefined,
      }),
    };
  }

  if (
    trackWetness >= INTER_TYRE_THRESHOLD &&
    needsWeatherTyreSwap(tread, trackWetness)
  ) {
    const target =
      trackWetness >= WET_TYRE_THRESHOLD ? "wet" : "intermediate";
    return {
      hintId: "",
      entryId: s.entryId,
      carNumber,
      category: "wrong_tyre",
      text: `Track is ${trackWetness >= WET_TYRE_THRESHOLD ? "wet" : "damp"} — you're on ${tread} tyres. Box for ${target} rubber.`,
      suggestedCommand: buildPitCommand(s, trackWetness, { tyres: true }),
    };
  }

  if (fuelPct <= profile.fuelCritical) {
    return {
      hintId: "",
      entryId: s.entryId,
      carNumber,
      text: `Fuel at ${(fuelPct * 100).toFixed(0)}% — plan to pit this lap.`,
      category: "fuel",
      suggestedCommand: buildPitCommand(s, trackWetness, { fuel: true }),
    };
  }

  if (tyresWorn(s)) {
    return {
      hintId: "",
      entryId: s.entryId,
      carNumber,
      text: `Tyre wear at ${((s.tireWear ?? 0) * 100).toFixed(0)}% — box for a fresh set.`,
      category: "tyre_wear",
      suggestedCommand: buildPitCommand(s, trackWetness, { tyres: true }),
    };
  }

  const engineDamaged = (s.engineHealth ?? 100) <= ENGINE_DAMAGE_THRESHOLD;
  const bodyDamaged = bodyNeedsHintRepair(s);
  if (engineDamaged || bodyDamaged) {
    const repairs: string[] = [];
    if (engineDamaged) repairs.push("engine");
    if (bodyDamaged) repairs.push("body");
    const detail = engineDamaged
      ? `engine ${(s.engineHealth ?? 100).toFixed(0)}%`
      : "bodywork";
    return {
      hintId: "",
      entryId: s.entryId,
      carNumber,
      category: "damage",
      text: `Car damage (${detail}) — pit for repairs.`,
      suggestedCommand: buildPitCommand(s, trackWetness, { repairs }),
    };
  }

  const wornPart = partWearIssue(s);
  if (wornPart) {
    return {
      hintId: "",
      entryId: s.entryId,
      carNumber,
      category: "part_wear",
      text: `${formatPartLabel(wornPart)} wear is high — schedule a stop for component service.`,
      suggestedCommand: buildPitCommand(s, trackWetness, { repairs: ["body"] }),
    };
  }

  return null;
}

const CATEGORY_PRIORITY: Record<EngineerHintCategory, number> = {
  emergency: 0,
  wrong_tyre: 1,
  fuel: 2,
  damage: 3,
  tyre_wear: 4,
  part_wear: 5,
};

function pickMostUrgent(hints: EngineerHint[]): EngineerHint | null {
  if (!hints.length) return null;
  return hints.sort(
    (a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category],
  )[0]!;
}

export interface EngineerHintTickResult {
  hint: EngineerHint | null;
  autoPaused: boolean;
  autoResumed: boolean;
  timeScale: number;
}

export class EngineerHintManager {
  private activeHint: EngineerHint | null = null;
  private dismissedKeys = new Set<string>();
  private snoozeUntilRaceSec = new Map<string, number>();
  private hintPaused = false;
  private timeScaleBeforeHint = 1;
  private nextHintSeq = 0;

  reset(): void {
    this.activeHint = null;
    this.dismissedKeys.clear();
    this.snoozeUntilRaceSec.clear();
    this.hintPaused = false;
    this.timeScaleBeforeHint = 1;
    this.nextHintSeq = 0;
  }

  getActiveHint(): EngineerHint | null {
    return this.activeHint;
  }

  isHintPaused(): boolean {
    return this.hintPaused;
  }

  dismiss(hintId: string): boolean {
    if (!this.activeHint || this.activeHint.hintId !== hintId) return false;
    const key = `${this.activeHint.entryId}:${this.activeHint.category}`;
    this.dismissedKeys.add(key);
    this.activeHint = null;
    const wasPaused = this.hintPaused;
    this.hintPaused = false;
    return wasPaused;
  }

  /**
   * Evaluate managed cars; returns a new hint to broadcast when one is raised.
   * Caller should pause the sim when autoPaused is true.
   */
  tick(
    snapshots: CarSnapshot[],
    managedEntryIds: string[],
    trackWetness: number,
    raceTimeSec: number,
    timeScale: number,
    paused: boolean,
  ): EngineerHintTickResult {
    if (this.activeHint) {
      const snap = snapshots.find((s) => s.entryId === this.activeHint!.entryId);
      if (!snap || !evaluateCarHint(snap, trackWetness)) {
        const wasHintPaused = this.hintPaused;
        this.activeHint = null;
        this.hintPaused = false;
        return {
          hint: null,
          autoPaused: false,
          autoResumed: wasHintPaused,
          timeScale: this.timeScaleBeforeHint,
        };
      }
      return {
        hint: null,
        autoPaused: false,
        autoResumed: false,
        timeScale: this.timeScaleBeforeHint,
      };
    }

    const managed = new Set(managedEntryIds);
    const candidates: EngineerHint[] = [];
    for (const snap of snapshots) {
      if (!managed.has(snap.entryId)) continue;
      const raw = evaluateCarHint(snap, trackWetness);
      if (!raw) continue;
      const key = `${raw.entryId}:${raw.category}`;
      if (this.dismissedKeys.has(key)) {
        const snoozeUntil = this.snoozeUntilRaceSec.get(key) ?? 0;
        if (raceTimeSec < snoozeUntil) continue;
        this.dismissedKeys.delete(key);
      }
      candidates.push(raw);
    }

    const picked = pickMostUrgent(candidates);
    if (!picked) {
      return {
        hint: null,
        autoPaused: false,
        autoResumed: false,
        timeScale: this.timeScaleBeforeHint,
      };
    }

    const hintId = `hint-${picked.entryId}-${picked.category}-${++this.nextHintSeq}`;
    const hint: EngineerHint = { ...picked, hintId };
    this.activeHint = hint;

    const key = `${hint.entryId}:${hint.category}`;
    this.snoozeUntilRaceSec.set(key, raceTimeSec + SNOOZE_AFTER_DISMISS_SEC);

    let autoPaused = false;
    if (!paused && !this.hintPaused) {
      this.timeScaleBeforeHint = timeScale > 0 ? timeScale : 1;
      this.hintPaused = true;
      autoPaused = true;
    }

    return {
      hint,
      autoPaused,
      autoResumed: false,
      timeScale: this.timeScaleBeforeHint,
    };
  }
}
