import * as fs from "fs";
import * as path from "path";
import type { TrackGeometryPayload } from "../ws_protocol";
import { trackDisplayName, trackJsonPath } from "./track_catalog";

interface TrackJson {
  name: string;
  closed?: boolean;
  lap_length?: number;
  control_points?: Array<{ x: number; z: number }>;
  display_polyline?: Array<{ x: number; z: number }>;
  map_labels?: Array<{
    text: string;
    x: number;
    z: number;
    anchor?: "start" | "middle" | "end";
  }>;
  sectors?: Array<{ name: string; start_t: number; end_t: number }>;
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

  return {
    name: track.name || fallbackName,
    lapLength,
    closed: track.closed ?? true,
    polyline,
    sectors,
    mapLabels: track.map_labels,
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
