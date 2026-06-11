"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTrackGeometry = buildTrackGeometry;
const track_json_1 = require("./track_json");
const perimeter_surfaces_1 = require("./perimeter_surfaces");
function parsePitLane(pit) {
    if (!pit)
        return undefined;
    const out = {};
    if (pit.width_m != null)
        out.widthM = pit.width_m;
    if (pit.offset_m != null)
        out.offsetM = pit.offset_m;
    if (pit.merge_lateral_offset != null) {
        out.mergeLateralOffset = pit.merge_lateral_offset;
    }
    if (pit.merge_blend_m != null)
        out.mergeBlendM = pit.merge_blend_m;
    if (pit.entry_t != null)
        out.entryT = pit.entry_t;
    if (pit.exit_t != null)
        out.exitT = pit.exit_t;
    if (pit.box_distance_m != null)
        out.boxDistanceM = pit.box_distance_m;
    if (pit.speed_limit_ms != null)
        out.speedLimitMs = pit.speed_limit_ms;
    if (pit.polyline?.length) {
        out.polyline = pit.polyline.map((p) => ({
            x: p.x,
            z: p.z,
            role: p.role,
        }));
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function parseSurfaceProfile(profile) {
    if (!profile?.length)
        return undefined;
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
function parseSurfaceDefaults(defaults) {
    if (!defaults)
        return undefined;
    const out = {};
    if (defaults.verge_width_m != null)
        out.vergeWidthM = defaults.verge_width_m;
    if (defaults.runoff_width_m != null)
        out.runoffWidthM = defaults.runoff_width_m;
    if (defaults.kerb_width_m != null)
        out.kerbWidthM = defaults.kerb_width_m;
    return Object.keys(out).length > 0 ? out : undefined;
}
function parseWidthProfile(profile) {
    if (!profile?.length)
        return undefined;
    return profile.map((seg) => ({
        startT: seg.start_t,
        endT: seg.end_t,
        widthM: seg.width_m,
    }));
}
function buildTrackGeometry(track, fallbackName) {
    const polyline = (0, track_json_1.canonicalPolyline)(track).map((p) => ({ x: p.x, z: p.z }));
    const lapLength = track.lap_length ?? 0;
    const sectors = (track.sectors ?? []).map((sector) => {
        const midT = (sector.start_t + sector.end_t) * 0.5;
        const idx = Math.min(polyline.length - 1, Math.max(0, Math.round(midT * Math.max(polyline.length - 1, 0))));
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
    const surfaceProfile = (0, perimeter_surfaces_1.synthesizePerimeterSurfaces)({
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
