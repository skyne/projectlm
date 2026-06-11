import * as fs from "fs";
import * as path from "path";
import type { TrackGeometryPayload } from "../ws_protocol";
import { trackDisplayName, trackJsonPath } from "./track_catalog";
import { buildTrackGeometry } from "./track_geometry_build";
import type { TrackJson } from "./track_json";

export function loadTrackGeometryFromPath(
  repoRoot: string,
  trackConfigPath: string,
  fallbackName = "Circuit",
): TrackGeometryPayload | null {
  const abs = path.join(repoRoot, trackConfigPath);
  if (!fs.existsSync(abs)) return null;
  try {
    const track = JSON.parse(fs.readFileSync(abs, "utf8")) as TrackJson;
    return buildTrackGeometry(track, fallbackName);
  } catch {
    return null;
  }
}

export function loadTrackJsonFromPath(
  repoRoot: string,
  trackConfigPath: string,
): TrackJson | null {
  const abs = path.join(repoRoot, trackConfigPath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8")) as TrackJson;
  } catch {
    return null;
  }
}

export function loadTrackGeometryById(
  repoRoot: string,
  trackId: string,
): TrackGeometryPayload | null {
  const rel = trackJsonPath(trackId);
  return loadTrackGeometryFromPath(
    repoRoot,
    rel,
    trackDisplayName(trackId),
  );
}

/** Merge corridor metadata from track JSON onto a native geometry payload. */
export function enrichTrackGeometryFromJson(
  base: TrackGeometryPayload,
  repoRoot: string,
  trackConfigPath: string,
): TrackGeometryPayload {
  const fromJson = loadTrackGeometryFromPath(repoRoot, trackConfigPath, base.name);
  if (!fromJson) return base;
  return {
    ...base,
    defaultWidthM: fromJson.defaultWidthM ?? base.defaultWidthM,
    widthProfile: fromJson.widthProfile ?? base.widthProfile,
    surfaceProfile: fromJson.surfaceProfile ?? base.surfaceProfile,
    surfaceDefaults: fromJson.surfaceDefaults ?? base.surfaceDefaults,
    pitLane: fromJson.pitLane ?? base.pitLane,
    mapLabels: base.mapLabels?.length ? base.mapLabels : fromJson.mapLabels,
  };
}
