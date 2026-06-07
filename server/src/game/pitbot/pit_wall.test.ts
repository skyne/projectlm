import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initCarState,
  sortedTeamClasses,
  teamResultsByClass,
  tickPitBot,
} from "./pit_wall";
import type { CarSnapshot } from "../../ws_protocol";
import type { PlannerSnap } from "./pit_planner";

function snap(
  overrides: Partial<CarSnapshot> & Pick<CarSnapshot, "entryId" | "classId" | "teamName">,
): PlannerSnap {
  return {
    entryId: overrides.entryId,
    teamName: overrides.teamName,
    carNumber: overrides.carNumber ?? overrides.entryId,
    classId: overrides.classId,
    lap: overrides.lap ?? 5,
    distance: overrides.distance ?? 0,
    normalizedT: overrides.normalizedT ?? 0.5,
    speed: overrides.speed ?? 80,
    rpm: overrides.rpm ?? 6000,
    fuel: overrides.fuel ?? 50,
    tireWear: overrides.tireWear ?? 0.2,
    engineHealth: overrides.engineHealth ?? 100,
    sectorIndex: overrides.sectorIndex ?? 0,
    racePosition: overrides.racePosition ?? 1,
    inPit: overrides.inPit ?? false,
    inGarage: overrides.inGarage ?? false,
    retired: overrides.retired ?? false,
    pitQueued: overrides.pitQueued ?? false,
    currentLapTime: overrides.currentLapTime ?? 0,
    currentSectorTime: overrides.currentSectorTime ?? 0,
    lastLapTime: overrides.lastLapTime ?? 90,
    bestLapTime: overrides.bestLapTime ?? 88,
    gapToLeader: overrides.gapToLeader ?? 0,
    currentLapSectorTimes: overrides.currentLapSectorTimes ?? [0, 0, 0],
    lapHistory: overrides.lapHistory ?? [],
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    tangent: overrides.tangent ?? { x: 1, y: 0, z: 0 },
    pendingPenalty: overrides.pendingPenalty,
    lapsToComply: overrides.lapsToComply,
    meatballFlag: overrides.meatballFlag,
    limpMode: overrides.limpMode,
  };
}

describe("teamResultsByClass", () => {
  it("groups managed entries by class", () => {
    const snaps = [
      snap({ classId: "LMP2", entryId: "e1", teamName: "Cursor Racing" }),
      snap({ classId: "LMGT3", entryId: "e2", teamName: "Cursor Racing" }),
      snap({ classId: "Hypercar", entryId: "e3", teamName: "Other Team" }),
    ];
    const byClass = teamResultsByClass(snaps, { entryIds: ["e1", "e2"] });
    assert.equal(byClass.LMP2?.length, 1);
    assert.equal(byClass.LMGT3?.length, 1);
    assert.equal(byClass.Hypercar, undefined);
  });
});

describe("sortedTeamClasses", () => {
  it("orders Hypercar before LMP2 before LMGT3", () => {
    const order = sortedTeamClasses({
      LMGT3: [snap({ classId: "LMGT3", entryId: "g1", teamName: "T" })],
      LMP2: [snap({ classId: "LMP2", entryId: "p1", teamName: "T" })],
      Hypercar: [snap({ classId: "Hypercar", entryId: "h1", teamName: "T" })],
    });
    assert.deepEqual(order, ["Hypercar", "LMP2", "LMGT3"]);
  });
});

