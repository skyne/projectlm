import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildWidthProfileFromAuthoring,
  compileTrackAuthoring,
  inferTrackAuthoring,
  inferTrackAuthoringFromTrack,
  rotateAuthoringToStartFinish,
  syncTrackPolyline,
} from "../../../server/src/game/track_authoring.ts";
import { canonicalPolyline } from "../../../server/src/game/track_json.ts";
import type { TrackJson } from "../../../server/src/game/track_json.ts";
import { enableAuthoring } from "./editor/authoringState.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("track_authoring", () => {
  it("compiles turn_mid as a knee inside a corner span", () => {
    const polyline = compileTrackAuthoring(
      {
        nodes: [
          { x: 0, y: 0, z: 0, type: "normal" },
          { x: 0, y: 0, z: 40, type: "turn_start" },
          { x: 25, y: 0, z: 55, type: "turn_mid" },
          { x: 50, y: 0, z: 40, type: "turn_end" },
          { x: 50, y: 0, z: 0, type: "normal" },
        ],
        segments: [],
      },
      false,
    );
    assert.ok(polyline.length >= 5);
    const maxX = Math.max(...polyline.map((p) => p.x));
    assert.ok(maxX > 30, "knee should pull the path outward");
  });

  it("compiles layout straight spans", () => {
    const polyline = compileTrackAuthoring(
      {
        nodes: [
          { x: 0, y: 0, z: 0, type: "normal" },
          { x: 100, y: 0, z: 0, type: "normal" },
          { x: 100, y: 0, z: 50, type: "normal" },
        ],
        segments: [],
      },
      true,
    );
    assert.ok(polyline.length >= 3);
  });

  it("infers sparse nodes from dense layout polyline", () => {
    const dense = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
      { x: 30, y: 0, z: 30 },
    ];
    const authoring = inferTrackAuthoring(dense, false);
    assert.ok(authoring.nodes.length <= 4);
    assert.equal(authoring.nodes[0].type, "normal");
  });

  it("rotates start/finish node to index 0", () => {
    const rotated = rotateAuthoringToStartFinish({
      nodes: [
        { x: 0, y: 0, z: 0, type: "normal" },
        { x: 10, y: 0, z: 0, type: "normal" },
        { x: 10, y: 0, z: 10, type: "normal", start_finish: true },
        { x: 0, y: 0, z: 10, type: "normal" },
      ],
      segments: [{}, {}, {}],
    });
    assert.equal(rotated.nodes[0].start_finish, true);
    assert.equal(rotated.nodes[0].x, 10);
    assert.equal(rotated.nodes[0].z, 10);
    assert.ok(!rotated.nodes[1]?.start_finish);
  });

  it("enableAuthoring on layout writes polylines", () => {
    const track = enableAuthoring(
      {
        name: "test",
        closed: true,
        control_points: [
          { x: 0, y: 0, z: 0 },
          { x: 100, y: 0, z: 0 },
          { x: 100, y: 0, z: 100 },
        ],
      },
      "layout",
    );
    assert.ok(track.authoring?.nodes.length);
    assert.equal(track.authoring?.nodes[0]?.start_finish, true);
    assert.ok((track.control_points?.length ?? 0) >= 2);
  });

  it("builds width_profile from node width_m overrides", () => {
    const track: TrackJson = {
      name: "width test",
      closed: true,
      lap_length: 1000,
      track_width_m: 12,
      control_points: [
        { x: 0, y: 0, z: 0 },
        { x: 500, y: 0, z: 0 },
        { x: 1000, y: 0, z: 0 },
        { x: 1000, y: 0, z: 500 },
      ],
      authoring: {
        nodes: [
          { x: 0, y: 0, z: 0, type: "normal", start_finish: true, width_m: 15 },
          { x: 1000, y: 0, z: 0, type: "normal", width_m: 12 },
          { x: 1000, y: 0, z: 500, type: "normal", width_m: 11 },
        ],
        segments: [],
      },
    };
    const profile = buildWidthProfileFromAuthoring(track);
    assert.ok(profile && profile.length >= 2);
    // Width is keyed to the destination node on each span.
    assert.equal(profile[0].width_m, 12);
    assert.equal(profile[1].width_m, 11);
    const synced = syncTrackPolyline(track);
    assert.ok((synced.width_profile?.length ?? 0) >= 2);
  });

  it("simplify preserves lap_length on double-traced catalog polylines", () => {
    const track = JSON.parse(
      readFileSync(join(repoRoot, "tracks/lemans_la_sarthe.json"), "utf8"),
    ) as TrackJson;
    const lapBefore = track.lap_length ?? 0;
    assert.ok(lapBefore > 0);

    const authored = inferTrackAuthoringFromTrack(track);
    const synced = syncTrackPolyline({ ...track, authoring: authored });

    assert.ok(Math.abs((synced.lap_length ?? 0) - lapBefore) < 1);
    assert.ok((synced.authoring?.nodes.length ?? 0) < 65);

    const polyline = canonicalPolyline(synced);
    const renderGap = Math.hypot(
      polyline[0]!.x - polyline[polyline.length - 1]!.x,
      polyline[0]!.z - polyline[polyline.length - 1]!.z,
    );
    assert.ok(
      renderGap < 1,
      `compiled polyline should close at SF (gap ${renderGap.toFixed(1)} m)`,
    );
  });
});
