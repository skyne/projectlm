import type { CarSnapshot } from "../ws/protocol";
import { escapeHtml } from "./mmUi";
import { PIT_SUBSYSTEM_ORDER, repairPartLabel } from "./pitRepairParts";
import { resolveRetireReason } from "./retireReason";
import { classTagShortLabel } from "./classLabels";
import {
  formatTyreWear,
  wearBand,
  wheelWearFromSnapshot,
  worstWheelWear,
} from "./formatTyre";
import { buildCarConditionDiagramHtml, type ConditionPart } from "./carConditionDiagram";

export const DAMAGE_DISPLAY_THRESHOLD = 90;
export const DAMAGE_BADGE_THRESHOLD = 85;
/** Show any part below this in telemetry condition panel. */
export const DAMAGE_TELEMETRY_THRESHOLD = 99.5;

export function partHealthBand(health: number): string {
  if (health < 35) return "health-critical";
  if (health < 78) return "health-warn";
  if (health < DAMAGE_TELEMETRY_THRESHOLD) return "status-caution";
  return "health-ok";
}

export function structuralSeverityBand(severity: number): string {
  if (severity > 35) return "health-critical";
  if (severity > 15) return "health-warn";
  if (severity > 1) return "status-caution";
  return "health-ok";
}

const HIDDEN_FAULT_LABELS: Record<string, string> = {
  cooling_hose_leak: "Cooling hose leak",
  powertrain_seal_leak: "Powertrain seal leak",
  hairline_crack: "Hairline crack",
  wiring_chafe: "Wiring chafe",
  tub_stress: "Tub stress",
};

export interface TimingStatusTag {
  text: string;
  title: string;
  className: string;
}

export function isStrandedOrRecovering(snap: CarSnapshot): boolean {
  return snap.trackStatus === "stranded" || snap.trackStatus === "recovering";
}

export function formatLimpModeLabel(mode: string | undefined): string {
  switch (mode) {
    case "reduced_power":
      return "Reduced power";
    case "hybrid_only":
      return "Hybrid only";
    case "barely_driveable":
      return "Barely driveable";
    case "immobilized":
      return "Immobilized";
    default:
      return "";
  }
}

export function formatTrackStatusLabel(status: string | undefined): string {
  switch (status) {
    case "stranded":
      return "Stranded";
    case "recovering":
      return "Recovering";
    case "cleared":
      return "Cleared";
    default:
      return "On track";
  }
}

export function trackStatusClass(status: string | undefined): string {
  if (status === "stranded" || status === "recovering") return "status-stranded";
  if (status === "cleared") return "status-caution";
  return "";
}

export function limpModeClass(mode: string | undefined): string {
  switch (mode) {
    case "immobilized":
      return "health-critical";
    case "barely_driveable":
    case "hybrid_only":
      return "health-warn";
    case "reduced_power":
      return "status-caution";
    default:
      return "";
  }
}

export function hasCarDamage(snap: CarSnapshot): boolean {
  if (snap.onFire) return true;
  if ((snap.engineHealth ?? 100) < DAMAGE_BADGE_THRESHOLD) return true;
  if (snap.limpMode && snap.limpMode !== "none") return true;
  if (Object.entries(snap.partHealth ?? {}).some(([, h]) => h < DAMAGE_BADGE_THRESHOLD)) {
    return true;
  }
  if (Object.values(snap.tyreDeflation ?? {}).some((v) => v === "flat" || v === "soft")) {
    return true;
  }
  if ((snap.partIrreparable?.length ?? 0) > 0) return true;
  if (snap.suspectedIssues) return true;
  if ((snap.structuralSeverity ?? 0) > 10) return true;
  return false;
}

export function damagedPartSummaries(
  snap: CarSnapshot,
  threshold = DAMAGE_DISPLAY_THRESHOLD,
): string[] {
  return Object.entries(snap.partHealth ?? {})
    .filter(([, h]) => h < threshold)
    .sort((a, b) => a[1] - b[1])
    .map(([part, health]) => `${repairPartLabel(part)} ${health.toFixed(0)}%`);
}

export function tyreDeflationSummaries(snap: CarSnapshot): string[] {
  return Object.entries(snap.tyreDeflation ?? {})
    .filter(([, v]) => v === "flat" || v === "soft")
    .map(([wheel, state]) => `${wheel.toUpperCase()} ${state}`);
}

export function damageSummaryText(snap: CarSnapshot): string {
  const parts = damagedPartSummaries(snap);
  const flats = tyreDeflationSummaries(snap);
  const limp = formatLimpModeLabel(snap.limpMode);
  return [...parts, ...flats, limp].filter(Boolean).join(" · ");
}

