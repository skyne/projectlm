"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const race_classification_js_1 = require("./race_classification.js");
function snap(partial) {
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
    };
}
(0, node_test_1.test)("raceDistanceMeters uses completed laps plus current distance", () => {
    strict_1.default.equal((0, race_classification_js_1.raceDistanceMeters)(snap({ entryId: "a", classId: "Hypercar", lap: 1, distance: 500 }), 4900), 500);
    strict_1.default.equal((0, race_classification_js_1.raceDistanceMeters)(snap({ entryId: "a", classId: "Hypercar", lap: 193, distance: 1000 }), 4900), 192 * 4900 + 1000);
});
(0, node_test_1.test)("applyRaceClassification marks under 75% class leader as not classified", () => {
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
    const out = (0, race_classification_js_1.applyRaceClassification)([leader, lapped], lapLength);
    const dnf = out.find((s) => s.entryId === "entry-2");
    strict_1.default.equal(dnf?.retired, true);
    strict_1.default.match(dnf?.retireReason ?? "", /Not classified/);
    strict_1.default.ok((0, race_classification_js_1.raceDistanceMeters)(lapped, lapLength) <
        (0, race_classification_js_1.raceDistanceMeters)(leader, lapLength) * race_classification_js_1.CLASS_MIN_DISTANCE_FRACTION);
});
(0, node_test_1.test)("applyRaceClassification keeps cars above threshold classified", () => {
    const lapLength = 1000;
    const leader = snap({ entryId: "a", classId: "Hypercar", lap: 10, distance: 0 });
    const follower = snap({ entryId: "b", classId: "Hypercar", lap: 8, distance: 500 });
    const out = (0, race_classification_js_1.applyRaceClassification)([leader, follower], lapLength);
    strict_1.default.equal(out.find((s) => s.entryId === "b")?.retired, false);
});
