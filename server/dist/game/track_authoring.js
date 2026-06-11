"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileTrackAuthoring = compileTrackAuthoring;
exports.ensureTrackAuthoringSegments = ensureTrackAuthoringSegments;
exports.rotateAuthoringToStartFinish = rotateAuthoringToStartFinish;
exports.syncTrackPolyline = syncTrackPolyline;
exports.inferTrackAuthoring = inferTrackAuthoring;
exports.inferTrackAuthoringFromTrack = inferTrackAuthoringFromTrack;
const track_exporter_1 = require("./track_exporter");
const polyline_authoring_1 = require("./polyline_authoring");
const track_json_1 = require("./track_json");
function compileTrackAuthoring(authoring, closed) {
    return (0, polyline_authoring_1.compilePolylineFromAuthoring)(authoring.nodes, closed);
}
function ensureTrackAuthoringSegments(authoring) {
    const count = Math.max(0, authoring.nodes.length - 1);
    const existing = authoring.segments ?? [];
    const segments = [];
    for (let i = 0; i < count; i++) {
        segments.push(existing[i] ?? {});
    }
    return segments;
}
/** Rotate closed-circuit authoring so start/finish node is index 0 (lap t=0). */
function rotateAuthoringToStartFinish(authoring) {
    const nodes = authoring.nodes;
    if (nodes.length < 2)
        return authoring;
    let sfIdx = nodes.findIndex((n) => n.start_finish);
    if (sfIdx < 0)
        sfIdx = 0;
    const rotatedNodes = sfIdx === 0
        ? nodes.map((n, i) => ({ ...n, start_finish: i === 0 }))
        : [...nodes.slice(sfIdx), ...nodes.slice(0, sfIdx)].map((n, i) => ({
            ...n,
            start_finish: i === 0,
        }));
    const segs = ensureTrackAuthoringSegments(authoring);
    const rotatedSegments = sfIdx === 0 || segs.length === 0
        ? segs
        : [...segs.slice(sfIdx), ...segs.slice(0, sfIdx)];
    return { nodes: rotatedNodes, segments: rotatedSegments };
}
function syncTrackPolyline(track) {
    if (!track.authoring?.nodes?.length)
        return track;
    const normalized = rotateAuthoringToStartFinish({
        ...track.authoring,
        segments: ensureTrackAuthoringSegments(track.authoring),
    });
    const points = compileTrackAuthoring(normalized, track.closed ?? true);
    const polylines = (0, track_exporter_1.mirrorPolylineEdits)(points);
    const merged = { ...track, authoring: normalized, ...polylines };
    return { ...merged, lap_length: (0, track_exporter_1.recomputeLapLength)(merged) };
}
function inferTrackAuthoring(polyline, closed) {
    if (polyline.length < 2) {
        return { nodes: [], segments: [] };
    }
    const points = polyline.map((p) => ({ x: p.x, z: p.z }));
    const keep = new Set([0, polyline.length - 1]);
    const epsilon = closed ? 18 : 12;
    (0, polyline_authoring_1.douglasPeuckerIndices)(points, 0, polyline.length - 1, epsilon, keep);
    const sorted = [...keep].sort((a, b) => a - b);
    const nodes = [];
    for (let k = 0; k < sorted.length; k++) {
        const idx = sorted[k];
        const pt = polyline[idx];
        let type = "normal";
        if (k > 0 && k < sorted.length - 1) {
            const prev = polyline[sorted[k - 1]];
            const next = polyline[sorted[k + 1]];
            const angle = (0, polyline_authoring_1.interiorAngleDeg)(prev, pt, next);
            if (angle < 150)
                type = "turn_start";
        }
        nodes.push({ x: pt.x, y: pt.y ?? 0, z: pt.z, type, start_finish: k === 0 });
    }
    if (nodes.length > 0 && !nodes.some((n) => n.start_finish)) {
        nodes[0].start_finish = true;
    }
    (0, polyline_authoring_1.inferCornerTurnPairs)(nodes);
    const segments = ensureTrackAuthoringSegments({ nodes, segments: [] });
    return { nodes, segments };
}
function inferTrackAuthoringFromTrack(track) {
    let polyline = (0, track_json_1.canonicalPolyline)(track);
    if (track.lap_length != null && track.lap_length > 0) {
        polyline = (0, track_exporter_1.extractSingleLapPolyline)(polyline, track.lap_length);
    }
    return inferTrackAuthoring(polyline, track.closed ?? true);
}