export function damageBadgeTitle(snap: CarSnapshot): string {
  const bits: string[] = [];
  const limp = formatLimpModeLabel(snap.limpMode);
  if (limp) bits.push(limp);
  bits.push(...damagedPartSummaries(snap, DAMAGE_BADGE_THRESHOLD).slice(0, 3));
  bits.push(...tyreDeflationSummaries(snap));
  if (snap.onFire) bits.push("On fire");
  if ((snap.engineHealth ?? 100) < DAMAGE_BADGE_THRESHOLD) {
    bits.push(`Engine ${snap.engineHealth.toFixed(0)}%`);
  }
  if (snap.suspectedIssues) bits.push("Suspected hidden faults");
  return bits.length ? bits.join(" · ") : "Car damage";
}

export function hasLimpMode(snap: CarSnapshot): boolean {
  return Boolean(snap.limpMode && snap.limpMode !== "none");
}

export function formatLimpTag(snap: CarSnapshot): TimingStatusTag | null {
  const limp = formatLimpModeLabel(snap.limpMode);
  if (!limp) return null;
  const title = snap.limpReason ? `${limp} · ${snap.limpReason}` : limp;
  let className = "status-limp";
  switch (snap.limpMode) {
    case "immobilized":
    case "barely_driveable":
      className = "status-limp-critical";
      break;
    case "hybrid_only":
    case "reduced_power":
      className = "status-limp-warn";
      break;
    default:
      break;
  }
  return { text: "LIMP", title, className };
}

function formatPenaltyTag(snap: CarSnapshot): TimingStatusTag | null {
  if (snap.blackFlag || snap.pendingPenalty === "black") {
    return { text: "BLK", title: "Black flag", className: "status-black-flag" };
  }
  if (snap.meatballFlag) {
    return { text: "MEAT", title: "Meatball — return to pits", className: "status-meatball" };
  }
  const penalty = snap.pendingPenalty ?? "none";
  if (penalty === "drive_through") {
    const laps = snap.lapsToComply != null ? ` (${snap.lapsToComply})` : "";
    return { text: `DT${laps}`, title: "Drive-through penalty", className: "status-penalty" };
  }
  if (penalty === "stop_go") {
    const laps = snap.lapsToComply != null ? ` (${snap.lapsToComply})` : "";
    return { text: `S&G${laps}`, title: "Stop-and-go penalty", className: "status-penalty" };
  }
  return null;
}

export function hasWornTyre(snap: CarSnapshot): boolean {
  const wear = worstWheelWear(wheelWearFromSnapshot(snap));
  return wearBand(wear) !== "";
}

export function wornTyreTag(snap: CarSnapshot): TimingStatusTag | null {
  const wear = worstWheelWear(wheelWearFromSnapshot(snap));
  const band = wearBand(wear);
  if (!band) return null;
  return {
    text: "TYRE",
    title: `Tyre wear ${formatTyreWear(wear)}`,
    className: band === "critical" ? "status-tyre-critical" : "status-tyre-warn",
  };
}

export function classStandingsTag(snap: CarSnapshot): TimingStatusTag {
  return {
    text: classTagShortLabel(snap.classId),
    title: snap.classId,
    className: `standings-tag-class class-${snap.classId}`,
  };
}

export interface StandingsTagOptions {
  showClass?: boolean;
  showDamage?: boolean;
  showLimp?: boolean;
  showTyre?: boolean;
}

/** Tags for the standings rail — operational tags always on; optional class/dmg/limp/tyre. */
export function resolveStandingsTags(
  snap: CarSnapshot,
  options: StandingsTagOptions = {},
): TimingStatusTag[] {
  const { showClass = false, showDamage = false, showLimp = false, showTyre = false } =
    options;

  const ops = resolveTimingStatusTags(snap, { showDamage: false }).filter(
    (tag) => tag.text !== "LIMP" && tag.text !== "DMG",
  );

  const optional: TimingStatusTag[] = [];
  if (showClass) optional.push(classStandingsTag(snap));
  if (showLimp) {
    const limp = formatLimpTag(snap);
    if (limp) optional.push(limp);
  }
  if (showDamage && hasCarDamage(snap)) {
    optional.push({
      text: "DMG",
      title: damageBadgeTitle(snap),
      className: "status-damaged",
    });
  }
  if (showTyre) {
    const tyre = wornTyreTag(snap);
    if (tyre) optional.push(tyre);
  }

  return [...ops, ...optional];
}

