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
        fuelTankCapacity: overrides.fuelTankCapacity,
        tyreDeflation: overrides.tyreDeflation,
        partHealth: overrides.partHealth,
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
(0, node_test_1.describe)("releaseFromGarage", () => {
    (0, node_test_1.it)("staggers practice releases by grid order", () => {
        const entryIds = ["entry-1", "entry-2", "entry-3"];
        const snapshots = entryIds.map((entryId) => snap({
            entryId,
            classId: "Hypercar",
            teamName: "Cursor Racing",
            inGarage: true,
            lap: 0,
            speed: 0,
        }));
        const carState = (0, pit_wall_1.initCarState)(entryIds);
        const submitted = [];
        const submit = (id, cmd) => {
            submitted.push(`${id}:${cmd}`);
            return true;
        };
        (0, pit_wall_1.releaseFromGarage)(snapshots, entryIds, carState, { phase: "practice", raceTimeSec: 0 }, submit);
        strict_1.default.deepEqual(submitted, ["entry-1:release"]);
        (0, pit_wall_1.releaseFromGarage)(snapshots, entryIds, carState, { phase: "practice", raceTimeSec: 2 }, submit);
        strict_1.default.deepEqual(submitted, ["entry-1:release"]);
        (0, pit_wall_1.releaseFromGarage)(snapshots, entryIds, carState, { phase: "practice", raceTimeSec: 3 }, submit);
        strict_1.default.deepEqual(submitted, ["entry-1:release", "entry-2:release"]);
        (0, pit_wall_1.releaseFromGarage)(snapshots, entryIds, carState, { phase: "practice", raceTimeSec: 6 }, submit);
        strict_1.default.deepEqual(submitted, [
            "entry-1:release",
            "entry-2:release",
            "entry-3:release",
        ]);
    });
    (0, node_test_1.it)("releases at most one car per call even when race time jumped ahead", () => {
        const entryIds = ["entry-1", "entry-2", "entry-3"];
        const snapshots = entryIds.map((entryId) => snap({
            entryId,
            classId: "Hypercar",
            teamName: "Cursor Racing",
            inGarage: true,
            lap: 0,
            speed: 0,
        }));
        const carState = (0, pit_wall_1.initCarState)(entryIds);
        const submitted = [];
        const submit = (id, cmd) => {
            submitted.push(id);
            return true;
        };
        (0, pit_wall_1.releaseFromGarage)(snapshots, entryIds, carState, { phase: "practice", raceTimeSec: 120 }, submit);
        strict_1.default.deepEqual(submitted, ["entry-1"]);
        (0, pit_wall_1.releaseFromGarage)(snapshots, entryIds, carState, { phase: "practice", raceTimeSec: 120 }, submit);
        strict_1.default.deepEqual(submitted, ["entry-1", "entry-2"]);
        (0, pit_wall_1.releaseFromGarage)(snapshots, entryIds, carState, { phase: "practice", raceTimeSec: 120 }, submit);
        strict_1.default.deepEqual(submitted, ["entry-1", "entry-2", "entry-3"]);
    });
    (0, node_test_1.it)("uses shorter gaps in qualifying", () => {
        strict_1.default.equal((0, pit_wall_1.garageReleaseTimeSec)("practice", 1), pit_wall_1.GARAGE_RELEASE_GAP_PRACTICE_SEC);
        strict_1.default.equal((0, pit_wall_1.garageReleaseTimeSec)("qualifying", 1), pit_wall_1.GARAGE_RELEASE_GAP_QUALIFYING_SEC);
        strict_1.default.ok(pit_wall_1.GARAGE_RELEASE_GAP_QUALIFYING_SEC < pit_wall_1.GARAGE_RELEASE_GAP_PRACTICE_SEC);
    });
});
(0, node_test_1.describe)("tickPitBot race control", () => {
    (0, node_test_1.it)("submits stop-and-go when penalty is pending in the pit lane", () => {
        const entryId = "ai-pit";
        const snapshots = [
            snap({
                entryId,
                classId: "LMP2",
                teamName: "Rival",
                inPit: true,
                pendingPenalty: "stop_go",
                lapsToComply: 2,
            }),
        ];
        const carState = (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 });
        const submitted = [];
        const actions = (0, pit_wall_1.tickPitBot)(snapshots, [entryId], carState, { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.equal(submitted[0], "pit|stop_go");
        strict_1.default.equal(actions[0]?.label, "Serve stop-and-go");
    });
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
        strict_1.default.equal(actions[0]?.label, "Serve drive-through");
    });
    (0, node_test_1.it)("defers penalty serve when fuel cannot cover in-penalty-out-service", () => {
        const entryId = "ai-fuel-pen";
        const snapshots = [
            snap({
                entryId,
                classId: "LMP2",
                teamName: "Rival",
                lap: 10,
                fuel: 3,
                fuelTankCapacity: 100,
                pendingPenalty: "stop_go",
                lapsToComply: 3,
            }),
        ];
        const carState = (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 });
        const st = carState.get(entryId);
        st.lastPitLap = 5;
        st.fuelAtLastPit = 13;
        const submitted = [];
        const actions = (0, pit_wall_1.tickPitBot)(snapshots, [entryId], carState, { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(!submitted.some((c) => c === "pit|stop_go"));
        strict_1.default.ok(submitted.some((c) => c.includes("fuel")));
        strict_1.default.match(actions[0]?.label ?? "", /before stop-and-go/i);
    });
    (0, node_test_1.it)("defers penalty serve when car has a flat tyre", () => {
        const entryId = "ai-flat-pen";
        const snapshots = [
            snap({
                entryId,
                classId: "LMP2",
                teamName: "Rival",
                lap: 10,
                fuel: 50,
                fuelTankCapacity: 100,
                inPit: true,
                pendingPenalty: "drive_through",
                lapsToComply: 3,
                tyreDeflation: { FL: "flat" },
            }),
        ];
        const carState = (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 });
        const submitted = [];
        const actions = (0, pit_wall_1.tickPitBot)(snapshots, [entryId], carState, { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(!submitted.some((c) => c === "pit|drive_through"));
        strict_1.default.ok(submitted.some((c) => c.includes("tires")));
        strict_1.default.match(actions[0]?.label ?? "", /before drive-through/i);
    });
    (0, node_test_1.it)("serves penalty when fuel covers in-penalty-out-service buffer", () => {
        const entryId = "ai-fuel-ok";
        const snapshots = [
            snap({
                entryId,
                classId: "LMP2",
                teamName: "Rival",
                lap: 10,
                fuel: 50,
                fuelTankCapacity: 100,
                inPit: true,
                pendingPenalty: "drive_through",
                lapsToComply: 3,
            }),
        ];
        const carState = (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 });
        const submitted = [];
        (0, pit_wall_1.tickPitBot)(snapshots, [entryId], carState, { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.equal(submitted[0], "pit|drive_through");
    });
    (0, node_test_1.it)("defers routine pit under red flag but submits emergency tyre work in pits", () => {
        const entryId = "ai-rf";
        const base = snap({
            entryId,
            classId: "LMP2",
            teamName: "Rival",
            tireWear: 0.95,
            fuel: 60,
            fuelTankCapacity: 100,
        });
        const carState = (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 });
        const routine = [];
        (0, pit_wall_1.tickPitBot)([base], [entryId], carState, { phase: "race", wet: 0, flagPhase: "red_flag" }, (_id, cmd) => {
            routine.push(cmd);
            return true;
        });
        strict_1.default.ok(!routine.some((c) => c.includes("driver_change")));
        const emergency = [];
        (0, pit_wall_1.tickPitBot)([
            {
                ...base,
                inPit: true,
                tyreDeflation: { FL: "flat" },
            },
        ], [entryId], carState, { phase: "race", wet: 0, flagPhase: "red_flag" }, (_id, cmd) => {
            emergency.push(cmd);
            return true;
        });
        strict_1.default.ok(emergency.some((c) => c.includes("tires=FL")));
        strict_1.default.ok(!emergency.some((c) => c.includes("tires=all")));
    });
    (0, node_test_1.it)("defers routine pit under FCY but not limp emergency", () => {
        // Fuel comfortable (window closed) — near-empty fuel is no longer deferred.
        const entryId = "ai-2";
        const base = snap({
            entryId,
            classId: "LMP2",
            teamName: "Rival",
            tireWear: 0.95,
            fuel: 60,
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
                fuel: 50,
                fuelTankCapacity: 100,
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
                fuel: 60,
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
    (0, node_test_1.it)("tickPitBot pushes hypercar on dry race when engine health is 85%", () => {
        const entryId = "e-push";
        const submitted = [];
        (0, pit_wall_1.tickPitBot)([snap({ entryId, classId: "Hypercar", teamName: "Sweep", lap: 8, engineHealth: 85 })], [entryId], (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 }), { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(submitted.includes("driver_mode=push"));
        strict_1.default.ok(submitted.includes("hybrid_strategy=deploy"));
    });
    (0, node_test_1.it)("tickPitBot conserves when engine health drops to 80%", () => {
        const entryId = "e-low";
        const submitted = [];
        (0, pit_wall_1.tickPitBot)([snap({ entryId, classId: "Hypercar", teamName: "Sweep", lap: 8, engineHealth: 80 })], [entryId], (0, pit_wall_1.initCarState)([entryId], 0, { minLap: 3 }), { phase: "race", wet: 0 }, (_id, cmd) => {
            submitted.push(cmd);
            return true;
        });
        strict_1.default.ok(submitted.includes("driver_mode=conserve"));
        strict_1.default.ok(submitted.includes("hybrid_strategy=balanced"));
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
