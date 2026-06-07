/**
 * Autonomous full WEC weekend: practice → qualifying → race.
 *
 * Usage:
 *   npx tsx src/weekend_orchestrator.ts [--url ws://localhost:8765] [--role host|player]
 *
 * Co-op: join as player — uses continue_weekend_session between sessions.
 * Solo: join as host (first client) — uses start_round / continue_weekend_session.
 */
import { SessionPlayer } from "./client.js";
import type {
  MetaStatePayload,
  RaceCompletePayload,
  WeekendSessionType,
} from "./protocol.js";
import {
  classResults,
  fmtLap,
  gridSetup,
  initCarState,
  managedEntryIds,
  managedMinLap,
  snap,
  tickPitWall,
  timeScaleFor,
} from "./pit_strategy.js";
import {
  isTimingSession,
  resolveNextSession,
  sessionTargetSeconds,
} from "./weekend_sessions.js";

const URL = process.argv.find((a) => a.startsWith("ws://")) ?? "ws://localhost:8765";
const ROLE = (process.argv.find((a) => a === "--role") &&
  process.argv[process.argv.indexOf("--role") + 1]) as "host" | "player" | undefined;
const ADVANCE_FLAG = process.argv.find((a) => a === "--advance") &&
  process.argv[process.argv.indexOf("--advance") + 1];
const TEAM = "SkyTech";

export type AdvanceMode = "auto" | "host";

function parseRole(): "host" | "player" {
  if (ROLE === "host" || ROLE === "player") return ROLE;
  return "player";
}

function parseAdvanceMode(role: "host" | "player"): AdvanceMode {
  if (ADVANCE_FLAG === "auto" || ADVANCE_FLAG === "host") return ADVANCE_FLAG;
  // Co-op: host clicks Continue in the viewer — bot must not double-start.
  return role === "host" ? "auto" : "host";
}

function sessionType(player: SessionPlayer): WeekendSessionType {
  const init = player.state.sessionInit as {
    weekendSessionType?: WeekendSessionType;
    targetDurationSeconds?: number;
  } | null;
  if (init?.weekendSessionType) return init.weekendSessionType;
  const t = init?.targetDurationSeconds ?? 0;
  if (t === 900) return "qualifying";
  if (t === 3600) return "practice";
  return "race";
}

function canStartSessions(player: SessionPlayer): boolean {
  const perms = player.state.clientAssignment?.permissions ?? [];
  return perms.includes("start_round") || perms.includes("continue_weekend_session");
}

function sessionFingerprint(init: SessionPlayer["state"]["sessionInit"]): string {
  if (!init) return "";
  return JSON.stringify({
    weekend: init.weekendSessionType,
    target: init.targetDurationSeconds,
    active: init.raceActive,
    complete: init.raceComplete,
    raceTime: init.raceTime,
  });
}

/** Wait for host (viewer button) to start the next session — avoids double start_round. */
async function waitForHostToStartSession(
  player: SessionPlayer,
  afterFingerprint: string,
  nextLabel: string,
  timeoutMs = 300_000,
): Promise<void> {
  console.log(
    `[PitBot] Waiting for host to start ${nextLabel} in the viewer (click Continue — do not double-click)…`,
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const init = player.state.sessionInit;
    const fp = sessionFingerprint(init);
    if (init?.raceActive && !init.raceComplete && fp !== afterFingerprint) {
      console.log(`[PitBot] Host started ${init.weekendSessionType ?? nextLabel}`);
      return;
    }
    await player.sleep(1000);
  }
  throw new Error(`Timed out waiting for host to start ${nextLabel}`);
}

async function startNextSession(player: SessionPlayer): Promise<void> {
  const perms = player.state.clientAssignment?.permissions ?? [];
  const useContinue = perms.includes("continue_weekend_session");
  const useStart = perms.includes("start_round");

  player.state.raceComplete = null;
  const errorsBefore = player.state.errors.length;
  const sessionBefore = JSON.stringify(player.state.sessionInit);

  if (useContinue) {
    player.send("continue_weekend_session", {});
  } else if (useStart) {
    player.send("start_round", {});
  } else {
    throw new Error("No permission to start weekend sessions (need host or continue_weekend_session)");
  }

  await player.sleep(800);

  if (player.state.errors.length > errorsBefore) {
    throw new Error(player.state.errors.at(-1) ?? "Failed to start session");
  }

  await player.waitFor(
    () =>
      player.state.sessionInit &&
      JSON.stringify(player.state.sessionInit) !== sessionBefore
        ? player.state.sessionInit
        : null,
    15000,
    "Timed out waiting for new session_init after start",
  );
}

async function waitForRaceComplete(
  player: SessionPlayer,
  timeoutMs: number,
): Promise<RaceCompletePayload> {
  player.state.raceComplete = null;
  const payload = await player.waitFor(
    () => player.state.raceComplete,
    timeoutMs,
    "Timed out waiting for race_complete",
  );
  return payload!;
}

