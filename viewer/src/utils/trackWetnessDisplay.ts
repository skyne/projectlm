/**
 * UI wetness display — hide ambient sim floor (~1%) while surfacing damp track
 * well before the ~15% inter-tyre window.
 */
export const TRACK_WETNESS_DISPLAY_MIN = 0.05;

export function displayTrackWetnessPercent(raw: number | undefined | null): number | null {
  const wet = Math.max(0, Math.min(1, raw ?? 0));
  if (wet < TRACK_WETNESS_DISPLAY_MIN) return null;
  return Math.round(wet * 100);
}

export function formatTrackWetnessConditions(raw: number | undefined | null): string | null {
  const pct = displayTrackWetnessPercent(raw);
  return pct == null ? null : `Wet ${pct}%`;
}

export function formatTrackWetnessRadar(raw: number | undefined | null): string {
  const pct = displayTrackWetnessPercent(raw);
  return pct == null ? "track dry" : `track ${pct}% wet`;
}

/** Bar width / meta values — zero when below display floor. */
export function trackWetnessBarPercent(raw: number | undefined | null): number {
  const wet = Math.max(0, Math.min(1, raw ?? 0));
  if (wet < TRACK_WETNESS_DISPLAY_MIN) return 0;
  return Math.round(wet * 100);
}
