import type { CarSnapshot } from "../ws/protocol";
import {
  buildCarConditionTelemetryHtml,
  damageSummaryText,
  formatLimpModeLabel,
  formatTrackStatusLabel,
  isStrandedOrRecovering,
  trackStatusClass,
} from "./carStatus";
import { escapeHtml } from "./mmUi";
import { buildTyreTelemetryPanelHtml } from "./formatTyre";
import { tyreCompoundIconHtml, tyreCompoundLabel } from "./tyreCompound";
import {
  COOLANT_OVERHEAT_C,
  coolantStatusLabel,
  coolantTempBand,
  coolantTempBarPercent,
  formatCoolantTemp,
} from "./formatCoolant";
import type { FuelStats } from "./fuelTracker";
import { formatFuelAmount, fuelColumnLabel, usesBatteryFuelDisplay } from "./fuelDisplay";
import {
  buildHybridChargeBarHtml,
  formatHybridCharge,
  hybridStrategyLabel,
  type HybridStrategy,
} from "./hybridStrategy";

export interface TelemetryWidgetContext {
  fuelStats?: FuelStats;
  hybridBudgetMJ?: number | null;
}

function formatLapsRemaining(stats: FuelStats | undefined): string {
  if (!stats?.lapsRemaining || stats.avgLitersPerLap <= 0) return "—";
  return `~${stats.lapsRemaining.toFixed(1)} laps`;
}

function pitStatusLabel(snap: CarSnapshot): string {
  if (snap.inPit) return `In pit · ${(snap.pitRemainingSec ?? 0).toFixed(0)}s`;
  if (snap.pitQueued) return "Pit queued";
  if (isStrandedOrRecovering(snap)) return formatTrackStatusLabel(snap.trackStatus);
  const limp = formatLimpModeLabel(snap.limpMode);
  if (limp) return `Limp · ${limp}`;
  if (snap.onFire) return "On fire";
  if (snap.overtaking) return "Overtaking";
  if (snap.blocked) return "In traffic";
  if (snap.fuel <= 0) {
    return usesBatteryFuelDisplay(snap) ? "Battery depleted" : "Out of fuel";
  }
  return "On track";
}

function hasHybridEnergy(
  snap: CarSnapshot,
  hybridBudgetMJ: number | null | undefined,
): boolean {
  const batteryFuel = usesBatteryFuelDisplay(snap);
  return (
    !batteryFuel &&
    snap.hybridDeployMJ != null &&
    snap.hybridDeployMJ >= 0 &&
    (snap.hybridBudgetMJ ?? hybridBudgetMJ ?? 0) > 0
  );
}

export function buildCarSummaryHtml(snap: CarSnapshot): string {
  const activeDriver = snap.driverRoster?.find((d) => d.active);
  const tier = activeDriver?.tier ?? "";
  const pressure = snap.driverPressure ?? 0;
  const mistakeRisk = snap.driverMistakeRisk ?? 0;
  const lapLabel = `${snap.lap} · P${snap.racePosition}${snap.classPosition != null ? ` · C${snap.classPosition}` : ""}`;
  const pitLabel = pitStatusLabel(snap);

  const statCell = (label: string, value: string) =>
    `<div class="telemetry-stat-cell"><span>${label}</span><strong>${value}</strong></div>`;

  return `
    <div class="telemetry-widget-head">
      <span class="telemetry-widget-label">Car</span>
      <strong class="telemetry-widget-title">${escapeHtml(snap.driverName ?? "—")}${tier ? ` <span class="driver-tier tier-${tier.toLowerCase()}">${escapeHtml(tier)}</span>` : ""}</strong>
    </div>
    <div class="telemetry-stats-grid telemetry-stats-grid-tight">
      ${statCell("Stamina", `${(snap.driverStamina ?? 100).toFixed(0)}%`)}
      ${statCell("Pressure", `${pressure.toFixed(0)}%`)}
      ${statCell("Mistake", `<span class="${mistakeRisk > 130 ? "risk-high" : ""}">${mistakeRisk.toFixed(0)}%</span>`)}
      ${statCell("Lap", lapLabel)}
      ${statCell("Status", `<span class="${trackStatusClass(snap.trackStatus)}">${escapeHtml(pitLabel)}</span>`)}
    </div>
  `;
}

