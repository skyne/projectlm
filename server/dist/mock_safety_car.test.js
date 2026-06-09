"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mock_safety_car_1 = require("./mock_safety_car");
const LAP = 5000;
const samples = [
    {
        distance: 0,
        normalizedT: 0,
        x: 0,
        z: 0,
        tangentX: 1,
        tangentZ: 0,
    },
    {
        distance: LAP,
        normalizedT: 1,
        x: LAP,
        z: 0,
        tangentX: 1,
        tangentZ: 0,
    },
];
(0, node_test_1.describe)("mock_safety_car", () => {
    (0, node_test_1.it)("emits a map snapshot while deployed", () => {
        const sc = (0, mock_safety_car_1.createParkedMockSafetyCar)(LAP);
        strict_1.default.equal((0, mock_safety_car_1.buildMockSafetyCarSnapshot)(sc, LAP, samples), null);
        (0, mock_safety_car_1.deployMockSafetyCar)(sc, LAP);
        (0, mock_safety_car_1.tickMockSafetyCar)(sc, LAP, 1000, 0.5);
        const snap = (0, mock_safety_car_1.buildMockSafetyCarSnapshot)(sc, LAP, samples);
        strict_1.default.equal(snap?.entryId, "safety-car");
        strict_1.default.equal(snap?.inPit, true);
        strict_1.default.equal(typeof snap?.position.x, "number");
    });
    (0, node_test_1.it)("returns to pit box after peel-off", () => {
        const sc = (0, mock_safety_car_1.createParkedMockSafetyCar)(LAP);
        (0, mock_safety_car_1.deployMockSafetyCar)(sc, LAP);
        for (let i = 0; i < 200; i++)
            (0, mock_safety_car_1.tickMockSafetyCar)(sc, LAP, 1200, 0.1);
        const phaseAfterDeploy = sc.phase;
        strict_1.default.equal(phaseAfterDeploy, "on_track");
        sc.distance = LAP - 30;
        (0, mock_safety_car_1.peelOffMockSafetyCar)(sc);
        let sawForwardPitEntry = false;
        let prevPitDist = -1;
        for (let i = 0; i < 500; i++) {
            (0, mock_safety_car_1.tickMockSafetyCar)(sc, LAP, 1200, 0.05);
            const phase = sc.phase;
            if (phase === "entering_pit" && sc.inPit) {
                if (prevPitDist >= 0 && sc.pitLaneDistance > prevPitDist)
                    sawForwardPitEntry = true;
                prevPitDist = sc.pitLaneDistance;
            }
            if (phase === "parked")
                break;
        }
        strict_1.default.equal(sc.phase, "parked");
        strict_1.default.equal(sc.inPit, true);
        strict_1.default.ok(sawForwardPitEntry, "SC should drive forward through pit entrance");
        strict_1.default.equal((0, mock_safety_car_1.buildMockSafetyCarSnapshot)(sc, LAP, samples), null);
    });
});
