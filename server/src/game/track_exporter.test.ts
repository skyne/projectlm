import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, it } from "node:test";
import { buildTrackGeometry } from "./track_geometry_build";
import {
  decimateOversampledPolyline,
  parseTrackJson,
  polylineExceedsLapLength,
  prepareTrackForExport,
  recomputeLapLength,
  trackJsonToFile,
} from "./track_exporter";
import { loadTrackJsonFromPath } from "./track_loader";
import type { TrackJson } from "./track_json";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("track_exporter", () => {
  it("round-trips sample_circuit.json", () => {
    const track = loadTrackJsonFromPath(repoRoot, "tracks/sample_circuit.json");
    assert.ok(track);
    const before = buildTrackGeometry(track!, "Sample");
    const exported = JSON.parse(trackJsonToFile(track!)) as TrackJson;
    const after = buildTrackGeometry(exported, "Sample");
    assert.equal(after.polyline.length, before.polyline.length);
    assert.equal(after.sectors.length, before.sectors.length);
    assert.ok(Math.abs(after.lapLength - recomputeLapLength(exported)) < 1);
  });

  it("strips synthesized perimeter segments on export", () => {
    const track: TrackJson = {
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
    const prepared = prepareTrackForExport(track);
    assert.equal(prepared.surface_profile?.length, 1);
    assert.equal(prepared.surface_profile?.[0].name, "T1 runoff");
  });

  it("preserves lap_length when polyline chord exceeds stored lap distance", () => {
    const track: TrackJson = {
      name: "Scaled",
      closed: true,
      lap_length: 1000,
      control_points: [
        { x: 0, y: 0, z: 0 },
        { x: 2000, y: 0, z: 0 },
        { x: 2000, y: 0, z: 2000 },
      ],
    };
    const flat = track.control_points!.map((p) => ({ x: p.x, z: p.z }));
    assert.ok(polylineExceedsLapLength(flat, 1000));
    assert.equal(recomputeLapLength(track), 1000);
    const dense: TrackJson["control_points"] = [];
    for (let i = 0; i < 60; i++) {
      dense.push({ x: i * 20, y: 0, z: 0 });
    }
    dense.push({ ...dense[0]! });
    const decimated = decimateOversampledPolyline(dense, 1000, true);
    assert.ok(decimated.length >= 2);
    assert.ok(decimated.length < dense.length);
    assert.ok(
      Math.hypot(
        decimated[0]!.x - decimated[decimated.length - 1]!.x,
        decimated[0]!.z - decimated[decimated.length - 1]!.z,
      ) < 0.01,
    );
  });

  it("rejects invalid track json", () => {
    assert.throws(() => parseTrackJson({}), /name/);
    assert.throws(
      () =>
        parseTrackJson({
          name: "x",
          control_points: [{ x: 0, y: 0, z: 0 }],
        }),
      /two polyline/,
    );
  });

  it("loads all catalog tracks for geometry build", () => {
    const files = fs
      .readdirSync(path.join(repoRoot, "tracks"))
      .filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const track = loadTrackJsonFromPath(repoRoot, `tracks/${file}`);
      assert.ok(track, file);
      const geom = buildTrackGeometry(track!, track!.name);
      assert.ok(geom.polyline.length >= 2, file);
    }
  });
});