export function buildFuelWidgetHtml(
  snap: CarSnapshot,
  ctx: TelemetryWidgetContext = {},
): string {
  const { fuelStats } = ctx;
  const coolantTemp = snap.coolantTempC;
  const coolantBand = coolantTempBand(coolantTemp);
  const coolantPct = coolantTempBarPercent(coolantTemp);
  const coolantLabel = coolantStatusLabel(coolantTemp);
  const engineHealth = snap.engineHealth ?? 100;

  const row = (label: string, value: string) =>
    `<div class="telemetry-row telemetry-row-compact"><span>${label}</span><strong>${value}</strong></div>`;

  return `
    <div class="telemetry-widget-head">
      <span class="telemetry-widget-label">Fuel &amp; power</span>
    </div>
    ${row(fuelColumnLabel(snap), formatFuelAmount(snap))}
    ${row("Last lap", fuelStats && fuelStats.lastLapLiters > 0 ? `${fuelStats.lastLapLiters.toFixed(1)} L` : "—")}
    ${row("Avg / lap", fuelStats && fuelStats.avgLitersPerLap > 0 ? `${fuelStats.avgLitersPerLap.toFixed(1)} L` : "—")}
    ${row("This lap", fuelStats ? `${fuelStats.currentLapPartialUse.toFixed(1)} L` : "—")}
    ${row("Range", formatLapsRemaining(fuelStats))}
    <div class="telemetry-row coolant-row telemetry-row-compact">
      <span>Coolant</span>
      <div class="coolant-temp-wrap">
        <div class="coolant-temp-bar coolant-${coolantBand}" style="--coolant-fill: ${coolantPct}%"></div>
        <strong class="${coolantBand === "hot" || coolantBand === "overheat" ? "coolant-alert" : ""}">${formatCoolantTemp(coolantTemp)}</strong>
      </div>
    </div>
    ${row("Engine", `${engineHealth.toFixed(0)}% · ${escapeHtml(coolantLabel)} <span class="telemetry-hint">(limit ${COOLANT_OVERHEAT_C}°C)</span>`)}
  `;
}

export function buildTyreWidgetHtml(snap: CarSnapshot): string {
  const compoundBadge = tyreCompoundIconHtml(snap.tireCompound, {
    size: 18,
    title: `${tyreCompoundLabel(snap.tireCompound)} compound`,
  });

  return `
    <div class="telemetry-widget-head">
      <span class="telemetry-widget-label">Tyres</span>
      <span class="telemetry-tyre-label">${compoundBadge}</span>
    </div>
    <div class="tyre-grid-wrap">
      ${buildTyreTelemetryPanelHtml(snap, { compact: true, showSummary: false })}
    </div>
  `;
}

export function buildHybridWidgetHtml(
  snap: CarSnapshot,
  ctx: TelemetryWidgetContext = {},
): string {
  const budget = snap.hybridBudgetMJ ?? ctx.hybridBudgetMJ;
  if (!hasHybridEnergy(snap, budget)) {
    return `
      <div class="telemetry-widget-head">
        <span class="telemetry-widget-label">Hybrid</span>
      </div>
      <p class="telemetry-widget-empty">No hybrid system on this car</p>
    `;
  }

  const strategy = (snap.hybridStrategy ?? "balanced") as HybridStrategy;

  return `
    <div class="telemetry-widget-head">
      <span class="telemetry-widget-label">Hybrid</span>
      <strong class="hybrid-strategy-${strategy}">${hybridStrategyLabel(strategy)}</strong>
    </div>
    <div class="telemetry-row telemetry-row-compact">
      <span>Charge</span>
      <strong>${formatHybridCharge(snap.hybridDeployMJ, budget)}</strong>
    </div>
    <div class="telemetry-row telemetry-row-compact">
      <span>Deploy</span>
      ${buildHybridChargeBarHtml(snap.hybridDeployMJ, budget, true)}
    </div>
  `;
}

export function buildDamageWidgetHtml(snap: CarSnapshot): string {
  const conditionBlock = buildCarConditionTelemetryHtml(snap);
  const damageLine = damageSummaryText(snap);

  return `
    <div class="telemetry-widget-head">
      <span class="telemetry-widget-label">Condition</span>
    </div>
    ${conditionBlock || `<p class="telemetry-widget-empty">No damage reported</p>`}
    ${damageLine && !conditionBlock ? `<div class="telemetry-row telemetry-warn"><span>Damage</span><strong>${escapeHtml(damageLine)}</strong></div>` : ""}
  `;
}
