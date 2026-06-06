import type { CarSnapshot } from "../ws/protocol";
import { mmPanelHeader } from "../utils/mmUi";
import { buildTelemetryCardHtml } from "../utils/telemetryCard";
import { FuelTracker } from "../utils/fuelTracker";
import type { DriverMode } from "./RaceControls";

const COLUMN_COUNT = 3;

export interface TelemetryPanelHandlers {
  onDriverMode: (entryId: string, mode: DriverMode) => void;
}

interface ColumnSlot {
  root: HTMLElement;
  select: HTMLSelectElement;
  card: HTMLElement;
  modeButtons: NodeListOf<HTMLButtonElement>;
  entryId: string;
}

export class TelemetryPanel {
  readonly root: HTMLElement;
  readonly mapContainer: HTMLElement;
  private columnsWrap!: HTMLElement;
  private slots: ColumnSlot[] = [];
  private handlers: TelemetryPanelHandlers;
  private snapshots: CarSnapshot[] = [];
  private entries: Array<{ entryId: string; teamName: string; carNumber: string }> = [];
  private playerEntryId = "entry-1";
  private fuelTracker = new FuelTracker();
  private hybridBudgetByEntry = new Map<string, number>();
  private visible = false;

  constructor(container: HTMLElement, handlers: TelemetryPanelHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel telemetry-panel panel-wec hidden";
    this.root.innerHTML = `
      ${mmPanelHeader("Telemetry", { subtitle: "Multi-car live data · strategy", badge: "LIVE" })}
      <div class="telemetry-layout">
        <div class="telemetry-map-row">
          <div class="telemetry-map-inner" id="telemetry-map-host">
            <span class="telemetry-map-hint">Scroll to zoom · drag to pan (when zoomed) · double-click reset</span>
          </div>
        </div>
        <div class="telemetry-columns"></div>
      </div>
    `;
    container.appendChild(this.root);

    this.mapContainer = this.root.querySelector("#telemetry-map-host")!;
    this.columnsWrap = this.root.querySelector(".telemetry-columns")!;

    for (let i = 0; i < COLUMN_COUNT; i++) {
      const col = document.createElement("div");
      col.className = "telemetry-column";
      col.innerHTML = `
        <div class="telemetry-column-head">
          <label class="mm-field telemetry-car-field">
            <span class="control-label">Car ${i + 1}</span>
            <select class="telemetry-car-select"></select>
          </label>
          <div class="driver-mode-group telemetry-mode-group">
            <span class="control-label">Driver mode</span>
            <div class="driver-mode-buttons">
              <button type="button" class="driver-mode-btn" data-mode="conserve">Eco</button>
              <button type="button" class="driver-mode-btn active" data-mode="normal">Normal</button>
              <button type="button" class="driver-mode-btn" data-mode="push">Push</button>
            </div>
          </div>
        </div>
        <div class="race-telemetry-card telemetry-slot-card">Select a car…</div>
      `;
      this.columnsWrap.appendChild(col);

      const select = col.querySelector(".telemetry-car-select") as HTMLSelectElement;
      const card = col.querySelector(".telemetry-slot-card") as HTMLElement;
      const modeButtons = col.querySelectorAll(".driver-mode-btn") as NodeListOf<HTMLButtonElement>;

      select.addEventListener("change", () => this.renderColumn(i));
      for (const btn of modeButtons) {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.mode as DriverMode;
          const entryId = select.value;
          if (!entryId) return;
          this.setColumnMode(i, mode, true);
        });
      }

      this.slots.push({ root: col, select, card, modeButtons, entryId: "" });
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle("hidden", !visible);
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setEntries(entries: Array<{ entryId: string; teamName: string; carNumber: string }>): void {
    this.entries = entries;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const prev = slot.select.value;
      slot.select.replaceChildren();

      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "— none —";
      slot.select.appendChild(empty);

      for (const entry of entries) {
        const opt = document.createElement("option");
        opt.value = entry.entryId;
        opt.textContent = `#${entry.carNumber} ${entry.teamName}`;
        slot.select.appendChild(opt);
      }

      const defaults = [
        this.playerEntryId,
        entries.find((e) => e.entryId !== this.playerEntryId)?.entryId ?? "",
        entries.find((e) => e.entryId !== this.playerEntryId && e.entryId !== entries[0]?.entryId)?.entryId ?? "",
      ];
      const pick = prev && entries.some((e) => e.entryId === prev) ? prev : defaults[i] ?? "";
      slot.select.value = pick;
      slot.entryId = pick;
    }
    this.renderAllColumns();
  }

  reset(): void {
    this.fuelTracker.reset();
    this.hybridBudgetByEntry.clear();
    for (const slot of this.slots) {
      slot.card.textContent = "Waiting for telemetry…";
    }
  }

  update(snapshots: CarSnapshot[]): void {
    this.snapshots = snapshots;

    for (const snap of snapshots) {
      if (snap.hybridDeployMJ != null && snap.hybridDeployMJ >= 0) {
        const prev = this.hybridBudgetByEntry.get(snap.entryId) ?? 0;
        this.hybridBudgetByEntry.set(snap.entryId, Math.max(prev, snap.hybridDeployMJ));
      }
      this.fuelTracker.update(snap.entryId, snap.lap, snap.fuel);
    }

    if (this.visible) this.renderAllColumns();
  }

  private renderAllColumns(): void {
    for (let i = 0; i < this.slots.length; i++) this.renderColumn(i);
  }

  private renderColumn(index: number): void {
    const slot = this.slots[index];
    const entryId = slot.select.value;
    slot.entryId = entryId;

    if (!entryId) {
      slot.card.textContent = "Select a car…";
      return;
    }

    const snap = this.snapshots.find((s) => s.entryId === entryId);
    if (!snap) {
      slot.card.textContent = "Waiting for telemetry…";
      return;
    }

    const mode = (snap.driverMode as DriverMode) ?? "normal";
    this.setColumnMode(index, mode, false);

    const fuelStats = this.fuelTracker.stats(snap.entryId, snap.fuel);
    const hybridBudget = this.hybridBudgetByEntry.get(entryId) ?? null;

    slot.card.innerHTML = buildTelemetryCardHtml(snap, {
      extended: true,
      fuelStats,
      hybridBudgetMJ: hybridBudget,
    });
  }

  private setColumnMode(index: number, mode: DriverMode, notify: boolean): void {
    const slot = this.slots[index];
    for (const btn of slot.modeButtons) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    }
    if (notify && slot.entryId) {
      this.handlers.onDriverMode(slot.entryId, mode);
    }
  }
}
