/** tyreWear: 0 = fresh, 1 = destroyed */
export function formatTyreWear(wear: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, wear)) * 100);
  return `${pct}%`;
}

export interface WheelWearValues {
  FL: number;
  FR: number;
  RL: number;
  RR: number;
}

export function wheelWearFromSnapshot(snap: {
  tireWear?: number;
  tireWearFL?: number;
  tireWearFR?: number;
  tireWearRL?: number;
  tireWearRR?: number;
}): WheelWearValues {
  const fallback = snap.tireWear ?? 0;
  return {
    FL: snap.tireWearFL ?? fallback,
    FR: snap.tireWearFR ?? fallback,
    RL: snap.tireWearRL ?? fallback,
    RR: snap.tireWearRR ?? fallback,
  };
}

export function worstWheelWear(wear: WheelWearValues): number {
  return Math.max(wear.FL, wear.FR, wear.RL, wear.RR);
}

export function wearBand(wear: number): "" | "warn" | "critical" {
  if (wear >= 0.75) return "critical";
  if (wear >= 0.5) return "warn";
  return "";
}

export function buildWheelWearGridHtml(
  wear: WheelWearValues,
  highlightWheel?: string,
): string {
  const cells = (["FL", "FR", "RL", "RR"] as const)
    .map((corner) => {
      const value = wear[corner];
      const band = wearBand(value);
      const hot =
        highlightWheel === corner ? " wheel-wear-hot" : "";
      return `
        <div class="wheel-wear-cell wheel-wear-${corner.toLowerCase()}${band ? ` wheel-wear-${band}` : ""}${hot}">
          <span class="wheel-wear-label">${corner}</span>
          <strong>${formatTyreWear(value)}</strong>
        </div>`;
    })
    .join("");
  return `<div class="wheel-wear-grid">${cells}</div>`;
}

export interface WheelTempValues {
  FL: number;
  FR: number;
  RL: number;
  RR: number;
}

export function wheelTempFromSnapshot(snap: {
  tireTempC?: number;
  tireTempFL?: number;
  tireTempFR?: number;
  tireTempRL?: number;
  tireTempRR?: number;
}): WheelTempValues {
  const fallback = snap.tireTempC ?? 85;
  return {
    FL: snap.tireTempFL ?? fallback,
    FR: snap.tireTempFR ?? fallback,
    RL: snap.tireTempRL ?? fallback,
    RR: snap.tireTempRR ?? fallback,
  };
}

export function hottestWheelTemp(temps: WheelTempValues): number {
  return Math.max(temps.FL, temps.FR, temps.RL, temps.RR);
}

export function buildWheelTyreGridHtml(
  wear: WheelWearValues,
  temps: WheelTempValues,
  highlightWheel?: string,
  compact = false,
): string {
  const gridClass = compact ? "wheel-tyre-grid wheel-tyre-grid-compact" : "wheel-tyre-grid";
  const cells = (["FL", "FR", "RL", "RR"] as const)
    .map((corner) => {
      const wearValue = wear[corner];
      const tempValue = temps[corner];
      const wearLevel = wearBand(wearValue);
      const tempLevel = tyreTempBand(tempValue);
      const hot =
        highlightWheel === corner ? " wheel-tyre-hot" : "";
      return `
        <div class="wheel-tyre-cell wheel-tyre-${corner.toLowerCase()} tyre-${tempLevel}${wearLevel ? ` wheel-wear-${wearLevel}` : ""}${hot}">
          <span class="wheel-tyre-label">${corner}</span>
          <strong class="wheel-tyre-temp">${formatTyreTemp(tempValue)}</strong>
          <span class="wheel-tyre-wear">${formatTyreWear(wearValue)}</span>
        </div>`;
    })
    .join("");
  return `<div class="${gridClass}">${cells}</div>`;
}

export interface TyreSnapshotFields {
  tireWear?: number;
  tireWearFL?: number;
  tireWearFR?: number;
  tireWearRL?: number;
  tireWearRR?: number;
  tireTempC?: number;
  tireTempFL?: number;
  tireTempFR?: number;
  tireTempRL?: number;
  tireTempRR?: number;
  lastMistakeRemainingSec?: number;
  lastMistakeWheel?: string;
}

export function mistakeHighlightWheel(snap: TyreSnapshotFields): string | undefined {
  if (snap.lastMistakeRemainingSec && snap.lastMistakeRemainingSec > 0) {
    return snap.lastMistakeWheel;
  }
  return undefined;
}

export function buildTyreTelemetryPanelHtml(
  snap: TyreSnapshotFields,
  options: { compact?: boolean; showSummary?: boolean } = {},
): string {
  const { compact = false, showSummary = true } = options;
  const wheelWear = wheelWearFromSnapshot(snap);
  const wheelTemps = wheelTempFromSnapshot(snap);
  const maxWheelWear = worstWheelWear(wheelWear);
  const maxWheelTemp = hottestWheelTemp(wheelTemps);
  const maxWearBand = wearBand(maxWheelWear);
  const maxTempBand = tyreTempBand(maxWheelTemp);
  const highlightWheel = mistakeHighlightWheel(snap);

  const summary = showSummary
    ? `
      <div class="tyre-grid-summary">
        <strong class="tyre-${maxTempBand} ${maxTempBand === "hot" ? "coolant-alert" : ""}">${formatTyreTemp(maxWheelTemp)} peak</strong>
        <strong class="${maxWearBand === "critical" ? "health-critical" : maxWearBand === "warn" ? "health-warn" : ""}">${formatTyreWear(maxWheelWear)} worst</strong>
      </div>`
    : "";

  return `
    <div class="tyre-telemetry-panel${compact ? " tyre-telemetry-panel-compact" : ""}">
      ${summary}
      ${buildWheelTyreGridHtml(wheelWear, wheelTemps, highlightWheel, compact)}
    </div>`;
}

export function formatTyreTemp(tempC: number | undefined): string {
  if (!Number.isFinite(tempC)) return "—";
  return `${Math.round(tempC!)}°C`;
}

export type TyreTempBand = "cold" | "optimal" | "warm" | "hot";

export function tyreTempBand(tempC: number | undefined): TyreTempBand {
  const t = tempC ?? 85;
  if (t >= 115) return "hot";
  if (t >= 100) return "warm";
  if (t < 75) return "cold";
  return "optimal";
}

export function tyreTempBarPercent(tempC: number | undefined): number {
  const t = tempC ?? 85;
  const min = 40;
  const max = 130;
  return Math.round((Math.min(max, Math.max(min, t)) - min) / (max - min) * 100);
}
