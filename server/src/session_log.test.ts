import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionLogWriter } from "./session_log.js";

describe("SessionLogWriter", () => {
  it("returns active session events before finish", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plm-log-"));
    const writer = new SessionLogWriter(repoRoot);
    writer.startSession({
      trackName: "Test",
      roundNumber: 1,
      weekendSessionType: "race",
      raceFormat: "6h",
      teamName: "PLM",
    });
    writer.recordEvents([
      { type: "GreenFlag", timestamp: 0, message: "Green" },
      { type: "Overtake", entryId: "entry-1", timestamp: 12, message: "P2" },
    ]);
    assert.deepEqual(writer.getActiveEvents().map((e) => e.type), [
      "GreenFlag",
      "Overtake",
    ]);
    writer.finishSession(100);
    assert.deepEqual(writer.getActiveEvents(), []);
  });
});
