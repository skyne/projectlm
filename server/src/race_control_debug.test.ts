import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultMockRaceControlState } from "./race_control_model";
import { applyMockDebugRaceControl } from "./race_control_debug";

describe("race_control_debug", () => {
  it("deploys FCY and SC with control events", () => {
    const rc = defaultMockRaceControlState();
    const events: Array<{ type: string }> = [];
    const ctx = {
      raceTime: 42,
      sectorCount: 3,
      mockRaceControl: rc,
      pushEvent: (e: { type: string }) => events.push(e),
      strandCar: () => null,
      clearObstructionCar: () => {},
      releaseGarageCars: () => {},
      findCar: () => undefined,
      obstructedEntryIds: () => [] as string[],
      obstructedSectorIndices: () => [] as number[],
    };

    assert.equal(applyMockDebugRaceControl({ action: "flag_phase", phase: "fcy" }, ctx), null);
    assert.equal(rc.flagPhase, "fcy");
    assert.equal(rc.fcyActive, true);
    assert.equal(events.at(-1)?.type, "FcyDeploy");

    assert.equal(applyMockDebugRaceControl({ action: "flag_phase", phase: "sc" }, ctx), null);
    assert.equal(rc.scActive, true);
    assert.ok(rc.scLapsRemaining >= 2);
    assert.equal(events.at(-1)?.type, "SafetyCarDeploy");
  });

  it("sets sector flags and spawns hazards", () => {
    const rc = defaultMockRaceControlState();
    const events: Array<{ type: string }> = [];
    const ctx = {
      raceTime: 10,
      sectorCount: 2,
      mockRaceControl: rc,
      pushEvent: (e: { type: string }) => events.push(e),
      strandCar: () => null,
      clearObstructionCar: () => {},
      releaseGarageCars: () => {},
      findCar: () => undefined,
      obstructedEntryIds: () => [] as string[],
      obstructedSectorIndices: () => [] as number[],
    };

    assert.equal(
      applyMockDebugRaceControl({ action: "sector_flag", sectorIndex: 1, level: 2 }, ctx),
      null,
    );
    assert.deepEqual(rc.sectorFlags, [0, 2]);

    assert.equal(
      applyMockDebugRaceControl(
        { action: "spawn_hazard", sectorIndex: 0, kind: "oil" },
        ctx,
      ),
      null,
    );
    assert.equal(rc.surfaceHazards.length, 1);
    assert.deepEqual(rc.sectorFlags, [1, 2]);
    assert.equal(events.at(-1)?.type, "SurfaceHazard");
  });

  it("clears hazard sector flags when hazards are cleared", () => {
    const rc = defaultMockRaceControlState();
    const events: Array<{ type: string }> = [];
    const ctx = {
      raceTime: 10,
      sectorCount: 2,
      mockRaceControl: rc,
      pushEvent: (e: { type: string }) => events.push(e),
      strandCar: () => null,
      clearObstructionCar: () => {},
      releaseGarageCars: () => {},
      findCar: () => undefined,
      obstructedEntryIds: () => [] as string[],
      obstructedSectorIndices: () => [] as number[],
    };

    assert.equal(
      applyMockDebugRaceControl(
        { action: "spawn_hazard", sectorIndex: 0, kind: "oil" },
        ctx,
      ),
      null,
    );
    assert.deepEqual(rc.sectorFlags, [1, 0]);

    assert.equal(applyMockDebugRaceControl({ action: "clear_hazards" }, ctx), null);
    assert.deepEqual(rc.sectorFlags, [0, 0]);
    assert.equal(rc.surfaceHazards.length, 0);
    assert.equal(events.at(-1)?.type, "SurfaceCleared");
  });

  it("keeps double yellow when clearing hazards but a car remains stranded", () => {
    const rc = defaultMockRaceControlState();
    const ctx = {
      raceTime: 10,
      sectorCount: 3,
      mockRaceControl: rc,
      pushEvent: () => {},
      strandCar: () => null,
      clearObstructionCar: () => {},
      releaseGarageCars: () => {},
      findCar: () => undefined,
      obstructedEntryIds: () => [] as string[],
      obstructedSectorIndices: () => [1],
    };

    assert.equal(
      applyMockDebugRaceControl(
        { action: "spawn_hazard", sectorIndex: 0, kind: "debris" },
        ctx,
      ),
      null,
    );
    assert.deepEqual(rc.sectorFlags, [1, 0, 0]);

    assert.equal(applyMockDebugRaceControl({ action: "clear_hazards" }, ctx), null);
    assert.deepEqual(rc.sectorFlags, [0, 2, 0]);
  });

  it("deploys red flag when multiple fire hazards are spawned", () => {
    const rc = defaultMockRaceControlState();
    const events: Array<{ type: string }> = [];
    const ctx = {
      raceTime: 10,
      sectorCount: 3,
      mockRaceControl: rc,
      pushEvent: (e: { type: string }) => events.push(e),
      strandCar: () => null,
      clearObstructionCar: () => {},
      releaseGarageCars: () => {},
      findCar: () => undefined,
      obstructedEntryIds: () => [] as string[],
      obstructedSectorIndices: () => [] as number[],
    };

    assert.equal(
      applyMockDebugRaceControl({ action: "spawn_hazard", sectorIndex: 0, kind: "fire" }, ctx),
      null,
    );
    assert.equal(rc.flagPhase, "green");

    assert.equal(
      applyMockDebugRaceControl({ action: "spawn_hazard", sectorIndex: 1, kind: "fire" }, ctx),
      null,
    );
    assert.equal(rc.flagPhase, "red_flag");
    assert.equal(rc.redFlagActive, true);
    assert.equal(events.at(-1)?.type, "RedFlagDeploy");
  });

  it("green flag releases garage-held cars", () => {
    const rc = defaultMockRaceControlState();
    let released = false;
    const ctx = {
      raceTime: 10,
      sectorCount: 2,
      mockRaceControl: rc,
      pushEvent: () => {},
      strandCar: () => null,
      clearObstructionCar: () => {},
      releaseGarageCars: () => {
        released = true;
      },
      findCar: () => undefined,
      obstructedEntryIds: () => [] as string[],
      obstructedSectorIndices: () => [] as number[],
    };

    rc.flagPhase = "red_flag";
    rc.scLapsRemaining = 2;
    rc.redFlagSecondsRemaining = 12;

    assert.equal(applyMockDebugRaceControl({ action: "flag_phase", phase: "green" }, ctx), null);
    assert.equal(rc.flagPhase, "green");
    assert.equal(rc.scLapsRemaining, 0);
    assert.equal(rc.redFlagSecondsRemaining, 0);
    assert.equal(released, true);
  });
});
