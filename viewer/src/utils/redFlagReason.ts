import type { RaceControlPayload } from "../ws/protocol";
import { formatVisibilityKm } from "./visibilityDisplay";

/** Live red-flag reason for UI when deploy event is not in the log buffer. */
export function deriveRedFlagReason(rc: RaceControlPayload | undefined): string | null {
  if (!rc) return null;
  const phase = (rc.flagPhase ?? "green").toLowerCase();
  if (phase !== "red_flag" && rc.redFlagActive !== true) return null;
  if (rc.redFlagReason?.trim()) return rc.redFlagReason.trim();

  // Keep in sync with kRedFlagDeployVisibilityKm in src/sim/race_control.cpp (0.5 km).
  const vis = rc.visibilityKm ?? 10;
  if (vis < 0.5) return `Visibility too low (${formatVisibilityKm(vis)})`;
  if (rc.obstructionsOnTrack > 0) {
    const n = rc.obstructionsOnTrack;
    return `Track blocked (${n} obstruction${n === 1 ? "" : "s"})`;
  }
  return "Session stopped — red flag";
}
