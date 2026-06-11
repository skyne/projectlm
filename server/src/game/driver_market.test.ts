import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  buildDriverMarket,
  driverRosterCapMessage,
  maxDriverRosterForFleet,
} from "./driver_market";
import { listWecCatalogDriverIds } from "./driver_catalog";

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("driver_market", () => {
  it("scales roster cap with fleet size", () => {
    assert.equal(maxDriverRosterForFleet(1), 6);
    assert.equal(maxDriverRosterForFleet(5), 25);
    assert.ok(driverRosterCapMessage(5).includes("25"));
    assert.ok(driverRosterCapMessage(5).includes("4 per car"));
  });

  it("lists real free agents from 2025 grids ahead of random prospects", () => {
    const market = buildDriverMarket(REPO_ROOT, {
      seed: 424242,
      playerTeamName: "Player Team",
      existingRoster: [],
    });
    const freeAgents = market.filter((l) => l.source === "free_agent");
    const prospects = market.filter((l) => l.source === "prospect");
    assert.ok(freeAgents.length >= 10);
    assert.ok(prospects.length <= 4);
    const names = new Set(freeAgents.map((l) => l.driver.name));
    assert.ok(names.has("Sarah Bovy"));
    assert.ok(names.has("Michelle Gatting"));
    assert.ok(names.has("Rahel Frey"));
    const catalogIds = new Set(listWecCatalogDriverIds(REPO_ROOT));
    for (const listing of freeAgents) {
      assert.ok(!catalogIds.has(listing.driver.id!));
      assert.ok(listing.tagline.length > 0);
    }
  });

  it("prioritises female free agents in the market shuffle", () => {
    const market = buildDriverMarket(REPO_ROOT, {
      seed: 777,
      playerTeamName: "Player Team",
      existingRoster: [],
    });
    const freeAgents = market.filter((l) => l.source === "free_agent");
    const femaleCount = freeAgents.filter(
      (l) => l.driver.gender === "female",
    ).length;
    assert.ok(femaleCount >= 5);
  });
});
