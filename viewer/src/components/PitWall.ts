import type { CarSnapshot } from "../ws/protocol";
import { buildTyreTelemetryPanelHtml } from "../utils/formatTyre";
import {
  estimateDriverChangeSeconds,
  estimatePitSeconds,
  PIT_LANE_SPEED_KMH,
} from "../utils/pitCommands";
import { mmPanelHeader } from "../utils/mmUi";
import { buildHybridChargeBarHtml, hybridStrategyHint, hybridStrategyLabel, type HybridStrategy } from "../utils/hybridStrategy";
import { TeamCarPicker, type ManagedEntryOption } from "./TeamCarPicker";
import {
  buildSubsystemRepairHtml,
  collectSubsystemRepairs,
} from "../utils/pitRepairParts";

export interface PitWallHandlers {
  onSubmitPit: (entryId: string, command: string) => void;
  onDriverMode: (entryId: string, mode: string) => void;
  onHybridStrategy: (entryId: string, strategy: HybridStrategy) => void;
  onSetupChange: (entryId: string, wingDelta: number) => void;
  onEntryChange?: (entryId: string) => void;
}

export class PitWall {
  readonly root: HTMLElement;
  private teamCarPicker: TeamCarPicker;
  private fuelInput!: HTMLInputElement;
  private compoundSelect!: HTMLSelectElement;
  private tireChecks!: NodeListOf<HTMLInputElement>;
  private repairEngine!: HTMLInputElement;
  private repairBody!: HTMLInputElement;
  private driverChange!: HTMLInputElement;
  private modeSelect!: HTMLSelectElement;
  private hybridStrategySelect!: HTMLSelectElement;
  private hybridHintEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private estimateEl!: HTMLElement;
  private carInfoEl!: HTMLElement;
  private setupMoreDfBtn!: HTMLButtonElement;
  private setupLessDragBtn!: HTMLButtonElement;
  private handlers: PitWallHandlers;
  private playerEntryId = "entry-1";
  private latestSnapshots: CarSnapshot[] = [];
  private subsystemHost!: HTMLElement;

