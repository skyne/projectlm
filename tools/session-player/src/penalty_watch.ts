/**
 * Co-pilot callouts for penalties and race-control actions on managed team cars.
 */
import type { SessionPlayer } from "./client.js";
import type { SimEvent } from "./protocol.js";
import { penaltyDisplayName } from "../../../server/src/game/pitbot/pit_wall.js";
import { managedEntryIds, snap } from "./pit_strategy.js";

const MANAGED_CALLOUT_TYPES = new Set([
  "PenaltyIssued",
  "PenaltyWarning",
  "MeatballFlag",
  "BlackFlag",
  "DriveThroughServed",
  "StopGoServed",
  "Disqualified",
]);

function carNumber(player: SessionPlayer, entryId?: string): string {
  if (!entryId) return "?";
  const s = snap(player, entryId);
  return String(s?.carNumber ?? "?");
}

/** Strip leading "TeamName: " from sim event messages when present. */
function eventDetail(message: string): string {
  const idx = message.indexOf(": ");
  if (idx > 0 && idx < 48) return message.slice(idx + 2);
  return message;
}

export function formatPenaltyCallout(
  carNumberLabel: string,
  ev: SimEvent,
): string | null {
  const prefix = `#${carNumberLabel}`;
  const detail = eventDetail(ev.message);

  switch (ev.type) {
    case "PenaltyIssued":
      return `${prefix} PENALTY — ${detail}`;
    case "PenaltyWarning":
      return `${prefix} WARNING — ${detail}`;
    case "MeatballFlag":
      return `${prefix} MEATBALL — ${detail}`;
    case "BlackFlag":
      return `${prefix} BLACK FLAG — ${detail}`;
    case "DriveThroughServed":
      return `${prefix} Served drive-through`;
    case "StopGoServed":
      return `${prefix} Served stop-and-go`;
    case "Disqualified":
      return `${prefix} DISQUALIFIED — ${detail}`;
    default:
      return null;
  }
}

function formatSnapPenaltyCallout(
  carNumberLabel: string,
  penalty: string,
  lapsToComply?: number,
  penaltyReason?: string,
): string {
  const name = penaltyDisplayName(penalty);
  const laps =
    lapsToComply != null && lapsToComply > 0
      ? ` — comply within ${lapsToComply} lap(s)`
      : "";
  const reason = penaltyReason?.trim();
  const reasonBit = reason ? ` (${reason})` : "";
  return `#${carNumberLabel} PENALTY pending — ${name}${laps}${reasonBit}`;
}

/** Watch WS events + snapshot transitions; log managed-team penalty callouts. */
export function attachPenaltyWatcher(player: SessionPlayer): () => void {
  const seen = new Set<string>();
  const lastPenalty = new Map<string, string>();
  const lastMeatball = new Map<string, boolean>();

  const log = (line: string) => console.log(`[PitBot]   ${line}`);

  const unsubEvents = player.onEvents((events) => {
    const managed = new Set(managedEntryIds(player));
    for (const ev of events) {
      if (!MANAGED_CALLOUT_TYPES.has(ev.type)) continue;
      if (ev.entryId && !managed.has(ev.entryId)) continue;

      const key = `${ev.type}|${ev.entryId ?? ""}|${ev.timestamp}|${ev.message}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const line = formatPenaltyCallout(carNumber(player, ev.entryId), ev);
      if (line) log(line);
    }
  });

  const unsubTick = player.onTick(() => {
    for (const entryId of managedEntryIds(player)) {
      const s = snap(player, entryId);
      if (!s) continue;

      const penalty = s.pendingPenalty ?? "none";
      const prevPenalty = lastPenalty.get(entryId) ?? "none";
      if (penalty !== "none" && prevPenalty === "none") {
        const key = `snap|${entryId}|penalty|${penalty}|${s.lapsToComply ?? 0}`;
        if (!seen.has(key)) {
          seen.add(key);
          log(
            formatSnapPenaltyCallout(
              carNumber(player, entryId),
              penalty,
              s.lapsToComply,
              s.penaltyReason,
            ),
          );
        }
      }
      lastPenalty.set(entryId, penalty);

      const meatball = s.meatballFlag === true;
      const hadMeatball = lastMeatball.get(entryId) ?? false;
      if (meatball && !hadMeatball) {
        const key = `snap|${entryId}|meatball`;
        if (!seen.has(key)) {
          seen.add(key);
          log(`#${carNumber(player, entryId)} MEATBALL — pit immediately for repairs`);
        }
      }
      lastMeatball.set(entryId, meatball);
    }
  });

  return () => {
    unsubEvents();
    unsubTick();
  };
}
