import type { CarSnapshot } from "../ws/protocol";
import { escapeHtml } from "./mmUi";
import {
  buildTyreTelemetryPanelHtml,
} from "./formatTyre";
import {
  COOLANT_OVERHEAT_C,
  coolantStatusLabel,
  coolantTempBand,
  coolantTempBarPercent,
  formatCoolantTemp,
} from "./formatCoolant";
import type { FuelStats } from "./fuelTracker";

export interface TelemetryCardOptions {
  /** Show extended race-engineering fields (speed, fuel burn, hybrid, etc.) */
  extended?: boolean;
  /** Hide per-wheel tyre panel (when rendered in a dedicated slot) */
  hideTyres?: boolean;
  fuelStats?: FuelStats;
  hybridBudgetMJ?: number | null;
}

function formatSpeedKmh(speedMs: number): string {
  return `${(speedMs * 3.6).toFixed(0)} km/h`;
}

function formatHybrid(snap: CarSnapshot, budgetMJ: number | null | undefined): string {
  if (snap.hybridDeployMJ == null || snap.hybridDeployMJ < 0) return "—";
  const mj = snap.hybridDeployMJ;
  if (budgetMJ != null && budgetMJ > 0) {
    const pct = Math.min(100, (mj / budgetMJ) * 100);
    return `${mj.toFixed(1)} MJ · ${pct.toFixed(0)}%`;
  }
  return `${mj.toFixed(1)} MJ`;
}

function formatLapsRemaining(stats: FuelStats | undefined): string {
  if (!stats?.lapsRemaining || stats.avgLitersPerLap <= 0) return "—";
  return `~${stats.lapsRemaining.toFixed(1)} laps`;
}

function mistakeKindLabel(kind: string | undefined): string {
  switch (kind) {
    case "lockup":
      return "Lock-up";
    case "overdrive":
      return "Overdrive";
    case "ran_wide":
      return "Ran wide";
    default:
      return "Mistake";
  }
}

function mistakeKindDetail(kind: string | undefined): string {
  switch (kind) {
    case "lockup":
      return "Flat spot · heavy wear spike";
    case "overdrive":
      return "Overdriven corner · extra scrub";
    case "ran_wide":
      return "Off-line · tyre damage";
    default:
      return "Tyre wear spike";
  }
}

function buildMistakeTelemetryHtml(snap: CarSnapshot): string {
  const parts: string[] = [];
  const mistakeSec = snap.lastMistakeRemainingSec ?? 0;
  const boostSec = snap.wearBoostRemainingSec ?? 0;

  if (mistakeSec > 0 && snap.lastMistakeKind) {
    const wearPct = snap.lastMistakeWearPct ?? 0;
    const wheelNote = snap.lastMistakeWheel
      ? ` · worst ${escapeHtml(snap.lastMistakeWheel)}`
      : "";
    parts.push(`
      <div class="telemetry-mistake-alert mistake-${escapeHtml(snap.lastMistakeKind)}">
        <strong>${escapeHtml(mistakeKindLabel(snap.lastMistakeKind))}</strong>
        <span>+${wearPct.toFixed(1)}% wear${wheelNote} · ${escapeHtml(mistakeKindDetail(snap.lastMistakeKind))}</span>
      </div>
    `);
  }

  if (boostSec > 0) {
    const mult = snap.wearBoostMultiplier ?? 1;
    parts.push(`
      <div class="telemetry-wear-boost">
        <span>Elevated tyre scrub</span>
        <strong>${mult.toFixed(2)}× wear · ${boostSec.toFixed(1)}s left</strong>
      </div>
    `);
  }

  if (snap.setupFeedback) {
    parts.push(`
      <div class="telemetry-driver-feedback">${escapeHtml(snap.setupFeedback)}</div>
    `);
  }

  return parts.join("");
}

function pitStatusLabel(snap: CarSnapshot): string {
  if (snap.inPit) return `In pit · ${(snap.pitRemainingSec ?? 0).toFixed(0)}s`;
  if (snap.pitQueued) return "Pit queued";
  if (snap.overtaking) return "Overtaking";
  if (snap.blocked) return "In traffic";
  if (snap.fuel <= 0) return "Out of fuel";
  return "On track";
}

/** Minimal at-a-glance summary for the track-map pit wall (full data lives on Telemetry). */
export function buildRaceControlsSummaryHtml(snap: CarSnapshot): string {
  const activeDriver = snap.driverRoster?.find((d) => d.active);
  const tier = activeDriver?.tier ?? "";

  return `
    ${buildMistakeTelemetryHtml(snap)}
    <div class="race-controls-summary">
      <div class="race-controls-driver">
        <strong>${escapeHtml(snap.driverName ?? "—")}</strong>
        ${tier ? `<span class="driver-tier tier-${tier.toLowerCase()}">${escapeHtml(tier)}</span>` : ""}
      </div>
      <div class="race-controls-stats">
        <span>Fuel <strong>${snap.fuel.toFixed(1)} L</strong></span>
        <span class="pit-state">${escapeHtml(pitStatusLabel(snap))}</span>
      </div>
    </div>
  `;
}

