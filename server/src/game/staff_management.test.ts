import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isJuniorPlaceholder,
  isStaffSlotFilled,
  moveStaffBetweenCars,
  releaseStaffSlot,
  type StaffMember,
} from "./staff";

function engineer(carId: string, name: string, skill = 80): StaffMember {
  return {
    id: `staff-engineer-${carId}`,
    role: "engineer",
    name,
    skill,
    experience: 5,
    salaryPerRace: 40_000,
    morale: 75,
    assignedCarId: carId,
    status: "active",
  };
}

function juniorEngineer(carId: string): StaffMember {
  return {
    id: `staff-junior-engineer-${carId}`,
    role: "engineer",
    name: "Junior Engineer",
    skill: 60,
    experience: 0,
    salaryPerRace: 32_000,
    morale: 70,
    assignedCarId: carId,
    status: "active",
  };
}

describe("staff management", () => {
  it("releases a signed crew member back to a junior placeholder", () => {
    const staff = [engineer("car-1", "Luca Rossi")];
    const next = releaseStaffSlot(staff, "car-1", "engineer");
    assert.ok(!("error" in next));
    const slot = next.find(
      (m) => m.role === "engineer" && m.assignedCarId === "car-1",
    );
    assert.ok(slot);
    assert.ok(isJuniorPlaceholder(slot!));
    assert.ok(!isStaffSlotFilled(slot));
  });

  it("rejects releasing an already vacant slot", () => {
    const staff = [juniorEngineer("car-2")];
    const next = releaseStaffSlot(staff, "car-2", "engineer");
    assert.ok("error" in next);
  });

  it("moves crew into a vacant slot on another car", () => {
    const staff = [engineer("car-1", "Luca Rossi"), juniorEngineer("car-2")];
    const next = moveStaffBetweenCars(staff, "car-1", "car-2", "engineer");
    assert.ok(!("error" in next));
    const from = next.find(
      (m) => m.role === "engineer" && m.assignedCarId === "car-1",
    );
    const to = next.find(
      (m) => m.role === "engineer" && m.assignedCarId === "car-2",
    );
    assert.ok(from && isJuniorPlaceholder(from));
    assert.equal(to?.name, "Luca Rossi");
    assert.ok(isStaffSlotFilled(to));
  });

  it("swaps crew when both cars have signed engineers", () => {
    const staff = [
      engineer("car-1", "Luca Rossi"),
      engineer("car-2", "Marco Bianchi", 72),
    ];
    const next = moveStaffBetweenCars(staff, "car-1", "car-2", "engineer");
    assert.ok(!("error" in next));
    const car1 = next.find(
      (m) => m.role === "engineer" && m.assignedCarId === "car-1",
    );
    const car2 = next.find(
      (m) => m.role === "engineer" && m.assignedCarId === "car-2",
    );
    assert.equal(car1?.name, "Marco Bianchi");
    assert.equal(car2?.name, "Luca Rossi");
  });
});
