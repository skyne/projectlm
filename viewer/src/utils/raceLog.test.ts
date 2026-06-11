import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SimEvent } from "../ws/protocol";
import {
  categorizeEvent,
  computeRaceLogStats,
  findPenaltyTrace,
  formatCarNumber,
  formatRaceLogHtml,
  formatSidebarLogHtml,
  isRaceLogEvent,
  matchesSidebarLogFilter,
  matchesSidebarRetainFilter,
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

  it("formats overtake lines with defender car number not team name", () => {
    const maps = {
      teamNameByEntry: new Map([
        ["e1", "Audi Sport Team SkyTech"],
        ["e2", "Team WRT"],
      ]),
      carNumberByEntry: new Map([
        ["e1", "8"],
        ["e2", "5"],
      ]),
    };
    const html = formatRaceLogHtml(
      {
        type: "Overtake",
        timestamp: 60,
        entryId: "e1",
        otherEntryId: "e2",
        message: "Loic Duval overtaking Team WRT",
      },
      maps,
    );
    assert.match(html, /#8 Audi Sport Team SkyTech/);
    assert.match(html, /Loic Duval overtaking #5/);
    assert.doesNotMatch(html, /Team WRT/);
  });

  it("shows red flag deploy reason in sidebar feed", () => {
    const maps = { teamNameByEntry: new Map(), carNumberByEntry: new Map() };
    const html = formatSidebarLogHtml(
      {
        type: "RedFlagDeploy",
        timestamp: 90,
        message: "Race control: Red flag — visibility too low (1.0 km)",
      },
      maps,
    );
    assert.match(html, /visibility too low/);
    assert.match(html, /1\.0 km/);
  });

  it("formats compact sidebar lines with car numbers only", () => {
    const maps = {
      teamNameByEntry: new Map([["e1", "Acme Racing"], ["e2", "Beta Motors"]]),
      carNumberByEntry: new Map([
        ["e1", "7"],
        ["e2", "42"],
      ]),
    };
    assert.equal(formatCarNumber("e1", maps), "#7");
    const html = formatSidebarLogHtml(
      { type: "SafetyCarDeploy", timestamp: 90, message: "Safety car deployed" },
      maps,
    );
    assert.match(html, /SC/);
    assert.doesNotMatch(html, /Acme/);
    const pen = formatSidebarLogHtml(
      {
        type: "PenaltyIssued",
        timestamp: 100,
        entryId: "e1",
        message: "#7 Acme Racing: Caused collision (Drive-through)",
      },
      maps,
    );
    assert.match(pen, /#7/);
    assert.match(pen, /PEN/);
    assert.doesNotMatch(pen, /Acme/);
  });

  it("retain filter keeps sidebar-eligible events but not timing noise", () => {
    const managed = new Set(["e1"]);
    assert.equal(
      matchesSidebarRetainFilter({ type: "FcyDeploy", timestamp: 1, message: "" }, managed),
      true,
    );
    assert.equal(
      matchesSidebarRetainFilter({ type: "PitEnter", timestamp: 2, message: "", entryId: "e1" }, managed),
      true,
    );
    assert.equal(
      matchesSidebarRetainFilter({ type: "PitEnter", timestamp: 2, message: "", entryId: "e9" }, managed),
      false,
    );
    assert.equal(
      matchesSidebarRetainFilter({ type: "LapComplete", timestamp: 3, message: "" }, managed),
      false,
    );
  });

  it("sidebar filter shows track events and managed car incidents by default", () => {
    const managed = new Set(["e1"]);
    const filters = { track: true, myTeam: true, allIncidents: false, traffic: false };
    assert.equal(
      matchesSidebarLogFilter({ type: "FcyDeploy", timestamp: 1, message: "" }, filters, managed),
      true,
    );
    assert.equal(
      matchesSidebarLogFilter(
        { type: "Collision", timestamp: 2, message: "", entryId: "e1", otherEntryId: "e2" },
        filters,
        managed,
      ),
      true,
    );
    assert.equal(
      matchesSidebarLogFilter(
        { type: "Collision", timestamp: 2, message: "", entryId: "e9", otherEntryId: "e2" },
        filters,
        managed,
      ),
      false,
    );
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
