import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { createRequire } from "module";

const repoRoot = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);

interface NativeSim {
  initFromRaceConfig(configPath: string): boolean;
  tick(deltaTime: number): void;
  getSnapshots(): Array<{ entryId: string; fuel: number; lap: number }>;
  getTrackGeometry(): {
    name: string;
    lapLength: number;
    points: unknown[];
    sectors: unknown[];
  };
  getRaceTime(): number;
  drainEvents(): unknown[];
  isRaceComplete(): boolean;
}

describe("native sim integration", () => {
  let native: NativeSim;

  before(() => {
    process.chdir(repoRoot);
    native = require(path.join(repoRoot, "bindings/node")) as NativeSim;
  });

  it("loads open-session race config and ticks forward", () => {
    const ok = native.initFromRaceConfig(
      "configs/race_config_open_session_test.txt",
    );
    assert.equal(ok, true);
    const t0 = native.getRaceTime();
    for (let i = 0; i < 200; i++) native.tick(0.1);
    assert.ok(native.getRaceTime() > t0);
    const snaps = native.getSnapshots();
    assert.ok(snaps.length >= 2);
    assert.ok(snaps.every((s) => s.entryId.length > 0));
  });

  it("single-car race config advances distance on tick", () => {
    const ok = native.initFromRaceConfig("configs/race_config.txt");
    assert.equal(ok, true);
    const startDistance = native.getSnapshots()[0]?.distance ?? 0;
    for (let i = 0; i < 500; i++) native.tick(0.1);
    const endDistance = native.getSnapshots()[0]?.distance ?? 0;
    assert.ok(endDistance > startDistance);
  });

  it("exposes track geometry aligned with La Sarthe", () => {
    native.initFromRaceConfig("configs/race_config_open_session_test.txt");
    const geo = native.getTrackGeometry();
    assert.ok(geo.lapLength > 12000);
    assert.ok(geo.sectors.length >= 10);
    assert.match(geo.name, /Sarthe|La Sarthe/i);
  });
});
