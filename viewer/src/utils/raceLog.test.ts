import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SimEvent } from "../ws/protocol";
import {
  categorizeEvent,
  computeRaceLogStats,
  findPenaltyTrace,
  isRaceLogEvent,
  normalizeSimEventType,
  parsePenaltyMessage,
} from "./raceLog";

describe("raceLog", () => {
  it("hides timing noise from the race log", () => {
    assert.equal(isRaceLogEvent({ type: "SectorCross", timestamp: 1, message: "" }), false);
    assert.equal(isRaceLogEvent({ type: "PenaltyIssued", timestamp: 1, message: "x" }), true);
  });

  it("normalizes native collision event types for the race log", () => {
    assert.equal(normalizeSimEventType("collision"), "Collision");
    assert.equal(
      isRaceLogEvent({ type: "collision", timestamp: 1, message: "hit" }),
      true,
    );
    assert.equal(
      categorizeEvent({ type: "collision", timestamp: 1, message: "hit" }),
      "incident",
    );
  });

  it("parses penalty messages with sanction and car number", () => {
    const parsed = parsePenaltyMessage(
      "#7 Acme Racing: Caused collision — drive through (Drive-through)",
    );
    assert.deepEqual(parsed, {
      team: "#7 Acme Racing",
      reason: "Caused collision — drive through",
      sanction: "Drive-through",
    });
  });

  it("counts penalties and incidents", () => {
    const events: SimEvent[] = [
      { type: "PenaltyIssued", timestamp: 10, message: "a" },
      { type: "Collision", timestamp: 9, message: "b", entryId: "e1" },
      { type: "FcyDeploy", timestamp: 5, message: "FCY" },
      { type: "LapComplete", timestamp: 4, message: "" },
    ];
    assert.deepEqual(computeRaceLogStats(events), {
      total: 3,
      penalties: 1,
      incidents: 1,
      flags: 1,
      retirements: 0,
    });
    assert.equal(categorizeEvent(events[0]!), "penalty");
  });

  it("traces penalty context for the same car", () => {
    const events: SimEvent[] = [
      { type: "PenaltyWarning", timestamp: 100, message: "warn", entryId: "e1" },
      { type: "Collision", timestamp: 110, message: "hit", entryId: "e1" },
      { type: "PenaltyIssued", timestamp: 115, message: "pen", entryId: "e1" },
      { type: "PenaltyIssued", timestamp: 120, message: "other", entryId: "e2" },
    ];
    const trace = findPenaltyTrace(events, events[2]!);
    assert.deepEqual(
      trace.map((e) => e.type),
      ["PenaltyWarning", "Collision", "PenaltyIssued"],
    );
  });
});
