import type { CarSnapshot, WeekendSessionType } from "../ws/protocol";
import { sessionLabel, sessionShortLabel, sessionTelemetrySubtitle } from "../utils/weekendSessions";
import { mmPanelHeader } from "../utils/mmUi";
import { FuelTracker } from "../utils/fuelTracker";
import type { DriverMode } from "./RaceControls";
import { hybridStrategyLabel, type HybridStrategy } from "../utils/hybridStrategy";
import {
  buildCarSummaryHtml,
  buildDamageWidgetHtml,
  buildFuelWidgetHtml,
  buildHybridWidgetHtml,
  buildTyreWidgetHtml,
} from "../utils/telemetryWidgets";

export interface TelemetryPanelHandlers {
  onDriverMode: (entryId: string, mode: DriverMode) => void;
  onHybridStrategy: (entryId: string, strategy: HybridStrategy) => void;
  onFitTeamMap?: () => void;
  onResetMap?: () => void;
}

export interface TelemetryEntryOption {
  entryId: string;
  teamName: string;
  carNumber: string;
  classId?: string;
}

interface ColumnSlot {
  root: HTMLElement;
  select: HTMLSelectElement;
  summary: HTMLElement;
  modeButtons: NodeListOf<HTMLButtonElement>;
  hybridButtons: NodeListOf<HTMLButtonElement>;
  hybridGroup: HTMLElement;
  entryId: string;
}

export class TelemetryPanel {
  readonly root: HTMLElement;
  readonly mapContainer: HTMLElement;
  private carsWrap!: HTMLElement;
  private fuelWidget!: HTMLElement;
  private tyreWidget!: HTMLElement;
  private hybridWidget!: HTMLElement;
  private damageWidget!: HTMLElement;
  private slots: ColumnSlot[] = [];
  private handlers: TelemetryPanelHandlers;
  private snapshots: CarSnapshot[] = [];
  private entries: TelemetryEntryOption[] = [];
  private fuelTracker = new FuelTracker();
  private visible = false;
  private titleEl!: HTMLElement;
  private subtitleEl!: HTMLElement;
  private badgeEl!: HTMLElement;

  constructor(container: HTMLElement, handlers: TelemetryPanelHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel telemetry-panel panel-wec panel-grid hidden";
    this.root.innerHTML = `
      ${mmPanelHeader("Telemetry", { subtitle: "Multi-car live data · strategy", badge: "LIVE", theme: "grid" })}
      <div class="telemetry-bento">
        <div class="telemetry-tile telemetry-tile-map">
          <div class="telemetry-map-toolbar">
            <span class="telemetry-map-toolbar-label">Team on track</span>
            <button type="button" class="secondary-btn telemetry-map-fit-btn">Fit team</button>
            <button type="button" class="secondary-btn telemetry-map-reset-btn">Reset</button>
          </div>
          <div class="telemetry-map-inner" id="telemetry-map-host">
            <span class="telemetry-map-hint">Scroll to zoom · drag to pan · double-click reset</span>
          </div>
          <div class="telemetry-map-legend" aria-label="Team cars on map"></div>
        </div>
        <div class="telemetry-tile telemetry-tile-cars">
          <div class="telemetry-widget-head">
            <span class="telemetry-widget-label">Fleet</span>
          </div>
          <div class="telemetry-cars-row"></div>
        </div>
        <div class="telemetry-tile telemetry-tile-fuel" id="telemetry-fuel-widget"></div>
        <div class="telemetry-tile telemetry-tile-tyres" id="telemetry-tyre-widget"></div>
        <div class="telemetry-tile telemetry-tile-hybrid" id="telemetry-hybrid-widget"></div>
        <div class="telemetry-tile telemetry-tile-damage" id="telemetry-damage-widget"></div>
      </div>
    `;
    container.appendChild(this.root);

    this.mapContainer = this.root.querySelector("#telemetry-map-host")!;
    this.carsWrap = this.root.querySelector(".telemetry-cars-row")!;
    this.fuelWidget = this.root.querySelector("#telemetry-fuel-widget")!;
    this.tyreWidget = this.root.querySelector("#telemetry-tyre-widget")!;
    this.hybridWidget = this.root.querySelector("#telemetry-hybrid-widget")!;
    this.damageWidget = this.root.querySelector("#telemetry-damage-widget")!;
    this.titleEl = this.root.querySelector(".mm-panel-title")!;
    this.subtitleEl = this.root.querySelector(".mm-panel-subtitle")!;
    this.badgeEl = this.root.querySelector(".mm-badge")!;

    this.root.querySelector(".telemetry-map-fit-btn")!.addEventListener("click", () => {
      this.handlers.onFitTeamMap?.();
    });
    this.root.querySelector(".telemetry-map-reset-btn")!.addEventListener("click", () => {
      this.handlers.onResetMap?.();
    });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle("hidden", !visible);
    if (visible) this.handlers.onFitTeamMap?.();
  }

