import type { CarSnapshot } from "../ws/protocol";
import {
  estimateGarageRebuildSeconds,
  formatGarageRebuildDuration,
  PIT_REPAIR_PART_SEC,
} from "./pitCommands";
import { escapeHtml } from "./mmUi";

export const REPAIR_HEALTH_THRESHOLD = 85;

export const REPAIR_PART_LABELS: Record<string, string> = {
  gearbox: "Gearbox",
  cooling: "Cooling",
  brakes: "Brakes",
  hybrid: "Hybrid",
  monocoque: "Safety cell",
  aero_front: "Front aero",
  aero_rear: "Rear aero",
  body_fl: "Body FL",
  body_fr: "Body FR",
  body_rl: "Body RL",
  body_rr: "Body RR",
  susp_fl: "Susp FL",
  susp_fr: "Susp FR",
  susp_rl: "Susp RL",
  susp_rr: "Susp RR",
};

/** Subsystem tokens shown in pit UI (engine/body use dedicated checkboxes). */
const PIT_SUBSYSTEM_ORDER = [
  "monocoque",
  "gearbox",
  "cooling",
  "brakes",
  "hybrid",
  "aero_front",
  "aero_rear",
  "body_fl",
  "body_fr",
  "body_rl",
  "body_rr",
  "susp_fl",
  "susp_fr",
  "susp_rl",
  "susp_rr",
] as const;

export function repairPartLabel(token: string): string {
  return REPAIR_PART_LABELS[token] ?? token;
}

export function damagedSubsystemParts(snap: CarSnapshot | null | undefined): string[] {
  if (!snap) return [];
  if (snap.sessionRepairable === false || snap.physicallyRepairable === false) return [];
  const garageParts = new Set(snap.partIrreparable ?? []);
  const damaged = new Set(
    Object.entries(snap.partHealth ?? {})
      .filter(([part, health]) => health < REPAIR_HEALTH_THRESHOLD && !garageParts.has(part))
      .map(([part]) => part),
  );
  return PIT_SUBSYSTEM_ORDER.filter((part) => damaged.has(part));
}

export function buildSubsystemRepairHtml(
  snap: CarSnapshot | null | undefined,
  className = "pit-subsystem-repairs",
): string {
  const parts = damagedSubsystemParts(snap);
  if (!parts.length) {
    return `<div class="${className} hidden"></div>`;
  }
  const rows = parts
    .map((part) => {
      const health = snap?.partHealth?.[part] ?? 0;
      const sec = snap?.partRepairSec?.[part] ?? PIT_REPAIR_PART_SEC[part] ?? 8;
      const checked = health < 78 ? " checked" : "";
      return `<label><input type="checkbox" data-repair-part="${part}"${checked} /> ${escapeHtml(repairPartLabel(part))} (${health.toFixed(0)}%, +${sec}s)</label>`;
    })
    .join("");
  return `<div class="${className}"><p class="pit-subsystem-title">Subsystem repairs</p>${rows}</div>`;
}

export function collectSubsystemRepairs(root: ParentNode): string[] {
  const tokens: string[] = [];
  for (const input of root.querySelectorAll<HTMLInputElement>("[data-repair-part]")) {
    if (input.checked) {
      const part = input.getAttribute("data-repair-part");
      if (part) tokens.push(part);
    }
  }
  return tokens;
}

export function estimateSubsystemRepairSeconds(parts: string[]): number {
  return parts.reduce((sum, part) => sum + (PIT_REPAIR_PART_SEC[part] ?? 8), 0);
}

export function canRequestGarageRebuild(snap: CarSnapshot | null | undefined): boolean {
  if (!snap) return false;
  if (snap.garageRebuildActive) return false;
  if (snap.physicallyRepairable === false) return false;
  if (snap.sessionRepairable === false) return false;
  return true;
}

export function garageRebuildEstimateLabel(snap: CarSnapshot | null | undefined): string {
  const sec = estimateGarageRebuildSeconds(snap?.totalRepairSec ?? 0);
  return formatGarageRebuildDuration(sec);
}
