import type { CarSnapshot } from "../ws/protocol";

/** Prefer sim-provided reason; infer from telemetry when the native field is missing. */
export function resolveRetireReason(snap: CarSnapshot): string {
  const explicit = snap.retireReason?.trim();
  if (explicit) return explicit;
  if (snap.engineHealth <= 0) return "Engine failure";
  if (snap.fuel <= 0) return "Out of fuel";
  return "Retired from race";
}
