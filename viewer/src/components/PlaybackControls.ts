import { mmPanelHeader } from "../utils/mmUi";

export interface PlaybackHandlers {
  onRestartRace: () => void;
  onEndSession: () => void;
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
  private raceTimeLabel: HTMLElement;
  private remainingRow: HTMLElement;
  private remainingLabel: HTMLElement;
  private targetDurationSeconds: number | null = null;

  constructor(container: HTMLElement, handlers: PlaybackHandlers) {
    this.root = document.createElement("section");
    this.root.className = "panel playback panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Session Control", { subtitle: "Elapsed time and session actions", badge: "SIM" })}
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
      <div class="buttons session-actions">
        <button type="button" class="btn-restart secondary-btn">↺ Restart</button>
        <button type="button" class="btn-reload secondary-btn">Reload</button>
      </div>
      <button type="button" class="btn-end-session secondary-btn danger-btn">End Session</button>
    `;

    container.appendChild(this.root);
    this.raceTimeLabel = this.root.querySelector("#race-time")!;
    this.remainingRow = this.root.querySelector(".race-remaining")!;
    this.remainingLabel = this.root.querySelector("#race-remaining")!;

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

  markRaceComplete(): void {
    this.root.querySelector<HTMLButtonElement>(".btn-restart")!.disabled = true;
    this.root.querySelector<HTMLButtonElement>(".btn-end-session")!.disabled = true;
    this.root.querySelector<HTMLButtonElement>(".btn-reload")!.disabled = true;
  }

  resetSession(): void {
    this.root.querySelector<HTMLButtonElement>(".btn-restart")!.disabled = false;
    this.root.querySelector<HTMLButtonElement>(".btn-end-session")!.disabled = false;
    this.root.querySelector<HTMLButtonElement>(".btn-reload")!.disabled = false;
    this.setRaceTime(0);
    this.remainingRow.classList.remove("time-low");
  }

  setControlsEnabled(enabled: boolean): void {
    this.root.querySelector<HTMLButtonElement>(".btn-restart")!.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>(".btn-end-session")!.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>(".btn-reload")!.disabled = !enabled;
    this.root.classList.toggle("spectator-readonly", !enabled);
  }
}
