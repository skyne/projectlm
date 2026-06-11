"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_path_1 = __importDefault(require("node:path"));
const driver_catalog_1 = require("./driver_catalog");
const REPO_ROOT = node_path_1.default.resolve(__dirname, "../../..");
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
(0, node_test_1.describe)("custom bronze drivers", () => {
    (0, node_test_1.it)("derives point pool from WEC bronze preset average", () => {
        const pool = (0, driver_catalog_1.computeBronzeDriverPointPool)(REPO_ROOT);
        strict_1.default.equal(pool, 7);
    });
    (0, node_test_1.it)("creates custom drivers at bronze baseline within pool", () => {
        const pool = (0, driver_catalog_1.computeBronzeDriverPointPool)(REPO_ROOT);
        const driver = (0, driver_catalog_1.createCustomBronzeDriver)(REPO_ROOT);
        strict_1.default.equal(driver.tier, "Bronze");
        strict_1.default.equal(driver.origin, "custom");
        strict_1.default.ok((0, driver_catalog_1.isCustomDriver)(driver));
        strict_1.default.equal((0, driver_catalog_1.validateCustomDriver)(driver, pool), null);
        strict_1.default.equal((0, driver_catalog_1.computeDriverPointCost)({ ...driver, tier: "Bronze" }), pool);
    });
    (0, node_test_1.it)("template matches averaged bronze stats", () => {
        const template = (0, driver_catalog_1.computeBronzeDriverTemplate)(REPO_ROOT);
        strict_1.default.equal(template.tier, "Bronze");
        strict_1.default.equal(template.dryPace, 70);
        strict_1.default.ok((template.adaptability ?? 0) >= 55);
        strict_1.default.ok((template.adaptability ?? 0) <= 65);
    });
    (0, node_test_1.it)("seeds adaptability from FIA license tier with stable variance", () => {
        const a = (0, driver_catalog_1.seedAdaptabilityForTier)("Platinum", "Earl Bamber|NZ");
        const b = (0, driver_catalog_1.seedAdaptabilityForTier)("Platinum", "Earl Bamber|NZ");
        const bronze = (0, driver_catalog_1.seedAdaptabilityForTier)("Bronze", "James Kell|GB");
        strict_1.default.equal(a, b);
        strict_1.default.ok(a >= 82 && a <= 94);
        strict_1.default.ok(bronze >= 53 && bronze <= 63);
        strict_1.default.ok(a > bronze);
    });
    (0, node_test_1.it)("recognises WEC catalog drivers by stable id", () => {
        const catalogIds = new Set((0, driver_catalog_1.listWecCatalogDriverIds)(REPO_ROOT));
        const lopez = {
            id: crypto.randomUUID(),
            name: "José María López",
            nationality: "AR",
            tier: "Gold",
            dryPace: 86,
            wetPace: 80,
            consistency: 87,
            overtaking: 82,
            defending: 85,
            trafficManagement: 82,
            rollingStart: 80,
            standingStart: 78,
            setupFeedback: 76,
            tireManagement: 80,
            fuelSaving: 76,
            composure: 82,
            nightPace: 78,
            rainRadar: 74,
            stamina: 82,
            maxStintHours: 3,
        };
        strict_1.default.ok((0, driver_catalog_1.isSignedDriver)(lopez, catalogIds));
        strict_1.default.ok(!(0, driver_catalog_1.isCustomDriver)(lopez, catalogIds));
    });
    (0, node_test_1.it)("skips point pool for signed drivers", () => {
        const signed = {
            id: (0, driver_catalog_1.stableCatalogDriverId)("Earl Bamber", "NZ"),
            origin: "signed",
            name: "Earl Bamber",
            nationality: "NZ",
            tier: "Platinum",
            dryPace: 95,
            wetPace: 90,
            consistency: 92,
            overtaking: 88,
            defending: 86,
            trafficManagement: 90,
            rollingStart: 88,
            standingStart: 86,
            setupFeedback: 84,
            tireManagement: 88,
            fuelSaving: 86,
            composure: 94,
            nightPace: 90,
            rainRadar: 86,
            stamina: 88,
            maxStintHours: 3,
        };
        strict_1.default.ok((0, driver_catalog_1.isSignedDriver)(signed));
        strict_1.default.equal((0, driver_catalog_1.validateCustomDriver)(signed, 7), null);
    });
    (0, node_test_1.it)("loads free agents without duplicating 2026 WEC catalog drivers", () => {
        const catalogIds = new Set((0, driver_catalog_1.listWecCatalogDriverIds)(REPO_ROOT));
        const freeAgents = (0, driver_catalog_1.loadFreeAgentDrivers)(REPO_ROOT);
        strict_1.default.ok(freeAgents.length >= 20);
        const ids = new Set();
        for (const entry of freeAgents) {
            const id = entry.driver.id;
            strict_1.default.ok(!catalogIds.has(id), `${entry.driver.name} is on 2026 WEC grid`);
            strict_1.default.ok(!ids.has(id), `duplicate free agent ${entry.driver.name}`);
            ids.add(id);
        }
    });
    (0, node_test_1.it)("includes female free agents from ELMS and IMSA", () => {
        const females = (0, driver_catalog_1.loadFreeAgentDrivers)(REPO_ROOT).filter((e) => e.driver.gender === "female");
        const names = new Set(females.map((e) => e.driver.name));
        strict_1.default.ok(names.has("Sarah Bovy"));
        strict_1.default.ok(names.has("Michelle Gatting"));
        strict_1.default.ok(names.has("Tatiana Calderón"));
        strict_1.default.ok(females.length >= 7);
    });
});
