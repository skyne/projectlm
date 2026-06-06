import type { CarSnapshot } from "../ws/protocol";
import { mmPanelHeader } from "../utils/mmUi";
import { buildRaceControlsSummaryHtml } from "../utils/telemetryCard";

export type DriverMode = "conserve" | "normal" | "push";

export interface RaceControlsHandlers {
  onDriverMode: (entryId: string, mode: DriverMode) => void;
  onPitNow: () => void;
  onCancelPit: (entryId: string) => void;
}

export class RaceControls {
  readonly root: HTMLElement;
  private summaryEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private pitBtn!: HTMLButtonElement;
  private cancelPitBtn!: HTMLButtonElement;
  private modeButtons!: NodeListOf<HTMLButtonElement>;
  private handlers: RaceControlsHandlers;
  private playerEntryId = "entry-1";
  private activeMode: DriverMode = "normal";
  private latestSnap: CarSnapshot | null = null;

  constructor(container: HTMLElement, handlers: RaceControlsHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel race-controls panel-wec hidden";
    this.root.innerHTML = `
      ${mmPanelHeader("Your Car", { subtitle: "Pit commands", badge: "LIVE" })}
      <div class="race-controls-summary-card race-telemetry-card"></div>
      <div class="driver-mode-group">
        <span class="control-label">Driver mode</span>
        <div class="driver-mode-buttons">
          <button type="button" class="driver-mode-btn" data-mode="conserve">Eco</button>
          <button type="button" class="driver-mode-btn active" data-mode="normal">Normal</button>
          <button type="button" class="driver-mode-btn" data-mode="push">Push</button>
        </div>
      </div>
      <div class="race-control-actions">
        <button type="button" class="primary-btn pit-now-btn">⛽ Pit Now</button>
        <button type="button" class="secondary-btn cancel-pit-btn hidden">Cancel pit</button>
      </div>
      <p class="race-control-status"></p>
    `;
    container.appendChild(this.root);

    this.summaryEl = this.root.querySelector(".race-controls-summary-card")!;
    this.statusEl = this.root.querySelector(".race-control-status")!;
    this.pitBtn = this.root.querySelector(".pit-now-btn")!;
    this.cancelPitBtn = this.root.querySelector(".cancel-pit-btn")!;
    this.modeButtons = this.root.querySelectorAll(".driver-mode-btn");

    for (const btn of this.modeButtons) {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode as DriverMode;
        this.setDriverMode(mode, true);
      });
    }

    this.pitBtn.addEventListener("click", () => this.handlers.onPitNow());
    this.cancelPitBtn.addEventListener("click", () => {
      this.handlers.onCancelPit(this.playerEntryId);
      this.setStatus("Pit request cancelled");
    });
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setRaceActive(active: boolean): void {
    this.root.classList.toggle("hidden", !active);
  }

  setInteractionEnabled(enabled: boolean): void {
    this.pitBtn.disabled = !enabled;
    this.cancelPitBtn.disabled = !enabled;
    for (const btn of this.modeButtons) {
      btn.disabled = !enabled;
    }
    this.root.classList.toggle("spectator-readonly", !enabled);
  }

  updateSnapshot(snap: CarSnapshot | null): void {
    this.latestSnap = snap;
    if (!snap) {
      this.summaryEl.textContent = "Waiting for telemetry…";
      return;
    }

    const mode = (snap.driverMode as DriverMode) ?? "normal";
    if (["conserve", "normal", "push"].includes(mode)) {
      this.setDriverMode(mode, false);
    }

    this.summaryEl.innerHTML = buildRaceControlsSummaryHtml(snap);

    this.pitBtn.disabled = snap.inPit;
    this.cancelPitBtn.classList.toggle("hidden", !snap.pitQueued);
  }

  setDriverMode(mode: DriverMode, notify: boolean): void {
    this.activeMode = mode;
    for (const btn of this.modeButtons) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    }
    if (notify) {
      this.handlers.onDriverMode(this.playerEntryId, mode);
      this.setStatus(`Driver mode → ${mode}`);
    }
  }

  setStatus(message: string): void {
    this.statusEl.textContent = message;
  }

  getPlayerSnapshot(): CarSnapshot | null {
    return this.latestSnap;
  }
}