describe("tickPitBot race control", () => {
  it("submits drive-through when penalty is pending", () => {
    const entryId = "ai-1";
    const snapshots = [
      snap({
        entryId,
        classId: "LMP2",
        teamName: "Rival",
        pendingPenalty: "drive_through",
        lapsToComply: 2,
      }),
    ];
    const carState = initCarState([entryId], 0, { minLap: 3 });
    const submitted: string[] = [];
    const actions = tickPitBot(
      snapshots,
      [entryId],
      carState,
      { phase: "race", wet: 0 },
      (_id, cmd) => {
        submitted.push(cmd);
        return true;
      },
    );
    assert.equal(submitted[0], "pit|drive_through");
    assert.equal(actions[0]?.command, "pit|drive_through");
  });

  it("defers routine pit under FCY but not limp emergency", () => {
    const entryId = "ai-2";
    const base = snap({
      entryId,
      classId: "LMP2",
      teamName: "Rival",
      tireWear: 0.95,
      fuel: 5,
    });
    const carState = initCarState([entryId], 0, { minLap: 3 });
    const routine: string[] = [];
    tickPitBot(
      [base],
      [entryId],
      carState,
      { phase: "race", wet: 0, fcyActive: true, flagPhase: "fcy" },
      (_id, cmd) => {
        routine.push(cmd);
        return true;
      },
    );
    assert.ok(!routine.some((c) => c.startsWith("pit|fuel")));

    const emergency: string[] = [];
    tickPitBot(
      [{ ...base, limpMode: "barely_driveable" }],
      [entryId],
      carState,
      { phase: "race", wet: 0, fcyActive: true, flagPhase: "fcy" },
      (_id, cmd) => {
        emergency.push(cmd);
        return true;
      },
    );
    assert.ok(emergency.some((c) => c.startsWith("pit|")));
  });

  it("submits stop-and-go for black flag penalty", () => {
    const entryId = "ai-black";
    const submitted: string[] = [];
    tickPitBot(
      [
        snap({
          entryId,
          classId: "LMP2",
          teamName: "Rival",
          pendingPenalty: "black",
          lapsToComply: 1,
        }),
      ],
      [entryId],
      initCarState([entryId], 0, { minLap: 3 }),
      { phase: "race", wet: 0 },
      (_id, cmd) => {
        submitted.push(cmd);
        return true;
      },
    );
    assert.equal(submitted[0], "pit|stop_go");
  });

  it("serves penalty before deferring under safety car", () => {
    const entryId = "ai-pen-sc";
    const submitted: string[] = [];
    tickPitBot(
      [
        snap({
          entryId,
          classId: "LMP2",
          teamName: "Rival",
          pendingPenalty: "drive_through",
          lapsToComply: 2,
          tireWear: 0.99,
          fuel: 3,
        }),
      ],
      [entryId],
      initCarState([entryId], 0, { minLap: 3 }),
      {
        phase: "race",
        wet: 0,
        scActive: true,
        flagPhase: "sc",
      },
      (_id, cmd) => {
        submitted.push(cmd);
        return true;
      },
    );
    assert.equal(submitted[0], "pit|drive_through");
    assert.ok(!submitted.some((c) => c.startsWith("pit|fuel")));
  });

  it("defers routine pit under slow zone flag phase", () => {
    const entryId = "ai-slow";
    const submitted: string[] = [];
    tickPitBot(
      [
        snap({
          entryId,
          classId: "Hypercar",
          teamName: "Rival",
          tireWear: 0.99,
          fuel: 4,
        }),
      ],
      [entryId],
      initCarState([entryId], 0, { minLap: 3 }),
      { phase: "race", wet: 0, flagPhase: "slow_zone" },
      (_id, cmd) => {
        submitted.push(cmd);
        return true;
      },
    );
    assert.ok(!submitted.some((c) => c.startsWith("pit|fuel")));
  });

  it("does not submit penalty serve when none pending", () => {
    const entryId = "ai-clean";
    const submitted: string[] = [];
    tickPitBot(
      [snap({ entryId, classId: "LMP2", teamName: "Rival" })],
      [entryId],
      initCarState([entryId], 0, { minLap: 3 }),
      { phase: "race", wet: 0 },
      (_id, cmd) => {
        submitted.push(cmd);
        return true;
      },
    );
    assert.ok(!submitted.some((c) => c.includes("drive_through")));
    assert.ok(!submitted.some((c) => c.includes("stop_go")));
  });
});
