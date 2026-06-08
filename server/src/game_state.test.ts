import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GameStateStore } from "./game_state";
import type { MetaStatePayload } from "./ws_protocol";

function defaults(): MetaStatePayload {
  return {
    teamName: "Defaults",
    budget: 500_000_000,
    rdPoints: 100,
    playerEntryId: "entry-1",
    seasonYear: 2026,
    currentRound: 0,
    staff: [],
    unlockedParts: [],
    calendar: [],
    setupComplete: false,
    fleet: [],
    activeCarId: "",
    driverRoster: [],
  };
}

describe("GameStateStore.load", () => {
  let repoRoot = "";
  let store: GameStateStore;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plm-save-"));
    store = new GameStateStore(repoRoot);
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("defaults setupComplete to false when the field is missing", () => {
    const saveDir = path.join(repoRoot, "data");
    fs.mkdirSync(saveDir, { recursive: true });
    fs.writeFileSync(
      path.join(saveDir, "game_save.json"),
      JSON.stringify({
        teamName: "Legacy Team",
        budget: 1_000_000,
        fleet: [],
      }),
    );

    const loaded = store.load(defaults());
    assert.equal(loaded.setupComplete, false);
    assert.equal(loaded.teamName, "Legacy Team");
  });

  it("preserves explicit setupComplete true", () => {
    const saveDir = path.join(repoRoot, "data");
    fs.mkdirSync(saveDir, { recursive: true });
    fs.writeFileSync(
      path.join(saveDir, "game_save.json"),
      JSON.stringify({
        teamName: "Complete Team",
        setupComplete: true,
      }),
    );

    const loaded = store.load(defaults());
    assert.equal(loaded.setupComplete, true);
  });
});
