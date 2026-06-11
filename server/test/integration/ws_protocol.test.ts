import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  serverMessage,
} from "../../src/ws_protocol";

describe("ws_protocol integration", () => {
  it("parseClientMessage accepts join_session", () => {
    const raw = JSON.stringify({
      protocol: PROTOCOL_VERSION,
      type: "join_session",
      payload: { displayName: "QA Bot", role: "player" },
    });
    const msg = parseClientMessage(raw);
    assert.ok(msg);
    assert.equal(msg!.type, "join_session");
    assert.equal(msg!.payload.displayName, "QA Bot");
  });

  it("parseClientMessage rejects wrong protocol version", () => {
    const raw = JSON.stringify({
      protocol: PROTOCOL_VERSION + 99,
      type: "join_session",
      payload: {},
    });
    assert.equal(parseClientMessage(raw), null);
  });

  it("parseClientMessage rejects unknown message types", () => {
    const raw = JSON.stringify({
      protocol: PROTOCOL_VERSION,
      type: "not_a_real_command",
      payload: {},
    });
    assert.equal(parseClientMessage(raw), null);
  });

  it("serverMessage wraps tick payloads", () => {
    const msg = serverMessage("tick", {
      raceTime: 12.5,
      snapshots: [],
      raceControl: { fcyActive: false },
    });
    assert.equal(msg.type, "tick");
    assert.equal(msg.protocol, PROTOCOL_VERSION);
    assert.equal((msg.payload as { raceTime: number }).raceTime, 12.5);
  });

  it("round-trips submit_command payload fields", () => {
    const raw = JSON.stringify({
      protocol: PROTOCOL_VERSION,
      type: "submit_command",
      payload: {
        entryId: "entry-1",
        command: "pit",
      },
    });
    const msg = parseClientMessage(raw);
    assert.ok(msg);
    assert.equal(msg!.type, "submit_command");
    assert.equal(msg!.payload.entryId, "entry-1");
    assert.equal(msg!.payload.command, "pit");
  });
});