  setSessionType(sessionType?: WeekendSessionType): void {
    this.titleEl.textContent = `${sessionLabel(sessionType)} Telemetry`;
    this.subtitleEl.textContent = sessionTelemetrySubtitle(sessionType);
    this.badgeEl.textContent = sessionShortLabel(sessionType);
  }

  setPlayerEntry(_entryId: string): void {
    // Widgets follow slot 0; player highlight is on the car slot if mapped there.
  }

  setEntries(entries: TelemetryEntryOption[]): void {
    const prevByIndex = this.slots.map((s) => s.select.value);
    this.entries = entries;

    if (this.slots.length !== entries.length) {
      this.carsWrap.replaceChildren();
      this.slots = [];
      for (let i = 0; i < entries.length; i++) {
        this.slots.push(this.createColumn(i));
      }
    }

    const legendEl = this.root.querySelector(".telemetry-map-legend")!;
    legendEl.replaceChildren();
    for (const entry of entries) {
      const chip = document.createElement("span");
      chip.className = `telemetry-map-legend-chip${entry.classId ? ` class-${entry.classId}` : ""}`;
      chip.title = entry.teamName;
      chip.textContent = `#${entry.carNumber}${entry.classId ? ` · ${entry.classId}` : ""}`;
      legendEl.appendChild(chip);
    }

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const prev = prevByIndex[i] ?? "";
      slot.select.replaceChildren();

      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "— none —";
      slot.select.appendChild(empty);

      for (const entry of entries) {
        const opt = document.createElement("option");
        opt.value = entry.entryId;
        const classSuffix = entry.classId ? ` · ${entry.classId}` : "";
        opt.textContent = `#${entry.carNumber} ${entry.teamName}${classSuffix}`;
        slot.select.appendChild(opt);
      }

      const defaultEntryId = entries[i]?.entryId ?? "";
      const pick =
        prev && entries.some((e) => e.entryId === prev) ? prev : defaultEntryId;
      slot.select.value = pick;
      slot.entryId = pick;
    }

