import { mmPanelHeader } from "../utils/mmUi";

export interface PlaybackHandlers {
  onTimeScale: (scale: number) => void;
  onPause: () => void;
  onResume: () => void;
  onRestartRace: () => void;
  onEndSession: () => void;
  onReloadDefinitions: () => void;
}

const TIME_SCALE_PRESETS = [1, 2, 5, 10, 40] as const;

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export class PlaybackControls {
  readonly root: HTMLElement;
  private slider: HTMLInputElement;
  private scaleLabel: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private resumeBtn: HTMLButtonElement;
  private raceTimeLabel: HTMLElement;
  private remainingRow: HTMLElement;
  private remainingLabel: HTMLElement;
  private targetDurationSeconds: number | null = null;
  private paused = false;
  private presetButtons: HTMLButtonElement[] = [];

  constructor(container: HTMLElement, handlers: PlaybackHandlers) {
    this.root = document.createElement("section");
    this.root.className = "panel playback panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Session Control", { subtitle: "Endurance time compression", badge: "SIM" })}
      <div class="playback-clocks">
        <div class="endurance-clock-block">
          <span class="clock-block-label">Elapsed</span>
          <div class="race-time"><span id="race-time">0:00</span></div>
        </div>
        <div class="endurance-clock-block race-remaining hidden">
          <span class="clock-block-label">Remaining</span>
          <div class="race-remaining-value"><span id="race-remaining">—</span></div>
        </div>
      </div>
      <div class="scale-control">
        <div class="scale-control-header">
          <span>Time compression</span>
          <span class="scale-value">1.0×</span>
        </div>
        <div class="scale-presets" role="group" aria-label="Time compression presets">
          ${TIME_SCALE_PRESETS.map(
            (p) =>
              `<button type="button" class="scale-preset-btn secondary-btn${p === 1 ? " active" : ""}" data-scale="${p}">×${p}</button>`,
          ).join("")}
        </div>
        <input type="range" min="0" max="100" step="0.5" value="1" aria-label="Time compression slider" />
      </div>
      <div class="buttons playback-transport">
        <button type="button" class="btn-pause secondary-btn">⏸ Pause</button>
        <button type="button" class="btn-resume primary-btn">▶ Resume</button>
      </div>
      <div class="buttons session-actions">
        <button type="button" class="btn-restart secondary-btn">↺ Restart</button>
        <button type="button" class="btn-reload secondary-btn">Reload</button>
      </div>
      <button type="button" class="btn-end-session secondary-btn danger-btn">End Session</button>
    `;

    container.appendChild(this.root);
    this.slider = this.root.querySelector("input")!;
    this.scaleLabel = this.root.querySelector(".scale-value")!;
    this.pauseBtn = this.root.querySelector(".btn-pause")!;
    this.resumeBtn = this.root.querySelector(".btn-resume")!;
    this.raceTimeLabel = this.root.querySelector("#race-time")!;
    this.remainingRow = this.root.querySelector(".race-remaining")!;
    this.remainingLabel = this.root.querySelector("#race-remaining")!;
    this.presetButtons = [...this.root.querySelectorAll<HTMLButtonElement>(".scale-preset-btn")];

    const applyScale = (scale: number): void => {
      this.slider.value = String(scale);
      this.scaleLabel.textContent = `${scale.toFixed(1)}×`;
      this.syncPresetHighlight(scale);
      handlers.onTimeScale(scale);
      if (scale === 0) this.setPaused(true);
    };

    this.slider.addEventListener("input", () => {
      applyScale(parseFloat(this.slider.value));
    });

    for (const btn of this.presetButtons) {
      btn.addEventListener("click", () => {
        applyScale(Number(btn.dataset.scale));
      });
    }

    this.pauseBtn.addEventListener("click", () => {
      this.setPaused(true);
      handlers.onPause();
    });

    this.resumeBtn.addEventListener("click", () => {
      this.setPaused(false);
      if (parseFloat(this.slider.value) === 0) {
        applyScale(1);
      }
      handlers.onResume();
    });

    this.root.querySelector(".btn-restart")!.addEventListener("click", () => {
      handlers.onRestartRace();
    });

    this.root.querySelector(".btn-end-session")!.addEventListener("click", () => {
      handlers.onEndSession();
    });

    this.root.querySelector(".btn-reload")!.addEventListener("click", () => {
      handlers.onReloadDefinitions();
    });
  }

  setTargetDuration(seconds: number | null): void {
    this.targetDurationSeconds = seconds && seconds > 0 ? seconds : null;
    this.remainingRow.classList.toggle("hidden", !this.targetDurationSeconds);
  }

  setRaceTime(seconds: number): void {
    this.raceTimeLabel.textContent = formatClock(seconds);

    if (this.targetDurationSeconds) {
      const remaining = Math.max(0, this.targetDurationSeconds - seconds);
      this.remainingLabel.textContent = formatClock(remaining);
      this.remainingRow.classList.toggle("time-low", remaining <= 300 && remaining > 0);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseBtn.disabled = paused;
    this.resumeBtn.disabled = !paused;
    this.root.classList.toggle("is-paused", paused);
  }

  markRaceComplete(): void {
    this.setPaused(true);
    this.pauseBtn.disabled = true;
    this.resumeBtn.disabled = true;
    this.slider.disabled = true;
    this.setPresetsEnabled(false);
  }

  getTimeScale(): number {
    return parseFloat(this.slider.value);
  }

  setTimeScale(scale: number): void {
    const max = parseFloat(this.slider.max);
    const clamped = Math.min(Math.max(0, scale), max);
    this.slider.value = String(clamped);
    this.scaleLabel.textContent = `${scale.toFixed(1)}×`;
    this.syncPresetHighlight(clamped);
    if (scale === 0) this.setPaused(true);
  }

  private syncPresetHighlight(scale: number): void {
    for (const btn of this.presetButtons) {
      const preset = Number(btn.dataset.scale);
      btn.classList.toggle("active", Math.abs(scale - preset) < 0.25);
    }
  }

  private setPresetsEnabled(enabled: boolean): void {
    for (const btn of this.presetButtons) {
      btn.disabled = !enabled;
    }
  }

  resetSession(): void {
    this.slider.disabled = false;
    this.setPresetsEnabled(true);
    this.setTimeScale(1);
    this.setRaceTime(0);
    this.remainingRow.classList.remove("time-low");
  }

  setControlsEnabled(enabled: boolean): void {
    this.slider.disabled = !enabled;
    this.setPresetsEnabled(enabled);
    this.pauseBtn.disabled = !enabled || this.paused;
    this.resumeBtn.disabled = !enabled || !this.paused;
    this.root.querySelector<HTMLButtonElement>(".btn-restart")!.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>(".btn-end-session")!.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>(".btn-reload")!.disabled = !enabled;
    this.root.classList.toggle("spectator-readonly", !enabled);
  }
}