async function runSession(player: SessionPlayer, phase: WeekendSessionType): Promise<RaceCompletePayload> {
  const wet = player.raceControl()?.trackWetness ?? 0;
  await player.sleep(200);
  const minLap = managedMinLap(player);
  const carState = initCarState(player, wet, { minLap });
  const midRace = minLap >= 3;
  if (!midRace) {
    gridSetup(player);
    await player.sleep(300);
  }

  const scale = timeScaleFor(phase);
  player.send("set_time_scale", { timeScale: scale });
  player.send("resume", {});
  await player.sleep(400);

  const target =
    player.state.sessionInit?.targetDurationSeconds ??
    sessionTargetSeconds(phase, player.state.sessionInit?.raceFormat);
  const timing = isTimingSession(phase);

  console.log(
    `[PitBot] ▶ ${phase.toUpperCase()} @ ${scale}× (${Math.floor(target / 60)}m sim)`,
  );

  let lastLog = 0;
  let lastRaceTime = -1;
  let lastRaceAdvanceMs = Date.now();
  const startMs = Date.now();
  const maxRealMs = timing
    ? 5 * 60 * 1000
    : Math.ceil((target / scale) * 1000 * 1.8) + 120_000;

  while (Date.now() - startMs < maxRealMs) {
    if (player.state.raceComplete) break;
    const tick = player.state.latestTick;
    if (tick && (tick.raceTime ?? 0) >= target - 2) break;

    const rt = tick?.raceTime ?? 0;
    if (rt > lastRaceTime + 0.5) {
      lastRaceTime = rt;
      lastRaceAdvanceMs = Date.now();
    } else if (Date.now() - lastRaceAdvanceMs > 25_000) {
      console.log("[PitBot] Sim stalled — re-sending resume + time scale");
      player.send("set_time_scale", { timeScale: scale });
      player.send("resume", {});
      lastRaceAdvanceMs = Date.now();
    }

    const notes = tickPitWall(player, phase, carState);
    for (const n of notes) console.log(`[PitBot]   ${n}`);

    const now = Date.now();
    if (now - lastLog >= 12000) {
      lastLog = now;
      const rt = tick?.raceTime ?? 0;
      const entries = managedEntryIds(player);
      const lines = entries.map((id) => {
        const s = snap(player, id);
        const st = carState.get(id)!;
        if (!s) return "";
        return `#${s.carNumber} P${s.classPosition ?? "?"} ${fmtLap(st.bestLap)}`;
      }).filter(Boolean);
      console.log(
        `[PitBot]   ${Math.floor(rt / 60)}:${String(Math.floor(rt % 60)).padStart(2, "0")} | ${lines.join(" | ")}`,
      );
    }

    await player.sleep(timing ? 1500 : 2000);
  }

  if (!player.state.raceComplete) {
    const graceMs = Math.min(
      600_000,
      Math.max(120_000, Math.ceil((target / scale) * 250)),
    );
    return await waitForRaceComplete(player, graceMs);
  }
  return player.state.raceComplete!;
}

