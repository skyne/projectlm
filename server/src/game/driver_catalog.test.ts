import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FleetCarPayload } from "../ws_protocol";
import {
  buildDriverContractMap,
  defaultDriverAssignments,
  ensureDriverIds,
  filterRosterByContract,
  migrateDriverAssignments,
  sanitizeAssignedDriverIds,
  stableCatalogDriverId,
  validateExclusiveDriverAssignments,
  type DriverProfilePayload,
} from "./driver_catalog";

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
