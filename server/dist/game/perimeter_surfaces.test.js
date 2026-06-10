"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const perimeter_surfaces_1 = require("./perimeter_surfaces");
(0, node_test_1.describe)("synthesizePerimeterSurfaces", () => {
    (0, node_test_1.it)("fills bare straights with 10m grass and a barrier on both sides", () => {
        const profile = (0, perimeter_surfaces_1.synthesizePerimeterSurfaces)({
            profile: [],
            defaultWidthM: 12,
        });
        strict_1.default.ok(profile.length >= 2);
        const grass = profile.filter((s) => s.variant === "grass");
        const barriers = profile.filter((s) => s.surface.startsWith("barrier"));
        strict_1.default.ok(grass.length >= 2);
        strict_1.default.ok(barriers.length >= 2);
        const outGrass = grass.find((s) => s.side === "outboard");
        strict_1.default.ok(outGrass);
        strict_1.default.equal(outGrass.widthM, perimeter_surfaces_1.PERIMETER_GRASS_GAP_M - 2);
        strict_1.default.equal(outGrass.innerOffsetM, 0);
        const outBarrier = barriers.find((s) => s.side === "outboard");
        strict_1.default.ok(outBarrier);
        strict_1.default.equal(outBarrier.innerOffsetM, perimeter_surfaces_1.PERIMETER_GRASS_GAP_M - 2);
        strict_1.default.equal(outBarrier.widthM, perimeter_surfaces_1.PERIMETER_BARRIER_WIDTH_M);
    });
    (0, node_test_1.it)("places synthesized barrier at runoff outer edge when runoff exists", () => {
        const profile = (0, perimeter_surfaces_1.synthesizePerimeterSurfaces)({
            profile: [
                {
                    startT: 0.4,
                    endT: 0.5,
                    side: "outboard",
                    surface: "runoff_concrete",
                    widthM: 12,
                    innerOffsetM: 0,
                },
            ],
            defaultWidthM: 12,
        });
        const synthBarrier = profile.find((s) => s.name?.includes("barrier") &&
            s.side === "outboard" &&
            s.startT <= 0.45 &&
            s.endT >= 0.45);
        strict_1.default.ok(synthBarrier);
        // Runoff band starts after default verge (2m) on a 12m-wide track.
        strict_1.default.equal(synthBarrier.innerOffsetM, 12);
        const synthGrass = profile.find((s) => s.variant === "grass" &&
            s.side === "outboard" &&
            s.startT <= 0.45 &&
            s.endT >= 0.45);
        strict_1.default.equal(synthGrass, undefined);
    });
    (0, node_test_1.it)("keeps explicit barrier segments and skips duplicate synth barrier", () => {
        const profile = (0, perimeter_surfaces_1.synthesizePerimeterSurfaces)({
            profile: [
                {
                    name: "T1 outer barrier",
                    startT: 0.05,
                    endT: 0.1,
                    side: "outboard",
                    surface: "barrier_tecpro",
                    widthM: 1.2,
                    innerOffsetM: 20,
                },
            ],
            defaultWidthM: 12,
        });
        const explicit = profile.filter((s) => s.name === "T1 outer barrier");
        strict_1.default.equal(explicit.length, 1);
        const synthAtCorner = profile.filter((s) => s.name?.startsWith("synth:perimeter-barrier") &&
            s.side === "outboard" &&
            s.startT < 0.1 &&
            s.endT > 0.05);
        strict_1.default.equal(synthAtCorner.length, 0);
    });
});
