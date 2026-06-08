export type LiveryPattern =
  | "solid"
  | "dual_stripe"
  | "center_stripe"
  | "side_bands"
  | "chevron"
  | "gradient_bow"
  | "hood_accent"
  | "split_diagonal";

export const LIVERY_PATTERN_IDS: readonly LiveryPattern[] = [
  "solid",
  "dual_stripe",
  "center_stripe",
  "side_bands",
  "chevron",
  "gradient_bow",
  "hood_accent",
  "split_diagonal",
];

export const DEFAULT_LIVERY_PATTERN: LiveryPattern = "dual_stripe";

/** Max stored logo data URL length in meta JSON. */
export const LOGO_DATA_URL_MAX_CHARS = 96_000;

export interface TeamLiveryPayload {
  primary: string;
  secondary: string;
  pattern: LiveryPattern;
  logoDataUrl?: string | null;
}

export function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

export function isValidLiveryPattern(pattern: string): pattern is LiveryPattern {
  return (LIVERY_PATTERN_IDS as readonly string[]).includes(pattern);
}

export function isValidLogoDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.length > LOGO_DATA_URL_MAX_CHARS) return false;
  return /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(value);
}

export function normalizeTeamLivery(
  input: Partial<TeamLiveryPayload> | null | undefined,
  fallback?: Partial<TeamLiveryPayload>,
): TeamLiveryPayload | null {
  const primary = input?.primary ?? fallback?.primary;
  const secondary = input?.secondary ?? fallback?.secondary;
  if (!primary || !secondary) return null;
  if (!isValidHexColor(primary) || !isValidHexColor(secondary)) return null;

  const patternRaw = input?.pattern ?? fallback?.pattern ?? DEFAULT_LIVERY_PATTERN;
  const pattern = isValidLiveryPattern(patternRaw)
    ? patternRaw
    : DEFAULT_LIVERY_PATTERN;

  let logoDataUrl: string | null = null;
  if (input?.logoDataUrl) {
    if (!isValidLogoDataUrl(input.logoDataUrl)) return null;
    logoDataUrl = input.logoDataUrl;
  } else if (input && "logoDataUrl" in input && input.logoDataUrl === null) {
    logoDataUrl = null;
  } else if (fallback?.logoDataUrl && isValidLogoDataUrl(fallback.logoDataUrl)) {
    logoDataUrl = fallback.logoDataUrl;
  }

  return { primary, secondary, pattern, logoDataUrl };
}
