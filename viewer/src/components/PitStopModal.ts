import type { CarSnapshot } from "../ws/protocol";
import {
  buildPitCommand,
  estimateDriverChangeSeconds,
  estimatePitSeconds,
} from "../utils/pitCommands";
import { buildTyreTelemetryPanelHtml, formatTyreTemp, formatTyreWear, wheelTempFromSnapshot, wheelWearFromSnapshot, worstWheelWear, hottestWheelTemp } from "../utils/formatTyre";
import { escapeHtml } from "../utils/mmUi";

export interface PitStopModalHandlers {
  onConfirm: (entryId: string, command: string) => void;
  onCancelPit: (entryId: string) => void;
}

export class PitStopModal {
  readonly root: HTMLElement;
  private fuelInput!: HTMLInputElement;
  private compoundSelect!: HTMLSelectElement;
  private tireChecks!: NodeListOf<HTMLInputElement>;
  private repairEngine!: HTMLInputElement;
  private repairBody!: HTMLInputElement;
  private driverChange!: HTMLInputElement;
  private driverSelectWrap!: HTMLElement;
  private driverSelect!: HTMLSelectElement;
  private estimateEl!: HTMLElement;
  private carSummaryEl!: HTMLElement;
  private wearGridEl!: HTMLElement;
  private handlers: PitStopModalHandlers;
  private playerEntryId = "entry-1";
  private latestSnap: CarSnapshot | null = null;

