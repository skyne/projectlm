const TIME_SCALE_PRESETS = [1, 2, 5, 10, 40] as const;

export interface HeaderTimeHandlers {
  onTimeScale: (scale: number) => void;
  onTogglePause: (paused: boolean) => void;
}

export class HeaderTimeControls {
  readonly root: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private presetButtons: HTMLButtonElement[] = [];
  private paused = true;
  private controlsEnabled = false;
  private currentScale = 1;

  constructor(container: HTMLElement, handlers: HeaderTimeHandlers) {
    this.root = document.createElement("div");
    this.root.className = "header-time-controls hidden";
    this.root.setAttribute("aria-label", "Time compression");
    this.root.innerHTML = `
      <button
        type="button"
        class="header-playback-toggle secondary-btn"
        aria-label="Resume session"
        title="Resume"
      >▶</button>
      <div class="header-scale-presets" role="group" aria-label="Time compression presets">
        ${TIME_SCALE_PRESETS.map(
          (p) =>
            `<button type="button" class="header-scale-preset secondary-btn${p === 1 ? " active" : ""}" data-scale="${p}">×${p}</button>`,
        ).join("")}
      </div>
    `;

    container.appendChild(this.root);
    this.toggleBtn = this.root.querySelector(".header-playback-toggle")!;
    this.presetButtons = [...this.root.querySelectorAll<HTMLButtonElement>(".header-scale-preset")];

    const applyScale = (scale: number): void => {
      this.currentScale = scale;
      this.syncPresetHighlight(scale);
      handlers.onTimeScale(scale);
      if (scale === 0) {
        this.setPaused(true);
        handlers.onTogglePause(true);
      }
    };

    for (const btn of this.presetButtons) {
      btn.addEventListener("click", () => {
        applyScale(Number(btn.dataset.scale));
      });
    }

    this.toggleBtn.addEventListener("click", () => {
      const nextPaused = !this.paused;
      if (!nextPaused && this.currentScale === 0) {
        applyScale(1);
      }
      this.setPaused(nextPaused);
      handlers.onTogglePause(nextPaused);
    });
  }

  setSessionActive(active: boolean): void {
    this.root.classList.toggle("hidden", !active);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.root.classList.toggle("is-paused", paused);
    this.toggleBtn.textContent = paused ? "▶" : "⏸";
    this.toggleBtn.setAttribute("aria-label", paused ? "Resume session" : "Pause session");
    this.toggleBtn.title = paused ? "Resume" : "Pause";
    this.syncToggleEnabled();
  }

  getTimeScale(): number {
    return this.currentScale;
  }

  setTimeScale(scale: number): void {
    this.currentScale = Math.min(Math.max(0, scale), 100);
    this.syncPresetHighlight(this.currentScale);
    if (scale === 0) this.setPaused(true);
  }

  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    this.setPresetsEnabled(enabled);
    this.syncToggleEnabled();
    this.root.classList.toggle("spectator-readonly", !enabled);
  }

  markRaceComplete(): void {
    this.setPaused(true);
    this.toggleBtn.disabled = true;
    this.setPresetsEnabled(false);
  }

  resetSession(): void {
    this.setPresetsEnabled(true);
    this.setTimeScale(1);
    this.syncToggleEnabled();
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

  private syncToggleEnabled(): void {
    this.toggleBtn.disabled = !this.controlsEnabled;
  }
}
