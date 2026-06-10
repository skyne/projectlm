"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTrackGeometryFromPath = loadTrackGeometryFromPath;
exports.loadTrackGeometryById = loadTrackGeometryById;
exports.enrichTrackGeometryFromJson = enrichTrackGeometryFromJson;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const track_catalog_1 = require("./track_catalog");
function parsePitLane(pit) {
    if (!pit)
        return undefined;
    const out = {};
    if (pit.width_m != null)
        out.widthM = pit.width_m;
    if (pit.offset_m != null)
        out.offsetM = pit.offset_m;
    if (pit.merge_lateral_offset != null)
        out.mergeLateralOffset = pit.merge_lateral_offset;
    if (pit.merge_blend_m != null)
        out.mergeBlendM = pit.merge_blend_m;
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
function buildGeometry(track, fallbackName) {
    const polyline = track.display_polyline?.map((p) => ({ x: p.x, z: p.z })) ??
        track.control_points?.map((p) => ({ x: p.x, z: p.z })) ??
        [];
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
        ...(pitLane ? { pitLane } : {}),
    };
}
function loadTrackGeometryFromPath(repoRoot, trackConfigPath, fallbackName = "Circuit") {
    const abs = path.join(repoRoot, trackConfigPath);
    if (!fs.existsSync(abs))
        return null;
    try {
        const track = JSON.parse(fs.readFileSync(abs, "utf8"));
        return buildGeometry(track, fallbackName);
    }
    catch {
        return null;
    }
}
function loadTrackGeometryById(repoRoot, trackId) {
    const rel = (0, track_catalog_1.trackJsonPath)(trackId);
    return loadTrackGeometryFromPath(repoRoot, rel, (0, track_catalog_1.trackDisplayName)(trackId));
}
/** Merge corridor metadata from track JSON onto a native geometry payload. */
function enrichTrackGeometryFromJson(base, repoRoot, trackConfigPath) {
    const fromJson = loadTrackGeometryFromPath(repoRoot, trackConfigPath, base.name);
    if (!fromJson)
        return base;
    return {
        ...base,
        defaultWidthM: fromJson.defaultWidthM ?? base.defaultWidthM,
        widthProfile: fromJson.widthProfile ?? base.widthProfile,
        pitLane: fromJson.pitLane ?? base.pitLane,
        mapLabels: base.mapLabels?.length ? base.mapLabels : fromJson.mapLabels,
    };
}
