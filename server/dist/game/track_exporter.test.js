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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const url_1 = require("url");
const node_test_1 = require("node:test");
const track_geometry_build_1 = require("./track_geometry_build");
const track_exporter_1 = require("./track_exporter");
const track_loader_1 = require("./track_loader");
const repoRoot = path.resolve(path.dirname((0, url_1.fileURLToPath)(import.meta.url)), "../../..");
(0, node_test_1.describe)("track_exporter", () => {
    (0, node_test_1.it)("round-trips sample_circuit.json", () => {
        const track = (0, track_loader_1.loadTrackJsonFromPath)(repoRoot, "tracks/sample_circuit.json");
        strict_1.default.ok(track);
        const before = (0, track_geometry_build_1.buildTrackGeometry)(track, "Sample");
        const exported = JSON.parse((0, track_exporter_1.trackJsonToFile)(track));
        const after = (0, track_geometry_build_1.buildTrackGeometry)(exported, "Sample");
        strict_1.default.equal(after.polyline.length, before.polyline.length);
        strict_1.default.equal(after.sectors.length, before.sectors.length);
        strict_1.default.ok(Math.abs(after.lapLength - (0, track_exporter_1.recomputeLapLength)(exported)) < 1);
    });
    (0, node_test_1.it)("strips synthesized perimeter segments on export", () => {
        const track = {
            name: "Test",
            closed: true,
            control_points: [
                { x: 0, y: 0, z: 0 },
                { x: 100, y: 0, z: 0 },
                { x: 100, y: 0, z: 100 },
            ],
            display_polyline: [
                { x: 0, y: 0, z: 0 },
                { x: 100, y: 0, z: 0 },
                { x: 100, y: 0, z: 100 },
            ],
            surface_profile: [
                {
                    name: "synth:perimeter-grass-outboard",
                    start_t: 0,
                    end_t: 1,
                    side: "outboard",
                    surface: "verge",
                    width_m: 8,
                },
                {
                    name: "T1 runoff",
                    start_t: 0.1,
                    end_t: 0.2,
                    side: "outboard",
                    surface: "runoff_concrete",
                    width_m: 10,
                },
            ],
        };
        const prepared = (0, track_exporter_1.prepareTrackForExport)(track);
        strict_1.default.equal(prepared.surface_profile?.length, 1);
        strict_1.default.equal(prepared.surface_profile?.[0].name, "T1 runoff");
    });
    (0, node_test_1.it)("preserves lap_length when polyline chord exceeds stored lap distance", () => {
        const track = {
            name: "Scaled",
            closed: true,
            lap_length: 1000,
            control_points: [
                { x: 0, y: 0, z: 0 },
                { x: 2000, y: 0, z: 0 },
                { x: 2000, y: 0, z: 2000 },
            ],
        };
        const flat = track.control_points.map((p) => ({ x: p.x, z: p.z }));
        strict_1.default.ok((0, track_exporter_1.polylineExceedsLapLength)(flat, 1000));
        strict_1.default.equal((0, track_exporter_1.recomputeLapLength)(track), 1000);
        const single = (0, track_exporter_1.extractSingleLapPolyline)(track.control_points, 1000);
        strict_1.default.ok(single.length >= 2);
        strict_1.default.ok(single.length < track.control_points.length);
    });
    (0, node_test_1.it)("rejects invalid track json", () => {
        strict_1.default.throws(() => (0, track_exporter_1.parseTrackJson)({}), /name/);
        strict_1.default.throws(() => (0, track_exporter_1.parseTrackJson)({
            name: "x",
            control_points: [{ x: 0, y: 0, z: 0 }],
        }), /two polyline/);
    });
    (0, node_test_1.it)("loads all catalog tracks for geometry build", () => {
        const files = fs
            .readdirSync(path.join(repoRoot, "tracks"))
            .filter((f) => f.endsWith(".json"));
        for (const file of files) {
            const track = (0, track_loader_1.loadTrackJsonFromPath)(repoRoot, `tracks/${file}`);
            strict_1.default.ok(track, file);
            const geom = (0, track_geometry_build_1.buildTrackGeometry)(track, track.name);
            strict_1.default.ok(geom.polyline.length >= 2, file);
        }
    });
});
