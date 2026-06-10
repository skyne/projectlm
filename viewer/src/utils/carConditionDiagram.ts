import type { CarSnapshot } from "../ws/protocol";
import { escapeHtml } from "./mmUi";

const TELEMETRY_HEALTH_THRESHOLD = 99.5;

function healthBand(health: number): string {
  if (health < 35) return "health-critical";
  if (health < 78) return "health-warn";
  if (health < TELEMETRY_HEALTH_THRESHOLD) return "status-caution";
  return "health-ok";
}

export interface ConditionPart {
  token: string;
  label: string;
  health: number;
  repairSec?: number;
  garageOnly: boolean;
}

interface CornerZone {
  key: string;
  label: string;
  bodyToken: string;
  suspToken: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SilhouetteDef {
  viewBox: string;
  outline: string;
  nose: string;
  tail: string;
  cockpit: string;
}

const SILHOUETTES: Record<string, SilhouetteDef> = {
  Hypercar: {
    viewBox: "0 0 80 156",
    outline:
      "M40 3 C54 4 62 12 64 26 L66 48 C68 68 67 88 63 106 L58 126 C55 138 48 146 40 148 C32 146 25 138 22 126 L17 106 C13 88 12 68 14 48 L16 26 C18 12 26 4 40 3 Z",
    nose: "M40 8 L52 18 L48 32 L32 32 L28 18 Z",
    tail: "M32 118 L48 118 L50 136 L30 136 Z",
    cockpit: "M34 52 C40 50 46 50 52 52 L54 72 C52 82 48 86 40 86 C32 86 28 82 26 72 Z",
  },
  LMP2: {
    viewBox: "0 0 76 148",
    outline:
      "M38 4 C50 5 58 13 60 25 L62 46 C64 66 63 86 59 102 L55 120 C52 132 46 140 38 142 C30 140 24 132 21 120 L17 102 C13 86 12 66 14 46 L16 25 C18 13 26 5 38 4 Z",
    nose: "M38 9 L48 17 L45 30 L31 30 L28 17 Z",
    tail: "M30 112 L46 112 L48 128 L28 128 Z",
    cockpit: "M32 50 C38 48 44 48 50 50 L51 70 C49 78 45 82 38 82 C31 82 27 78 25 70 Z",
  },
  LMGT3: {
    viewBox: "0 0 88 132",
    outline:
      "M44 5 C58 6 68 14 72 26 L74 42 C76 56 75 72 70 86 L64 104 C60 116 54 124 44 126 C34 124 28 116 24 104 L18 86 C13 72 12 56 14 42 L16 26 C20 14 30 6 44 5 Z",
    nose: "M44 10 L56 18 L54 28 L34 28 L32 18 Z",
    tail: "M32 96 L56 96 L58 112 L30 112 Z",
    cockpit: "M36 44 C44 42 52 42 60 44 L62 62 C60 72 54 76 44 76 C34 76 28 72 26 62 Z",
  },
};

const DEFAULT_SILHOUETTE = SILHOUETTES.Hypercar;

const CORNER_ZONES: Record<string, CornerZone[]> = {
  Hypercar: [
    { key: "fl", label: "FL", bodyToken: "body_fl", suspToken: "susp_fl", x: 5, y: 17, w: 24, h: 28 },
    { key: "fr", label: "FR", bodyToken: "body_fr", suspToken: "susp_fr", x: 51, y: 17, w: 24, h: 28 },
    { key: "rl", label: "RL", bodyToken: "body_rl", suspToken: "susp_rl", x: 5, y: 86, w: 24, h: 28 },
    { key: "rr", label: "RR", bodyToken: "body_rr", suspToken: "susp_rr", x: 51, y: 86, w: 24, h: 28 },
  ],
  LMP2: [
    { key: "fl", label: "FL", bodyToken: "body_fl", suspToken: "susp_fl", x: 6, y: 16, w: 23, h: 27 },
    { key: "fr", label: "FR", bodyToken: "body_fr", suspToken: "susp_fr", x: 47, y: 16, w: 23, h: 27 },
    { key: "rl", label: "RL", bodyToken: "body_rl", suspToken: "susp_rl", x: 6, y: 82, w: 23, h: 27 },
    { key: "rr", label: "RR", bodyToken: "body_rr", suspToken: "susp_rr", x: 47, y: 82, w: 23, h: 27 },
  ],
  LMGT3: [
    { key: "fl", label: "FL", bodyToken: "body_fl", suspToken: "susp_fl", x: 3, y: 13, w: 25, h: 26 },
    { key: "fr", label: "FR", bodyToken: "body_fr", suspToken: "susp_fr", x: 60, y: 13, w: 25, h: 26 },
    { key: "rl", label: "RL", bodyToken: "body_rl", suspToken: "susp_rl", x: 3, y: 70, w: 25, h: 26 },
    { key: "rr", label: "RR", bodyToken: "body_rr", suspToken: "susp_rr", x: 60, y: 70, w: 25, h: 26 },
  ],
};

const WHEEL_POSITIONS: Record<string, [number, number][]> = {
  Hypercar: [
    [17, 32],
    [63, 32],
    [17, 108],
    [63, 108],
  ],
  LMP2: [
    [16, 30],
    [60, 30],
    [16, 100],
    [60, 100],
  ],
  LMGT3: [
    [16, 26],
    [72, 26],
    [16, 84],
    [72, 84],
  ],
};

const SYSTEM_GROUPS: { title: string; tokens: string[] }[] = [
  { title: "Powertrain", tokens: ["engine", "gearbox", "cooling", "hybrid"] },
  { title: "Brakes & aero", tokens: ["brakes", "aero_front", "aero_rear"] },
  { title: "Safety cell", tokens: ["monocoque"] },
];

function silhouetteForClass(classId: string): SilhouetteDef {
  return SILHOUETTES[classId] ?? DEFAULT_SILHOUETTE;
}

function partMap(parts: ConditionPart[]): Map<string, ConditionPart> {
  return new Map(parts.map((p) => [p.token, p]));
}

function healthFill(band: string): string {
  switch (band) {
    case "health-critical":
      return "rgba(231, 76, 60, 0.55)";
    case "health-warn":
      return "rgba(243, 156, 18, 0.45)";
    case "status-caution":
      return "rgba(241, 196, 15, 0.38)";
    default:
      return "rgba(46, 204, 113, 0.14)";
  }
}

function healthStroke(band: string): string {
  switch (band) {
    case "health-critical":
      return "rgba(231, 76, 60, 0.9)";
    case "health-warn":
      return "rgba(243, 156, 18, 0.85)";
    case "status-caution":
      return "rgba(241, 196, 15, 0.8)";
    default:
      return "rgba(46, 204, 113, 0.38)";
  }
}

function cornerWorstHealth(body: ConditionPart | undefined, susp: ConditionPart | undefined): number {
  const values = [body?.health, susp?.health].filter((v): v is number => v != null);
  return values.length ? Math.min(...values) : 100;
}

function formatRepairHint(part: ConditionPart | undefined): string {
  if (!part) return "";
  if (part.garageOnly) return "garage";
  if (part.health >= 99.5) return "";
  if (part.repairSec != null && part.repairSec > 0) return `~${part.repairSec.toFixed(0)}s`;
  return "";
}

function cornerTitle(
  label: string,
  body: ConditionPart | undefined,
  susp: ConditionPart | undefined,
): string {
  const lines = [label];
  if (body) lines.push(`${body.label}: ${body.health.toFixed(0)}%`);
  if (susp) lines.push(`${susp.label}: ${susp.health.toFixed(0)}%`);
  const hints = [formatRepairHint(body), formatRepairHint(susp)].filter(Boolean);
  if (hints.length) lines.push(hints.join(" · "));
  return lines.join(" · ");
}

function cornerZonesForClass(classId: string): CornerZone[] {
  return CORNER_ZONES[classId] ?? CORNER_ZONES.Hypercar;
}

function buildWheelMarkers(classId: string): string {
  const wheels = WHEEL_POSITIONS[classId] ?? WHEEL_POSITIONS.Hypercar;
  return wheels
    .map(
      ([cx, cy]) =>
        `<ellipse class="condition-wheel" cx="${cx}" cy="${cy}" rx="5.5" ry="7" />`,
    )
    .join("");
}

function buildCornerZone(zone: CornerZone, parts: Map<string, ConditionPart>): string {
  const body = parts.get(zone.bodyToken);
  const susp = parts.get(zone.suspToken);
  const worst = cornerWorstHealth(body, susp);
  const band = healthBand(worst);
  const x = zone.x;
  const y = zone.y;
  const w = zone.w;
  const h = zone.h;
  const bodyPct = body ? body.health.toFixed(0) : "—";
  const suspPct = susp ? susp.health.toFixed(0) : "—";
  const worstPct = worst.toFixed(0);
  const title = escapeHtml(cornerTitle(zone.label, body, susp));
  const showSplit =
    body != null &&
    susp != null &&
    (body.health < TELEMETRY_HEALTH_THRESHOLD ||
      susp.health < TELEMETRY_HEALTH_THRESHOLD ||
      Math.abs(body.health - susp.health) > 0.5);
  const detailLine = showSplit
    ? `<text class="condition-corner-detail" x="${(w / 2).toFixed(1)}" y="${(h - 3).toFixed(1)}" text-anchor="middle">B${bodyPct} · S${suspPct}</text>`
    : "";

  return `
    <g class="condition-corner condition-corner-${zone.key}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <title>${title}</title>
      <rect class="condition-zone-fill" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4"
        fill="${healthFill(band)}" stroke="${healthStroke(band)}" stroke-width="1.1"/>
      <text class="condition-corner-label" x="${(w / 2).toFixed(1)}" y="11" text-anchor="middle">${zone.label}</text>
      <text class="condition-corner-health ${band}" x="${(w / 2).toFixed(1)}" y="${showSplit ? 23 : 24}" text-anchor="middle">${worstPct}%</text>
      ${detailLine}
    </g>`;
}

function buildOverlayZone(
  token: string,
  path: string,
  parts: Map<string, ConditionPart>,
  label: string,
): string {
  const part = parts.get(token);
  const health = part?.health ?? 100;
  const band = healthBand(health);
  const title = part
    ? escapeHtml(`${part.label}: ${health.toFixed(0)}%${formatRepairHint(part) ? ` · ${formatRepairHint(part)}` : ""}`)
    : escapeHtml(label);
  return `
    <g class="condition-overlay condition-overlay-${token}">
      <title>${title}</title>
      <path d="${path}" fill="${healthFill(band)}" stroke="${healthStroke(band)}" stroke-width="1"/>
    </g>`;
}

function buildSystemsPanel(parts: ConditionPart[]): string {
  const byToken = partMap(parts);
  const groups = SYSTEM_GROUPS.map((group) => {
    const rows = group.tokens
      .map((token) => byToken.get(token))
      .filter((p): p is ConditionPart => p != null)
      .map((part) => {
        const band = healthBand(part.health);
        const hint = formatRepairHint(part);
        return `
          <div class="condition-system-row" title="${escapeHtml(part.label)}">
            <span class="condition-system-label">${escapeHtml(part.label)}</span>
            <strong class="condition-system-health ${band}">${part.health.toFixed(0)}%</strong>
            ${hint ? `<span class="condition-system-hint">${escapeHtml(hint)}</span>` : ""}
          </div>`;
      })
      .join("");
    if (!rows) return "";
    return `
      <div class="condition-system-group">
        <div class="condition-system-title">${escapeHtml(group.title)}</div>
        ${rows}
      </div>`;
  }).join("");

  return `<div class="condition-systems">${groups}</div>`;
}

/** Top-down class silhouette with corner zones and subsystem list. */
export function buildCarConditionDiagramHtml(
  snap: CarSnapshot,
  parts: ConditionPart[],
): string {
  const sil = silhouetteForClass(snap.classId);
  const [vbW, vbH] = sil.viewBox.split(" ").slice(2).map(Number);
  const byToken = partMap(parts);
  const corners = cornerZonesForClass(snap.classId)
    .map((z) => buildCornerZone(z, byToken))
    .join("");
  const wheels = buildWheelMarkers(snap.classId);
  const overlays = [
    buildOverlayZone("aero_front", sil.nose, byToken, "Front aero"),
    buildOverlayZone("monocoque", sil.cockpit, byToken, "Safety cell"),
    buildOverlayZone("aero_rear", sil.tail, byToken, "Rear aero"),
  ].join("");

  const classLabel = escapeHtml(snap.classId);

  return `
    <div class="condition-diagram-wrap">
      <svg class="condition-diagram-svg condition-diagram-${snap.classId.replace(/[^a-z0-9]/gi, "")}"
        viewBox="${sil.viewBox}" role="img" aria-label="${classLabel} condition diagram">
        <path class="condition-silhouette-outline" d="${sil.outline}"/>
        ${wheels}
        ${overlays}
        ${corners}
        <text class="condition-diagram-front" x="${(vbW / 2).toFixed(1)}" y="6" text-anchor="middle">F</text>
      </svg>
      ${buildSystemsPanel(parts)}
    </div>`;
}
