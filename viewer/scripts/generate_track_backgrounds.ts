/**
 * Bake outfield atmosphere (and per-track infield) to PNG for the live map.
 *
 *   cd viewer && npm run generate:track-bg
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { BIOME_THEMES, TRACK_BIOMES, type TrackTheme } from "../src/utils/trackThemes.ts";
import { TRACK_BG_THEME_IDS } from "../src/utils/trackBackgroundAssets.ts";
import {
  TRACK_JSON_PATHS,
  TRACK_SURFACE_IDS,
  type TrackSurfaceId,
} from "../src/utils/trackCatalog.ts";
import { computeTrackLayout } from "../src/utils/trackLayout.ts";
import type { TrackGeometryPayload } from "../src/ws/protocol.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.resolve(__dirname, "../public/assets/track_bg");
const TRACK_OUT_DIR = path.join(OUT_DIR, "tracks");
/** Normalized viewBox the runtime biome bake stretches to fit. */
const BIOME_VIEW = 1000;
/** Bake resolution — high enough to stay sharp on large monitors. */
const MAX_RENDER_PX = 2048;

interface TrackJson {
  name: string;
  closed?: boolean;
  lap_length?: number;
  control_points?: Array<{ x: number; z: number }>;
  display_polyline?: Array<{ x: number; z: number }>;
}

function buildGeometry(track: TrackJson, fallbackName: string): TrackGeometryPayload {
  const polyline =
    track.display_polyline?.map((p) => ({ x: p.x, z: p.z })) ??
    track.control_points?.map((p) => ({ x: p.x, z: p.z })) ??
    [];
  return {
    name: track.name || fallbackName,
    lapLength: track.lap_length ?? 0,
    closed: track.closed ?? true,
    polyline,
    sectors: [],
  };
}

function atmosphereEllipses(
  theme: TrackTheme,
  cx: number,
  cy: number,
  span: number,
): string {
  const patches = [
    { dx: -span * 0.28, dy: -span * 0.2, rx: span * 0.34, ry: span * 0.28, fill: theme.terrainPrimary, op: 0.55 },
    { dx: span * 0.3, dy: span * 0.18, rx: span * 0.3, ry: span * 0.24, fill: theme.terrainSecondary, op: 0.5 },
    { dx: span * 0.08, dy: span * 0.32, rx: span * 0.22, ry: span * 0.18, fill: theme.dirt, op: 0.35 },
    { dx: -span * 0.12, dy: span * 0.28, rx: span * 0.18, ry: span * 0.14, fill: theme.dirt, op: 0.28 },
    { dx: span * 0.22, dy: -span * 0.26, rx: span * 0.26, ry: span * 0.2, fill: theme.terrainPrimary, op: 0.42 },
  ];
  return patches
    .map(
      (p) =>
        `<ellipse cx="${cx + p.dx}" cy="${cy + p.dy}" rx="${p.rx}" ry="${p.ry}" fill="${p.fill}" opacity="${p.op}" filter="url(#terrain-blur)"/>`,
    )
    .join("");
}

function atmosphereDefs(): string {
  return `<defs>
    <filter id="terrain-blur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="terrain-noise" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="4" seed="12" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
      <feBlend in="SourceGraphic" in2="mono" mode="multiply"/>
    </filter>
  </defs>`;
}

