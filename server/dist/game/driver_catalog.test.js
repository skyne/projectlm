"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const driver_catalog_1 = require("./driver_catalog");
function sampleDriver(name, id) {
    return {
        id,
        name,
        nationality: "GB",
        tier: "Gold",
        dryPace: 80,
        wetPace: 78,
        consistency: 80,
        overtaking: 78,
        defending: 78,
        trafficManagement: 78,
        rollingStart: 78,
        standingStart: 76,
        setupFeedback: 74,
        tireManagement: 78,
        fuelSaving: 76,
        composure: 80,
        nightPace: 78,
        rainRadar: 74,
        stamina: 80,
        maxStintHours: 3,
    };
}
function sampleCar(id, carNumber) {
    return {
        id,
        carNumber,
        classId: "Hypercar",
        affiliation: "privateer",
        acquisition: "privateer",
        build: { carName: `Car ${carNumber}` },
        carConfigPath: `configs/runtime/${id}.txt`,
    };
}
(0, node_test_1.describe)("driver_catalog assignments", () => {
    (0, node_test_1.it)("assigns all drivers to a single car by default", () => {
        const roster = (0, driver_catalog_1.ensureDriverIds)([
            sampleDriver("A", "d-a"),
            sampleDriver("B", "d-b"),
        ]);
        const fleet = [sampleCar("car-1", "1")];
        const assignments = (0, driver_catalog_1.defaultDriverAssignments)(roster, fleet);
        strict_1.default.deepEqual(assignments["car-1"], ["d-a", "d-b"]);
    });
    (0, node_test_1.it)("round-robins drivers across multiple cars", () => {
        const roster = (0, driver_catalog_1.ensureDriverIds)([
            sampleDriver("A", "d-a"),
            sampleDriver("B", "d-b"),
            sampleDriver("C", "d-c"),
        ]);
        const fleet = [sampleCar("car-1", "1"), sampleCar("car-2", "2")];
        const assignments = (0, driver_catalog_1.defaultDriverAssignments)(roster, fleet);
        strict_1.default.deepEqual(assignments["car-1"], ["d-a", "d-c"]);
        strict_1.default.deepEqual(assignments["car-2"], ["d-b"]);
    });
    (0, node_test_1.it)("rejects a driver assigned to two cars", () => {
        const roster = (0, driver_catalog_1.ensureDriverIds)([sampleDriver("A", "d-a")]);
        const fleet = [
            { ...sampleCar("car-1", "1"), assignedDriverIds: ["d-a"] },
            { ...sampleCar("car-2", "2"), assignedDriverIds: ["d-a"] },
        ];
        const err = (0, driver_catalog_1.validateExclusiveDriverAssignments)(fleet, roster);
        strict_1.default.match(err ?? "", /cannot be assigned to more than one car/i);
    });
    (0, node_test_1.it)("migrates legacy index assignments to exclusive driver ids", () => {
        const roster = (0, driver_catalog_1.ensureDriverIds)([
            sampleDriver("A", "d-a"),
            sampleDriver("B", "d-b"),
        ]);
        const fleet = [
            {
                ...sampleCar("car-1", "1"),
                assignedDriverIndices: [0, 1],
            },
            {
                ...sampleCar("car-2", "2"),
                assignedDriverIndices: [0, 1],
            },
        ];
        const { fleet: migrated } = (0, driver_catalog_1.migrateDriverAssignments)(roster, fleet);
        const allAssigned = migrated.flatMap((c) => c.assignedDriverIds ?? []);
        strict_1.default.equal(new Set(allAssigned).size, allAssigned.length);
        strict_1.default.ok(migrated.every((c) => (c.assignedDriverIds?.length ?? 0) >= 1));
        strict_1.default.ok((0, driver_catalog_1.sanitizeAssignedDriverIds)(migrated[0].assignedDriverIds, roster).length >= 1);
    });
});
(0, node_test_1.describe)("driver_catalog contracts", () => {
    (0, node_test_1.it)("uses stable catalog ids for the same real-world driver", () => {
        const a = (0, driver_catalog_1.stableCatalogDriverId)("Tom Kristensen", "DK");
        const b = (0, driver_catalog_1.stableCatalogDriverId)("Tom Kristensen", "DK");
        strict_1.default.equal(a, b);
        strict_1.default.match(a, /^catalog-/);
    });
    (0, node_test_1.it)("player roster overrides catalog team contracts", () => {
        const catalogId = (0, driver_catalog_1.stableCatalogDriverId)("Factory Ace", "JP");
        const contracts = (0, driver_catalog_1.buildDriverContractMap)("/tmp/unused", {
            playerTeamName: "SkyTech",
            playerRoster: [sampleDriver("Factory Ace", catalogId)],
            rosterOverrides: {
                "Toyota Racing#7": [sampleDriver("Factory Ace", catalogId)],
            },
        });
        strict_1.default.equal(contracts.get(catalogId), "SkyTech");
    });
    (0, node_test_1.it)("filters poached drivers out of their former team roster", () => {
        const catalogId = (0, driver_catalog_1.stableCatalogDriverId)("Poached Star", "FR");
        const contracts = (0, driver_catalog_1.buildDriverContractMap)("/tmp/unused", {
            playerTeamName: "SkyTech",
            playerRoster: [sampleDriver("Poached Star", catalogId)],
        });
        const filtered = (0, driver_catalog_1.filterRosterByContract)([sampleDriver("Poached Star", catalogId), sampleDriver("Teammate", "d-x")], "Toyota Racing", contracts);
        strict_1.default.equal(filtered.length, 1);
        strict_1.default.equal(filtered[0].name, "Teammate");
    });
});
