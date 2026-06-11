"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.polylineArcLengthM = polylineArcLengthM;
exports.polylineExceedsLapLength = polylineExceedsLapLength;
exports.extractSingleLapPolyline = extractSingleLapPolyline;
exports.recomputeLapLength = recomputeLapLength;
exports.prepareTrackForExport = prepareTrackForExport;
exports.trackJsonToFile = trackJsonToFile;
exports.parseTrackJson = parseTrackJson;
exports.validateTrackJson = validateTrackJson;
exports.mirrorPolylineEdits = mirrorPolylineEdits;
const track_json_1 = require("./track_json");
const track_geometry_build_1 = require("./track_geometry_build");
function polylineArcLengthM(points, closed) {
    if (points.length < 2)
        return 0;
    let total = 0;
    const limit = closed ? points.length : points.length - 1;
    for (let i = 0; i < limit; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        total += Math.hypot(dx, dz);
    }
    return total;
}
/** True when polyline chord length exceeds stored lap length (sim scales via setTargetLength). */
function polylineExceedsLapLength(points, lapLengthM) {
    if (lapLengthM <= 0 || points.length < 2)
        return false;
    return polylineArcLengthM(points, false) > lapLengthM * 1.15;
}
/**
 * Trim an oversampled / multi-lap polyline to the first lap_length meters.
 * Used before layout authoring inference on catalog tracks whose control points
 * trace more than one lap while lap_length is the authoritative sim distance.
 */
function extractSingleLapPolyline(polyline, lapLengthM) {
    if (polyline.length < 2 || lapLengthM <= 0)
        return polyline;
    const flat = polyline.map((p) => ({ x: p.x, z: p.z }));
    if (!polylineExceedsLapLength(flat, lapLengthM))
        return polyline;
    let accum = 0;
    const out = [polyline[0]];
    for (let i = 1; i < polyline.length; i++) {
        const prev = polyline[i - 1];
        const cur = polyline[i];
        const seg = Math.hypot(cur.x - prev.x, cur.z - prev.z);
        if (accum + seg >= lapLengthM) {
            const remain = lapLengthM - accum;
            if (remain > 1e-6 && seg > 1e-6) {
                const t = remain / seg;
                out.push({
                    x: prev.x + (cur.x - prev.x) * t,
                    y: (prev.y ?? 0) + ((cur.y ?? 0) - (prev.y ?? 0)) * t,
                    z: prev.z + (cur.z - prev.z) * t,
                });
            }
            break;
        }
        accum += seg;
        out.push(cur);
    }
    return out.length >= 2 ? out : polyline;
}
function recomputeLapLength(track) {
    const poly = (0, track_json_1.canonicalPolyline)(track).map((p) => ({ x: p.x, z: p.z }));
    const closed = track.closed ?? true;
    const arc = polylineArcLengthM(poly, closed);
    const existing = track.lap_length;
    if (existing != null && existing > 0 && polylineExceedsLapLength(poly, existing)) {
        return existing;
    }
    return arc;
}
function prepareTrackForExport(track) {
    const withPolylines = (0, track_json_1.ensureAuthoringPolylines)(track);
    const lapLength = recomputeLapLength(withPolylines);
    const surfaceProfile = (0, track_json_1.stripSynthSurfaceSegments)(withPolylines.surface_profile);
    return {
        ...withPolylines,
        lap_length: lapLength,
        ...(surfaceProfile ? { surface_profile: surfaceProfile } : {}),
    };
}
function trackJsonToFile(track) {
    const prepared = prepareTrackForExport(track);
    return `${JSON.stringify(prepared, null, 2)}\n`;
}
function parseTrackJson(raw) {
    if (!raw || typeof raw !== "object") {
        throw new Error("track must be a JSON object");
    }
    const track = raw;
    if (!track.name || typeof track.name !== "string") {
        throw new Error("track.name is required");
    }
    const poly = (0, track_json_1.canonicalPolyline)(track);
    if (poly.length < 2) {
        throw new Error("track needs at least two polyline points");
    }
    return track;
}
function validateTrackJson(track, fallbackName = "Circuit") {
    parseTrackJson(track);
    (0, track_geometry_build_1.buildTrackGeometry)(track, fallbackName);
}
function mirrorPolylineEdits(points) {
    const normalized = points.map((p) => ({
        x: p.x,
        y: p.y ?? 0,
        z: p.z,
    }));
    return {
        display_polyline: normalized,
        control_points: normalized.map((p) => ({ ...p })),
    };
}
