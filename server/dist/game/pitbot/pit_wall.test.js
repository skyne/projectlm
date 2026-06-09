"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const briefing_tactics_1 = require("../briefing_tactics");
const pit_wall_1 = require("./pit_wall");
function snap(overrides) {
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
(0, node_test_1.describe)("teamResultsByClass", () => {
    (0, node_test_1.it)("groups managed entries by class", () => {
        const snaps = [
            snap({ classId: "LMP2", entryId: "e1", teamName: "Cursor Racing" }),
            snap({ classId: "LMGT3", entryId: "e2", teamName: "Cursor Racing" }),
            snap({ classId: "Hypercar", entryId: "e3", teamName: "Other Team" }),
        ];
        const byClass = (0, pit_wall_1.teamResultsByClass)(snaps, { entryIds: ["e1", "e2"] });
        strict_1.default.equal(byClass.LMP2?.length, 1);
        strict_1.default.equal(byClass.LMGT3?.length, 1);
        strict_1.default.equal(byClass.Hypercar, undefined);
    });
});
(0, node_test_1.describe)("sortedTeamClasses", () => {
    (0, node_test_1.it)("orders Hypercar before LMP2 before LMGT3", () => {
        const order = (0, pit_wall_1.sortedTeamClasses)({
            LMGT3: [snap({ classId: "LMGT3", entryId: "g1", teamName: "T" })],
            LMP2: [snap({ classId: "LMP2", entryId: "p1", teamName: "T" })],
            Hypercar: [snap({ classId: "Hypercar", entryId: "h1", teamName: "T" })],
        });
        strict_1.default.deepEqual(order, ["Hypercar", "LMP2", "LMGT3"]);
    });
});
(0, node_test_1.describe)("tickPitBot race control", () => {
    (0, node_test_1.it)("submits drive-through when penalty is pending", () => {
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
        const carState = (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 });
        const submitted = [];
        const actions = (0, pit_wall_1.tickPitBot)(snapshots, [entryId], carState, { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.equal(submitted[0], "pit|drive_through");
        strict_1.default.equal(actions[0]?.command, "pit|drive_through");
    });
    (0, node_test_1.it)("defers routine pit under FCY but not limp emergency", () => {
        const entryId = "ai-2";
        const base = snap({
            entryId,
            classId: "LMP2",
            teamName: "Rival",
            tireWear: 0.95,
            fuel: 5,
        });
        const carState = (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 });
        const routine = [];
        (0, pit_wall_1.tickPitBot)([base], [entryId], carState, { phase: "race", wet: 0, fcyActive: true, flagPhase: "fcy" }, (_id, cmd) => {
            routine.push(cmd);
            return true;
        });
        strict_1.default.ok(!routine.some((c) => c.startsWith("pit|fuel")));
        const emergency = [];
        (0, pit_wall_1.tickPitBot)([{ ...base, limpMode: "barely_driveable" }], [entryId], carState, { phase: "race", wet: 0, fcyActive: true, flagPhase: "fcy" }, (_id, cmd) => {
            emergency.push(cmd);
            return true;
        });
        strict_1.default.ok(emergency.some((c) => c.startsWith("pit|")));
    });
    (0, node_test_1.it)("submits stop-and-go for black flag penalty", () => {
        const entryId = "ai-black";
        const submitted = [];
        (0, pit_wall_1.tickPitBot)([
            snap({
                entryId,
                classId: "LMP2",
                teamName: "Rival",
                pendingPenalty: "black",
                lapsToComply: 1,
            }),
        ], [entryId], (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 }), { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.equal(submitted[0], "pit|stop_go");
    });
    (0, node_test_1.it)("serves penalty before deferring under safety car", () => {
        const entryId = "ai-pen-sc";
        const submitted = [];
        (0, pit_wall_1.tickPitBot)([
            snap({
                entryId,
                classId: "LMP2",
                teamName: "Rival",
                pendingPenalty: "drive_through",
                lapsToComply: 2,
                tireWear: 0.99,
                fuel: 3,
            }),
        ], [entryId], (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 }), {
            phase: "race",
            wet: 0,
            scActive: true,
            flagPhase: "sc",
        }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.equal(submitted[0], "pit|drive_through");
        strict_1.default.ok(!submitted.some((c) => c.startsWith("pit|fuel")));
    });
    (0, node_test_1.it)("defers routine pit under slow zone flag phase", () => {
        const entryId = "ai-slow";
        const submitted = [];
        (0, pit_wall_1.tickPitBot)([
            snap({
                entryId,
                classId: "Hypercar",
                teamName: "Rival",
                tireWear: 0.99,
                fuel: 4,
            }),
        ], [entryId], (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 }), { phase: "race", wet: 0, flagPhase: "slow_zone" }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(!submitted.some((c) => c.startsWith("pit|fuel")));
    });
    (0, node_test_1.it)("does not submit penalty serve when none pending", () => {
        const entryId = "ai-clean";
        const submitted = [];
        (0, pit_wall_1.tickPitBot)([snap({ entryId, classId: "LMP2", teamName: "Rival" })], [entryId], (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 }), { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(!submitted.some((c) => c.includes("drive_through")));
        strict_1.default.ok(!submitted.some((c) => c.includes("stop_go")));
    });
});
(0, node_test_1.describe)("tickPitBot briefing integration", () => {
    function tacticsFor(briefingId, classId, sessionType = "race") {
        return (0, briefing_tactics_1.resolveBriefingTactics)({ carId: "car-1", briefingId }, sessionType, classId);
    }
    (0, node_test_1.it)("gridSetupCommands applies pole_attack soft push and deploy hybrid", () => {
        const entryId = "e-hc";
        const snapshots = [
            snap({ entryId, classId: "Hypercar", teamName: "Cursor Racing" }),
        ];
        const tactics = tacticsFor("pole_attack", "Hypercar", "qualifying");
        const commands = (0, pit_wall_1.gridSetupCommands)(snapshots, [entryId], 0, undefined, () => tactics).map((a) => a.command);
        strict_1.default.ok(commands.includes("starting_compound=soft"));
        strict_1.default.ok(commands.includes("driver_mode=push"));
        strict_1.default.ok(commands.includes("hybrid_strategy=deploy"));
    });
    (0, node_test_1.it)("gridSetupCommands applies conserve harvest hybrid on hypercar race", () => {
        const entryId = "e-hc";
        const snapshots = [
            snap({ entryId, classId: "Hypercar", teamName: "Cursor Racing" }),
        ];
        const tactics = tacticsFor("conserve", "Hypercar", "race");
        const commands = (0, pit_wall_1.gridSetupCommands)(snapshots, [entryId], 0, undefined, () => tactics).map((a) => a.command);
        strict_1.default.ok(commands.includes("starting_compound=medium"));
        strict_1.default.ok(commands.includes("driver_mode=conserve"));
        strict_1.default.ok(commands.includes("hybrid_strategy=harvest"));
    });
    (0, node_test_1.it)("tickPitBot uses conserve briefing driver mode during race", () => {
        const entryId = "e-conserve";
        const submitted = [];
        (0, pit_wall_1.tickPitBot)([snap({ entryId, classId: "LMP2", teamName: "Us", lap: 5 })], [entryId], (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 }), {
            phase: "race",
            wet: 0,
            getBriefingTactics: () => tacticsFor("conserve", "LMP2", "race"),
        }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(submitted.includes("driver_mode=conserve"));
    });
    (0, node_test_1.it)("tickPitBot yields push to normal when teammate is within strategist gap", () => {
        const lead = "e-lead";
        const support = "e-support";
        const snapshots = [
            snap({
                entryId: lead,
                classId: "Hypercar",
                teamName: "Cursor Racing",
                gapToLeader: 12,
                lap: 4,
            }),
            snap({
                entryId: support,
                classId: "Hypercar",
                teamName: "Cursor Racing",
                gapToLeader: 12.2,
                lap: 4,
            }),
        ];
        const submitted = [];
        (0, pit_wall_1.tickPitBot)(snapshots, [lead], (0, pit_wall_1.initCarState)([lead], 0, { minLap: 3 }), {
            phase: "qualifying",
            wet: 0,
            getBriefingTactics: () => tacticsFor("no_teammate_fight", "Hypercar", "qualifying"),
            strategistSkill: 50,
        }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(submitted.includes("driver_mode=normal"));
        strict_1.default.ok(!submitted.includes("driver_mode=push"));
    });
    (0, node_test_1.it)("tickPitBot keeps push when teammate gap exceeds strategist threshold", () => {
        const lead = "e-lead";
        const support = "e-support";
        const snapshots = [
            snap({
                entryId: lead,
                classId: "Hypercar",
                teamName: "Cursor Racing",
                gapToLeader: 12,
                lap: 4,
            }),
            snap({
                entryId: support,
                classId: "Hypercar",
                teamName: "Cursor Racing",
                gapToLeader: 14,
                lap: 4,
            }),
        ];
        const submitted = [];
        (0, pit_wall_1.tickPitBot)(snapshots, [lead], (0, pit_wall_1.initCarState)([lead], 0, { minLap: 3 }), {
            phase: "qualifying",
            wet: 0,
            getBriefingTactics: () => tacticsFor("pole_attack", "Hypercar", "qualifying"),
            strategistSkill: 50,
        }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(submitted.includes("driver_mode=push"));
    });
});
