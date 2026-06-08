import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignStaffToCar,
  findVacantCarsForRole,
  isJuniorPlaceholder,
  isStaffSlotFilled,
  type StaffMember,
} from "./staff";
import { staffSeveranceCost } from "./economy";
import {
  buildStaffMarket,
  findStaffMarketListing,
  staffMarketSeedForRound,
} from "./staff_market";

describe("staff market", () => {
  it("builds varied listings with creative names", () => {
    const seed = staffMarketSeedForRound("Audi SkyTech", 3, 0);
    const market = buildStaffMarket({ seed, existingStaff: [] });
    assert.ok(market.length >= 20);
    const names = new Set(market.map((l) => l.name));
    assert.equal(names.size, market.length);
    assert.ok(market.some((l) => l.source === "veteran"));
    assert.ok(market.some((l) => l.traits.length > 0));
  });

  it("signs into the first vacant car slot", () => {
    const staff: StaffMember[] = [
      {
        id: "staff-engineer-car1",
        role: "engineer",
        name: "Luca Rossi",
        skill: 80,
        experience: 10,
        salaryPerRace: 40_000,
        morale: 80,
        assignedCarId: "car-1",
        status: "active",
      },
      {
        id: "staff-mechanic-car1",
        role: "mechanic",
        name: "Marcus Webb",
        skill: 78,
        experience: 8,
        salaryPerRace: 36_000,
        morale: 80,
        assignedCarId: "car-1",
        status: "active",
      },
      {
        id: "staff-junior-mechanic-car-2",
        role: "mechanic",
        name: "Junior Mechanic",
        skill: 58,
        experience: 0,
        salaryPerRace: 28_000,
        morale: 70,
        assignedCarId: "car-2",
        status: "active",
      },
    ];
    const vacant = findVacantCarsForRole(
      ["car-1", "car-2"],
      staff,
      "mechanic",
    );
    assert.deepEqual(vacant, ["car-2"]);
    assert.ok(isJuniorPlaceholder(staff[2]!));
    assert.ok(!isStaffSlotFilled(staff[2]));

    const listing = buildStaffMarket({ seed: 42, existingStaff: staff })[0]!;
    const found = findStaffMarketListing(
      buildStaffMarket({ seed: 42, existingStaff: staff }),
      listing.id,
    );
    assert.ok(found);

    const next = assignStaffToCar(staff, "car-2", {
      role: "mechanic",
      name: found!.name,
      skill: found!.skill,
      experience: found!.experience,
      salaryPerRace: found!.salaryPerRace,
      morale: found!.morale,
      traits: found!.traits,
    });
    const hired = next.find(
      (m) => m.role === "mechanic" && m.assignedCarId === "car-2",
    );
    assert.ok(hired);
    assert.equal(hired!.name, found!.name);
    assert.ok(isStaffSlotFilled(hired));
  });

  it("replaces an incumbent crew member on assign", () => {
    const staff: StaffMember[] = [
      {
        id: "staff-engineer-car-1",
        role: "engineer",
        name: "Luca Rossi",
        skill: 80,
        experience: 10,
        salaryPerRace: 40_000,
        morale: 80,
        assignedCarId: "car-1",
        status: "active",
      },
    ];
    assert.deepEqual(findVacantCarsForRole(["car-1"], staff, "engineer"), []);

    const listing = buildStaffMarket({ seed: 7, existingStaff: staff }).find(
      (l) => l.role === "engineer",
    )!;
    const severance = staffSeveranceCost(staff[0]!);
    assert.equal(severance, 80_000);

    const next = assignStaffToCar(staff, "car-1", {
      role: listing.role,
      name: listing.name,
      skill: listing.skill,
      experience: listing.experience,
      salaryPerRace: listing.salaryPerRace,
      morale: listing.morale,
      traits: listing.traits,
    });
    const replaced = next.find(
      (m) => m.role === "engineer" && m.assignedCarId === "car-1",
    );
    assert.ok(replaced);
    assert.equal(replaced!.name, listing.name);
    assert.notEqual(replaced!.name, "Luca Rossi");
  });
});
