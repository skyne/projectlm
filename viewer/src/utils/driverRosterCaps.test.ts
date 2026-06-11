import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maxDriverRosterForFleet } from "./driverRosterCaps";

describe("driverRosterCaps", () => {
  it("matches server scaling for multi-car teams", () => {
    assert.equal(maxDriverRosterForFleet(5), 25);
    assert.equal(maxDriverRosterForFleet(1), 6);
  });
});
