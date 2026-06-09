/**
 * Co-op PitBot wrapper — drives the player's team cars via WebSocket.
 * Core logic lives in server/src/game/pitbot/.
 */
import type { SessionPlayer } from "./client.js";
import type { CarSnapshot } from "./protocol.js";
import {
  classResults,
  fmtLap,
  gridSetupCommands,
  initCarState as initPitBotCarState,
  sortedTeamClasses,
  teamResultsByClass,
  tickPitBot,
  type CarPitState,
} from "../../../server/src/game/pitbot/pit_wall.js";
import type { WeekendSessionType } from "./weekend_sessions.js";
import { isTimingSession } from "./weekend_sessions.js";
import { resolveBriefingTactics } from "../../../server/src/game/briefing_tactics.js";
import type { EntrySessionBriefing } from "./protocol.js";

export type ExtSnap = CarSnapshot & {
  pitQueued?: boolean;
  classPosition?: number;
  driverMode?: string;
  fuelTankCapacity?: number;
  inGarage?: boolean;
  bestLapTime?: number;
  lastLapTime?: number;
  tireWear?: number;
  coolantTempC?: number;
  driverStintSeconds?: number;
  maxDriverStintSeconds?: number;
  driverStamina?: number;
  activeDriverIndex?: number;
  driverRoster?: Array<{ name: string; active?: boolean }>;
  serviceabilityFactor?: number;
  driverChangeFactor?: number;
  tireCompound?: string;
  pendingPenalty?: string;
  lapsToComply?: number;
  penaltyReason?: string;
  meatballFlag?: boolean;
  blackFlag?: boolean;
};

export type { CarPitState };

function managedEntries(player: SessionPlayer): string[] {
  return (
    player.state.sessionInit?.managedEntryIds ??
    player.state.clientAssignment?.entryIds ??
    []
  );
}

export function snap(player: SessionPlayer, entryId: string): ExtSnap | null {
  return (
    (player.state.latestTick?.snapshots.find((x) => x.entryId === entryId) as ExtSnap) ??
    null
  );
}

function send(player: SessionPlayer, entryId: string, cmd: string): number {
  const b = player.state.errors.length;
  player.send("submit_command", { entryId, command: cmd });
  return b;
}

function submitCommand(player: SessionPlayer, entryId: string, cmd: string): boolean {
  const b = send(player, entryId, cmd);
  return player.state.errors.length === b;
}

export function initCarState(
  player: SessionPlayer,
  wet = 0,
  options?: { minLap?: number; lastPitLap?: number },
): Map<string, CarPitState> {
  return initPitBotCarState(managedEntries(player), wet, options);
}

/** Lap count for managed entries when reconnecting mid-session. */
export function managedMinLap(player: SessionPlayer): number {
  const entries = managedEntries(player);
  const snaps = player.state.latestTick?.snapshots ?? [];
  let min = 0;
  for (const id of entries) {
    const lap = snaps.find((s) => s.entryId === id)?.lap ?? 0;
    if (lap > min) min = lap;
  }
  return min;
}

export function timeScaleFor(phase: WeekendSessionType): number {
  if (phase === "qualifying") return 60;
  if (phase === "practice") return 50;
  return 40;
}

/** One tick of co-op pit-wall logic; returns log lines for notable actions. */
function briefingCtx(player: SessionPlayer, phase: WeekendSessionType) {
  const init = player.state.sessionInit as {
    carBriefingsByEntryId?: Record<string, EntrySessionBriefing>;
    strategistSkill?: number;
    raceTime?: number;
  } | null;
  const briefings = init?.carBriefingsByEntryId ?? {};
  const snapshots = (player.state.latestTick?.snapshots ?? []) as ExtSnap[];
  const classByEntry = new Map(snapshots.map((s) => [s.entryId, s.classId]));

  return {
    getBriefingTactics: (entryId: string) => {
      const raw = briefings[entryId];
      if (!raw) return undefined;
      return resolveBriefingTactics(
        {
          carId: "",
          briefingId: raw.briefingId,
          priority: raw.priority,
          teammatePolicy: raw.teammatePolicy,
          gapHoldSec: raw.gapHoldSec,
        },
        phase,
        classByEntry.get(entryId) ?? "Hypercar",
      );
    },
    strategistSkill: init?.strategistSkill ?? 50,
    raceTimeSec: player.state.latestTick?.raceTime ?? init?.raceTime ?? 0,
  };
}

export function tickPitWall(
  player: SessionPlayer,
  phase: WeekendSessionType,
  carState: Map<string, CarPitState>,
): string[] {
  const wet = player.raceControl()?.trackWetness ?? 0;
  const snapshots = (player.state.latestTick?.snapshots ?? []) as ExtSnap[];
  const entries = managedEntries(player);
  const bctx = briefingCtx(player, phase);

  const actions = tickPitBot(
    snapshots,
    entries,
    carState,
    {
      phase,
      wet,
      raceTimeSec: bctx.raceTimeSec ?? player.state.latestTick?.raceTime ?? 0,
      getBriefingTactics: bctx.getBriefingTactics,
      strategistSkill: bctx.strategistSkill,
    },
    (entryId, cmd) => submitCommand(player, entryId, cmd),
  );

  return actions
    .filter((a) => a.label)
    .map((a) => {
      const num = snapshots.find((s) => s.entryId === a.entryId)?.carNumber ?? "?";
      return `#${num} ${a.label}`;
    });
}

export function gridSetup(player: SessionPlayer): void {
  const wet = player.raceControl()?.trackWetness ?? 0;
  const snapshots = (player.state.latestTick?.snapshots ?? []) as ExtSnap[];
  const entries = managedEntries(player);
  const phase =
    (player.state.sessionInit as { weekendSessionType?: WeekendSessionType } | null)
      ?.weekendSessionType ?? "race";
  const bctx = briefingCtx(player, phase);
  for (const action of gridSetupCommands(
    snapshots,
    entries,
    wet,
    undefined,
    bctx.getBriefingTactics,
  )) {
    send(player, action.entryId, action.command);
  }
}

export { fmtLap, classResults, isTimingSession, sortedTeamClasses };

const CLASS_LABEL: Record<string, string> = {
  Hypercar: "Hypercar",
  LMP2: "LMP2",
  LMGT3: "GT3",
};

export function classDisplayLabel(classId: string): string {
  return CLASS_LABEL[classId] ?? classId;
}

/** Team cars grouped by class — uses managed entry IDs from the connected player. */
export function teamClassResults(
  player: SessionPlayer,
  fallbackResults?: Array<{
    entryId: string;
    teamName: string;
    carNumber: string | number;
    classId: string;
    position: number;
    bestLapTime?: number;
    classPosition?: number;
  }>,
): Record<string, CarSnapshot[]> {
  const entryIds = managedEntries(player);
  const tickSnaps = player.state.latestTick?.snapshots;
  const snapshots = Array.isArray(tickSnaps)
    ? tickSnaps
    : Array.isArray(fallbackResults)
      ? (fallbackResults as CarSnapshot[])
      : [];
  return teamResultsByClass(snapshots, { entryIds });
}

export function classPosition(s: CarSnapshot & { position?: number }): number | undefined {
  return s.classPosition ?? s.position;
}

/** Managed entry IDs for the connected player (co-op pit wall). */
export function managedEntryIds(player: SessionPlayer): string[] {
  return managedEntries(player);
}
