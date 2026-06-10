import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CarSnapshot } from "../ws_protocol";
import {
  EngineerHintManager,
  evaluateCarHint,
} from "./engineer_hints";

function snap(overrides: Partial<CarSnapshot> = {}): CarSnapshot {
  return {
    entryId: "e1",
    teamName: "Team",
    carNumber: "7",
    classId: "LMP2",
    lap: 5,
    distance: 1000,
    normalizedT: 0.2,
    speed: 60,
    rpm: 5000,
    fuel: 50,
    tireWear: 0.3,
    engineHealth: 100,
    sectorIndex: 0,
    racePosition: 1,
    inPit: false,
    retired: false,
    currentLapTime: 100,
    currentSectorTime: 30,
    lastLapTime: 100,
    bestLapTime: 99,
    gapToLeader: 0,
    currentLapSectorTimes: [],
    lapHistory: [],
    position: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    ...overrides,
  };
}

describe("evaluateCarHint", () => {
  it("flags emergency fuel", () => {
    const hint = evaluateCarHint(
      snap({ fuel: 15, fuelTankCapacity: 100 }),
      0,
    );
    assert.ok(hint);
    assert.equal(hint!.category, "emergency");
  });

  it("flags worn tyres", () => {
    const hint = evaluateCarHint(snap({ tireWear: 0.8 }), 0);
    assert.ok(hint);
    assert.equal(hint!.category, "tyre_wear");
  });

  it("flags wrong tyres in wet conditions", () => {
    const hint = evaluateCarHint(
      snap({ tireCompound: "soft" }),
      0.5,
    );
    assert.ok(hint);
    assert.equal(hint!.category, "wrong_tyre");
  });

  it("skips cars in the pit", () => {
    assert.equal(evaluateCarHint(snap({ inPit: true, fuel: 5 }), 0), null);
  });

  it("does not emergency-call for depleted hybrid on parallel hypercars", () => {
    const hint = evaluateCarHint(
      snap({
        classId: "Hypercar",
        fuel: 80,
        fuelTankCapacity: 110,
        hybridDeployMJ: 0,
        hybridBudgetMJ: 4.5,
      }),
      0,
    );
    assert.equal(hint, null);
  });

  it("skips cars with a pit stop already queued", () => {
    assert.equal(evaluateCarHint(snap({ pitQueued: true, tireWear: 0.8 }), 0), null);
    assert.equal(
      evaluateCarHint(
        snap({ pitQueued: true, fuel: 15, fuelTankCapacity: 100 }),
        0,
      ),
      null,
    );
    assert.equal(
      evaluateCarHint(snap({ pitQueued: true, partHealth: { body_fl: 70 } }), 0),
      null,
    );
  });
});

describe("EngineerHintManager", () => {
  it("raises one hint and snoozes after dismiss", () => {
    const mgr = new EngineerHintManager();
    const worn = snap({ tireWear: 0.8 });
    const first = mgr.tick([worn], ["e1"], 0, 100, 20, false);
    assert.ok(first.hint);
    assert.equal(first.autoPaused, true);
    assert.equal(first.timeScale, 20);

    const second = mgr.tick([worn], ["e1"], 0, 110, 20, true);
    assert.equal(second.hint, null);

    mgr.dismiss(first.hint!.hintId);
    const third = mgr.tick([worn], ["e1"], 0, 120, 20, false);
    assert.equal(third.hint, null);

    const fourth = mgr.tick([worn], ["e1"], 0, 200, 20, false);
    assert.ok(fourth.hint);
  });

  it("clears an active hint when pit is queued for that car", () => {
    const mgr = new EngineerHintManager();
    const worn = snap({ tireWear: 0.8 });
    const raised = mgr.tick([worn], ["e1"], 0, 100, 20, false);
    assert.ok(raised.hint);

    const queued = mgr.tick([{ ...worn, pitQueued: true }], ["e1"], 0, 110, 20, true);
    assert.equal(queued.hint, null);
    assert.equal(queued.autoResumed, true);
    assert.equal(mgr.getActiveHint(), null);
  });
});
