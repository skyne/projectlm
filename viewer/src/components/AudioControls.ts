import type { AudioSettings } from "../audio/GameAudio";
import { GameAudio } from "../audio/GameAudio";
import {
  cloneAudioSettings,
  MUSIC_VOLUME_IDS,
  MUSIC_VOLUME_LABELS,
  SFX_CATEGORY_IDS,
  SFX_CATEGORY_LABELS,
  type MusicVolumeId,
  type SfxCategoryId,
} from "../audio/audioSettings";

/** Embedded audio sliders for the global settings menu. */
export class AudioControls {
  readonly root: HTMLElement;
  private audio: GameAudio;
  private enabledToggle: HTMLInputElement;
  private ambienceNoteEl: HTMLElement;
  private masterSlider: HTMLInputElement;
  private musicSliders = new Map<MusicVolumeId, HTMLInputElement>();
  private sfxSliders = new Map<SfxCategoryId, HTMLInputElement>();

  constructor(container: HTMLElement, audio: GameAudio) {
    this.audio = audio;
    this.root = document.createElement("div");
    this.root.className = "audio-controls-embedded";
    this.root.innerHTML = `
      <label class="audio-toggle-row">
        <input type="checkbox" class="audio-enabled-toggle" checked />
        <span>Sound enabled</span>
      </label>
      <div class="audio-panel-section">
        <span class="audio-panel-section-title">Overall</span>
        <label class="audio-slider-row">
          <span>Master</span>
          <input type="range" min="0" max="100" step="1" data-kind="master" aria-label="Master volume" />
        </label>
      </div>
      <div class="audio-panel-section">
        <span class="audio-panel-section-title">Music</span>
        ${MUSIC_VOLUME_IDS.map(
          (id) => `
          <label class="audio-slider-row">
            <span>${MUSIC_VOLUME_LABELS[id]}</span>
            <input type="range" min="0" max="100" step="1" data-kind="music" data-id="${id}" aria-label="${MUSIC_VOLUME_LABELS[id]} volume" />
          </label>`,
        ).join("")}
      </div>
      <div class="audio-panel-section">
        <span class="audio-panel-section-title">Sound effects</span>
        ${SFX_CATEGORY_IDS.map(
          (id) => `
          <label class="audio-slider-row">
            <span>${SFX_CATEGORY_LABELS[id]}</span>
            <input type="range" min="0" max="100" step="1" data-kind="sfx" data-id="${id}" aria-label="${SFX_CATEGORY_LABELS[id]} volume" />
          </label>`,
        ).join("")}
      </div>
      <p class="audio-panel-note audio-ambience-note hidden">Track ambience active</p>
      <p class="audio-panel-note">CC0 / Mixkit assets · click anywhere to enable audio</p>
    `;
    container.appendChild(this.root);

    this.enabledToggle = this.root.querySelector(".audio-enabled-toggle")!;
    this.ambienceNoteEl = this.root.querySelector(".audio-ambience-note")!;
    this.masterSlider = this.root.querySelector('[data-kind="master"]')!;

    for (const id of MUSIC_VOLUME_IDS) {
      this.musicSliders.set(
        id,
        this.root.querySelector(`[data-kind="music"][data-id="${id}"]`)!,
      );
    }
    for (const id of SFX_CATEGORY_IDS) {
      this.sfxSliders.set(
        id,
        this.root.querySelector(`[data-kind="sfx"][data-id="${id}"]`)!,
      );
    }

    this.syncFromSettings(audio.getSettings());
    audio.setSettingsListener((settings) => this.syncFromSettings(settings));

    this.enabledToggle.addEventListener("change", () => {
      this.audio.setEnabled(this.enabledToggle.checked);
    });

    this.masterSlider.addEventListener("input", () => this.applySliders());
    this.masterSlider.addEventListener("change", () => this.applySliders());
    for (const slider of this.musicSliders.values()) {
      slider.addEventListener("input", () => this.applySliders());
      slider.addEventListener("change", () => this.applySliders());
    }
    for (const slider of this.sfxSliders.values()) {
      slider.addEventListener("input", () => this.applySliders());
      slider.addEventListener("change", () => this.applySliders());
    }
  }

  private syncFromSettings(settings: AudioSettings): void {
    this.enabledToggle.checked = settings.enabled;
    this.masterSlider.value = String(Math.round(settings.masterVolume * 100));
    for (const [id, slider] of this.musicSliders) {
      slider.value = String(Math.round(settings.music[id] * 100));
    }
    for (const [id, slider] of this.sfxSliders) {
      slider.value = String(Math.round(settings.sfx[id] * 100));
    }
  }

  private applySliders(): void {
    const next = cloneAudioSettings(this.audio.getSettings());
    next.masterVolume = Number(this.masterSlider.value) / 100;
    for (const [id, slider] of this.musicSliders) {
      next.music[id] = Number(slider.value) / 100;
    }
    for (const [id, slider] of this.sfxSliders) {
      next.sfx[id] = Number(slider.value) / 100;
    }
    if (!next.enabled && next.masterVolume > 0) {
      next.enabled = true;
      this.enabledToggle.checked = true;
    }
    this.audio.applySettings(next);
  }

  refreshAmbienceNote(): void {
    if (this.audio.isRaceAmbienceActive()) {
      this.ambienceNoteEl.textContent = "Track ambience: occasional cars passing by";
      this.ambienceNoteEl.classList.remove("hidden");
    } else {
      this.ambienceNoteEl.classList.add("hidden");
    }
  }
}
