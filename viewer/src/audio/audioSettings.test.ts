import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
} from "./audioSettings.js";

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

describe("normalizeAudioSettings", () => {
  it("returns defaults for invalid input", () => {
    const settings = normalizeAudioSettings(null);
    assert.equal(settings.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume);
    assert.equal(settings.music.menu, DEFAULT_AUDIO_SETTINGS.music.menu);
    assert.equal(settings.sfx.engine, DEFAULT_AUDIO_SETTINGS.sfx.engine);
  });

  it("migrates legacy musicVolume and sfxVolume fields", () => {
    const settings = normalizeAudioSettings({
      enabled: true,
      masterVolume: 0.5,
      musicVolume: 0.3,
      sfxVolume: 0.8,
    });
    assert.equal(settings.music.menu, 0.3);
    assert.equal(settings.music.race, 0.3);
    assert.equal(settings.sfx.ui, 0.8);
    assert.equal(settings.sfx.engine, 0.8);
  });

  it("preserves per-category overrides", () => {
    const settings = normalizeAudioSettings({
      music: { menu: 0.2, race: 0.9, briefing: 0.1 },
      sfx: { ui: 0.4, engine: 0.15, session: 0.6, crowd: 1 },
    });
    assert.equal(settings.music.race, 0.9);
    assert.equal(settings.sfx.engine, 0.15);
    assert.equal(settings.sfx.crowd, 1);
  });
});

describe("audio settings persistence", () => {
  afterEach(() => {
    store.clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("round-trips through localStorage", () => {
    installMockStorage();
    const custom = normalizeAudioSettings({
      enabled: false,
      masterVolume: 0.2,
      music: { menu: 0, race: 0.8, briefing: 0.1 },
      sfx: { ui: 0, engine: 1, session: 0.3, crowd: 0.5 },
    });
    saveAudioSettings(custom);
    const loaded = loadAudioSettings();
    assert.equal(loaded.enabled, false);
    assert.equal(loaded.masterVolume, 0.2);
    assert.equal(loaded.music.race, 0.8);
    assert.equal(loaded.sfx.engine, 1);
    assert.equal(loaded.sfx.ui, 0);
  });

  it("scopes settings per player id", () => {
    installMockStorage();
    localStorage.setItem("projectlm-player-id", "player-a");
    saveAudioSettings(
      normalizeAudioSettings({
        sfx: { ui: 0, engine: 0.9, session: 0, crowd: 0 },
      }),
    );

    localStorage.setItem("projectlm-player-id", "player-b");
    const other = loadAudioSettings();
    assert.equal(other.sfx.engine, DEFAULT_AUDIO_SETTINGS.sfx.engine);

    localStorage.setItem("projectlm-player-id", "player-a");
    const restored = loadAudioSettings();
    assert.equal(restored.sfx.engine, 0.9);
  });

  it("migrates legacy global key to player-scoped key", () => {
    installMockStorage();
    localStorage.setItem("projectlm-player-id", "player-a");
    localStorage.setItem(
      "projectlm-audio-settings",
      JSON.stringify({ masterVolume: 0.33 }),
    );

    const loaded = loadAudioSettings();
    assert.equal(loaded.masterVolume, 0.33);
    assert.ok(localStorage.getItem("projectlm-audio-settings:player-a"));
    assert.equal(localStorage.getItem("projectlm-audio-settings"), null);
  });
});
