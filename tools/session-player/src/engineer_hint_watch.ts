/**
 * Co-op pit wall: wait for the human to react to engineer radio hints,
 * then auto-dismiss and resume if they do not.
 */
import type { SessionPlayer } from "./client.js";
import type { EngineerHintPayload } from "./protocol.js";
import { managedEntryIds, snap } from "./pit_strategy.js";

/** User-facing co-op grace period before PitBot dismisses the radio hint. */
const DEFAULT_WAIT_MS = 8_000;

export interface EngineerHintWatchOptions {
  /** Only auto-handle hints in co-op sessions (default true). */
  coopOnly?: boolean;
  waitMs?: number;
}

function isCoop(player: SessionPlayer): boolean {
  return (
    player.state.roster?.sessionMode === "coop" ||
    player.state.clientAssignment?.sessionMode === "coop"
  );
}

function simResumedSinceHint(
  player: SessionPlayer,
  raceTimeAtHint: number,
): boolean {
  const rt = player.state.latestTick?.raceTime;
  if (rt == null) return false;
  return rt > raceTimeAtHint + 0.02;
}

function playerReacted(
  player: SessionPlayer,
  hint: EngineerHintPayload,
  raceTimeAtHint: number,
  seenEvents: Set<string>,
): boolean {
  // session_init.paused is not rebroadcast on engineer-hint pause — use tick motion.
  if (simResumedSinceHint(player, raceTimeAtHint)) return true;

  for (const entryId of managedEntryIds(player)) {
    const s = snap(player, entryId);
    if (!s || s.entryId !== hint.entryId) continue;
    if (s.pitQueued) return true;
    if (s.inPit) return true;
  }

  for (const ev of player.state.events) {
    const key = `${ev.type}|${ev.entryId ?? ""}|${ev.timestamp}|${ev.message}`;
    if (seenEvents.has(key)) continue;
    if (ev.entryId !== hint.entryId) continue;
    if (ev.type === "PitEnter") return true;
    if (ev.type === "CommandAck" && /pit/i.test(ev.message)) return true;
  }

  return false;
}

export function attachEngineerHintWatcher(
  player: SessionPlayer,
  opts: EngineerHintWatchOptions = {},
): () => void {
  const coopOnly = opts.coopOnly !== false;
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;
  const pending = new Map<string, Promise<void>>();

  const handleHint = (hint: EngineerHintPayload) => {
    if (coopOnly && !isCoop(player)) return;
    if (pending.has(hint.hintId)) return;

    const seenEvents = new Set(
      player.state.events.map(
        (ev) => `${ev.type}|${ev.entryId ?? ""}|${ev.timestamp}|${ev.message}`,
      ),
    );
    const raceTimeAtHint = player.state.latestTick?.raceTime ?? 0;

    console.log(
      `[PitBot] RADIO — Car #${hint.carNumber}: ${hint.text}`,
    );
    console.log(
      `[PitBot] Waiting ${Math.round(waitMs / 1000)}s for pit-wall reaction…`,
    );

    const task = (async () => {
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        if (playerReacted(player, hint, raceTimeAtHint, seenEvents)) {
          console.log("[PitBot] Player reacted to engineer hint — standing by");
          return;
        }
        await player.sleep(200);
      }

      console.log(
        "[PitBot] No player reaction — dismissing engineer hint and resuming",
      );
      try {
        player.send("dismiss_engineer_hint", { hintId: hint.hintId });
        if (hint.timeScale > 0) {
          player.send("set_time_scale", { timeScale: hint.timeScale });
        }
        player.send("resume");
      } catch {
        // connection may have closed
      }
    })().finally(() => {
      pending.delete(hint.hintId);
    });

    pending.set(hint.hintId, task);
  };

  const unsub = player.onEngineerHint(handleHint);
  return () => {
    unsub();
    pending.clear();
  };
}
