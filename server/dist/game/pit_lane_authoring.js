"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compilePitLaneAuthoring = compilePitLaneAuthoring;
exports.ensureAuthoringSegments = ensureAuthoringSegments;
exports.syncPitLanePolyline = syncPitLanePolyline;
exports.inferPitLaneAuthoring = inferPitLaneAuthoring;
exports.projectPointOnTrack = projectPointOnTrack;
exports.snapJoinNodeToTrack = snapJoinNodeToTrack;
exports.syncAuthoringTrack = syncAuthoringTrack;
const polyline_authoring_1 = require("./polyline_authoring");
const track_authoring_1 = require("./track_authoring");
const track_json_1 = require("./track_json");
function roleForAuthoringNode(node) {
    if (node.type === "box")
        return "box";
    if (node.type === "join") {
        return node.join_role === "exit" ? "exit" : "entry";
    }
    return "waypoint";
}
function appendCompiledPoint(out, pt, role) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - pt.x, last.z - pt.z) < 0.5)
        return;
    out.push({ x: pt.x, y: pt.y, z: pt.z, role });
}
function compilePitLaneAuthoring(authoring, pit) {
    const nodes = authoring.nodes;
    if (nodes.length < 2)
        return [];
    const compiled = (0, polyline_authoring_1.compilePolylineFromAuthoring)(nodes, false);
    const out = [];
    for (let i = 0; i < compiled.length; i++) {
        const pt = compiled[i];
        let role = "waypoint";
        for (let n = 0; n < nodes.length; n++) {
            const node = nodes[n];
            if (Math.hypot(node.x - pt.x, node.z - pt.z) < 2) {
                role = roleForAuthoringNode(node);
                break;
            }
        }
        if (i === 0)
            role = roleForAuthoringNode(nodes[0]);
        if (i === compiled.length - 1)
            role = roleForAuthoringNode(nodes[nodes.length - 1]);
        appendCompiledPoint(out, pt, role);
    }
    if (out.length >= 2 && pit?.box_distance_m != null) {
        let accum = 0;
        let boxIdx = 0;
        for (let k = 1; k < out.length; k++) {
            accum += Math.hypot(out[k].x - out[k - 1].x, out[k].z - out[k - 1].z);
            if (accum >= pit.box_distance_m) {
                boxIdx = k;
                break;
            }
        }
        const existingBox = out.findIndex((p) => p.role === "box");
        if (existingBox >= 0) {
            for (let k = 0; k < out.length; k++) {
                if (out[k].role === "box" && k !== existingBox)
                    out[k].role = "waypoint";
            }
        }
        else {
            out[boxIdx].role = "box";
        }
    }
    return out;
}
function ensureAuthoringSegments(authoring, defaultSpeedMs) {
    const count = Math.max(0, authoring.nodes.length - 1);
    const existing = authoring.segments ?? [];
    const segments = [];
    for (let i = 0; i < count; i++) {
        segments.push(existing[i] ?? {
            speed_limit_ms: defaultSpeedMs,
            zone: defaultSpeedMs != null ? "speed_limit" : "none",
        });
    }
    return segments;
}
function syncPitLanePolyline(track) {
    const pit = track.pit_lane;
    if (!pit?.authoring?.nodes?.length)
        return track;
    const segments = ensureAuthoringSegments(pit.authoring, pit.speed_limit_ms);
    const authoring = { ...pit.authoring, segments };
    const polyline = compilePitLaneAuthoring(authoring, pit);
    return {
        ...track,
        pit_lane: {
            ...pit,
            authoring,
            polyline,
        },
    };
}
function polylinePointToAuthoringType(role, isFirst, isLast) {
    if (role === "entry" || (isFirst && role !== "exit")) {
        return { type: "join", join_role: "entry" };
    }
    if (role === "exit" || isLast) {
        return { type: "join", join_role: "exit" };
    }
    if (role === "box") {
        return { type: "box" };
    }
    return { type: "normal" };
}
function inferPitLaneAuthoring(polyline, pit) {
    if (polyline.length < 2) {
        return { nodes: [], segments: [] };
    }
    const points = polyline.map((p) => ({ x: p.x, z: p.z }));
    const keep = new Set([0, polyline.length - 1]);
    for (let i = 0; i < polyline.length; i++) {
        if (polyline[i].role === "entry" || polyline[i].role === "box" || polyline[i].role === "exit") {
            keep.add(i);
        }
    }
    (0, polyline_authoring_1.douglasPeuckerIndices)(points, 0, polyline.length - 1, 12, keep);
    const sorted = [...keep].sort((a, b) => a - b);
    const nodes = [];
    for (let k = 0; k < sorted.length; k++) {
        const idx = sorted[k];
        const pt = polyline[idx];
        const template = polylinePointToAuthoringType(pt.role, idx === 0, idx === polyline.length - 1);
        let type = template.type;
        if (type === "normal" && k > 0 && k < sorted.length - 1) {
            const prev = polyline[sorted[k - 1]];
            const next = polyline[sorted[k + 1]];
            const angle = (0, polyline_authoring_1.interiorAngleDeg)(prev, pt, next);
            if (angle < 150)
                type = "turn_start";
        }
        nodes.push({
            x: pt.x,
            y: pt.y ?? 0,
            z: pt.z,
            type,
            ...(template.join_role ? { join_role: template.join_role } : {}),
        });
    }
    (0, polyline_authoring_1.inferCornerTurnPairs)(nodes);
    const segments = ensureAuthoringSegments({ nodes, segments: [] }, pit?.speed_limit_ms);
    return { nodes, segments };
}
function projectPointOnTrack(track, x, z) {
    const points = (0, track_json_1.canonicalPolyline)(track);
    const closed = track.closed ?? true;
    const lapLength = track.lap_length ?? 0;
    if (points.length < 2) {
        return { x, z, t: 0, distanceM: Infinity };
    }
    const limit = closed ? points.length : points.length - 1;
    let bestDist = Infinity;
    let bestX = x;
    let bestZ = z;
    let bestSeg = 0;
    let bestU = 0;
    for (let i = 0; i < limit; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lenSq = abx * abx + abz * abz;
        const u = lenSq > 0 ? ((x - a.x) * abx + (z - a.z) * abz) / lenSq : 0;
        const clamped = Math.max(0, Math.min(1, u));
        const cx = a.x + abx * clamped;
        const cz = a.z + abz * clamped;
        const d = Math.hypot(x - cx, z - cz);
        if (d < bestDist) {
            bestDist = d;
            bestX = cx;
            bestZ = cz;
            bestSeg = i;
            bestU = clamped;
        }
    }
    let chord = 0;
    for (let i = 0; i < bestSeg; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        chord += Math.hypot(b.x - a.x, b.z - a.z);
    }
    const a = points[bestSeg];
    const b = points[(bestSeg + 1) % points.length];
    chord += Math.hypot(b.x - a.x, b.z - a.z) * bestU;
    let totalChord = 0;
    for (let i = 0; i < limit; i++) {
        const pa = points[i];
        const pb = points[(i + 1) % points.length];
        totalChord += Math.hypot(pb.x - pa.x, pb.z - pa.z);
    }
    const t = lapLength > 0 && totalChord > 0 ? (chord / totalChord) % 1 : 0;
    return { x: bestX, z: bestZ, t, distanceM: bestDist };
}
function snapJoinNodeToTrack(track, node) {
    if (node.type !== "join")
        return node;
    const hit = projectPointOnTrack(track, node.x, node.z);
    return {
        ...node,
        x: hit.x,
        z: hit.z,
        track_t: hit.t,
    };
}
function syncAuthoringTrack(track) {
    return syncPitLanePolyline((0, track_authoring_1.syncTrackPolyline)(track));
}