export function resolveTimingStatusTags(
  snap: CarSnapshot,
  options: { showDamage?: boolean } = {},
): TimingStatusTag[] {
  if (snap.retired) {
    return [
      {
        text: "OUT",
        title: resolveRetireReason(snap),
        className: "status-retired",
      },
    ];
  }
  if (snap.inGarage) {
    return [{ text: "GAR", title: "In garage", className: "" }];
  }
  if (snap.inPit) {
    return [{ text: "PIT", title: "In pits", className: "status-pit" }];
  }

  const tags: TimingStatusTag[] = [];

  if (snap.trackStatus === "stranded") {
    tags.push({
      text: "STR",
      title: "Stranded on track",
      className: "status-stranded",
    });
  } else if (snap.trackStatus === "recovering") {
    const progress =
      snap.recoveryProgress != null
        ? ` · ${Math.round(snap.recoveryProgress * 100)}%`
        : "";
    tags.push({
      text: "REC",
      title: `Recovery in progress${progress}`,
      className: "status-stranded",
    });
  }

  const penalty = formatPenaltyTag(snap);
  if (penalty) tags.push(penalty);

  const limp = formatLimpTag(snap);
  if (limp) tags.push(limp);

  if (options.showDamage && hasCarDamage(snap)) {
    tags.push({
      text: "DMG",
      title: damageBadgeTitle(snap),
      className: "status-damaged",
    });
  }

  return tags;
}

export function renderTimingStatusTagsHtml(
  tags: TimingStatusTag[],
  tagClass: "status-tag" | "compact-lb-status" | "standings-wec-tag" = "status-tag",
): string {
  if (!tags.length) return "";
  return tags
    .map((tag) => {
      const classes = [tagClass, tag.className].filter(Boolean).join(" ");
      return `<span class="${classes}" title="${escapeHtml(tag.title)}">${escapeHtml(tag.text)}</span>`;
    })
    .join("");
}

function hiddenFaultSummary(snap: CarSnapshot): string[] {
  const lines: string[] = [];
  const unrevealed = (snap.hiddenFaults ?? []).filter((f) => !f.revealed).length;
  if (unrevealed > 0) {
    lines.push(`${unrevealed} suspected hidden fault${unrevealed > 1 ? "s" : ""}`);
  }
  for (const fault of (snap.hiddenFaults ?? []).filter((f) => f.revealed).slice(0, 3)) {
    const label = HIDDEN_FAULT_LABELS[fault.kind] ?? fault.kind;
    lines.push(`${label} (${repairPartLabel(fault.linkedPart)})`);
  }
  return lines;
}

function collectConditionParts(snap: CarSnapshot): ConditionPart[] {
  const garage = new Set(snap.partIrreparable ?? []);
  const rows: ConditionPart[] = [
    {
      token: "engine",
      label: "Engine",
      health: snap.engineHealth ?? 100,
      garageOnly: garage.has("engine"),
    },
  ];
  for (const token of PIT_SUBSYSTEM_ORDER) {
    rows.push({
      token,
      label: repairPartLabel(token),
      health: snap.partHealth?.[token] ?? 100,
      repairSec: snap.partRepairSec?.[token],
      garageOnly: garage.has(token),
    });
  }
  return rows;
}

function isConditionNominal(snap: CarSnapshot): boolean {
  const severity = snap.structuralSeverity ?? 0;
  if (severity > 1) return false;
  return collectConditionParts(snap).every(
    (p) => p.health >= DAMAGE_TELEMETRY_THRESHOLD && !p.garageOnly,
  );
}

function buildDamageSummaryRows(snap: CarSnapshot): string {
  const rows: string[] = [];
  const severity = snap.structuralSeverity ?? 0;
  const structBand = structuralSeverityBand(severity);
  rows.push(
    `<div class="telemetry-row"><span>Structural load</span><strong class="${structBand}" title="Composite score from corners, monocoque stress, and deflated tyres">${severity.toFixed(0)}%</strong></div>`,
  );
  if (isConditionNominal(snap)) {
    rows.push(
      `<div class="telemetry-row"><span>Overall</span><strong class="health-ok">All systems nominal</strong></div>`,
    );
  }
  if (snap.physicallyRepairable === false) {
    rows.push(
      `<div class="telemetry-row telemetry-warn"><span>Repair status</span><strong class="health-critical">Beyond physical repair</strong></div>`,
    );
  } else if (snap.sessionRepairable === false) {
    rows.push(
      `<div class="telemetry-row telemetry-warn"><span>Repair status</span><strong class="health-warn">Insufficient session time</strong></div>`,
    );
  } else if ((snap.totalRepairSec ?? 0) > 0) {
    rows.push(
      `<div class="telemetry-row"><span>Est. full repair</span><strong>~${snap.totalRepairSec!.toFixed(0)}s</strong></div>`,
    );
  }
  if (snap.collisionWarnings != null && snap.collisionWarnings > 0) {
    rows.push(
      `<div class="telemetry-row"><span>Steward warnings</span><strong class="health-warn">${snap.collisionWarnings}</strong></div>`,
    );
  }
  return rows.join("");
}

