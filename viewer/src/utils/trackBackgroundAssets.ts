import type { TrackTheme } from "./trackThemes";
import { TRACK_SURFACE_IDS, type TrackSurfaceId } from "./trackCatalog";

/** Unique biome themes with pregenerated outfield artwork. */
export const TRACK_BG_THEME_IDS = [
  "mediterranean",
  "forest",
  "desert",
  "tropical",
  "temperate",
  "default",
] as const;

export type TrackBgThemeId = (typeof TRACK_BG_THEME_IDS)[number];

function themeAssetId(theme: TrackTheme): TrackBgThemeId {
  return TRACK_BG_THEME_IDS.includes(theme.id as TrackBgThemeId) ? (theme.id as TrackBgThemeId) : "default";
}

export function trackBiomeBackgroundUrl(theme: TrackTheme): string {
  return `/assets/track_bg/${themeAssetId(theme)}.png`;
}

export function hasBakedTrackSurface(trackId?: string): trackId is TrackSurfaceId {
  return !!trackId && (TRACK_SURFACE_IDS as readonly string[]).includes(trackId);
}

export function trackSurfaceBackgroundUrl(trackId?: string, theme?: TrackTheme): string {
  if (hasBakedTrackSurface(trackId)) {
    return `/assets/track_bg/tracks/${trackId}.png`;
  }
  return trackBiomeBackgroundUrl(theme ?? { id: "default" } as TrackTheme);
}

/** @deprecated use trackSurfaceBackgroundUrl */
export function trackBackgroundUrl(theme: TrackTheme): string {
  return trackBiomeBackgroundUrl(theme);
}
