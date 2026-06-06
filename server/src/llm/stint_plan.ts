import type { CarSnapshot } from "../ws_protocol";
import { ollamaAvailable, ollamaChat } from "./ollama_client";
import { parseJsonBlock } from "./llm_parse";

export type StintCompound = "soft" | "medium" | "hard";
export type StintDriverMode = "push" | "normal" | "conserve";

export interface AiStintPlan {
  entryId: string;
  stintNumber: number;
  compound: StintCompound;
  driverMode: StintDriverMode;
  targetStintSeconds: number;
  /** Pit when fuel drops below this fraction of tank (0–1). */
  fuelStopFraction: number;
  driverChangeNextStop: boolean;
  notes: string;
  offline: boolean;
  model?: string;
}

const CLASS_DEFAULTS: Record<
  string,
  { targetStintSeconds: number; fuelStopFraction: number }
> = {
  Hypercar: { targetStintSeconds: 2700, fuelStopFraction: 0.28 },
  LMP2: { targetStintSeconds: 3000, fuelStopFraction: 0.27 },
  LMGT3: { targetStintSeconds: 2100, fuelStopFraction: 0.30 },
};

const STINT_SYSTEM = `You are a WEC race strategist planning the NEXT stint for one AI car.
Reply with a short note (1 sentence) then a JSON block:

\`\`\`json
{
  "compound": "soft|medium|hard",
  "driverMode": "push|normal|conserve",
  "targetStintSeconds": 1200-4200,
  "fuelStopFraction": 0.15-0.35,
  "driverChangeNextStop": true|false,
  "notes": "brief rationale"
}
\`\`\`

Balance tyre life, fuel, driver swaps, and race length. Use harder compounds for long stints.`;

function defaultsFor(classId: string) {
  return CLASS_DEFAULTS[classId] ?? { targetStintSeconds: 2700, fuelStopFraction: 0.28 };
}

function pickFallbackCompound(stintNumber: number, classId: string): StintCompound {
  const target = defaultsFor(classId).targetStintSeconds;
  if (stintNumber <= 1) return "medium";
  if (target <= 2200) return stintNumber % 2 === 0 ? "hard" : "soft";
  if (stintNumber % 3 === 0) return "hard";
  if (stintNumber % 3 === 1) return "soft";
  return "medium";
}

function clampStintPlan(
  entryId: string,
  stintNumber: number,
  classId: string,
  raw: Partial<AiStintPlan> | null,
  offline: boolean,
  model?: string,
): AiStintPlan {
  const defs = defaultsFor(classId);
  const compound = raw?.compound;
  const driverMode = raw?.driverMode;
  return {
    entryId,
    stintNumber,
    compound:
      compound === "soft" || compound === "medium" || compound === "hard"
        ? compound
        : pickFallbackCompound(stintNumber, classId),
    driverMode:
      driverMode === "push" || driverMode === "normal" || driverMode === "conserve"
        ? driverMode
        : "normal",
    targetStintSeconds: Math.min(
      4200,
      Math.max(1200, Math.round(raw?.targetStintSeconds ?? defs.targetStintSeconds)),
    ),
    fuelStopFraction: Math.min(
      0.35,
      Math.max(0.15, raw?.fuelStopFraction ?? defs.fuelStopFraction),
    ),
    driverChangeNextStop: raw?.driverChangeNextStop === true,
    notes: raw?.notes?.trim() || "Heuristic stint plan",
    offline,
    model,
  };
}

export function fallbackStintPlan(
  snap: CarSnapshot,
  stintNumber: number,
): AiStintPlan {
  const defs = defaultsFor(snap.classId);
  const roster = snap.driverRoster?.length ?? 0;
  const stintSec = snap.driverStintSeconds ?? 0;
  const maxStint = snap.maxDriverStintSeconds ?? 0;
  const driverChangeNextStop =
    roster >= 2 && maxStint > 0 && stintSec >= maxStint * 0.5;

  return clampStintPlan(
    snap.entryId,
    stintNumber,
    snap.classId,
    {
      compound: pickFallbackCompound(stintNumber, snap.classId),
      driverMode: "normal",
      targetStintSeconds: defs.targetStintSeconds,
      fuelStopFraction: defs.fuelStopFraction,
      driverChangeNextStop,
      notes: `Stint ${stintNumber}: ${pickFallbackCompound(stintNumber, snap.classId)} tyres, ~${Math.round(defs.targetStintSeconds / 60)} min target`,
    },
    true,
    "heuristic-fallback",
  );
}

export async function planStintWithLlm(options: {
  snap: CarSnapshot;
  stintNumber: number;
  trackName?: string;
  targetDurationSeconds?: number;
  raceTimeSec?: number;
}): Promise<AiStintPlan> {
  const { snap, stintNumber } = options;
  const online = await ollamaAvailable();
  if (!online) {
    return fallbackStintPlan(snap, stintNumber);
  }

  const context = {
    entryId: snap.entryId,
    team: snap.teamName,
    classId: snap.classId,
    stintNumber,
    lap: snap.lap,
    racePosition: snap.racePosition,
    gapToLeaderSec: snap.gapToLeader,
    fuelLiters: snap.fuel,
    tireWear: snap.tireWear,
    driverStamina: snap.driverStamina,
    driverStintSeconds: snap.driverStintSeconds,
    pitsCompleted: snap.pitCount ?? 0,
    track: options.trackName ?? "Unknown",
    raceRemainingSec: Math.max(
      0,
      (options.targetDurationSeconds ?? 0) - (options.raceTimeSec ?? 0),
    ),
  };

  try {
    const result = await ollamaChat(
      STINT_SYSTEM,
      `Plan stint ${stintNumber}:\n${JSON.stringify(context, null, 2)}`,
      { timeoutMs: 30_000 },
    );
    const parsed = parseJsonBlock<Partial<AiStintPlan>>(result.text);
    return clampStintPlan(
      snap.entryId,
      stintNumber,
      snap.classId,
      parsed,
      false,
      result.model,
    );
  } catch {
    return fallbackStintPlan(snap, stintNumber);
  }
}
