export type SectorFlagLevel = 0 | 1 | 2;

export interface ActiveSectorFlag {
  index: number;
  level: SectorFlagLevel;
  displayName: string;
}

export function resolveActiveSectorFlags(
  flags: number[],
  sectorNames?: string[],
): ActiveSectorFlag[] {
  const out: ActiveSectorFlag[] = [];
  for (let i = 0; i < flags.length; i++) {
    const level = flags[i] ?? 0;
    if (level <= 0) continue;
    const name = sectorNames?.[i]?.trim() || `Sector ${i + 1}`;
    out.push({
      index: i,
      level: Math.min(2, level) as SectorFlagLevel,
      displayName: name,
    });
  }
  return out;
}

export function hasLocalSectorFlags(flags: number[]): boolean {
  return flags.some((level) => (level ?? 0) >= 1);
}

function formatSectorList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function formatSectorFlagBanner(
  flags: number[],
  sectorNames?: string[],
): { label: string; severity: "yellow" | "double-yellow" } | null {
  const active = resolveActiveSectorFlags(flags, sectorNames);
  if (!active.length) return null;

  const doubles = active.filter((entry) => entry.level >= 2);
  const yellows = active.filter((entry) => entry.level === 1);
  const parts: string[] = [];

  if (doubles.length) {
    parts.push(
      `Double Yellow — ${formatSectorList(doubles.map((entry) => entry.displayName))}`,
    );
  }
  if (yellows.length) {
    parts.push(
      `Yellow Flag — ${formatSectorList(yellows.map((entry) => entry.displayName))}`,
    );
  }

  return {
    label: parts.join(" · "),
    severity: doubles.length ? "double-yellow" : "yellow",
  };
}

export function sectorFlagTitle(level: number, displayName: string): string {
  if (level >= 2) return `${displayName} — Double Yellow`;
  if (level >= 1) return `${displayName} — Yellow Flag`;
  return displayName;
}

const HAZARD_REASON_LABELS: Record<string, string> = {
  oil: "Oil on track",
  coolant: "Coolant spill",
  debris: "Debris on track",
  fuel: "Fuel spill",
  fire: "Fire on track",
};

export interface SectorFlagTooltipInput {
  sectorIndex: number;
  level: number;
  displayName: string;
  hazards?: { sectorIndex: number; kind: string }[];
  activeIncidentEntryId?: string;
}

/** Hover text for a sector flag marker — includes why the flag is shown when known. */
export function sectorFlagTooltip(input: SectorFlagTooltipInput): string {
  const { sectorIndex, level, displayName, hazards, activeIncidentEntryId } = input;
  const reasons: string[] = [];

  for (const hz of hazards ?? []) {
    if (hz.sectorIndex !== sectorIndex) continue;
    const label = HAZARD_REASON_LABELS[hz.kind] ?? `${hz.kind} on track`;
    if (!reasons.includes(label)) reasons.push(label);
  }
  if (level >= 2 && activeIncidentEntryId) {
    reasons.push("Stranded vehicle");
  }

  const base = sectorFlagTitle(level, displayName);
  if (!reasons.length) return base;
  return `${base} — ${reasons.join(" · ")}`;
}
