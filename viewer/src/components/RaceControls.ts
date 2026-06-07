import type { CarSnapshot } from "../ws/protocol";
import { mmPanelHeader } from "../utils/mmUi";
import { buildRaceControlsSummaryHtml } from "../utils/telemetryCard";
import { buildSetupCommand, type PitSetupDelta } from "../utils/setupCommands";
import {
  TeamCarPicker,
  type ManagedEntryOption,
} from "./TeamCarPicker";

export type DriverMode = "conserve" | "normal" | "push";

export type StartingCompound = "soft" | "medium" | "hard";

export interface RaceControlsHandlers {
  onDriverMode: (entryId: string, mode: DriverMode) => void;
  onPitNow: (entryId: string) => void;
  onCancelPit: (entryId: string) => void;
  onReleaseToTrack?: (entryId: string) => void;
  onPenaltyServe?: (entryId: string, command: string) => void;
  onSetupChange: (entryId: string, command: string) => void;
  onStartingCompound?: (entryId: string, compound: StartingCompound) => void;
  onEntryChange?: (entryId: string) => void;
}

export class RaceControls {
  readonly root: HTMLElement;
  private summaryEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private pitBtn!: HTMLButtonElement;
  private releaseBtn!: HTMLButtonElement;
  private cancelPitBtn!: HTMLButtonElement;
  private penaltyPanelEl!: HTMLElement;
  private penaltyLabelEl!: HTMLElement;
  private penaltyServeBtn!: HTMLButtonElement;
  private modeButtons!: NodeListOf<HTMLButtonElement>;
  private setupQuickEl!: HTMLElement;
  private setupReadoutEl!: HTMLElement;
  private setupMoreDfBtn!: HTMLButtonElement;
  private setupLessDragBtn!: HTMLButtonElement;
  private setupBrakeRearBtn!: HTMLButtonElement;
  private setupBrakeFrontBtn!: HTMLButtonElement;
  private sessionSetupEl!: HTMLElement;
  private startingCompoundSelect!: HTMLSelectElement;
  private teamCarPicker: TeamCarPicker;
  private handlers: RaceControlsHandlers;
  private playerEntryId = "entry-1";
  private selectedEntryId = "entry-1";
  private activeMode: DriverMode = "normal";
  private latestSnap: CarSnapshot | null = null;
  private preGreenFlag = false;
  private openSessionMode = false;
  private startingCompoundByEntry = new Map<string, StartingCompound>();

