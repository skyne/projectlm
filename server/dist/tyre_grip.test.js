"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const tyre_grip_1 = require("./tyre_grip");
(0, node_test_1.default)("intermediate peaks in damp conditions", () => {
    const inter = (0, tyre_grip_1.tyreGripScale)("intermediate", 0.3, 20);
    const slick = (0, tyre_grip_1.tyreGripScale)("slick", 0.3, 20);
    const wet = (0, tyre_grip_1.tyreGripScale)("wet", 0.3, 20);
    strict_1.default.ok(inter > slick);
    strict_1.default.ok(inter > wet);
});
(0, node_test_1.default)("wet tyres beat slicks on a soaked track", () => {
    strict_1.default.ok((0, tyre_grip_1.tyreGripScale)("wet", 0.7, 18) > (0, tyre_grip_1.tyreGripScale)("slick", 0.7, 18));
});
