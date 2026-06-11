"use strict";
/** Authoring JSON shape for tracks/*.json (single source of truth). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNTH_PERIMETER_PREFIX = void 0;
exports.stripSynthSurfaceSegments = stripSynthSurfaceSegments;
exports.canonicalPolyline = canonicalPolyline;
exports.ensureAuthoringPolylines = ensureAuthoringPolylines;
exports.SYNTH_PERIMETER_PREFIX = "synth:perimeter-";
function stripSynthSurfaceSegments(profile) {
    if (!profile?.length)
        return profile;
    const filtered = profile.filter((seg) => !seg.name?.startsWith(exports.SYNTH_PERIMETER_PREFIX));
    return filtered.length > 0 ? filtered : undefined;
}
function canonicalPolyline(track) {
    return track.display_polyline ?? track.control_points ?? [];
}
function ensureAuthoringPolylines(track) {
    const poly = canonicalPolyline(track);
    return {
        ...track,
        display_polyline: poly.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z })),
        control_points: poly.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z })),
    };
}
