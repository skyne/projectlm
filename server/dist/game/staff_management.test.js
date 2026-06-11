"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const staff_1 = require("./staff");
function engineer(carId, name, skill = 80) {
    return {
        id: `staff-engineer-${carId}`,
        role: "engineer",
        name,
        skill,
        experience: 5,
        salaryPerRace: 40000,
        morale: 75,
        assignedCarId: carId,
        status: "active",
    };
}
function juniorEngineer(carId) {
    return {
        id: `staff-junior-engineer-${carId}`,
        role: "engineer",
        name: "Junior Engineer",
        skill: 60,
        experience: 0,
        salaryPerRace: 32000,
        morale: 70,
        assignedCarId: carId,
        status: "active",
    };
}
(0, node_test_1.describe)("staff management", () => {
    (0, node_test_1.it)("releases a signed crew member back to a junior placeholder", () => {
        const staff = [engineer("car-1", "Luca Rossi")];
        const next = (0, staff_1.releaseStaffSlot)(staff, "car-1", "engineer");
        strict_1.default.ok(!("error" in next));
        const slot = next.find((m) => m.role === "engineer" && m.assignedCarId === "car-1");
        strict_1.default.ok(slot);
        strict_1.default.ok((0, staff_1.isJuniorPlaceholder)(slot));
        strict_1.default.ok(!(0, staff_1.isStaffSlotFilled)(slot));
    });
    (0, node_test_1.it)("rejects releasing an already vacant slot", () => {
        const staff = [juniorEngineer("car-2")];
        const next = (0, staff_1.releaseStaffSlot)(staff, "car-2", "engineer");
        strict_1.default.ok("error" in next);
    });
    (0, node_test_1.it)("moves crew into a vacant slot on another car", () => {
        const staff = [engineer("car-1", "Luca Rossi"), juniorEngineer("car-2")];
        const next = (0, staff_1.moveStaffBetweenCars)(staff, "car-1", "car-2", "engineer");
        strict_1.default.ok(!("error" in next));
        const from = next.find((m) => m.role === "engineer" && m.assignedCarId === "car-1");
        const to = next.find((m) => m.role === "engineer" && m.assignedCarId === "car-2");
        strict_1.default.ok(from && (0, staff_1.isJuniorPlaceholder)(from));
        strict_1.default.equal(to?.name, "Luca Rossi");
        strict_1.default.ok((0, staff_1.isStaffSlotFilled)(to));
    });
    (0, node_test_1.it)("swaps crew when both cars have signed engineers", () => {
        const staff = [
            engineer("car-1", "Luca Rossi"),
            engineer("car-2", "Marco Bianchi", 72),
        ];
        const next = (0, staff_1.moveStaffBetweenCars)(staff, "car-1", "car-2", "engineer");
        strict_1.default.ok(!("error" in next));
        const car1 = next.find((m) => m.role === "engineer" && m.assignedCarId === "car-1");
        const car2 = next.find((m) => m.role === "engineer" && m.assignedCarId === "car-2");
        strict_1.default.equal(car1?.name, "Marco Bianchi");
        strict_1.default.equal(car2?.name, "Luca Rossi");
    });
});
