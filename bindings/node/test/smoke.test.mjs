import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);

describe("native addon smoke", () => {
  /** @type {import('../index').default} */
  let native;

  before(() => {
    process.chdir(repoRoot);
    native = require(path.join(__dirname, ".."));
  });

  it("initFromRaceConfig loads open-session test grid", () => {
    const ok = native.initFromRaceConfig(
      "configs/race_config_open_session_test.txt",
    );
    assert.equal(ok, true);
  });

  it("tick advances race time and returns snapshots", () => {
    native.initFromRaceConfig("configs/race_config_open_session_test.txt");
    const t0 = native.getRaceTime();
    for (let i = 0; i < 50; i++) native.tick(0.1);
    assert.ok(native.getRaceTime() > t0);
    const snaps = native.getSnapshots();
    assert.ok(snaps.length >= 2);
    assert.ok(snaps[0].entryId);
    assert.ok(snaps[0].position);
  });

  it("getTrackGeometry exposes spline sectors", () => {
    native.initFromRaceConfig("configs/race_config_open_session_test.txt");
    const geo = native.getTrackGeometry();
    assert.ok(geo.lapLength > 10000);
    assert.ok(geo.sectors.length > 0);
    assert.ok(geo.points.length > 0);
    assert.equal(typeof geo.name, "string");
  });

  it("drainEvents returns an array after tick", () => {
    native.initFromRaceConfig("configs/race_config_open_session_test.txt");
    native.tick(0.1);
    const events = native.drainEvents();
    assert.ok(Array.isArray(events));
  });
});
