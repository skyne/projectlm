const STORAGE_KEY = "projectlm-engineer-hints-enabled";
const PLAYER_ID_KEY = "projectlm-player-id";

function resolveStorageKey(): string {
  try {
    const playerId = localStorage.getItem(PLAYER_ID_KEY);
    return playerId ? `${STORAGE_KEY}:${playerId}` : STORAGE_KEY;
  } catch {
    return STORAGE_KEY;
  }
}

export const DEFAULT_ENGINEER_HINTS_ENABLED = true;

export function loadEngineerHintsEnabled(): boolean {
  try {
    const key = resolveStorageKey();
    let raw = localStorage.getItem(key);
    if (!raw && key !== STORAGE_KEY) {
      raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    if (raw === null) return DEFAULT_ENGINEER_HINTS_ENABLED;
    return raw !== "false";
  } catch {
    return DEFAULT_ENGINEER_HINTS_ENABLED;
  }
}

export function saveEngineerHintsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(resolveStorageKey(), enabled ? "true" : "false");
  } catch {
    // Private mode / storage full — ignore.
  }
}
