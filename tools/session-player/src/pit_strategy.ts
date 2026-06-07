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
  tickPitBot,
  type CarPitState,
} from "../../../server/src/game/pitbot/pit_wall.js";
import type { WeekendSessionType } from "./weekend_sessions.js";
import { isTimingSession } from "./weekend_sessions.js";

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
export function tickPitWall(
  player: SessionPlayer,
  phase: WeekendSessionType,
  carState: Map<string, CarPitState>,
): string[] {
  const wet = player.raceControl()?.trackWetness ?? 0;
  const snapshots = (player.state.latestTick?.snapshots ?? []) as ExtSnap[];
  const entries = managedEntries(player);

  const actions = tickPitBot(
    snapshots,
    entries,
    carState,
    { phase, wet },
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
  for (const action of gridSetupCommands(snapshots, entries, wet)) {
    send(player, action.entryId, action.command);
  }
}

export { fmtLap, classResults, isTimingSession };

/** Managed entry IDs for the connected player (co-op pit wall). */
export function managedEntryIds(player: SessionPlayer): string[] {
  return managedEntries(player);
}