function reportSessionComplete(
  player: SessionPlayer,
  phase: WeekendSessionType,
  payload: RaceCompletePayload,
): void {
  const { hypercar, gt3 } = classResults(player, TEAM);

  if (isTimingSession(phase)) {
    const tick = player.state.latestTick;
    for (const cls of ["Hypercar", "LMGT3"] as const) {
      const ranked = [...(tick?.snapshots ?? [])]
        .filter((s) => s.classId === cls && (s.bestLapTime ?? 0) > 0)
        .sort((a, b) => (a.bestLapTime ?? 1e9) - (b.bestLapTime ?? 1e9));
      const ours = ranked.filter((s) => s.teamName.includes(TEAM));
      const leader = ranked[0];
      const ourBest = ours[0];
      if (leader && ourBest) {
        const won = ourBest.entryId === leader.entryId;
        console.log(
          `[PitBot] ${cls} ${phase}: ${won ? "POLE/LEAD" : `best #${ourBest.carNumber} ${fmtLap(ourBest.bestLapTime)}`} | leader #${leader.carNumber} ${fmtLap(leader.bestLapTime)}`,
        );
      }
    }
  } else {
    for (const s of [...hypercar, ...gt3]) {
      console.log(`[PitBot]   #${s.carNumber} (${s.classId}) class P${s.classPosition ?? "?"}`);
    }
    const hyperLead = payload.results
      .filter((r) => r.classId === "Hypercar")
      .sort((a, b) => a.position - b.position)[0];
    const gt3Lead = payload.results
      .filter((r) => r.classId === "LMGT3")
      .sort((a, b) => a.position - b.position)[0];
    const ourHyper = hypercar.sort((a, b) => (a.classPosition ?? 99) - (b.classPosition ?? 99))[0];
    const ourGt3 = gt3.sort((a, b) => (a.classPosition ?? 99) - (b.classPosition ?? 99))[0];
    if (ourHyper) {
      const won = ourHyper.carNumber === hyperLead?.carNumber;
      console.log(
        `[PitBot] Hypercar: ${won ? "CLASS WIN" : `P${ourHyper.classPosition} (winner #${hyperLead?.carNumber})`}`,
      );
    }
    if (ourGt3) {
      const won = ourGt3.carNumber === gt3Lead?.carNumber;
      console.log(
        `[PitBot] GT3: ${won ? "CLASS WIN" : `P${ourGt3.classPosition} (winner #${gt3Lead?.carNumber})`}`,
      );
    }
  }
}

function seasonRoundsRemaining(meta: MetaStatePayload): number {
  return meta.calendar.filter(
    (e) =>
      e.eventType === "race" &&
      (e.format ?? "").trim().toLowerCase() !== "test" &&
      !e.completed,
  ).length;
}

function currentRoundEvent(meta: MetaStatePayload) {
  return meta.calendar.find((e) => e.round === meta.currentRound);
}

export async function runWeekendLoop(
  player: SessionPlayer,
  advance: AdvanceMode,
): Promise<void> {
  const meta = player.state.metaState;
  if (!meta) throw new Error("meta_state missing");

  let next = resolveNextSession(meta);
  const live = player.state.sessionInit;
  if (live?.raceActive && !live.raceComplete) {
    next = live.weekendSessionType ?? next ?? "practice";
  } else if (!next) {
    console.log("[PitBot] ✓ Weekend already complete");
    return;
  }

  const liveFp = sessionFingerprint(player.state.sessionInit);
  if (!(player.state.sessionInit?.raceActive && !player.state.sessionInit.raceComplete)) {
    const label = next;
    if (advance === "auto") {
      console.log(`[PitBot] Starting ${label}…`);
      await startNextSession(player);
    } else {
      await waitForHostToStartSession(player, liveFp, label);
    }
    await player.sleep(500);
  }

  while (next) {
    const phase = sessionType(player);
    const payload = await runSession(player, phase);
    reportSessionComplete(player, phase, payload);

    next =
      payload.nextWeekendSession ??
      resolveNextSession(player.state.metaState ?? meta);
    if (player.state.metaState) {
      const fromMeta = resolveNextSession(player.state.metaState);
      if (fromMeta) next = fromMeta;
    }

    if (!next) {
      console.log("[PitBot] ✓ Weekend complete");
      break;
    }

    const fpAfter = sessionFingerprint(player.state.sessionInit);
    console.log(`[PitBot] → next: ${next}`);
    if (advance === "auto") {
      await player.sleep(1500);
      await startNextSession(player);
    } else {
      await waitForHostToStartSession(player, fpAfter, next);
    }
    await player.sleep(500);
  }
}

export async function runFullSeason(opts: {
  url: string;
  displayName: string;
  role: "host" | "player";
  advance?: AdvanceMode;
}): Promise<void> {
  const player = new SessionPlayer();
  await player.connect({
    url: opts.url,
    displayName: opts.displayName,
    requestedRole: opts.role,
    timeoutMs: 10000,
  });

  if (!canStartSessions(player)) {
    throw new Error(
      `${opts.displayName} joined as ${player.state.clientAssignment?.role} — cannot advance weekend.`,
    );
  }

  await player.waitFor(() => player.state.metaState, 5000, "meta_state timeout");

  const advance = opts.advance ?? parseAdvanceMode(opts.role);
  let remaining = seasonRoundsRemaining(player.state.metaState!);
  console.log(`[PitBot] Season: ${remaining} race round(s) remaining`);

  while (remaining > 0) {
    const meta = player.state.metaState!;
    const event = currentRoundEvent(meta);
    if (!event || event.completed) break;

    console.log(
      `[PitBot] ═══ Round ${event.round}: ${event.eventName} (${event.format}) ═══`,
    );
    await runWeekendLoop(player, advance);
    await player.sleep(2000);

    const updated = player.state.metaState ?? meta;
    remaining = seasonRoundsRemaining(updated);
    console.log(`[PitBot] Rounds left: ${remaining}`);
  }

  console.log("[PitBot] ✓ Season complete");
  player.close();
}

export async function runFullWeekend(opts: {
  url: string;
  displayName: string;
  role: "host" | "player";
  advance?: AdvanceMode;
}): Promise<void> {
  const player = new SessionPlayer();
  await player.connect({
    url: opts.url,
    displayName: opts.displayName,
    requestedRole: opts.role,
    timeoutMs: 10000,
  });

  if (!canStartSessions(player)) {
    throw new Error(
      `${opts.displayName} joined as ${player.state.clientAssignment?.role} — cannot advance weekend. Use --role host when solo, or ensure continue_weekend_session is enabled.`,
    );
  }

  await player.waitFor(() => player.state.metaState, 5000, "meta_state timeout");

  const advance = opts.advance ?? parseAdvanceMode(opts.role);
  await runWeekendLoop(player, advance);
  player.close();
}

async function main() {
  const role = parseRole();
  await runFullWeekend({
    url: URL,
    displayName: "PitBot",
    role,
    advance: parseAdvanceMode(role),
  });
}

const isDirectRun =
  process.argv[1]?.includes("weekend_orchestrator") ||
  process.argv.includes("weekend");

if (isDirectRun) {
  main().catch((err) => {
    console.error("[PitBot]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
