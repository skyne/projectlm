import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateEngineerCommand } from "./engineer_commands.js";

describe("validateEngineerCommand", () => {
  it("accepts driver mode and cancel_pit", () => {
    assert.equal(validateEngineerCommand("driver_mode=push"), "driver_mode=push");
    assert.equal(validateEngineerCommand("hybrid_strategy=harvest"), "hybrid_strategy=harvest");
    assert.equal(validateEngineerCommand("cancel_pit"), "cancel_pit");
  });

  it("accepts pit with setup keys", () => {
    const cmd = validateEngineerCommand(
      "pit|fuel=40|compound=medium|tires=all|wing=0.05|front_ride_height=0.002",
      100,
    );
    assert.ok(cmd?.startsWith("pit|"));
    assert.match(cmd!, /wing=0\.05/);
    assert.match(cmd!, /front_ride_height=0\.002/);
  });

  it("accepts live setup command", () => {
    const cmd = validateEngineerCommand("setup|wing=-0.05|brake_bias=0.02", 100);
    assert.equal(cmd, "setup|wing=-0.05|brake_bias=0.02");
  });

  it("clamps wing for low skill engineer", () => {
    const cmd = validateEngineerCommand("setup|wing=0.05|front_spring=8000", 60);
    assert.ok(cmd);
    assert.match(cmd!, /wing=/);
    assert.doesNotMatch(cmd!, /front_spring/);
    const wingVal = parseFloat(cmd!.match(/wing=([^|]+)/)?.[1] ?? "0");
    assert.ok(Math.abs(wingVal) < 0.05);
  });

  it("rejects unknown keys", () => {
    assert.equal(
      validateEngineerCommand("pit|fuel=40|magic=1"),
      undefined,
    );
  });
});
