"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const engineer_commands_js_1 = require("./engineer_commands.js");
(0, node_test_1.describe)("validateEngineerCommand", () => {
    (0, node_test_1.it)("accepts driver mode and cancel_pit", () => {
        strict_1.default.equal((0, engineer_commands_js_1.validateEngineerCommand)("driver_mode=push"), "driver_mode=push");
        strict_1.default.equal((0, engineer_commands_js_1.validateEngineerCommand)("hybrid_strategy=harvest"), "hybrid_strategy=harvest");
        strict_1.default.equal((0, engineer_commands_js_1.validateEngineerCommand)("cancel_pit"), "cancel_pit");
    });
    (0, node_test_1.it)("accepts pit with setup keys", () => {
        const cmd = (0, engineer_commands_js_1.validateEngineerCommand)("pit|fuel=40|compound=medium|tires=all|wing=0.05|front_ride_height=0.002", 100);
        strict_1.default.ok(cmd?.startsWith("pit|"));
        strict_1.default.match(cmd, /wing=0\.05/);
        strict_1.default.match(cmd, /front_ride_height=0\.002/);
    });
    (0, node_test_1.it)("accepts live setup command", () => {
        const cmd = (0, engineer_commands_js_1.validateEngineerCommand)("setup|wing=-0.05|brake_bias=0.02", 100);
        strict_1.default.equal(cmd, "setup|wing=-0.05|brake_bias=0.02");
    });
    (0, node_test_1.it)("clamps wing for low skill engineer", () => {
        const cmd = (0, engineer_commands_js_1.validateEngineerCommand)("setup|wing=0.05|front_spring=8000", 60);
        strict_1.default.ok(cmd);
        strict_1.default.match(cmd, /wing=/);
        strict_1.default.doesNotMatch(cmd, /front_spring/);
        const wingVal = parseFloat(cmd.match(/wing=([^|]+)/)?.[1] ?? "0");
        strict_1.default.ok(Math.abs(wingVal) < 0.05);
    });
    (0, node_test_1.it)("rejects unknown keys", () => {
        strict_1.default.equal((0, engineer_commands_js_1.validateEngineerCommand)("pit|fuel=40|magic=1"), undefined);
    });
});
