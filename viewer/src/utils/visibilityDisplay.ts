export type VisibilityLevel = "good" | "moderate" | "poor" | "critical";

export function visibilityLevel(km: number): VisibilityLevel {
  if (km < 1.5) return "critical";
  if (km < 3) return "poor";
  if (km < 8) return "moderate";
  return "good";
}

export function formatVisibilityKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

/** Show a dedicated visibility readout when conditions are limiting. */
export function shouldHighlightVisibility(km: number): boolean {
  return km < 8;
}
