/** Authoring JSON shape for tracks/*.json (single source of truth). */

export interface TrackPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface TrackSectorJson {
  name: string;
  start_t: number;
  end_t: number;
  max_speed_ms?: number;
  straight?: boolean;
}

export interface TrackWidthSegmentJson {
  name?: string;
  start_t: number;
  end_t: number;
  width_m: number;
}

export interface TrackSurfaceSegmentJson {
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
}

export type PitLanePointRole = "entry" | "box" | "exit" | "waypoint";

export interface PitLanePointJson extends TrackPoint3 {
  role: PitLanePointRole;
}

/** High-level sculpt nodes; compiled to dense polyline for sim/viewer. */
export type PolylineNodeType =
  | "join"
  | "normal"
  | "turn_start"
  | "turn_mid"
  | "turn_end"
  | "box";
export type PitLaneNodeType = PolylineNodeType;

export interface PolylineAuthoringNode extends TrackPoint3 {
  type: PolylineNodeType;
  /** Layout: marks start/finish line (lap t=0); only one per track, kept at nodes[0]. */
  start_finish?: boolean;
  /** join nodes: sim entry/exit peel & merge */
  join_role?: "entry" | "exit";
  /** join nodes: normalized t on racing line when snapped to track */
  track_t?: number;
  /** Layout: asphalt half-width hint at this node (drives width_profile when set). */
  width_m?: number;
}

export type PitLaneAuthoringNode = PolylineAuthoringNode;

export interface TrackAuthoringSegment {
  max_speed_ms?: number;
  straight?: boolean;
  width_m?: number;
}

export interface TrackAuthoring {
  nodes: PolylineAuthoringNode[];
  /** segments[i] spans nodes[i] → nodes[i + 1] (wraps on closed circuits) */
  segments?: TrackAuthoringSegment[];
}

export interface PitLaneAuthoringSegment {
  speed_limit_ms?: number;
  zone?: "speed_limit" | "blend" | "none";
}

export interface PitLaneAuthoring {
  nodes: PolylineAuthoringNode[];
  /** segments[i] spans nodes[i] → nodes[i + 1] */
  segments?: PitLaneAuthoringSegment[];
}

export interface TrackPitLaneJson {
  width_m?: number;
  offset_m?: number;
  merge_lateral_offset?: number;
  merge_blend_m?: number;
  /** Racing-line t where cars peel into pit (typically near 1.0). */
  entry_t?: number;
  /** Racing-line t where cars merge back (typically near 0.0). */
  exit_t?: number;
  box_distance_m?: number;
  speed_limit_ms?: number;
  polyline?: PitLanePointJson[];
  /** Sparse editor nodes; polyline is compiled output for sim. */
  authoring?: PitLaneAuthoring;
}

export interface TrackMapLabelJson {
  text: string;
  x: number;
  z: number;
  anchor?: "start" | "middle" | "end";
}

/** Editor-only tracing image; optional on catalog tracks, common in drafts. */
export interface TrackReferenceOverlayJson {
  /** PNG/SVG as data URL or resolvable href. */
  href: string;
  center_x: number;
  center_z: number;
  /** Width in world meters; height = width_m / aspect. */
  width_m: number;
  /** Image natural width / height. */
  aspect: number;
  opacity?: number;
  /** When true, overlay is locked to the map (pan/zoom with track). */
  frozen?: boolean;
}

export interface TrackJson {
  name: string;
  closed?: boolean;
  lap_length?: number;
  interpolation?: "linear" | "catmull";
  track_width_m?: number;
  control_points?: TrackPoint3[];
  display_polyline?: TrackPoint3[];
  /** Sparse layout editor nodes; polylines are compiled output for sim. */
  authoring?: TrackAuthoring;
  sectors?: TrackSectorJson[];
  width_profile?: TrackWidthSegmentJson[];
  width_metadata?: Record<string, unknown>;
  pit_lane?: TrackPitLaneJson;
  surface_defaults?: {
    verge_width_m?: number;
    runoff_width_m?: number;
    kerb_width_m?: number;
  };
  surface_profile?: TrackSurfaceSegmentJson[];
  surface_metadata?: Record<string, unknown>;
  map_labels?: TrackMapLabelJson[];
  label_source?: Record<string, unknown>;
  reference_overlay?: TrackReferenceOverlayJson;
}

export const SYNTH_PERIMETER_PREFIX = "synth:perimeter-";

export function stripSynthSurfaceSegments(
  profile: TrackSurfaceSegmentJson[] | undefined,
): TrackSurfaceSegmentJson[] | undefined {
  if (!profile?.length) return profile;
  const filtered = profile.filter(
    (seg) => !seg.name?.startsWith(SYNTH_PERIMETER_PREFIX),
  );
  return filtered.length > 0 ? filtered : undefined;
}

export function canonicalPolyline(track: TrackJson): TrackPoint3[] {
  return track.display_polyline ?? track.control_points ?? [];
}

export function ensureAuthoringPolylines(track: TrackJson): TrackJson {
  const poly = canonicalPolyline(track);
  return {
    ...track,
    display_polyline: poly.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z })),
    control_points: poly.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z })),
  };
}
