import type { CarSnapshot } from "../ws/protocol";
import {
  buildPitCommand,
  estimateDriverChangeSeconds,
  estimatePitSeconds,
  type PitSetupDelta,
} from "../utils/pitCommands";
import { formatSetupSummary } from "../utils/setupCommands";
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
  private setupDelta: PitSetupDelta = {};
  private engineerSkill = 75;
  private setupSummaryEl!: HTMLElement;

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
        <fieldset class="mm-fieldset pit-setup-fieldset">
          <legend>Setup changes (+~6s)</legend>
          <p class="pit-setup-hint">Applied during the stop — aero, balance, and suspension deltas.</p>
          <div class="pit-setup-grid">
            <label class="mm-field">Wing
              <select class="pit-setup-wing">
                <option value="">No change</option>
                <option value="0.05">More downforce (+0.05)</option>
                <option value="-0.05">Less drag (−0.05)</option>
              </select>
            </label>
            <label class="mm-field">Brake bias
              <select class="pit-setup-brake">
                <option value="">No change</option>
                <option value="0.02">More rear (+0.02)</option>
                <option value="-0.02">More front (−0.02)</option>
              </select>
            </label>
            <label class="mm-field">Front ride height
              <select class="pit-setup-front-rh">
                <option value="">No change</option>
                <option value="-0.002">Lower 2 mm</option>
                <option value="0.002">Raise 2 mm</option>
              </select>
            </label>
            <label class="mm-field">Rear ride height
              <select class="pit-setup-rear-rh">
                <option value="">No change</option>
                <option value="-0.002">Lower 2 mm</option>
                <option value="0.002">Raise 2 mm</option>
              </select>
            </label>
            <label class="mm-field">Front spring
              <select class="pit-setup-front-spring">
                <option value="">No change</option>
                <option value="5000">Stiffer (+5000 N/m)</option>
                <option value="-5000">Softer (−5000 N/m)</option>
              </select>
            </label>
            <label class="mm-field">Rear spring
              <select class="pit-setup-rear-spring">
                <option value="">No change</option>
                <option value="5000">Stiffer (+5000 N/m)</option>
                <option value="-5000">Softer (−5000 N/m)</option>
              </select>
            </label>
            <label class="mm-field">Front ARB
              <select class="pit-setup-front-arb">
                <option value="">No change</option>
                <option value="0.05">Stiffer (+0.05)</option>
                <option value="-0.05">Softer (−0.05)</option>
              </select>
            </label>
            <label class="mm-field">Rear ARB
              <select class="pit-setup-rear-arb">
                <option value="">No change</option>
                <option value="0.05">Stiffer (+0.05)</option>
                <option value="-0.05">Softer (−0.05)</option>
              </select>
            </label>
            <label class="mm-field">Front damper bump
              <select class="pit-setup-front-bump">
                <option value="">No change</option>
                <option value="1">+1 click</option>
                <option value="-1">−1 click</option>
              </select>
            </label>
            <label class="mm-field">Front damper rebound
              <select class="pit-setup-front-rebound">
                <option value="">No change</option>
                <option value="1">+1 click</option>
                <option value="-1">−1 click</option>
              </select>
            </label>
            <label class="mm-field">Rear damper bump
              <select class="pit-setup-rear-bump">
                <option value="">No change</option>
                <option value="1">+1 click</option>
                <option value="-1">−1 click</option>
              </select>
            </label>
            <label class="mm-field">Rear damper rebound
              <select class="pit-setup-rear-rebound">
                <option value="">No change</option>
                <option value="1">+1 click</option>
                <option value="-1">−1 click</option>
              </select>
            </label>
          </div>
          <p class="pit-setup-summary"></p>
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
    this.setupSummaryEl = this.root.querySelector(".pit-setup-summary")!;

    const refresh = () => this.updateEstimate();
    this.fuelInput.addEventListener("input", refresh);
    this.repairEngine.addEventListener("change", refresh);
    this.repairBody.addEventListener("change", refresh);
    for (const sel of this.root.querySelectorAll<HTMLSelectElement>(
      ".pit-setup-fieldset select",
    )) {
      sel.addEventListener("change", () => {
        this.readSetupFromForm();
        refresh();
      });
    }
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

  setEngineerSkill(skill: number): void {
    this.engineerSkill = skill;
  }

  open(snap: CarSnapshot | null): void {
    this.latestSnap = snap;
    this.resetSetupForm();
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
      setup: this.setupDelta,
      serviceabilityFactor: serviceability,
      driverChangeFactor,
      engineerSkill: this.engineerSkill,
    });
    this.estimateEl.textContent = `Estimated stop ~${sec.toFixed(0)}s (chassis serviceability ×${serviceability.toFixed(2)})`;
    this.setupSummaryEl.textContent = `Setup plan: ${formatSetupSummary(this.setupDelta)}`;
  }

  private resetSetupForm(): void {
    this.setupDelta = {};
    for (const sel of this.root.querySelectorAll<HTMLSelectElement>(
      ".pit-setup-fieldset select",
    )) {
      sel.value = "";
    }
    this.setupSummaryEl.textContent = "Setup plan: none";
  }

  private readSetupFromForm(): void {
    const num = (sel: string) => {
      const el = this.root.querySelector<HTMLSelectElement>(sel);
      const raw = el?.value ?? "";
      if (!raw) return undefined;
      const v = parseFloat(raw);
      return Number.isFinite(v) ? v : undefined;
    };
    this.setupDelta = {
      wing: num(".pit-setup-wing"),
      brakeBias: num(".pit-setup-brake"),
      frontRideHeight: num(".pit-setup-front-rh"),
      rearRideHeight: num(".pit-setup-rear-rh"),
      frontSpring: num(".pit-setup-front-spring"),
      rearSpring: num(".pit-setup-rear-spring"),
      frontArb: num(".pit-setup-front-arb"),
      rearArb: num(".pit-setup-rear-arb"),
      frontDamperBump: num(".pit-setup-front-bump"),
      frontDamperRebound: num(".pit-setup-front-rebound"),
      rearDamperBump: num(".pit-setup-rear-bump"),
      rearDamperRebound: num(".pit-setup-rear-rebound"),
    };
  }

  /** Apply engineer-suggested pit/setup command into the form. */
  applySuggestedCommand(command: string): void {
    const segments = command.split("|");
    const verb = segments[0]?.toLowerCase();
    if (verb !== "pit" && verb !== "setup") return;

    const setSelect = (cls: string, val: string) => {
      const el = this.root.querySelector<HTMLSelectElement>(cls);
      if (!el) return;
      const opt = [...el.options].find((o) => o.value === val);
      if (opt) el.value = val;
    };

    for (let i = 1; i < segments.length; i++) {
      const eq = segments[i].indexOf("=");
      if (eq <= 0) continue;
      const key = segments[i].slice(0, eq).trim().toLowerCase();
      const val = segments[i].slice(eq + 1).trim();
      if (key === "fuel") this.fuelInput.value = val;
      else if (key === "compound") this.compoundSelect.value = val.toLowerCase();
      else if (key === "wing") setSelect(".pit-setup-wing", val);
      else if (key === "brake_bias") setSelect(".pit-setup-brake", val);
      else if (key === "front_ride_height") setSelect(".pit-setup-front-rh", val);
      else if (key === "rear_ride_height") setSelect(".pit-setup-rear-rh", val);
      else if (key === "front_spring") setSelect(".pit-setup-front-spring", val);
      else if (key === "rear_spring") setSelect(".pit-setup-rear-spring", val);
      else if (key === "front_arb") setSelect(".pit-setup-front-arb", val);
      else if (key === "rear_arb") setSelect(".pit-setup-rear-arb", val);
      else if (key === "front_damper_bump") setSelect(".pit-setup-front-bump", val);
      else if (key === "front_damper_rebound") {
        setSelect(".pit-setup-front-rebound", val);
      } else if (key === "rear_damper_bump") setSelect(".pit-setup-rear-bump", val);
      else if (key === "rear_damper_rebound") {
        setSelect(".pit-setup-rear-rebound", val);
      }
    }
    this.readSetupFromForm();
    this.updateEstimate();
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
    this.readSetupFromForm();
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
      setup: this.setupDelta,
    });
  }
}
