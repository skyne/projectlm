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
