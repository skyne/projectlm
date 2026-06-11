import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_ENGINEER_HINTS_ENABLED,
  loadEngineerHintsEnabled,
  saveEngineerHintsEnabled,
} from "./engineerHintSettings.js";

const store = new Map<string, string>();

function installMockStorage(): void {
  const ls = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  (globalThis as { localStorage?: typeof ls }).localStorage = ls;
}

describe("engineer hint settings persistence", () => {
  afterEach(() => {
    store.clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("defaults to enabled when unset", () => {
    installMockStorage();
    assert.equal(loadEngineerHintsEnabled(), DEFAULT_ENGINEER_HINTS_ENABLED);
  });

  it("round-trips through localStorage", () => {
    installMockStorage();
    saveEngineerHintsEnabled(false);
    assert.equal(loadEngineerHintsEnabled(), false);
    saveEngineerHintsEnabled(true);
    assert.equal(loadEngineerHintsEnabled(), true);
  });

  it("scopes settings per player id", () => {
    installMockStorage();
    localStorage.setItem("projectlm-player-id", "player-a");
    saveEngineerHintsEnabled(false);

    localStorage.setItem("projectlm-player-id", "player-b");
    assert.equal(loadEngineerHintsEnabled(), DEFAULT_ENGINEER_HINTS_ENABLED);

    localStorage.setItem("projectlm-player-id", "player-a");
    assert.equal(loadEngineerHintsEnabled(), false);
  });

  it("migrates legacy global key to player-scoped key", () => {
    installMockStorage();
    localStorage.setItem("projectlm-player-id", "player-a");
    localStorage.setItem("projectlm-engineer-hints-enabled", "false");

    assert.equal(loadEngineerHintsEnabled(), false);
    assert.ok(localStorage.getItem("projectlm-engineer-hints-enabled:player-a"));
    assert.equal(localStorage.getItem("projectlm-engineer-hints-enabled"), null);
  });
});
