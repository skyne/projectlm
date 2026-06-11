import { AUDIO_ASSETS, MUSIC_PLAYLISTS, type MusicTrackId, type SfxId } from "./assets";
import {
  cloneAudioSettings,
  loadAudioSettings,
  saveAudioSettings,
  SFX_CATEGORY,
  type AudioSettings,
  type MusicVolumeId,
  type SfxCategoryId,
} from "./audioSettings";
import { RacePassByAudio, type PassByTickInput } from "./RacePassByAudio";

export type { AudioSettings, MusicVolumeId, PassByTickInput, SfxCategoryId };

const MUSIC_GAIN: Record<MusicTrackId, number> = {
  menu: 0.55,
  race: 0.7,
  briefing: 0.5,
};

const SFX_GAIN: Partial<Record<SfxId, number>> = {
  uiClick: 0.35,
  uiConfirm: 0.5,
  uiError: 0.55,
  uiToggle: 0.45,
  greenFlag: 0.75,
  crowdCheer: 0.8,
  stadiumCrowd: 0.5,
};

export class GameAudio {
  private settings: AudioSettings;
  private unlocked = false;
  private currentMusic: MusicTrackId | null = null;
  private musicPlaylistOrder: number[] = [];
  private musicPlaylistIndex = 0;
  private currentMusicSrc: string | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private greenFlagPlayed = false;
  private raceTime = 0;
  private racePaused = true;
  private raceLive = false;
  private onSettingsChange?: (settings: AudioSettings) => void;
  private readonly passBy = new RacePassByAudio();

  constructor() {
    this.settings = loadAudioSettings();
    this.syncPassBySettings();
    this.bindUnlock();
    this.bindUiClicks();
    this.bindPersistOnExit();
  }

  setSettingsListener(listener: (settings: AudioSettings) => void): void {
    this.onSettingsChange = listener;
  }

  getSettings(): AudioSettings {
    return cloneAudioSettings(this.settings);
  }

  applySettings(next: AudioSettings): void {
    this.settings = cloneAudioSettings(next);
    this.persist();
    if (!this.settings.enabled) this.stopAll();
    else {
      this.refreshMusic();
      this.syncPassBySettings();
    }
  }

  setEnabled(enabled: boolean): void {
    this.applySettings({ ...this.getSettings(), enabled });
  }

  setMasterVolume(volume: number): void {
    this.applySettings({ ...this.getSettings(), masterVolume: clamp01(volume) });
  }

  setMusicVolume(track: MusicVolumeId, volume: number): void {
    const music = { ...this.settings.music, [track]: clamp01(volume) };
    this.applySettings({ ...this.getSettings(), music });
  }

  setSfxCategoryVolume(category: SfxCategoryId, volume: number): void {
    const sfx = { ...this.settings.sfx, [category]: clamp01(volume) };
    this.applySettings({ ...this.getSettings(), sfx });
  }

  setMusicTrack(track: MusicTrackId | null): void {
    if (track === this.currentMusic) return;
    this.currentMusic = track;
    this.currentMusicSrc = null;
    this.musicPlaylistOrder = [];
    this.musicPlaylistIndex = 0;
    this.refreshMusic();
  }

  setRaceAmbience(active: boolean): void {
    this.raceLive = active;
    this.passBy.setSessionActive(active);
  }

  updateRacePassBy(input: PassByTickInput): void {
    this.raceTime = input.raceTime;
    this.racePaused = input.paused;
    this.syncPassBySettings();
    this.passBy.onTick(input);
  }

  isRaceAmbienceActive(): boolean {
    return this.raceLive && !this.racePaused;
  }

  setRacePaused(paused: boolean): void {
    this.racePaused = paused;
    this.passBy.setPaused(paused);
    if (!this.musicEl || !this.currentMusic) return;
    if (paused) {
      void this.musicEl.pause();
    } else if (this.settings.enabled && this.unlocked) {
      void this.musicEl.play().catch(() => undefined);
    }
  }

  resetRaceSession(): void {
    this.greenFlagPlayed = false;
    this.raceTime = 0;
    this.passBy.setSessionActive(false);
    this.passBy.setSessionActive(this.raceLive);
  }

  maybePlayGreenFlag(raceTime: number, paused: boolean): void {
    if (this.greenFlagPlayed || paused || raceTime < 0.5) return;
    this.greenFlagPlayed = true;
    this.playSfx("greenFlag");
    this.playSfx("stadiumCrowd", 0.35);
  }

  onOvertake(raceTime?: number): void {
    this.passBy.onOvertake(raceTime ?? this.raceTime, this.racePaused);
  }

  playSfx(id: SfxId, gainScale = 1): void {
    if (!this.settings.enabled || !this.unlocked) return;

    const src = AUDIO_ASSETS.sfx[id];
    const audio = new Audio(src);
    const base = SFX_GAIN[id] ?? 0.6;
    const category = SFX_CATEGORY[id];
    audio.volume = clamp01(
      this.settings.masterVolume *
        this.settings.sfx[category] *
        base *
        gainScale,
    );
    void audio.play().catch(() => undefined);
  }

