import * as fs from "fs";
import * as path from "path";
import type {
  TrackGeometryPayload,
  TrackPitLaneGeometry,
  TrackSurfaceDefaults,
  TrackSurfaceSegment,
  TrackWidthSegment,
} from "../ws_protocol";
import { trackDisplayName, trackJsonPath } from "./track_catalog";
import { synthesizePerimeterSurfaces } from "./perimeter_surfaces";

interface TrackJson {
  name: string;
  closed?: boolean;
  lap_length?: number;
  track_width_m?: number;
  width_profile?: Array<{
    name?: string;
    start_t: number;
    end_t: number;
    width_m: number;
  }>;
  pit_lane?: {
    width_m?: number;
    offset_m?: number;
    merge_lateral_offset?: number;
    merge_blend_m?: number;
  };
  control_points?: Array<{ x: number; z: number }>;
  display_polyline?: Array<{ x: number; z: number }>;
  map_labels?: Array<{
    text: string;
    x: number;
    z: number;
    anchor?: "start" | "middle" | "end";
  }>;
  sectors?: Array<{ name: string; start_t: number; end_t: number }>;
  surface_defaults?: {
    verge_width_m?: number;
    runoff_width_m?: number;
    kerb_width_m?: number;
  };
  surface_profile?: Array<{
    name?: string;
    start_t: number;
    end_t: number;
    side: "inboard" | "outboard" | "both";
    surface: string;
    width_m: number;
    width_start_m?: number;
    width_end_m?: number;
    inner_offset_m?: number;
    envelope?: string;
    variant?: string;
    grip_multiplier?: number;
  }>;
}

function parsePitLane(pit?: TrackJson["pit_lane"]): TrackPitLaneGeometry | undefined {
  if (!pit) return undefined;
  const out: TrackPitLaneGeometry = {};
  if (pit.width_m != null) out.widthM = pit.width_m;
  if (pit.offset_m != null) out.offsetM = pit.offset_m;
  if (pit.merge_lateral_offset != null) out.mergeLateralOffset = pit.merge_lateral_offset;
  if (pit.merge_blend_m != null) out.mergeBlendM = pit.merge_blend_m;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseSurfaceProfile(
  profile?: TrackJson["surface_profile"],
): TrackSurfaceSegment[] | undefined {
  if (!profile?.length) return undefined;
  return profile.map((seg) => ({
    startT: seg.start_t,
    endT: seg.end_t,
    side: seg.side,
    surface: seg.surface,
    widthM: seg.width_m,
    ...(seg.width_start_m != null ? { widthStartM: seg.width_start_m } : {}),
    ...(seg.width_end_m != null ? { widthEndM: seg.width_end_m } : {}),
    ...(seg.inner_offset_m != null ? { innerOffsetM: seg.inner_offset_m } : {}),
    ...(seg.envelope != null ? { envelope: seg.envelope } : {}),
    ...(seg.variant != null ? { variant: seg.variant } : {}),
    ...(seg.grip_multiplier != null ? { gripMultiplier: seg.grip_multiplier } : {}),
    ...(seg.name != null ? { name: seg.name } : {}),
  }));
}

function parseSurfaceDefaults(
  defaults?: TrackJson["surface_defaults"],
): TrackSurfaceDefaults | undefined {
  if (!defaults) return undefined;
  const out: TrackSurfaceDefaults = {};
  if (defaults.verge_width_m != null) out.vergeWidthM = defaults.verge_width_m;
  if (defaults.runoff_width_m != null) out.runoffWidthM = defaults.runoff_width_m;
  if (defaults.kerb_width_m != null) out.kerbWidthM = defaults.kerb_width_m;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseWidthProfile(
  profile?: TrackJson["width_profile"],
): TrackWidthSegment[] | undefined {
  if (!profile?.length) return undefined;
  return profile.map((seg) => ({
    startT: seg.start_t,
    endT: seg.end_t,
    widthM: seg.width_m,
  }));
}

function buildGeometry(track: TrackJson, fallbackName: string): TrackGeometryPayload {
  const polyline =
    track.display_polyline?.map((p) => ({ x: p.x, z: p.z })) ??
    track.control_points?.map((p) => ({ x: p.x, z: p.z })) ??
    [];

  const lapLength = track.lap_length ?? 0;
  const sectors = (track.sectors ?? []).map((sector) => {
    const midT = (sector.start_t + sector.end_t) * 0.5;
    const idx = Math.min(
      polyline.length - 1,
      Math.max(0, Math.round(midT * Math.max(polyline.length - 1, 0))),
    );
    const label = polyline[idx] ?? { x: 0, z: 0 };
    return {
      name: sector.name,
      startT: sector.start_t,
      endT: sector.end_t,
      labelX: label.x,
      labelZ: label.z,
    };
  });

  const defaultWidthM = track.track_width_m;
  const widthProfile = parseWidthProfile(track.width_profile);
  const surfaceDefaults = parseSurfaceDefaults(track.surface_defaults);
  const surfaceProfile = synthesizePerimeterSurfaces({
    profile: parseSurfaceProfile(track.surface_profile) ?? [],
    defaultWidthM: defaultWidthM ?? 12,
    widthProfile,
    surfaceDefaults,
  });
  const pitLane = parsePitLane(track.pit_lane);

  return {
    name: track.name || fallbackName,
    lapLength,
    closed: track.closed ?? true,
    polyline,
    sectors,
    mapLabels: track.map_labels,
    ...(defaultWidthM != null ? { defaultWidthM } : {}),
    ...(widthProfile ? { widthProfile } : {}),
    ...(surfaceProfile.length > 0 ? { surfaceProfile } : {}),
    ...(surfaceDefaults ? { surfaceDefaults } : {}),
    ...(pitLane ? { pitLane } : {}),
  };
}

export function loadTrackGeometryFromPath(
  repoRoot: string,
  trackConfigPath: string,
  fallbackName = "Circuit",
): TrackGeometryPayload | null {
  const abs = path.join(repoRoot, trackConfigPath);
  if (!fs.existsSync(abs)) return null;
  try {
    const track = JSON.parse(fs.readFileSync(abs, "utf8")) as TrackJson;
    return buildGeometry(track, fallbackName);
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
