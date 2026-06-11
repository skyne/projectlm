import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FleetCarPayload } from "../ws_protocol";
import path from "node:path";
import {
  buildDriverContractMap,
  computeBronzeDriverPointPool,
  computeBronzeDriverTemplate,
  computeDriverPointCost,
  createCustomBronzeDriver,
  seedAdaptabilityForTier,
  defaultDriverAssignments,
  ensureDriverIds,
  filterRosterByContract,
  isCustomDriver,
  isSignedDriver,
  listWecCatalogDriverIds,
  loadFreeAgentDrivers,
  migrateDriverAssignments,
  sanitizeAssignedDriverIds,
  stableCatalogDriverId,
  validateCustomDriver,
  validateExclusiveDriverAssignments,
  type DriverProfilePayload,
} from "./driver_catalog";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function sampleDriver(name: string, id: string): DriverProfilePayload {
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

function sampleCar(id: string, carNumber: string): FleetCarPayload {
  return {
    id,
    carNumber,
    classId: "Hypercar",
    affiliation: "privateer",
    acquisition: "privateer",
    build: { carName: `Car ${carNumber}` } as FleetCarPayload["build"],
    carConfigPath: `configs/runtime/${id}.txt`,
  };
}

describe("driver_catalog assignments", () => {
  it("assigns all drivers to a single car by default", () => {
    const roster = ensureDriverIds([
      sampleDriver("A", "d-a"),
      sampleDriver("B", "d-b"),
    ]);
    const fleet = [sampleCar("car-1", "1")];
    const assignments = defaultDriverAssignments(roster, fleet);
    assert.deepEqual(assignments["car-1"], ["d-a", "d-b"]);
  });

  it("round-robins drivers across multiple cars", () => {
    const roster = ensureDriverIds([
      sampleDriver("A", "d-a"),
      sampleDriver("B", "d-b"),
      sampleDriver("C", "d-c"),
    ]);
    const fleet = [sampleCar("car-1", "1"), sampleCar("car-2", "2")];
    const assignments = defaultDriverAssignments(roster, fleet);
    assert.deepEqual(assignments["car-1"], ["d-a", "d-c"]);
    assert.deepEqual(assignments["car-2"], ["d-b"]);
  });

  it("rejects a driver assigned to two cars", () => {
    const roster = ensureDriverIds([sampleDriver("A", "d-a")]);
    const fleet = [
      { ...sampleCar("car-1", "1"), assignedDriverIds: ["d-a"] },
      { ...sampleCar("car-2", "2"), assignedDriverIds: ["d-a"] },
    ];
    const err = validateExclusiveDriverAssignments(fleet, roster);
    assert.match(err ?? "", /cannot be assigned to more than one car/i);
  });

  it("migrates legacy index assignments to exclusive driver ids", () => {
    const roster = ensureDriverIds([
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
    ] as Array<FleetCarPayload & { assignedDriverIndices?: number[] }>;

    const { fleet: migrated } = migrateDriverAssignments(roster, fleet);
    const allAssigned = migrated.flatMap((c) => c.assignedDriverIds ?? []);
    assert.equal(new Set(allAssigned).size, allAssigned.length);
    assert.ok(migrated.every((c) => (c.assignedDriverIds?.length ?? 0) >= 1));
    assert.ok(
      sanitizeAssignedDriverIds(migrated[0].assignedDriverIds, roster).length >= 1,
    );
  });
});

describe("driver_catalog contracts", () => {
  it("uses stable catalog ids for the same real-world driver", () => {
    const a = stableCatalogDriverId("Tom Kristensen", "DK");
    const b = stableCatalogDriverId("Tom Kristensen", "DK");
    assert.equal(a, b);
    assert.match(a, /^catalog-/);
  });

  it("player roster overrides catalog team contracts", () => {
    const catalogId = stableCatalogDriverId("Factory Ace", "JP");
    const contracts = buildDriverContractMap("/tmp/unused", {
      playerTeamName: "SkyTech",
      playerRoster: [sampleDriver("Factory Ace", catalogId)],
      rosterOverrides: {
        "Toyota Racing#7": [sampleDriver("Factory Ace", catalogId)],
      },
    });
    assert.equal(contracts.get(catalogId), "SkyTech");
  });

  it("filters poached drivers out of their former team roster", () => {
    const catalogId = stableCatalogDriverId("Poached Star", "FR");
    const contracts = buildDriverContractMap("/tmp/unused", {
      playerTeamName: "SkyTech",
      playerRoster: [sampleDriver("Poached Star", catalogId)],
    });
    const filtered = filterRosterByContract(
      [sampleDriver("Poached Star", catalogId), sampleDriver("Teammate", "d-x")],
      "Toyota Racing",
      contracts,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.name, "Teammate");
  });
});

describe("custom bronze drivers", () => {
  it("derives point pool from WEC bronze preset average", () => {
    const pool = computeBronzeDriverPointPool(REPO_ROOT);
    assert.equal(pool, 7);
  });

  it("creates custom drivers at bronze baseline within pool", () => {
    const pool = computeBronzeDriverPointPool(REPO_ROOT);
    const driver = createCustomBronzeDriver(REPO_ROOT);
    assert.equal(driver.tier, "Bronze");
    assert.equal(driver.origin, "custom");
    assert.ok(isCustomDriver(driver));
    assert.equal(validateCustomDriver(driver, pool), null);
    assert.equal(computeDriverPointCost({ ...driver, tier: "Bronze" }), pool);
  });

  it("template matches averaged bronze stats", () => {
    const template = computeBronzeDriverTemplate(REPO_ROOT);
    assert.equal(template.tier, "Bronze");
    assert.equal(template.dryPace, 70);
    assert.ok((template.adaptability ?? 0) >= 55);
    assert.ok((template.adaptability ?? 0) <= 65);
  });

  it("seeds adaptability from FIA license tier with stable variance", () => {
    const a = seedAdaptabilityForTier("Platinum", "Earl Bamber|NZ");
    const b = seedAdaptabilityForTier("Platinum", "Earl Bamber|NZ");
    const bronze = seedAdaptabilityForTier("Bronze", "James Kell|GB");
    assert.equal(a, b);
    assert.ok(a >= 82 && a <= 94);
    assert.ok(bronze >= 53 && bronze <= 63);
    assert.ok(a > bronze);
  });

  it("recognises WEC catalog drivers by stable id", () => {
    const catalogIds = new Set(listWecCatalogDriverIds(REPO_ROOT));
    const lopez: DriverProfilePayload = {
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
    assert.ok(isSignedDriver(lopez, catalogIds));
    assert.ok(!isCustomDriver(lopez, catalogIds));
  });

  it("skips point pool for signed drivers", () => {
    const signed: DriverProfilePayload = {
      id: stableCatalogDriverId("Earl Bamber", "NZ"),
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
    assert.ok(isSignedDriver(signed));
    assert.equal(validateCustomDriver(signed, 7), null);
  });

  it("loads free agents without duplicating 2026 WEC catalog drivers", () => {
    const catalogIds = new Set(listWecCatalogDriverIds(REPO_ROOT));
    const freeAgents = loadFreeAgentDrivers(REPO_ROOT);
    assert.ok(freeAgents.length >= 20);
    const ids = new Set<string>();
    for (const entry of freeAgents) {
      const id = entry.driver.id!;
      assert.ok(!catalogIds.has(id), `${entry.driver.name} is on 2026 WEC grid`);
      assert.ok(!ids.has(id), `duplicate free agent ${entry.driver.name}`);
      ids.add(id);
    }
  });

  it("includes female free agents from ELMS and IMSA", () => {
    const females = loadFreeAgentDrivers(REPO_ROOT).filter(
      (e) => e.driver.gender === "female",
    );
    const names = new Set(females.map((e) => e.driver.name));
    assert.ok(names.has("Sarah Bovy"));
    assert.ok(names.has("Michelle Gatting"));
    assert.ok(names.has("Tatiana Calderón"));
    assert.ok(females.length >= 7);
  });
});