    this.renderAllColumns();
  }

  reset(): void {
    this.fuelTracker.reset();
    for (const slot of this.slots) {
      slot.summary.textContent = "Waiting for telemetry…";
    }
    this.fuelWidget.textContent = "";
    this.tyreWidget.textContent = "";
    this.hybridWidget.textContent = "";
    this.damageWidget.textContent = "";
  }

  update(snapshots: CarSnapshot[]): void {
    this.snapshots = snapshots;

    for (const snap of snapshots) {
      this.fuelTracker.update(snap.entryId, snap.lap, snap.fuel);
    }

    if (this.visible) this.renderAllColumns();
  }

  private createColumn(index: number): ColumnSlot {
    const col = document.createElement("div");
    col.className = "telemetry-car-slot";
    col.innerHTML = `
      <div class="telemetry-column-head telemetry-column-head-compact">
        <label class="mm-field telemetry-car-field">
          <span class="control-label">Car ${index + 1}</span>
          <select class="telemetry-car-select"></select>
        </label>
        <div class="driver-mode-group telemetry-mode-group">
          <span class="control-label">Driver mode</span>
          <div class="driver-mode-buttons telemetry-mode-buttons-inline">
            <button type="button" class="driver-mode-btn" data-mode="conserve">Eco</button>
            <button type="button" class="driver-mode-btn active" data-mode="normal">Normal</button>
            <button type="button" class="driver-mode-btn" data-mode="push">Push</button>
          </div>
        </div>
        <div class="driver-mode-group telemetry-mode-group telemetry-hybrid-group hidden">
          <span class="control-label">Hybrid</span>
          <div class="driver-mode-buttons telemetry-mode-buttons-inline">
            <button type="button" class="driver-mode-btn hybrid-strategy-btn" data-hybrid="balanced">Bal</button>
            <button type="button" class="driver-mode-btn hybrid-strategy-btn" data-hybrid="deploy">Use</button>
            <button type="button" class="driver-mode-btn hybrid-strategy-btn" data-hybrid="harvest">Regen</button>
            <button type="button" class="driver-mode-btn hybrid-strategy-btn" data-hybrid="hold">Hold</button>
          </div>
        </div>
      </div>
      <div class="telemetry-car-summary">Select a car…</div>
    `;
    this.carsWrap.appendChild(col);

    const select = col.querySelector(".telemetry-car-select") as HTMLSelectElement;
    const summary = col.querySelector(".telemetry-car-summary") as HTMLElement;
    const modeButtons = col.querySelectorAll(".driver-mode-btn[data-mode]") as NodeListOf<HTMLButtonElement>;
    const hybridButtons = col.querySelectorAll(".hybrid-strategy-btn") as NodeListOf<HTMLButtonElement>;
    const hybridGroup = col.querySelector(".telemetry-hybrid-group") as HTMLElement;

    select.addEventListener("change", () => this.renderColumn(index));
    for (const btn of modeButtons) {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode as DriverMode;
        const entryId = select.value;
        if (!entryId) return;
        this.setColumnMode(index, mode, true);
      });
    }
    for (const btn of hybridButtons) {
      btn.addEventListener("click", () => {
        const strategy = btn.dataset.hybrid as HybridStrategy;
        const entryId = select.value;
        if (!entryId) return;
        this.setColumnHybridStrategy(index, strategy, true);
      });
    }

    return { root: col, select, summary, modeButtons, hybridButtons, hybridGroup, entryId: "" };
  }

  private renderAllColumns(): void {
    for (let i = 0; i < this.slots.length; i++) this.renderColumn(i);
    this.renderWidgets(0);
  }

  private renderColumn(index: number): void {
    const slot = this.slots[index];
    const entryId = slot.select.value;
    slot.entryId = entryId;

    if (!entryId) {
      slot.summary.textContent = "Select a car…";
      if (index === 0) this.renderWidgets(index);
      return;
    }

    const snap = this.snapshots.find((s) => s.entryId === entryId);
    if (!snap) {
      slot.summary.textContent = "Waiting for telemetry…";
      if (index === 0) this.renderWidgets(index);
      return;
    }

    const mode = (snap.driverMode as DriverMode) ?? "normal";
    this.setColumnMode(index, mode, false);

    const hasHybrid =
      snap.hybridDeployMJ != null &&
      snap.hybridDeployMJ >= 0 &&
      (snap.hybridBudgetMJ ?? 0) > 0;
    slot.hybridGroup.classList.toggle("hidden", !hasHybrid);
    if (hasHybrid) {
      const strategy = (snap.hybridStrategy ?? "balanced") as HybridStrategy;
      this.setColumnHybridStrategy(index, strategy, false);
    }

    slot.summary.innerHTML = buildCarSummaryHtml(snap);
    if (index === 0) this.renderWidgets(index);
  }

  private renderWidgets(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    if (!slot?.entryId) {
      this.fuelWidget.innerHTML = `<p class="telemetry-widget-empty">Select a car in slot 1</p>`;
      this.tyreWidget.innerHTML = "";
      this.hybridWidget.innerHTML = "";
      this.damageWidget.innerHTML = "";
      return;
    }

    const snap = this.snapshots.find((s) => s.entryId === slot.entryId);
    if (!snap) {
      this.fuelWidget.innerHTML = `<p class="telemetry-widget-empty">Waiting for telemetry…</p>`;
      this.tyreWidget.innerHTML = "";
      this.hybridWidget.innerHTML = "";
      this.damageWidget.innerHTML = "";
      return;
    }

    const fuelStats = this.fuelTracker.stats(snap.entryId, snap.fuel);
    const ctx = { fuelStats, hybridBudgetMJ: snap.hybridBudgetMJ ?? null };

    this.fuelWidget.innerHTML = buildFuelWidgetHtml(snap, ctx);
    this.tyreWidget.innerHTML = buildTyreWidgetHtml(snap);
    this.hybridWidget.innerHTML = buildHybridWidgetHtml(snap, ctx);
    this.damageWidget.innerHTML = buildDamageWidgetHtml(snap);
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

  private setColumnHybridStrategy(
    index: number,
    strategy: HybridStrategy,
    notify: boolean,
  ): void {
    const slot = this.slots[index];
    for (const btn of slot.hybridButtons) {
      btn.classList.toggle("active", btn.dataset.hybrid === strategy);
      if (btn.classList.contains("active")) {
        btn.title = hybridStrategyLabel(strategy);
      }
    }
    if (notify && slot.entryId) {
      this.handlers.onHybridStrategy(slot.entryId, strategy);
    }
  }
}
