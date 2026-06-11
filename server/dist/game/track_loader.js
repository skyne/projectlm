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
exports.loadTrackJsonFromPath = loadTrackJsonFromPath;
exports.loadTrackGeometryById = loadTrackGeometryById;
exports.enrichTrackGeometryFromJson = enrichTrackGeometryFromJson;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const track_catalog_1 = require("./track_catalog");
const track_geometry_build_1 = require("./track_geometry_build");
function loadTrackGeometryFromPath(repoRoot, trackConfigPath, fallbackName = "Circuit") {
    const abs = path.join(repoRoot, trackConfigPath);
    if (!fs.existsSync(abs))
        return null;
    try {
        const track = JSON.parse(fs.readFileSync(abs, "utf8"));
        return (0, track_geometry_build_1.buildTrackGeometry)(track, fallbackName);
    }
    catch {
        return null;
    }
}
function loadTrackJsonFromPath(repoRoot, trackConfigPath) {
    const abs = path.join(repoRoot, trackConfigPath);
    if (!fs.existsSync(abs))
        return null;
    try {
        return JSON.parse(fs.readFileSync(abs, "utf8"));
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
        surfaceProfile: fromJson.surfaceProfile ?? base.surfaceProfile,
        surfaceDefaults: fromJson.surfaceDefaults ?? base.surfaceDefaults,
        pitLane: fromJson.pitLane ?? base.pitLane,
        mapLabels: base.mapLabels?.length ? base.mapLabels : fromJson.mapLabels,
    };
}