  constructor(container: HTMLElement, handlers: PitStopModalHandlers) {
    this.handlers = handlers;
    this.root = container;
    this.root.className = "pit-modal-overlay hidden";
    this.root.innerHTML = `
      <div class="pit-modal-card" role="dialog" aria-labelledby="pit-modal-title">
        <header class="pit-modal-header">
          <h2 id="pit-modal-title">Pit Stop</h2>
          <button type="button" class="pit-modal-close secondary-btn" aria-label="Close">✕</button>
        </header>
        <p class="pit-modal-car-summary"></p>
        <fieldset class="mm-fieldset">
          <legend>Stop configuration</legend>
          <label class="mm-field">Fuel (litres)
            <input type="number" class="pit-modal-fuel" min="0" max="140" step="5" value="40" />
          </label>
          <label class="mm-field">Tyre compound
            <select class="pit-modal-compound">
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
          <div class="pit-modal-wear-grid hidden"></div>
          <label><input type="checkbox" class="pit-modal-repair-engine" /> Engine repair</label>
          <label><input type="checkbox" class="pit-modal-repair-body" /> Bodywork repair</label>
          <label><input type="checkbox" class="pit-modal-driver-change" /> <span class="pit-modal-driver-change-label">Driver change</span></label>
          <label class="pit-driver-select-wrap hidden">Swap to
            <select class="pit-modal-driver-select"></select>
          </label>
          <p class="pit-estimate pit-modal-estimate"></p>
        </fieldset>
        <footer class="pit-modal-actions">
          <button type="button" class="secondary-btn pit-modal-cancel-queue">Cancel queued stop</button>
          <button type="button" class="secondary-btn pit-modal-dismiss">Back</button>
          <button type="button" class="primary-btn pit-modal-confirm">Confirm pit stop</button>
        </footer>
      </div>
    `;

    this.fuelInput = this.root.querySelector(".pit-modal-fuel")!;
    this.compoundSelect = this.root.querySelector(".pit-modal-compound")!;
    this.tireChecks = this.root.querySelectorAll("[data-tire]");
    this.repairEngine = this.root.querySelector(".pit-modal-repair-engine")!;
    this.repairBody = this.root.querySelector(".pit-modal-repair-body")!;
    this.driverChange = this.root.querySelector(".pit-modal-driver-change")!;
    this.driverSelectWrap = this.root.querySelector(".pit-driver-select-wrap")!;
    this.driverSelect = this.root.querySelector(".pit-modal-driver-select")!;
    this.estimateEl = this.root.querySelector(".pit-modal-estimate")!;
    this.carSummaryEl = this.root.querySelector(".pit-modal-car-summary")!;
    this.wearGridEl = this.root.querySelector(".pit-modal-wear-grid")!;

    const refresh = () => this.updateEstimate();
    this.fuelInput.addEventListener("input", refresh);
    this.repairEngine.addEventListener("change", refresh);
    this.repairBody.addEventListener("change", refresh);
    this.driverChange.addEventListener("change", () => {
      this.driverSelectWrap.classList.toggle("hidden", !this.driverChange.checked);
      refresh();
    });
    for (const cb of this.tireChecks) cb.addEventListener("change", refresh);

    this.root.querySelector(".pit-modal-close")!.addEventListener("click", () => this.hide());
    this.root.querySelector(".pit-modal-dismiss")!.addEventListener("click", () => this.hide());
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.hide();
    });

    this.root.querySelector(".pit-modal-confirm")!.addEventListener("click", () => {
      this.handlers.onConfirm(this.playerEntryId, this.buildCommand());
      this.hide();
    });

    this.root.querySelector(".pit-modal-cancel-queue")!.addEventListener("click", () => {
      this.handlers.onCancelPit(this.playerEntryId);
      this.hide();
    });
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  open(snap: CarSnapshot | null): void {
    this.latestSnap = snap;
    if (snap) {
      const tankGap = Math.max(0, 100 - snap.fuel);
      this.fuelInput.value = String(
        tankGap > 0 ? Math.min(140, Math.ceil(tankGap / 5) * 5) : 40,
      );
      const wheelWear = wheelWearFromSnapshot(snap);
      const wheelTemps = wheelTempFromSnapshot(snap);
      const worst = worstWheelWear(wheelWear);
      const hottest = hottestWheelTemp(wheelTemps);
      this.carSummaryEl.innerHTML = `
        <strong>#${snap.carNumber} ${escapeHtml(snap.teamName)}</strong>
        · ${escapeHtml(snap.driverName ?? "Driver")}
        · Fuel ${snap.fuel.toFixed(0)}L · peak ${formatTyreTemp(hottest)} · worst ${formatTyreWear(worst)}
      `;
      this.wearGridEl.innerHTML = buildTyreTelemetryPanelHtml(snap);
      this.wearGridEl.classList.remove("hidden");
      this.applyWearBasedTireSelection(wheelWear);
      this.populateDriverSelect(snap);
    } else {
      this.carSummaryEl.textContent = "Your car";
      this.wearGridEl.classList.add("hidden");
      this.wearGridEl.innerHTML = "";
    }
    this.updateEstimate();
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  private updateEstimate(): void {
    const tires = [...this.tireChecks].filter((cb) => cb.checked).length;
    const serviceability = this.latestSnap?.serviceabilityFactor ?? 1;
    const driverChangeFactor = this.latestSnap?.driverChangeFactor ?? 1;
    const driverSec = Math.round(estimateDriverChangeSeconds(driverChangeFactor));
    const driverLabel = this.root.querySelector(".pit-modal-driver-change-label");
    if (driverLabel) {
      driverLabel.textContent = `Driver change (+${driverSec}s)`;
    }
    const sec = estimatePitSeconds({
      fuel: Number(this.fuelInput.value) || 0,
      tireCount: tires,
      repairEngine: this.repairEngine.checked,
      repairBody: this.repairBody.checked,
      driverChange: this.driverChange.checked,
      serviceabilityFactor: serviceability,
      driverChangeFactor,
    });
    this.estimateEl.textContent = `Estimated stop ~${sec.toFixed(0)}s (chassis serviceability ×${serviceability.toFixed(2)})`;
  }

  private populateDriverSelect(snap: CarSnapshot): void {
    const roster = snap.driverRoster ?? [];
    const activeIdx = snap.activeDriverIndex ?? 0;
    this.driverSelect.innerHTML = roster
      .map((d, i) => {
        if (i === activeIdx) return "";
        const staminaNote = d.active ? "" : ` · DRY ${d.dryPace}`;
        return `<option value="${i}">${escapeHtml(d.name)} (${escapeHtml(d.tier)})${staminaNote}</option>`;
      })
      .filter(Boolean)
      .join("");
    this.driverSelectWrap.classList.toggle(
      "hidden",
      !this.driverChange.checked || roster.length < 2,
    );
  }

  private applyWearBasedTireSelection(wear: ReturnType<typeof wheelWearFromSnapshot>): void {
    const corners = ["FL", "FR", "RL", "RR"] as const;
    const values = corners.map((corner) => wear[corner]);
    const worst = Math.max(...values);
    const threshold = Math.max(0.35, worst - 0.08);
    for (const cb of this.tireChecks) {
      const corner = cb.getAttribute("data-tire") as (typeof corners)[number] | null;
      if (!corner) continue;
      cb.checked = wear[corner] >= threshold;
    }
  }

  private buildCommand(): string {
    const tires: string[] = [];
    for (const cb of this.tireChecks) {
      if (cb.checked) tires.push(cb.getAttribute("data-tire") ?? "");
    }
    const repairs: string[] = [];
    if (this.repairEngine.checked) repairs.push("engine");
    if (this.repairBody.checked) repairs.push("body");
    return buildPitCommand({
      fuel: Number(this.fuelInput.value) || 0,
      compound: this.compoundSelect.value,
      tires,
      repairs,
      driverChange: this.driverChange.checked,
      driverIndex: this.driverChange.checked ? Number(this.driverSelect.value) : undefined,
    });
  }
}
