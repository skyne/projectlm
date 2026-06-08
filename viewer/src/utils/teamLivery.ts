import type {
  LiveryPattern,
  MetaStatePayload,
  TeamLiveryPayload,
} from "../ws/protocol";
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "./liveryColors";

export type { LiveryPattern, TeamLiveryPayload };
export type TeamLiveryView = TeamLiveryPayload;

export const LIVERY_PATTERNS: ReadonlyArray<{
  id: LiveryPattern;
  label: string;
  description: string;
}> = [
  { id: "solid", label: "Solid", description: "Primary body with subtle secondary accents" },
  { id: "dual_stripe", label: "Dual stripe", description: "Twin racing stripes over the body" },
  { id: "center_stripe", label: "Center stripe", description: "Single wide stripe down the spine" },
  { id: "side_bands", label: "Side bands", description: "Lower side panels in secondary color" },
  { id: "chevron", label: "Chevron", description: "Arrow motif on the nose" },
  { id: "gradient_bow", label: "Gradient", description: "Fade from nose to tail" },
  { id: "hood_accent", label: "Hood & deck", description: "Secondary on nose and rear deck" },
  { id: "split_diagonal", label: "Diagonal split", description: "Diagonal two-tone split" },
];

export const DEFAULT_LIVERY_PATTERN: LiveryPattern = "dual_stripe";

export function randomLiveryPattern(): LiveryPattern {
  const idx = Math.floor(Math.random() * LIVERY_PATTERNS.length);
  return LIVERY_PATTERNS[idx]?.id ?? DEFAULT_LIVERY_PATTERN;
}

export function isLiveryPattern(value: string): value is LiveryPattern {
  return LIVERY_PATTERNS.some((p) => p.id === value);
}

export function defaultTeamLivery(
  overrides?: Partial<TeamLiveryPayload>,
): TeamLiveryPayload {
  return {
    primary: overrides?.primary ?? DEFAULT_PRIMARY,
    secondary: overrides?.secondary ?? DEFAULT_SECONDARY,
    pattern: overrides?.pattern ?? DEFAULT_LIVERY_PATTERN,
    logoDataUrl: overrides?.logoDataUrl ?? null,
  };
}

/** Resolve full livery from meta, supporting legacy teamColors-only saves. */
export function resolveTeamLivery(meta: MetaStatePayload | null | undefined): TeamLiveryPayload {
  if (meta?.teamLivery) {
    return defaultTeamLivery(meta.teamLivery);
  }
  if (meta?.teamColors) {
    return defaultTeamLivery({
      primary: meta.teamColors.primary,
      secondary: meta.teamColors.secondary,
    });
  }
  return defaultTeamLivery();
}

export function liveryCssStripBackground(
  primary: string,
  secondary: string,
  pattern: LiveryPattern,
): string {
  switch (pattern) {
    case "solid":
      return primary;
    case "dual_stripe":
      return `linear-gradient(90deg, ${primary} 0%, ${primary} 38%, ${secondary} 38%, ${secondary} 44%, ${primary} 44%, ${primary} 56%, ${secondary} 56%, ${secondary} 62%, ${primary} 62%)`;
    case "center_stripe":
      return `linear-gradient(90deg, ${primary} 0%, ${primary} 42%, ${secondary} 42%, ${secondary} 58%, ${primary} 58%)`;
    case "side_bands":
      return `linear-gradient(180deg, ${primary} 0%, ${primary} 55%, ${secondary} 55%, ${secondary} 100%)`;
    case "chevron":
      return `linear-gradient(118deg, ${secondary} 0%, ${secondary} 22%, ${primary} 22%, ${primary} 100%)`;
    case "gradient_bow":
      return `linear-gradient(90deg, ${secondary} 0%, ${primary} 50%, ${secondary} 100%)`;
    case "hood_accent":
      return `linear-gradient(180deg, ${secondary} 0%, ${secondary} 48%, transparent 48%), linear-gradient(90deg, ${secondary} 0%, ${secondary} 22%, ${primary} 22%, ${primary} 100%)`;
    case "split_diagonal":
      return `linear-gradient(118deg, ${primary} 0%, ${primary} 50%, ${secondary} 50%, ${secondary} 100%)`;
    default:
      return `linear-gradient(90deg, ${primary}, ${secondary})`;
  }
}
