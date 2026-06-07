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

export class AudioControls {
  readonly root: HTMLElement;
  private audio: GameAudio;
  private muteBtn: HTMLButtonElement;
  private panel: HTMLDialogElement;
  private enabledToggle: HTMLInputElement;
  private ambienceNoteEl: HTMLElement;
  private masterSlider: HTMLInputElement;
  private musicSliders = new Map<MusicVolumeId, HTMLInputElement>();
  private sfxSliders = new Map<SfxCategoryId, HTMLInputElement>();

  constructor(container: HTMLElement, audio: GameAudio) {
    this.audio = audio;
    this.root = document.createElement("div");
    this.root.className = "audio-controls";
    this.root.innerHTML = `
      <button type="button" class="audio-mute-btn secondary-btn" title="Sound settings" aria-label="Sound settings" aria-expanded="false" aria-haspopup="dialog">
        <span class="audio-mute-icon" aria-hidden="true">🔊</span>
      </button>
    `;

    this.panel = document.createElement("dialog");
    this.panel.className = "audio-panel-dialog";
    this.panel.setAttribute("aria-label", "Volume settings");
    this.panel.innerHTML = `
      <div class="audio-panel-inner">
        <div class="audio-panel-header">
          <span>Pit Wall Audio</span>
          <button type="button" class="audio-panel-close secondary-btn" aria-label="Close">✕</button>
        </div>
        <div class="audio-panel-body">
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
        </div>
      </div>
    `;

    container.appendChild(this.root);
    document.body.appendChild(this.panel);

    this.muteBtn = this.root.querySelector(".audio-mute-btn")!;
    this.enabledToggle = this.panel.querySelector(".audio-enabled-toggle")!;
    this.ambienceNoteEl = this.panel.querySelector(".audio-ambience-note")!;
    this.masterSlider = this.panel.querySelector('[data-kind="master"]')!;

    for (const id of MUSIC_VOLUME_IDS) {
      this.musicSliders.set(
        id,
        this.panel.querySelector(`[data-kind="music"][data-id="${id}"]`)!,
      );
    }
    for (const id of SFX_CATEGORY_IDS) {
      this.sfxSliders.set(
        id,
        this.panel.querySelector(`[data-kind="sfx"][data-id="${id}"]`)!,
      );
    }

    this.syncFromSettings(audio.getSettings());
    audio.setSettingsListener((settings) => this.syncFromSettings(settings));

    this.muteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.togglePanel();
    });

    this.enabledToggle.addEventListener("change", () => {
      this.audio.setEnabled(this.enabledToggle.checked);
    });

    this.panel.querySelector(".audio-panel-close")!.addEventListener("click", () => {
      this.panel.close();
    });

    this.panel.addEventListener("close", () => {
      this.applySliders();
      this.muteBtn.setAttribute("aria-expanded", "false");
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

    window.addEventListener(
      "resize",
      () => {
        if (this.panel.open) this.positionPanel();
      },
      { passive: true },
    );
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
    const icon = this.root.querySelector(".audio-mute-icon")!;
    icon.textContent = settings.enabled ? "🔊" : "🔇";
    this.muteBtn.classList.toggle("audio-muted", !settings.enabled);
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

  private togglePanel(): void {
    if (this.panel.open) {
      this.panel.close();
      return;
    }
    this.positionPanel();
    this.panel.showModal();
    this.muteBtn.setAttribute("aria-expanded", "true");
    this.refreshAmbienceNote();
  }

  private positionPanel(): void {
    const rect = this.muteBtn.getBoundingClientRect();
    const gap = 8;
    const panelWidth = Math.min(300, window.innerWidth - 16);
    const top = Math.min(rect.bottom + gap, window.innerHeight - 80);
    const right = Math.max(8, window.innerWidth - rect.right);

    this.panel.style.top = `${top}px`;
    this.panel.style.right = `${right}px`;
    this.panel.style.left = "auto";
    this.panel.style.width = `${panelWidth}px`;
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