export function buildTelemetryCardHtml(
  snap: CarSnapshot,
  options: TelemetryCardOptions = {},
): string {
  const { extended = false, hideTyres = false, fuelStats, hybridBudgetMJ } = options;

  const pitLabel = pitStatusLabel(snap);

  const coolantTemp = snap.coolantTempC;
  const coolantBand = coolantTempBand(coolantTemp);
  const coolantPct = coolantTempBarPercent(coolantTemp);
  const coolantLabel = coolantStatusLabel(coolantTemp);
  const engineHealth = snap.engineHealth ?? 100;

  const pressure = snap.driverPressure ?? 0;
  const mistakeRisk = snap.driverMistakeRisk ?? 0;
  const driverMode = snap.driverMode ?? "normal";
  const modeWearHint =
    driverMode === "push"
      ? "Push +22% wear"
      : driverMode === "conserve"
        ? "Eco −15% wear"
        : "";
  const activeDriver = snap.driverRoster?.find((d) => d.active);
  const tier = activeDriver?.tier ?? "";

  const extendedRows = extended
    ? `
      <div class="telemetry-row"><span>Speed</span><strong>${formatSpeedKmh(snap.speed)}</strong></div>
      <div class="telemetry-row"><span>RPM</span><strong>${Math.round(snap.rpm).toLocaleString()}</strong></div>
      <div class="telemetry-row"><span>Lap</span><strong>${snap.lap} · P${snap.racePosition}${snap.classPosition != null ? ` · C${snap.classPosition}` : ""}</strong></div>
      <div class="telemetry-row"><span>Hybrid battery</span><strong>${formatHybrid(snap, hybridBudgetMJ)}</strong></div>
      <div class="telemetry-row"><span>Fuel last lap</span><strong>${fuelStats && fuelStats.lastLapLiters > 0 ? `${fuelStats.lastLapLiters.toFixed(1)} L` : "—"}</strong></div>
      <div class="telemetry-row"><span>Fuel avg / lap</span><strong>${fuelStats && fuelStats.avgLitersPerLap > 0 ? `${fuelStats.avgLitersPerLap.toFixed(1)} L` : "—"}</strong></div>
      <div class="telemetry-row"><span>This lap use</span><strong>${fuelStats ? `${fuelStats.currentLapPartialUse.toFixed(1)} L` : "—"}</strong></div>
      <div class="telemetry-row"><span>Range (fuel)</span><strong>${formatLapsRemaining(fuelStats)}</strong></div>
    `
    : "";

  const tyrePanel = hideTyres
    ? ""
    : `
    <div class="telemetry-row tyre-row tyre-grid-row">
      <span>Tyres</span>
      <div class="tyre-grid-wrap">
        ${buildTyreTelemetryPanelHtml(snap)}
      </div>
    </div>`;

  return `
    ${buildMistakeTelemetryHtml(snap)}
    <div class="telemetry-row driver-row-main">
      <span>Driver</span>
      <strong>${escapeHtml(snap.driverName ?? "—")}${tier ? ` <span class="driver-tier tier-${tier.toLowerCase()}">${escapeHtml(tier)}</span>` : ""}</strong>
    </div>
    <div class="telemetry-row"><span>Stamina</span><strong>${(snap.driverStamina ?? 100).toFixed(0)}%</strong></div>
    <div class="telemetry-row">
      <span>Pressure</span>
      <div class="pressure-wrap">
        <div class="pressure-bar ${pressure > 55 ? "high" : pressure > 30 ? "med" : ""}" style="--pressure-fill: ${Math.min(100, pressure)}%"></div>
        <strong>${pressure.toFixed(0)}%</strong>
      </div>
    </div>
    <div class="telemetry-row"><span>Mistake risk</span><strong class="${mistakeRisk > 130 ? "risk-high" : ""}">${mistakeRisk.toFixed(0)}%</strong></div>
    <div class="telemetry-row"><span>Driver mode</span><strong class="driver-mode-${driverMode}">${driverMode.toUpperCase()}${modeWearHint ? ` <span class="telemetry-hint">(${modeWearHint})</span>` : ""}</strong></div>
    ${extendedRows}
    <div class="telemetry-row"><span>Fuel</span><strong>${snap.fuel.toFixed(1)} L</strong></div>
    <div class="telemetry-row coolant-row">
      <span>Coolant</span>
      <div class="coolant-temp-wrap">
        <div class="coolant-temp-bar coolant-${coolantBand}" style="--coolant-fill: ${coolantPct}%"></div>
        <strong class="${coolantBand === "hot" || coolantBand === "overheat" ? "coolant-alert" : ""}">${formatCoolantTemp(coolantTemp)}</strong>
      </div>
    </div>
    <div class="telemetry-row"><span>Engine temp</span><strong class="${coolantBand === "hot" || coolantBand === "overheat" ? "coolant-alert" : ""}">${escapeHtml(coolantLabel)} <span class="telemetry-hint">(limit ${COOLANT_OVERHEAT_C}°C)</span></strong></div>
    <div class="telemetry-row"><span>Engine health</span><strong class="${engineHealth < 90 ? "health-warn" : engineHealth < 75 ? "health-critical" : ""}">${engineHealth.toFixed(0)}%</strong></div>
    ${tyrePanel}
    <div class="telemetry-row"><span>Status</span><strong class="pit-state">${escapeHtml(pitLabel)}</strong></div>
  `;
}
