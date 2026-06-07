import { escapeHtml } from "./mmUi";

export type TyreCompoundKey =
  | "soft"
  | "medium"
  | "hard"
  | "endurance"
  | "intermediate"
  | "wet";

const COMPOUND_LABELS: Record<TyreCompoundKey, string> = {
  soft: "Soft",
  medium: "Medium",
  hard: "Hard",
  endurance: "Endurance",
  intermediate: "Intermediate",
  wet: "Wet",
};

export function normalizeTyreCompound(raw?: string): TyreCompoundKey {
  const v = (raw ?? "medium").trim().toLowerCase();
  if (v === "wet" || v.includes("full_wet") || v === "wets") return "wet";
  if (v === "intermediate" || v === "inter" || v === "inters") return "intermediate";
  if (v.includes("soft")) return "soft";
  if (v.includes("hard")) return "hard";
  if (v.includes("endur") || v.includes("michelin")) return "endurance";
  return "medium";
}

export function tyreCompoundLabel(raw?: string): string {
  return COMPOUND_LABELS[normalizeTyreCompound(raw)];
}

export function tyreCompoundIconSrc(raw?: string): string {
  return `/assets/tyres/${normalizeTyreCompound(raw)}.svg`;
}

export function tyreCompoundIconHtml(
  raw?: string,
  options: { size?: number; title?: string; className?: string } = {},
): string {
  const key = normalizeTyreCompound(raw);
  const label = options.title ?? tyreCompoundLabel(raw);
  const size = options.size ?? 18;
  const extraClass = options.className ? ` ${options.className}` : "";
  return `<img class="tyre-compound-icon tyre-compound-${key}${extraClass}" src="${tyreCompoundIconSrc(raw)}" alt="${escapeHtml(label)}" title="${escapeHtml(label)}" width="${size}" height="${size}" loading="lazy" decoding="async" />`;
}
