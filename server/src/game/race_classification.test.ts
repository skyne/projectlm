import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRaceClassification,
  CLASS_MIN_DISTANCE_FRACTION,
  raceDistanceMeters,
} from "./race_classification.js";
import type { CarSnapshot } from "../ws_protocol.js";

function snap(
  partial: Partial<CarSnapshot> & Pick<CarSnapshot, "entryId" | "classId">,
): CarSnapshot {
  return {
    entryId: partial.entryId,
    teamName: partial.teamName ?? "Team",
    carNumber: partial.carNumber ?? "1",
    classId: partial.classId,
    lap: partial.lap ?? 1,
    distance: partial.distance ?? 0,
    speed: partial.speed ?? 0,
    rpm: partial.rpm ?? 0,
    fuel: partial.fuel ?? 50,
    tireWear: partial.tireWear ?? 0,
    racePosition: partial.racePosition ?? 1,
    retired: partial.retired ?? false,
    retireReason: partial.retireReason,
    inPit: false,
    bestLapTime: partial.bestLapTime,
  } as CarSnapshot;
}

test("raceDistanceMeters uses completed laps plus current distance", () => {
  assert.equal(raceDistanceMeters(snap({ entryId: "a", classId: "Hypercar", lap: 1, distance: 500 }), 4900), 500);
  assert.equal(raceDistanceMeters(snap({ entryId: "a", classId: "Hypercar", lap: 193, distance: 1000 }), 4900), 192 * 4900 + 1000);
});

test("applyRaceClassification marks under 75% class leader as not classified", () => {
  const lapLength = 4900;
  const leader = snap({
    entryId: "entry-1",
    classId: "Hypercar",
    lap: 100,
    distance: 0,
    racePosition: 1,
  });
  const lapped = snap({
    entryId: "entry-2",
    classId: "Hypercar",
    lap: 2,
    distance: 0,
    racePosition: 62,
  });
  const out = applyRaceClassification([leader, lapped], lapLength);
  const dnf = out.find((s) => s.entryId === "entry-2");
  assert.equal(dnf?.retired, true);
  assert.match(dnf?.retireReason ?? "", /Not classified/);
  assert.ok(
    raceDistanceMeters(lapped, lapLength) <
      raceDistanceMeters(leader, lapLength) * CLASS_MIN_DISTANCE_FRACTION,
  );
});

test("applyRaceClassification keeps cars above threshold classified", () => {
  const lapLength = 1000;
  const leader = snap({ entryId: "a", classId: "Hypercar", lap: 10, distance: 0 });
  const follower = snap({ entryId: "b", classId: "Hypercar", lap: 8, distance: 500 });
  const out = applyRaceClassification([leader, follower], lapLength);
  assert.equal(out.find((s) => s.entryId === "b")?.retired, false);
});
