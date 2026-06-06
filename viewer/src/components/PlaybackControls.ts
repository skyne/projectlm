import { mmPanelHeader } from "../utils/mmUi";

export interface PlaybackHandlers {
  onTimeScale: (scale: number) => void;
  onPause: () => void;
  onResume: () => void;
  onRestartRace: () => void;
  onReloadDefinitions: () => void;
}

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
      <label class="scale-control">
        <span>Time compression</span>
        <input type="range" min="0" max="20" step="0.5" value="1" />
        <span class="scale-value">1.0×</span>
      </label>
      <div class="buttons playback-transport">
        <button type="button" class="btn-pause secondary-btn">⏸ Pause</button>
        <button type="button" class="btn-resume primary-btn">▶ Resume</button>
      </div>
      <div class="buttons session-actions">
        <button type="button" class="btn-restart secondary-btn">↺ Restart</button>
        <button type="button" class="btn-reload secondary-btn">Reload</button>
      </div>
    `;

    container.appendChild(this.root);
    this.slider = this.root.querySelector("input")!;
    this.scaleLabel = this.root.querySelector(".scale-value")!;
    this.pauseBtn = this.root.querySelector(".btn-pause")!;
    this.resumeBtn = this.root.querySelector(".btn-resume")!;
    this.raceTimeLabel = this.root.querySelector("#race-time")!;
    this.remainingRow = this.root.querySelector(".race-remaining")!;
    this.remainingLabel = this.root.querySelector("#race-remaining")!;

    this.slider.addEventListener("input", () => {
      const scale = parseFloat(this.slider.value);
      this.scaleLabel.textContent = `${scale.toFixed(1)}×`;
      handlers.onTimeScale(scale);
      if (scale === 0) this.setPaused(true);
    });

    this.pauseBtn.addEventListener("click", () => {
      this.setPaused(true);
      handlers.onPause();
    });

    this.resumeBtn.addEventListener("click", () => {
      this.setPaused(false);
      if (parseFloat(this.slider.value) === 0) {
        this.slider.value = "1";
        this.scaleLabel.textContent = "1.0×";
        handlers.onTimeScale(1);
      }
      handlers.onResume();
    });

    this.root.querySelector(".btn-restart")!.addEventListener("click", () => {
      handlers.onRestartRace();
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
  }

  setTimeScale(scale: number): void {
    this.slider.value = String(scale);
    this.scaleLabel.textContent = `${scale.toFixed(1)}×`;
    if (scale === 0) this.setPaused(true);
  }

  resetSession(): void {
    this.slider.disabled = false;
    this.setTimeScale(1);
    this.setRaceTime(0);
    this.remainingRow.classList.remove("time-low");
  }

  setControlsEnabled(enabled: boolean): void {
    this.slider.disabled = !enabled;
    this.pauseBtn.disabled = !enabled || this.paused;
    this.resumeBtn.disabled = !enabled || !this.paused;
    this.root.querySelector<HTMLButtonElement>(".btn-restart")!.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>(".btn-reload")!.disabled = !enabled;
    this.root.classList.toggle("spectator-readonly", !enabled);
  }
}
