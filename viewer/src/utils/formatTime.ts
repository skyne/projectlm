export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const whole = Math.floor(secs);
  const millis = Math.round((secs - whole) * 1000);
  if (mins > 0) {
    return `${mins}:${whole.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${whole}.${millis.toString().padStart(3, "0")}`;
}

export function formatGap(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `+${seconds.toFixed(1)}`;
  return `+${formatLapTime(seconds)}`;
}

/** Shorter gap string for narrow leaderboard columns (drops ms, shows lap down). */
export function formatGapCompact(seconds: number, lapDiff = 0): string {
  if (lapDiff > 0) {
    if (!Number.isFinite(seconds) || seconds <= 0) return `+${lapDiff}L`;
    if (seconds < 60) return `+${lapDiff}L ${seconds.toFixed(1)}`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `+${lapDiff}L ${mins}:${secs.toString().padStart(2, "0")}`;
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `+${seconds.toFixed(1)}`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `+${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Race duration / stint time — may exceed one hour. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
