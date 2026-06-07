import type { MusicTrackId, SfxId } from "./assets";

export type MusicVolumeId = MusicTrackId;
export type SfxCategoryId = "ui" | "engine" | "session" | "crowd";

export interface AudioSettings {
  enabled: boolean;
  masterVolume: number;
  music: Record<MusicVolumeId, number>;
  sfx: Record<SfxCategoryId, number>;
}

export const MUSIC_VOLUME_IDS: MusicVolumeId[] = ["menu", "race", "briefing"];
export const SFX_CATEGORY_IDS: SfxCategoryId[] = ["ui", "engine", "session", "crowd"];

export const MUSIC_VOLUME_LABELS: Record<MusicVolumeId, string> = {
  menu: "Championship & garage",
  race: "Live session",
  briefing: "Pre-session briefing",
};

export const SFX_CATEGORY_LABELS: Record<SfxCategoryId, string> = {
  ui: "UI clicks & alerts",
  engine: "Cars passing by",
  session: "Green flag & stadium",
  crowd: "Finish cheer",
};

export const SFX_CATEGORY: Record<SfxId, SfxCategoryId> = {
  uiClick: "ui",
  uiConfirm: "ui",
  uiError: "ui",
  uiToggle: "ui",
  greenFlag: "session",
  stadiumCrowd: "session",
  crowdCheer: "crowd",
};

const LEGACY_STORAGE_KEY = "projectlm-audio-settings";
const PLAYER_ID_KEY = "projectlm-player-id";

function resolveStorageKey(): string {
  try {
    const playerId = localStorage.getItem(PLAYER_ID_KEY);
    return playerId ? `${LEGACY_STORAGE_KEY}:${playerId}` : LEGACY_STORAGE_KEY;
  } catch {
    return LEGACY_STORAGE_KEY;
  }
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  masterVolume: 0.85,
  music: {
    menu: 0.45,
    race: 0.45,
    briefing: 0.4,
  },
  sfx: {
    ui: 0.65,
    engine: 0.75,
    session: 0.65,
    crowd: 0.7,
  },
};

function cloneDefaults(): AudioSettings {
  return {
    ...DEFAULT_AUDIO_SETTINGS,
    music: { ...DEFAULT_AUDIO_SETTINGS.music },
    sfx: { ...DEFAULT_AUDIO_SETTINGS.sfx },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function readVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : fallback;
}

/** Merge persisted JSON with defaults; migrates legacy master/music/sfx fields. */
export function loadAudioSettings(): AudioSettings {
  try {
    const key = resolveStorageKey();
    let raw = localStorage.getItem(key);
    if (!raw && key !== LEGACY_STORAGE_KEY) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) return cloneDefaults();
    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    const key = resolveStorageKey();
    localStorage.setItem(key, JSON.stringify(cloneAudioSettings(settings)));
  } catch {
    // Private mode / storage full — ignore.
  }
}

export function normalizeAudioSettings(raw: unknown): AudioSettings {
  const settings = cloneDefaults();
  if (!raw || typeof raw !== "object") return settings;

  const data = raw as Record<string, unknown>;
  if (typeof data.enabled === "boolean") settings.enabled = data.enabled;
  settings.masterVolume = readVolume(data.masterVolume, settings.masterVolume);

  const legacyMusic = readVolume(data.musicVolume, NaN);
  const legacySfx = readVolume(data.sfxVolume, NaN);

  if (data.music && typeof data.music === "object") {
    const music = data.music as Record<string, unknown>;
    for (const id of MUSIC_VOLUME_IDS) {
      settings.music[id] = readVolume(music[id], settings.music[id]);
    }
  } else if (!Number.isNaN(legacyMusic)) {
    for (const id of MUSIC_VOLUME_IDS) settings.music[id] = legacyMusic;
  }

  if (data.sfx && typeof data.sfx === "object") {
    const sfx = data.sfx as Record<string, unknown>;
    for (const id of SFX_CATEGORY_IDS) {
      settings.sfx[id] = readVolume(sfx[id], settings.sfx[id]);
    }
  } else if (!Number.isNaN(legacySfx)) {
    for (const id of SFX_CATEGORY_IDS) settings.sfx[id] = legacySfx;
  }

  return settings;
}

export function cloneAudioSettings(settings: AudioSettings): AudioSettings {
  return {
    ...settings,
    music: { ...settings.music },
    sfx: { ...settings.sfx },
  };
}
