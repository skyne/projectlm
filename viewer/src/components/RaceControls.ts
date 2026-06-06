import type { CarSnapshot } from "../ws/protocol";
import { mmPanelHeader } from "../utils/mmUi";
import { buildRaceControlsSummaryHtml } from "../utils/telemetryCard";
import { buildSetupCommand, type PitSetupDelta } from "../utils/setupCommands";

export type DriverMode = "conserve" | "normal" | "push";

export interface RaceControlsHandlers {
  onDriverMode: (entryId: string, mode: DriverMode) => void;
  onPitNow: () => void;
  onCancelPit: (entryId: string) => void;
  onSetupChange: (entryId: string, command: string) => void;
}

export class RaceControls {
  readonly root: HTMLElement;
  private summaryEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private pitBtn!: HTMLButtonElement;
  private cancelPitBtn!: HTMLButtonElement;
  private modeButtons!: NodeListOf<HTMLButtonElement>;
  private setupQuickEl!: HTMLElement;
  private setupReadoutEl!: HTMLElement;
  private setupMoreDfBtn!: HTMLButtonElement;
  private setupLessDragBtn!: HTMLButtonElement;
  private setupBrakeRearBtn!: HTMLButtonElement;
  private setupBrakeFrontBtn!: HTMLButtonElement;
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
      <div class="race-setup-quick hidden">
        <span class="control-label">Quick setup (pit only)</span>
        <div class="setup-row">
          <button type="button" class="secondary-btn setup-more-df-btn" disabled>+ DF</button>
          <button type="button" class="secondary-btn setup-less-drag-btn" disabled>− Drag</button>
          <button type="button" class="secondary-btn setup-brake-rear-btn" disabled>Brake +rear</button>
          <button type="button" class="secondary-btn setup-brake-front-btn" disabled>Brake +front</button>
        </div>
        <p class="race-setup-readout"></p>
      </div>
      <p class="race-control-status"></p>
    `;
    container.appendChild(this.root);

    this.summaryEl = this.root.querySelector(".race-controls-summary-card")!;
    this.statusEl = this.root.querySelector(".race-control-status")!;
    this.pitBtn = this.root.querySelector(".pit-now-btn")!;
    this.cancelPitBtn = this.root.querySelector(".cancel-pit-btn")!;
    this.modeButtons = this.root.querySelectorAll(".driver-mode-btn");
    this.setupQuickEl = this.root.querySelector(".race-setup-quick")!;
    this.setupReadoutEl = this.root.querySelector(".race-setup-readout")!;
    this.setupMoreDfBtn = this.root.querySelector(".setup-more-df-btn")!;
    this.setupLessDragBtn = this.root.querySelector(".setup-less-drag-btn")!;
    this.setupBrakeRearBtn = this.root.querySelector(".setup-brake-rear-btn")!;
    this.setupBrakeFrontBtn = this.root.querySelector(".setup-brake-front-btn")!;

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

    this.setupMoreDfBtn.addEventListener("click", () =>
      this.sendSetup({ wing: 0.05 }),
    );
    this.setupLessDragBtn.addEventListener("click", () =>
      this.sendSetup({ wing: -0.05 }),
    );
    this.setupBrakeRearBtn.addEventListener("click", () =>
      this.sendSetup({ brakeBias: 0.02 }),
    );
    this.setupBrakeFrontBtn.addEventListener("click", () =>
      this.sendSetup({ brakeBias: -0.02 }),
    );
  }

  private sendSetup(delta: PitSetupDelta): void {
    if (this.setupMoreDfBtn.disabled) return;
    const cmd = buildSetupCommand(delta);
    if (!cmd) return;
    this.handlers.onSetupChange(this.playerEntryId, cmd);
    this.setStatus(`Setup sent: ${cmd}`);
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setRaceActive(active: boolean): void {
    this.root.classList.toggle("hidden", !active);
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

    const setupAllowed = snap.inPit || snap.pitQueued;
    this.setupQuickEl.classList.toggle("hidden", !setupAllowed);
    for (const btn of [
      this.setupMoreDfBtn,
      this.setupLessDragBtn,
      this.setupBrakeRearBtn,
      this.setupBrakeFrontBtn,
    ]) {
      btn.disabled = !setupAllowed;
    }
    this.setupReadoutEl.textContent = formatLiveSetupReadout(snap);
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

function formatLiveSetupReadout(snap: CarSnapshot): string {
  const parts = [
    `Wing ${(snap.wingAngle ?? 0).toFixed(2)}`,
    `Bias ${(snap.brakeBias ?? 0.5).toFixed(2)}`,
  ];
  if (snap.frontRideHeightMm != null && snap.rearRideHeightMm != null) {
    parts.push(`RH F${snap.frontRideHeightMm.toFixed(0)}/R${snap.rearRideHeightMm.toFixed(0)} mm`);
  }
  if (snap.frontSpringNm != null) {
    parts.push(`Spr F${(snap.frontSpringNm / 1000).toFixed(0)}k`);
  }
  if (snap.frontArbStiffness != null) {
    parts.push(`ARB ×${snap.frontArbStiffness.toFixed(2)}`);
  }
  if (snap.frontCamberDeg != null) {
    parts.push(`Camb ${snap.frontCamberDeg.toFixed(1)}°`);
  }
  if (snap.setupFeedback) {
    parts.push(snap.setupFeedback);
  }
  return parts.join(" · ");
}
