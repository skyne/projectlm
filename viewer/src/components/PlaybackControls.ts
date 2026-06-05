export interface PlaybackHandlers {
  onTimeScale: (scale: number) => void;
  onPause: () => void;
  onResume: () => void;
  onRestartRace: () => void;
  onReloadDefinitions: () => void;
}

export class PlaybackControls {
  readonly root: HTMLElement;
  private slider: HTMLInputElement;
  private scaleLabel: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private resumeBtn: HTMLButtonElement;
  private raceTimeLabel: HTMLElement;
  private paused = false;

  constructor(container: HTMLElement, handlers: PlaybackHandlers) {
    this.root = document.createElement("section");
    this.root.className = "panel playback";
    this.root.innerHTML = `
      <h2>Playback</h2>
      <div class="race-time">Race time: <span id="race-time">0:00</span></div>
      <label class="scale-control">
        Time scale
        <input type="range" min="0" max="20" step="0.5" value="1" />
        <span class="scale-value">1.0×</span>
      </label>
      <div class="buttons">
        <button type="button" class="btn-pause">Pause</button>
        <button type="button" class="btn-resume">Resume</button>
      </div>
      <div class="buttons session-actions">
        <button type="button" class="btn-restart">Restart race</button>
        <button type="button" class="btn-reload">Reload config</button>
      </div>
    `;

    container.appendChild(this.root);
    this.slider = this.root.querySelector("input")!;
    this.scaleLabel = this.root.querySelector(".scale-value")!;
    this.pauseBtn = this.root.querySelector(".btn-pause")!;
    this.resumeBtn = this.root.querySelector(".btn-resume")!;
    this.raceTimeLabel = this.root.querySelector("#race-time")!;

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

  setRaceTime(seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.raceTimeLabel.textContent = `${m}:${s.toString().padStart(2, "0")}`;
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

  resetRaceActive(): void {
    this.slider.disabled = false;
    this.setPaused(false);
    this.slider.value = "1";
    this.scaleLabel.textContent = "1.0×";
    this.setRaceTime(0);
  }
}