  constructor(container: HTMLElement, handlers: PitWallHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel pitwall panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Pit Wall", { subtitle: "Strategy · fuel · driver stints", badge: "WEC" })}
      <div class="pitwall-grid">
        <div class="pitwall-section">
          <div class="pit-entry-picker-host"></div>
          <div id="pit-car-info" class="pit-car-info pit-telemetry-card"></div>
        </div>

        <fieldset class="mm-fieldset">
          <legend>Pit stop order</legend>
          <label>Fuel (L) <input type="number" id="pit-fuel" min="0" max="140" step="5" value="40" /></label>
          <label>Compound
            <select id="pit-compound">
              <option value="soft">Soft</option>
              <option value="medium" selected>Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <div class="tire-grid">
            <label><input type="checkbox" data-tire="FL" checked /> FL</label>
            <label><input type="checkbox" data-tire="FR" checked /> FR</label>
            <label><input type="checkbox" data-tire="RL" checked /> RL</label>
            <label><input type="checkbox" data-tire="RR" checked /> RR</label>
          </div>
          <label><input type="checkbox" id="pit-repair-engine" /> Engine repair</label>
          <label><input type="checkbox" id="pit-repair-body" /> Bodywork repair</label>
          <div id="pit-subsystem-host"></div>
          <label><input type="checkbox" id="pit-driver-change" /> <span id="pit-driver-change-label">Driver change</span></label>
          <p id="pit-estimate" class="pit-estimate"></p>
          <button type="button" id="pit-request" class="primary-btn">⛽ Request pit stop</button>
          <button type="button" id="pit-cancel" class="secondary-btn">Cancel request</button>
        </fieldset>

        <fieldset class="mm-fieldset">
          <legend>Stint strategy</legend>
          <label class="mm-field">Driver mode
            <select id="pit-mode">
              <option value="push">Push</option>
              <option value="normal" selected>Normal</option>
              <option value="conserve">Conserve</option>
            </select>
          </label>
          <label class="mm-field pit-hybrid-field hidden">Hybrid strategy
            <select id="pit-hybrid-strategy">
              <option value="balanced" selected>Balanced</option>
              <option value="deploy">Deploy</option>
              <option value="harvest">Harvest</option>
              <option value="hold">Hold</option>
            </select>
          </label>
          <p id="pit-hybrid-hint" class="pit-hybrid-hint hidden"></p>
          <div class="setup-row">
            <button type="button" id="setup-more-df" class="secondary-btn" disabled>More DF (pit only)</button>
            <button type="button" id="setup-less-drag" class="secondary-btn" disabled>Less drag (pit only)</button>
          </div>
        </fieldset>

        <p id="pit-status" class="pit-status"></p>
      </div>
    `;
    container.appendChild(this.root);

    this.teamCarPicker = new TeamCarPicker(
      {
        onSelect: (entryId) => {
          this.playerEntryId = entryId;
          this.handlers.onEntryChange?.(entryId);
          this.syncFromSnapshot();
          this.updateEstimate();
        },
      },
      { label: "Entry" },
    );
    this.teamCarPicker.mount(this.root.querySelector(".pit-entry-picker-host")!);

    this.fuelInput = this.root.querySelector("#pit-fuel")!;
    this.compoundSelect = this.root.querySelector("#pit-compound")!;
    this.tireChecks = this.root.querySelectorAll("[data-tire]");
    this.repairEngine = this.root.querySelector("#pit-repair-engine")!;
    this.repairBody = this.root.querySelector("#pit-repair-body")!;
    this.driverChange = this.root.querySelector("#pit-driver-change")!;
    this.modeSelect = this.root.querySelector("#pit-mode")!;
    this.hybridStrategySelect = this.root.querySelector("#pit-hybrid-strategy")!;
    this.hybridHintEl = this.root.querySelector("#pit-hybrid-hint")!;
    this.statusEl = this.root.querySelector("#pit-status")!;
    this.estimateEl = this.root.querySelector("#pit-estimate")!;
    this.carInfoEl = this.root.querySelector("#pit-car-info")!;
    this.setupMoreDfBtn = this.root.querySelector("#setup-more-df") as HTMLButtonElement;
    this.setupLessDragBtn = this.root.querySelector("#setup-less-drag") as HTMLButtonElement;
    this.subsystemHost = this.root.querySelector("#pit-subsystem-host")!;
    this.subsystemHost.addEventListener("change", () => this.updateEstimate());

    const refreshEstimate = () => this.updateEstimate();
    this.fuelInput.addEventListener("input", refreshEstimate);
    this.repairEngine.addEventListener("change", refreshEstimate);
    this.repairBody.addEventListener("change", refreshEstimate);
    this.driverChange.addEventListener("change", refreshEstimate);
    for (const cb of this.tireChecks) {
      cb.addEventListener("change", refreshEstimate);
    }

    this.root.querySelector("#pit-request")!.addEventListener("click", () => {
      this.handlers.onSubmitPit(this.selectedEntryId(), this.buildPitCommand());
      this.statusEl.textContent =
        "Pit queued — car will enter at start/finish straight";
    });
    this.root.querySelector("#pit-cancel")!.addEventListener("click", () => {
      this.handlers.onSubmitPit(this.selectedEntryId(), "cancel_pit");
      this.statusEl.textContent = "Pit request cancelled";
    });
    this.modeSelect.addEventListener("change", () => {
      this.handlers.onDriverMode(this.selectedEntryId(), this.modeSelect.value);
    });
    this.hybridStrategySelect.addEventListener("change", () => {
      const strategy = this.hybridStrategySelect.value as HybridStrategy;
      this.hybridHintEl.textContent = hybridStrategyHint(strategy);
      this.handlers.onHybridStrategy(this.selectedEntryId(), strategy);
    });
    this.root.querySelector("#setup-more-df")!.addEventListener("click", () => {
      if (this.setupMoreDfBtn.disabled) return;
      this.handlers.onSetupChange(this.selectedEntryId(), 0.05);
    });
    this.root.querySelector("#setup-less-drag")!.addEventListener("click", () => {
      if (this.setupLessDragBtn.disabled) return;
      this.handlers.onSetupChange(this.selectedEntryId(), -0.05);
    });
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setEntries(entries: ManagedEntryOption[], selectedId?: string): void {
    this.teamCarPicker.setEntries(entries, selectedId ?? this.playerEntryId);
  }

  setSelectedEntry(entryId: string): void {
    if (!entryId) return;
    this.playerEntryId = entryId;
    this.teamCarPicker.setSelectedEntry(entryId);
    this.syncFromSnapshot();
    this.updateEstimate();
  }

  updateSnapshots(snapshots: CarSnapshot[]): void {
    this.latestSnapshots = snapshots;
    this.teamCarPicker.setSnapshots(snapshots);
    this.syncFromSnapshot();
    this.updateEstimate();
  }

  private syncFromSnapshot(): void {
    const snap = this.latestSnapshots.find((s) => s.entryId === this.selectedEntryId());
    if (!snap) {
      this.carInfoEl.textContent = "";
      return;
    }

    const tankGap = Math.max(0, 100 - snap.fuel);
    if (Number(this.fuelInput.value) === 40 && tankGap > 0 && tankGap !== 40) {
      this.fuelInput.value = String(Math.min(140, Math.ceil(tankGap / 5) * 5));
    }

    if (snap.driverMode) {
      this.modeSelect.value = snap.driverMode;
    }

    const deflated = Object.entries(snap.tyreDeflation ?? {}).filter(
      ([, v]) => v === "flat" || v === "soft",
    );
    for (const cb of this.tireChecks) {
      const wheel = cb.getAttribute("data-tire") ?? "";
      const hit = deflated.some(([w]) => w.toUpperCase() === wheel);
      (cb as HTMLInputElement).checked = hit || (cb as HTMLInputElement).checked;
    }
    if ((snap.engineHealth ?? 100) < 78) this.repairEngine.checked = true;
    if (snap.limpMode && snap.limpMode !== "none") {
      this.repairBody.checked = true;
    }
    this.subsystemHost.innerHTML = buildSubsystemRepairHtml(snap, "pit-subsystem-repairs");

    const hasHybrid =
      snap.hybridDeployMJ != null &&
      snap.hybridDeployMJ >= 0 &&
      (snap.hybridBudgetMJ ?? 0) > 0;
    const hybridField = this.root.querySelector(".pit-hybrid-field")!;
    hybridField.classList.toggle("hidden", !hasHybrid);
    this.hybridHintEl.classList.toggle("hidden", !hasHybrid);
    if (hasHybrid) {
      const strategy = (snap.hybridStrategy ?? "balanced") as HybridStrategy;
      this.hybridStrategySelect.value = strategy;
      this.hybridHintEl.textContent = hybridStrategyHint(strategy);
    }

    const pitLabel = snap.inPit
      ? `IN PIT · ${(snap.pitRemainingSec ?? 0).toFixed(0)}s remaining`
      : snap.pitQueued
        ? "PIT QUEUED — awaiting start/finish"
        : snap.overtaking
          ? "OVERTAKING"
          : snap.blocked
            ? "IN TRAFFIC"
            : snap.fuel <= 0
              ? "OUT OF FUEL"
              : "On track";

    const setupAllowed = snap.inPit || snap.pitQueued;
    this.setupMoreDfBtn.disabled = !setupAllowed;
    this.setupLessDragBtn.disabled = !setupAllowed;
    this.carInfoEl.innerHTML = `
      <strong>${snap.driverName ?? "Driver"}</strong>
      · Stamina ${(snap.driverStamina ?? 100).toFixed(0)}%
      · Fuel ${snap.fuel.toFixed(0)}L
      · Engine ${snap.engineHealth.toFixed(0)}%
      ${snap.limpMode && snap.limpMode !== "none" ? `<br/><span class="pit-state pit-limp">LIMP: ${escapeHtml(snap.limpMode)}</span>` : ""}
      ${Object.keys(snap.partHealth ?? {}).length ? `<br/><span class="pit-damage">${Object.entries(snap.partHealth ?? {}).slice(0, 4).map(([p, h]) => `${escapeHtml(p)} ${h.toFixed(0)}%`).join(" · ")}</span>` : ""}
      · Wing ${(snap.wingAngle ?? 0).toFixed(2)} · Bias ${(snap.brakeBias ?? 0.5).toFixed(2)}
      ${
        hasHybrid
          ? `<br/><span class="pit-hybrid-charge">Hybrid ${buildHybridChargeBarHtml(snap.hybridDeployMJ, snap.hybridBudgetMJ, true)} · ${hybridStrategyLabel((snap.hybridStrategy ?? "balanced") as HybridStrategy)}</span>`
          : ""
      }
      <br/><span class="pit-state">${pitLabel}</span>
      <div class="pit-telemetry-tyres">${buildTyreTelemetryPanelHtml(snap, { compact: true })}</div>
      ${snap.setupFeedback ? `<br/><em>${escapeHtml(snap.setupFeedback)}</em>` : ""}
    `;
  }

  private selectedSnapshot(): CarSnapshot | undefined {
    const id = this.selectedEntryId();
    return this.latestSnapshots.find((s) => s.entryId === id);
  }

  private updateEstimate(): void {
    const snap = this.selectedSnapshot();
    const tires = [...this.tireChecks].filter((cb) => (cb as HTMLInputElement).checked).length;
    const serviceability = snap?.serviceabilityFactor ?? 1;
    const driverChangeFactor = snap?.driverChangeFactor ?? 1;
    const driverSec = Math.round(estimateDriverChangeSeconds(driverChangeFactor));
    const driverLabel = this.root.querySelector("#pit-driver-change-label");
    if (driverLabel) {
      driverLabel.textContent = `Driver change (+${driverSec}s)`;
    }
    const repairParts = collectSubsystemRepairs(this.subsystemHost);
    const sec = estimatePitSeconds({
      fuel: Number(this.fuelInput.value) || 0,
      tireCount: tires,
      repairEngine: this.repairEngine.checked,
      repairBody: this.repairBody.checked,
      repairParts,
      driverChange: this.driverChange.checked,
      serviceabilityFactor: serviceability,
      driverChangeFactor,
    });
    this.estimateEl.textContent = `Est. stop ~${sec.toFixed(0)}s (incl. pit lane @ ${PIT_LANE_SPEED_KMH} km/h) · pit work ×${serviceability.toFixed(2)}`;
  }

  private selectedEntryId(): string {
    return this.teamCarPicker.getSelectedEntryId() || this.playerEntryId;
  }

  setInteractionEnabled(enabled: boolean): void {
    this.teamCarPicker.setEnabled(enabled);
    this.fuelInput.disabled = !enabled;
    this.compoundSelect.disabled = !enabled;
    this.modeSelect.disabled = !enabled;
    for (const cb of this.tireChecks) {
      (cb as HTMLInputElement).disabled = !enabled;
    }
    this.repairEngine.disabled = !enabled;
    this.repairBody.disabled = !enabled;
    this.driverChange.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>("#pit-request")!.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>("#pit-cancel")!.disabled = !enabled;
    this.setupMoreDfBtn.disabled = !enabled;
    this.setupLessDragBtn.disabled = !enabled;
    this.root.classList.toggle("spectator-readonly", !enabled);
  }

  private buildPitCommand(): string {
    const tires: string[] = [];
    for (const cb of this.tireChecks) {
      if ((cb as HTMLInputElement).checked) {
        tires.push(cb.getAttribute("data-tire") ?? "");
      }
    }
    const repairs: string[] = [];
    if (this.repairEngine.checked) repairs.push("engine");
    if (this.repairBody.checked) repairs.push("body");
    repairs.push(...collectSubsystemRepairs(this.subsystemHost));
    const parts = [
      "pit",
      `fuel=${this.fuelInput.value}`,
      `compound=${this.compoundSelect.value}`,
      `tires=${tires.join(",")}`,
    ];
    if (repairs.length) parts.push(`repairs=${repairs.join(",")}`);
    if (this.driverChange.checked) parts.push("driver_change=true");
    return parts.join("|");
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