  constructor(container: HTMLElement, handlers: RaceControlsHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel race-controls panel-wec hidden";
    this.root.innerHTML = `
      ${mmPanelHeader("Your Car", { subtitle: "Pit commands", badge: "LIVE" })}
      <div class="team-car-picker-host"></div>
      <div class="race-controls-summary-card race-telemetry-card"></div>
      <div class="race-session-setup hidden">
        <span class="control-label">Session setup</span>
        <label class="race-session-compound-field">
          <span>Starting tyre compound</span>
          <select class="race-starting-compound-select">
            <option value="soft">Soft — peak grip, high wear</option>
            <option value="medium" selected>Medium — balanced</option>
            <option value="hard">Hard — durable, lower grip</option>
          </select>
        </label>
        <p class="race-session-setup-hint">Set per car on the grid before green flag. Change again at pit stops.</p>
      </div>
      <div class="driver-mode-group">
        <span class="control-label">Driver mode</span>
        <div class="driver-mode-buttons">
          <button type="button" class="driver-mode-btn" data-mode="conserve">Eco</button>
          <button type="button" class="driver-mode-btn active" data-mode="normal">Normal</button>
          <button type="button" class="driver-mode-btn" data-mode="push">Push</button>
        </div>
      </div>
      <div class="race-control-actions">
        <button type="button" class="primary-btn release-track-btn hidden">Release to track</button>
        <button type="button" class="primary-btn pit-now-btn">⛽ Pit Now</button>
        <button type="button" class="secondary-btn cancel-pit-btn hidden">Cancel pit</button>
      </div>
      <div class="race-penalty-panel hidden">
        <span class="control-label">Race control penalty</span>
        <p class="race-penalty-label"></p>
        <button type="button" class="primary-btn race-penalty-serve-btn">Serve penalty</button>
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
    this.releaseBtn = this.root.querySelector(".release-track-btn")!;
    this.cancelPitBtn = this.root.querySelector(".cancel-pit-btn")!;
    this.penaltyPanelEl = this.root.querySelector(".race-penalty-panel")!;
    this.penaltyLabelEl = this.root.querySelector(".race-penalty-label")!;
    this.penaltyServeBtn = this.root.querySelector(".race-penalty-serve-btn")!;
    this.modeButtons = this.root.querySelectorAll(".driver-mode-btn");
    this.setupQuickEl = this.root.querySelector(".race-setup-quick")!;
    this.setupReadoutEl = this.root.querySelector(".race-setup-readout")!;
    this.setupMoreDfBtn = this.root.querySelector(".setup-more-df-btn")!;
    this.setupLessDragBtn = this.root.querySelector(".setup-less-drag-btn")!;
    this.setupBrakeRearBtn = this.root.querySelector(".setup-brake-rear-btn")!;
    this.setupBrakeFrontBtn = this.root.querySelector(".setup-brake-front-btn")!;
    this.sessionSetupEl = this.root.querySelector(".race-session-setup")!;
    this.startingCompoundSelect = this.root.querySelector(
      ".race-starting-compound-select",
    )!;
    this.teamCarPicker = new TeamCarPicker(
      {
        onSelect: (entryId) => {
          this.selectedEntryId = entryId;
          this.syncStartingCompoundSelect();
          this.handlers.onEntryChange?.(entryId);
        },
      },
      { label: "Team car" },
    );
    this.teamCarPicker.mount(this.root.querySelector(".team-car-picker-host")!);

    for (const btn of this.modeButtons) {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode as DriverMode;
        this.setDriverMode(mode, true);
      });
    }

    this.releaseBtn.addEventListener("click", () => {
      this.handlers.onReleaseToTrack?.(this.selectedEntryId);
      this.setStatus("Released to track");
    });
    this.pitBtn.addEventListener("click", () =>
      this.handlers.onPitNow(this.selectedEntryId),
    );
    this.cancelPitBtn.addEventListener("click", () => {
      this.handlers.onCancelPit(this.selectedEntryId);
      this.setStatus("Pit request cancelled");
    });

    this.penaltyServeBtn.addEventListener("click", () => {
      const cmd = penaltyServeCommand(this.latestSnap);
      if (!cmd) return;
      this.handlers.onPenaltyServe?.(this.selectedEntryId, cmd);
      this.setStatus(`Penalty queued — ${cmd.replace("pit|", "")}`);
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

    this.startingCompoundSelect.addEventListener("change", () => {
      const compound = this.startingCompoundSelect.value as StartingCompound;
      this.startingCompoundByEntry.set(this.selectedEntryId, compound);
      this.handlers.onStartingCompound?.(this.selectedEntryId, compound);
      this.setStatus(`Starting compound → ${compound}`);
    });
  }

  private syncStartingCompoundSelect(): void {
    const compound =
      this.startingCompoundByEntry.get(this.selectedEntryId) ?? "medium";
    this.startingCompoundSelect.value = compound;
  }

  private sendSetup(delta: PitSetupDelta): void {
    if (this.setupMoreDfBtn.disabled) return;
    const cmd = buildSetupCommand(delta);
    if (!cmd) return;
    this.handlers.onSetupChange(this.selectedEntryId, cmd);
    this.setStatus(`Setup sent: ${cmd}`);
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
    this.selectedEntryId = entryId;
  }

  setManagedEntries(entries: ManagedEntryOption[], selectedId: string): void {
    this.teamCarPicker.setEntries(entries, selectedId);
    if (entries.some((e) => e.entryId === selectedId)) {
      this.selectedEntryId = selectedId;
    } else if (entries[0]) {
      this.selectedEntryId = entries[0].entryId;
    }
  }

  updateManagedSnapshots(snapshots: CarSnapshot[]): void {
    this.teamCarPicker.setSnapshots(snapshots);
  }

  setSelectedEntry(entryId: string): void {
    if (!entryId || entryId === this.selectedEntryId) return;
    this.selectedEntryId = entryId;
    this.teamCarPicker.setSelectedEntry(entryId);
  }

  getSelectedEntryId(): string {
    return this.selectedEntryId || this.playerEntryId;
  }

  setRaceActive(active: boolean): void {
    this.root.classList.toggle("hidden", !active);
    if (!active) {
      this.preGreenFlag = false;
      this.openSessionMode = false;
    }
  }

  setOpenSessionMode(enabled: boolean): void {
    this.openSessionMode = enabled;
    this.applySessionSetupVisibility();
    this.applyGarageControls();
  }

  /** True while session is loaded on the grid before meaningful race time elapses. */
  setPreGreenFlag(active: boolean): void {
    this.preGreenFlag = active;
    this.applySessionSetupVisibility();
  }

  setInteractionEnabled(enabled: boolean): void {
    this.teamCarPicker.setEnabled(enabled);
    this.pitBtn.disabled = !enabled;
    this.releaseBtn.disabled = !enabled;
    this.cancelPitBtn.disabled = !enabled;
    this.penaltyServeBtn.disabled = !enabled;
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

    this.summaryEl.innerHTML = buildRaceControlsSummaryHtml(snap, {
      hideIdentity: this.teamCarPicker.isMultiEntry(),
    });

    this.applyGarageControls();
    this.applyPenaltyControls();
    this.pitBtn.disabled = snap.inPit || snap.inGarage === true;
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

    this.applySessionSetupVisibility();
  }

  private applyPenaltyControls(): void {
    const snap = this.latestSnap;
    const penalty = snap?.pendingPenalty ?? "none";
    const mustServe =
      penalty !== "none" &&
      ((snap?.lapsToComply ?? 0) > 0 || penalty === "black" || snap?.blackFlag === true);
    this.penaltyPanelEl.classList.toggle("hidden", !mustServe);
    if (!mustServe) return;

    const label = formatPenaltyLabel(penalty, snap?.lapsToComply);
    this.penaltyLabelEl.textContent = label;
    const cmd = penaltyServeCommand(snap);
    this.penaltyServeBtn.textContent =
      cmd === "pit|drive_through"
        ? "Serve drive-through"
        : cmd === "pit|stop_go"
          ? "Serve stop-and-go"
          : "Serve penalty";
    const readonly = this.root.classList.contains("spectator-readonly");
    this.penaltyServeBtn.disabled = readonly || snap?.inPit === true || snap?.pitQueued === true;
  }

  private applyGarageControls(): void {
    const inGarage = this.openSessionMode && this.latestSnap?.inGarage === true;
    this.releaseBtn.classList.toggle("hidden", !inGarage);
    this.pitBtn.classList.toggle("hidden", inGarage);
  }

  private applySessionSetupVisibility(): void {
    const onGrid =
      !this.openSessionMode &&
      this.preGreenFlag &&
      this.latestSnap != null &&
      !this.latestSnap.retired;
    this.sessionSetupEl.classList.toggle("hidden", !onGrid);
    const canEdit = onGrid && !this.root.classList.contains("spectator-readonly");
    this.startingCompoundSelect.disabled = !canEdit;
    if (onGrid) {
      this.syncStartingCompoundSelect();
    }
  }

  setDriverMode(mode: DriverMode, notify: boolean): void {
    this.activeMode = mode;
    for (const btn of this.modeButtons) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    }
    if (notify) {
      this.handlers.onDriverMode(this.selectedEntryId, mode);
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

function formatPenaltyLabel(penalty: string, lapsToComply?: number): string {
  const laps =
    lapsToComply != null && lapsToComply > 0 ? ` — comply within ${lapsToComply} lap(s)` : "";
  switch (penalty) {
    case "drive_through":
      return `Drive-through pending${laps}`;
    case "stop_go":
      return `Stop-and-go pending${laps}`;
    case "black":
      return `Black flag — stop in pits${laps}`;
    default:
      return `Penalty pending${laps}`;
  }
}

function penaltyServeCommand(snap: CarSnapshot | null): string | null {
  if (!snap) return null;
  const penalty = snap.pendingPenalty ?? "none";
  if (penalty === "drive_through") return "pit|drive_through";
  if (penalty === "stop_go" || penalty === "black") return "pit|stop_go";
  if (penalty !== "none") return "pit|penalty";
  return null;
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
