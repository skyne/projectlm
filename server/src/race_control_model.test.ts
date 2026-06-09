import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countTrackObstructions,
  defaultMockRaceControlState,
  FLAG_PHASES,
  MOCK_MARSHAL_RESPONSE_SEC,
  MOCK_STRANDED_STOP_SEC,
  MOCK_TOW_DURATION_SEC,
  PENDING_PENALTIES,
  TRACK_STATUSES,
} from "./race_control_model";

describe("race_control_model", () => {
  it("defaultMockRaceControlState starts green with no hazards", () => {
    const rc = defaultMockRaceControlState();
    assert.equal(rc.flagPhase, "green");
    assert.equal(rc.fcyActive, false);
    assert.equal(rc.scActive, false);
    assert.deepEqual(rc.surfaceHazards, []);
    assert.equal(rc.activeIncidentEntryId, "");
    assert.equal(rc.scLapsRemaining, 0);
    assert.equal(rc.redFlagActive, false);
    assert.equal(rc.redFlagSecondsRemaining, 0);
  });

  it("countTrackObstructions counts stranded and recovering cars", () => {
    assert.equal(countTrackObstructions(["racing", "stranded"]), 1);
    assert.equal(countTrackObstructions(["recovering", "recovering"]), 2);
    assert.equal(countTrackObstructions(["racing", "cleared", undefined]), 0);
  });

  it("countTrackObstructions ignores racing and cleared only", () => {
    assert.equal(countTrackObstructions([]), 0);
    assert.equal(countTrackObstructions(["racing", "racing"]), 0);
    assert.equal(
      countTrackObstructions(["stranded", "racing", "recovering", "cleared"]),
      2,
    );
  });

  it("exports stable flag phase and penalty enums", () => {
    assert.ok(FLAG_PHASES.includes("fcy"));
    assert.ok(FLAG_PHASES.includes("sc_in_lap"));
    assert.ok(PENDING_PENALTIES.includes("drive_through"));
    assert.ok(PENDING_PENALTIES.includes("stop_go"));
    assert.ok(TRACK_STATUSES.includes("stranded"));
    assert.ok(TRACK_STATUSES.includes("recovering"));
  });

  it("mock lifecycle constants are positive durations", () => {
    assert.ok(MOCK_STRANDED_STOP_SEC > 0);
    assert.ok(MOCK_MARSHAL_RESPONSE_SEC > 0);
    assert.ok(MOCK_TOW_DURATION_SEC > MOCK_MARSHAL_RESPONSE_SEC);
  });

  it("defaultMockRaceControlState returns independent copies", () => {
    const a = defaultMockRaceControlState();
    const b = defaultMockRaceControlState();
    a.sectorFlags.push(1);
    a.surfaceHazards.push({ sectorIndex: 0, kind: "oil", gripMultiplier: 0.7 });
    assert.deepEqual(b.sectorFlags, []);
    assert.deepEqual(b.surfaceHazards, []);
  });
});