function buildBiomeAtmosphereSvg(theme: TrackTheme): string {
  const cx = BIOME_VIEW * 0.5;
  const cy = BIOME_VIEW * 0.46;
  const ellipses = atmosphereEllipses(theme, cx, cy, BIOME_VIEW);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MAX_RENDER_PX}" height="${MAX_RENDER_PX}" viewBox="0 0 ${BIOME_VIEW} ${BIOME_VIEW}">
  <defs>
    <radialGradient id="track-bg-gradient" cx="50%" cy="46%" r="82%">
      <stop offset="0%" stop-color="${theme.infieldLight}"/>
      <stop offset="45%" stop-color="${theme.outfield}"/>
      <stop offset="100%" stop-color="${theme.surfaceDeep}"/>
    </radialGradient>
    <linearGradient id="track-sunlight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="35%" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.12"/>
    </linearGradient>
    <radialGradient id="track-vignette" cx="50%" cy="48%" r="68%">
      <stop offset="60%" stop-color="transparent" stop-opacity="1"/>
      <stop offset="100%" stop-color="${theme.surfaceDeep}" stop-opacity="0.55"/>
    </radialGradient>
    <filter id="terrain-blur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="terrain-noise" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="4" seed="12" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
      <feBlend in="SourceGraphic" in2="mono" mode="multiply"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${BIOME_VIEW}" height="${BIOME_VIEW}" fill="url(#track-bg-gradient)" filter="url(#terrain-noise)"/>
  ${ellipses}
  <rect x="0" y="0" width="${BIOME_VIEW}" height="${BIOME_VIEW}" fill="url(#track-sunlight)" pointer-events="none"/>
  <rect x="0" y="0" width="${BIOME_VIEW}" height="${BIOME_VIEW}" fill="url(#track-vignette)" pointer-events="none"/>
</svg>`;
}

function buildTrackSurfaceSvg(theme: TrackTheme, layout: ReturnType<typeof computeTrackLayout>): string {
  const { viewBoxX, viewBoxY, viewWidth, viewHeight, pathD, centroid } = layout!;
  const cx = centroid.x;
  const cy = centroid.y;
  const span = Math.max(viewWidth, viewHeight);
  const ellipses = atmosphereEllipses(theme, cx, cy, span);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${viewWidth} ${viewHeight}">
  ${atmosphereDefs()}
  <defs>
    <radialGradient id="track-bg-gradient" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${span * 0.55}">
      <stop offset="0%" stop-color="${theme.infieldLight}"/>
      <stop offset="45%" stop-color="${theme.outfield}"/>
      <stop offset="100%" stop-color="${theme.surfaceDeep}"/>
    </radialGradient>
    <radialGradient id="track-infield-gradient" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${span * 0.38}">
      <stop offset="0%" stop-color="${theme.infieldLight}"/>
      <stop offset="55%" stop-color="${theme.infield}"/>
      <stop offset="100%" stop-color="${theme.infield}"/>
    </radialGradient>
    <linearGradient id="track-sunlight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="35%" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.12"/>
    </linearGradient>
    <radialGradient id="track-vignette" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${span * 0.52}">
      <stop offset="60%" stop-color="transparent" stop-opacity="1"/>
      <stop offset="100%" stop-color="${theme.surfaceDeep}" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewWidth}" height="${viewHeight}" fill="url(#track-bg-gradient)" filter="url(#terrain-noise)"/>
  ${ellipses}
  <path d="${pathD}" fill="url(#track-infield-gradient)" stroke="none"/>
  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewWidth}" height="${viewHeight}" fill="url(#track-sunlight)" pointer-events="none"/>
  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewWidth}" height="${viewHeight}" fill="url(#track-vignette)" pointer-events="none"/>
</svg>`;
}

function renderDimensions(viewWidth: number, viewHeight: number): { width: number; height: number } {
  const aspect = viewWidth / viewHeight;
  if (aspect >= 1) {
    return { width: MAX_RENDER_PX, height: Math.max(1, Math.round(MAX_RENDER_PX / aspect)) };
  }
  return { width: Math.max(1, Math.round(MAX_RENDER_PX * aspect)), height: MAX_RENDER_PX };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TRACK_OUT_DIR, { recursive: true });

  const launchOpts = { headless: true };
  let browser;
  try {
    browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
  } catch {
    browser = await chromium.launch(launchOpts);
  }

  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const id of TRACK_BG_THEME_IDS) {
    const theme = BIOME_THEMES[id];
    if (!theme) {
      console.warn(`[track-bg] skip unknown theme ${id}`);
      continue;
    }

    const svg = buildBiomeAtmosphereSvg(theme);
    await page.setViewportSize({ width: MAX_RENDER_PX, height: MAX_RENDER_PX });
    await page.setContent(
      `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#000;overflow:hidden">${svg}</body></html>`,
      { waitUntil: "load" },
    );
    await page.waitForTimeout(150);

    const out = path.join(OUT_DIR, `${id}.png`);
    await page.locator("svg").screenshot({ path: out, omitBackground: false });
    console.log(`[track-bg] wrote ${out} (${fs.statSync(out).size} bytes)`);
  }

  for (const trackId of TRACK_SURFACE_IDS) {
    const rel = TRACK_JSON_PATHS[trackId as TrackSurfaceId];
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`[track-bg] skip missing track ${trackId}`);
      continue;
    }

    const track = JSON.parse(fs.readFileSync(abs, "utf8")) as TrackJson;
    const geometry = buildGeometry(track, trackId);
    const layout = computeTrackLayout(geometry);
    if (!layout) {
      console.warn(`[track-bg] skip empty geometry ${trackId}`);
      continue;
    }

    const biomeKey = TRACK_BIOMES[trackId] ?? "default";
    const theme = BIOME_THEMES[biomeKey] ?? BIOME_THEMES.default;
    const svg = buildTrackSurfaceSvg(theme, layout);
    const { width, height } = renderDimensions(layout.viewWidth, layout.viewHeight);

    await page.setViewportSize({ width, height });
    await page.setContent(
      `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#000;overflow:hidden">${svg}</body></html>`,
      { waitUntil: "load" },
    );
    await page.waitForTimeout(200);

    const out = path.join(TRACK_OUT_DIR, `${trackId}.png`);
    await page.locator("svg").screenshot({ path: out, omitBackground: false });
    console.log(`[track-bg] wrote ${out} (${fs.statSync(out).size} bytes)`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