  handleSimEvent(
    type: string,
    entryId: string | undefined,
    playerEntryIds: readonly string[],
  ): void {
    if (!playerEntryIds.length || !entryId || !playerEntryIds.includes(entryId)) return;

    switch (type) {
      case "PitEnter":
        this.playSfx("uiConfirm", 0.7);
        break;
      case "PitExit":
        this.playSfx("uiToggle", 0.8);
        break;
      case "Retirement":
        this.playSfx("uiError");
        break;
      default:
        break;
    }
  }

  onRaceComplete(): void {
    this.playSfx("crowdCheer");
    this.setMusicTrack(null);
    this.passBy.setSessionActive(false);
  }

  onSessionEnd(): void {
    this.resetRaceSession();
    this.setMusicTrack("menu");
  }

  private refreshMusic(): void {
    if (!this.settings.enabled || !this.unlocked || !this.currentMusic) {
      this.stopMusic();
      return;
    }

    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.loop = false;
      this.musicEl.addEventListener("ended", () => this.onMusicEnded());
    }

    if (!this.currentMusicSrc) {
      this.startMusicPlaylist(this.currentMusic);
      return;
    }

    void this.musicEl.play().catch(() => undefined);
    this.applyMusicVolume();
  }

  private startMusicPlaylist(track: MusicTrackId): void {
    const playlist = MUSIC_PLAYLISTS[track];
    this.musicPlaylistOrder = shufflePlaylist(playlist.length);
    this.musicPlaylistIndex = 0;
    this.playMusicFromPlaylist(track);
  }

  private playMusicFromPlaylist(track: MusicTrackId): void {
    if (!this.musicEl) return;

    const playlist = MUSIC_PLAYLISTS[track];
    const orderIndex = this.musicPlaylistOrder[this.musicPlaylistIndex] ?? 0;
    const src = playlist[orderIndex]!;
    if (this.currentMusicSrc === src) {
      void this.musicEl.play().catch(() => undefined);
      this.applyMusicVolume();
      return;
    }

    this.currentMusicSrc = src;
    this.musicEl.src = src;
    this.applyMusicVolume();
    void this.musicEl.play().catch(() => undefined);
  }

  private onMusicEnded(): void {
    if (!this.currentMusic || !this.settings.enabled || !this.unlocked) return;

    const playlist = MUSIC_PLAYLISTS[this.currentMusic];
    const previousOrderIndex =
      this.musicPlaylistOrder[this.musicPlaylistIndex] ?? 0;
    this.musicPlaylistIndex = (this.musicPlaylistIndex + 1) % playlist.length;
    if (this.musicPlaylistIndex === 0) {
      this.musicPlaylistOrder = shufflePlaylist(
        playlist.length,
        previousOrderIndex,
      );
    }
    this.playMusicFromPlaylist(this.currentMusic);
  }

  private stopMusic(): void {
    this.currentMusicSrc = null;
    this.musicPlaylistOrder = [];
    this.musicPlaylistIndex = 0;
    if (!this.musicEl) return;
    this.musicEl.pause();
    this.musicEl.removeAttribute("src");
    this.musicEl.load();
    this.musicEl = null;
  }

  private stopAll(): void {
    this.stopMusic();
    this.passBy.setSessionActive(false);
  }

  private syncPassBySettings(): void {
    this.passBy.applySettings({
      enabled: this.settings.enabled,
      masterVolume: this.settings.masterVolume,
      trackVolume: this.settings.sfx.engine,
    });
    if (this.unlocked) this.passBy.setUnlocked(true);
  }

  private applyMusicVolume(): void {
    if (!this.musicEl || !this.currentMusic) return;
    const trackGain = MUSIC_GAIN[this.currentMusic];
    this.musicEl.volume = clamp01(
      this.settings.masterVolume *
        this.settings.music[this.currentMusic] *
        trackGain,
    );
  }

  private persist(): void {
    saveAudioSettings(this.settings);
    this.onSettingsChange?.(this.getSettings());
  }

  private bindUnlock(): void {
    const unlock = (): void => {
      if (!this.unlocked) {
        this.unlocked = true;
        if (this.settings.enabled) this.refreshMusic();
      }
      this.passBy.setUnlocked(true);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
  }

  private bindPersistOnExit(): void {
    const flush = (): void => saveAudioSettings(this.settings);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  private bindUiClicks(): void {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button, .primary-btn, .secondary-btn, .view-tab");
        if (!button || button.classList.contains("audio-mute-btn")) return;
        if (button.hasAttribute("disabled")) return;
        this.playSfx("uiClick", 0.6);
      },
      true,
    );
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function shufflePlaylist(length: number, avoidFirst?: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (
    avoidFirst !== undefined &&
    length > 1 &&
    order[0] === avoidFirst
  ) {
    [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}
