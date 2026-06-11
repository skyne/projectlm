import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import type { CarSnapshot } from "../../src/ws/protocol";
import {
  dedupeSnapshotsByEntryId,
  effectiveLeaderboardGapScope,
  orderLeaderboardBoard,
} from "../../src/utils/leaderboardBoard";

interface FixtureFile {
  sessionKind: string;
  snapshots: CarSnapshot[];
}

const fixturePath = path.resolve(
  import.meta.dirname,
  "../../../qa/fixtures/leaderboard_snapshots.json",
);

describe("viewer fixture reducers", () => {
  const fixture = JSON.parse(
    fs.readFileSync(fixturePath, "utf8"),
  ) as FixtureFile;

  it("orders race leaderboard by race position", () => {
    const ordered = orderLeaderboardBoard(
      fixture.snapshots,
      "race",
      "overall",
      "",
    );
    assert.deepEqual(
      ordered.map((s) => s.entryId),
      ["hc-1", "lmp2-1", "gt3-1"],
    );
  });

  it("dedupes duplicate entry ids keeping the last snapshot", () => {
    const duped = [
      ...fixture.snapshots,
      { ...fixture.snapshots[0]!, lap: 99, racePosition: 9 },
    ];
    const deduped = dedupeSnapshotsByEntryId(duped);
    assert.equal(deduped.length, 3);
    assert.equal(deduped[0]!.lap, 99);
  });

  it("uses overall gap scope for private_test sessions", () => {
    assert.equal(
      effectiveLeaderboardGapScope("class", "private_test"),
      "overall",
    );
    assert.equal(effectiveLeaderboardGapScope("class", "race"), "class");
  });
});