function penaltySummary(snap: CarSnapshot): string[] {
  const lines: string[] = [];
  if (snap.blackFlag || snap.pendingPenalty === "black") lines.push("Black flag");
  else if (snap.meatballFlag) lines.push("Meatball — return to pits");
  else if (snap.pendingPenalty === "drive_through") {
    const laps = snap.lapsToComply != null ? ` · ${snap.lapsToComply} laps to comply` : "";
    lines.push(`Drive-through pending${laps}`);
  } else if (snap.pendingPenalty === "stop_go") {
    const laps = snap.lapsToComply != null ? ` · ${snap.lapsToComply} laps to comply` : "";
    lines.push(`Stop-and-go pending${laps}`);
  }
  if (snap.blueFlag) {
    const strikes = snap.blueFlagStrikes != null ? ` (${snap.blueFlagStrikes} strikes)` : "";
    lines.push(`Blue flag${strikes}`);
  }
  return lines;
}

/** Detailed car condition rows for telemetry cards. */
export function buildCarConditionTelemetryHtml(snap: CarSnapshot): string {
  const rows: string[] = [];
  const alerts: string[] = [];

  const trackLabel = formatTrackStatusLabel(snap.trackStatus);
  const trackClass = trackStatusClass(snap.trackStatus);
  if (isStrandedOrRecovering(snap)) {
    alerts.push(
      `<div class="telemetry-condition-alert telemetry-condition-stranded">${escapeHtml(trackLabel)}${snap.recoveryProgress != null ? ` · ${Math.round(snap.recoveryProgress * 100)}%` : ""}</div>`,
    );
  }
  if (snap.onFire) {
    alerts.push(`<div class="telemetry-condition-alert telemetry-condition-fire">On fire</div>`);
  }
  const limpLabel = formatLimpModeLabel(snap.limpMode);
  if (limpLabel) {
    alerts.push(
      `<div class="telemetry-condition-alert telemetry-condition-limp">Limp mode · ${escapeHtml(limpLabel)}${snap.limpReason ? ` · ${escapeHtml(snap.limpReason)}` : ""}</div>`,
    );
  }

  const summaryRows: string[] = [
    `<div class="telemetry-row"><span>Track status</span><strong class="${trackClass}">${escapeHtml(trackLabel)}</strong></div>`,
    buildDamageSummaryRows(snap),
  ];
  if (limpLabel) {
    summaryRows.push(
      `<div class="telemetry-row telemetry-warn"><span>Limp mode</span><strong class="${limpModeClass(snap.limpMode)}">${escapeHtml(limpLabel)}${snap.limpReason ? ` <span class="telemetry-hint">(${escapeHtml(snap.limpReason)})</span>` : ""}</strong></div>`,
    );
  }

  const conditionParts = collectConditionParts(snap);
  const diagram = buildCarConditionDiagramHtml(snap, conditionParts);

  const flats = tyreDeflationSummaries(snap);
  if (flats.length) {
    rows.push(
      `<div class="telemetry-row telemetry-warn"><span>Tyre deflation</span><strong>${escapeHtml(flats.join(" · "))}</strong></div>`,
    );
  }

  if ((snap.partIrreparable?.length ?? 0) > 0) {
    rows.push(
      `<div class="telemetry-row telemetry-warn"><span>Garage rebuild</span><strong>${escapeHtml(snap.partIrreparable!.map(repairPartLabel).join(" · "))}</strong></div>`,
    );
  }

  const faults = hiddenFaultSummary(snap);
  if (faults.length) {
    rows.push(
      `<div class="telemetry-row telemetry-warn"><span>Faults</span><strong>${escapeHtml(faults.join(" · "))}</strong></div>`,
    );
  }

  const penalties = penaltySummary(snap);
  if (penalties.length) {
    rows.push(
      `<div class="telemetry-row"><span>Penalties</span><strong>${escapeHtml(penalties.join(" · "))}</strong></div>`,
    );
  }

  if (snap.garageRebuildActive) {
    rows.push(
      `<div class="telemetry-row"><span>Garage rebuild</span><strong>In progress · ${(snap.garageRebuildRemainingSec ?? 0).toFixed(0)}s</strong></div>`,
    );
  }

  const footer = rows.join("");
  if (!alerts.length && !summaryRows.length && !diagram && !footer) return "";
  return `${alerts.join("")}
    <div class="telemetry-condition-layout">
      <div class="telemetry-condition-summary">${summaryRows.join("")}</div>
      ${diagram}
      ${footer ? `<div class="telemetry-condition-footer">${footer}</div>` : ""}
    </div>`;
}
