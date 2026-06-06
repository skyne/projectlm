import type { CarBuildPayload, EngineBuildPayload } from "../ws/protocol";
import {
  COOLING_PRESETS,
  computeCoolingStats,
  coolingBalanceTone,
  decodeCoolingLayout,
  encodeCoolingBuild,
  layoutMatchesPreset,
  type CoolingLayout,
} from "../utils/cooling_model";

export interface CoolingDesignerHandlers {
  onChange: (patch: Pick<CarBuildPayload, "cooling_pack" | "cooling">) => void;
}

const PRESET_LABELS: Record<string, string> = {
  SprintSlimline: "Sprint",
  EnduranceHeavyDuty: "Endurance",
  DuctedRacing: "Ducted",
  MaxFlowEndurance: "Max flow",
};

const SLIDER_DEFS: Array<{ key: keyof CoolingLayout; label: string }> = [
  { key: "engineRadiator", label: "Engine radiator" },
  { key: "oilCooler", label: "Oil cooler" },
  { key: "chargeAirCooler", label: "Charge-air cooler" },
  { key: "gearboxCooler", label: "Gearbox cooler" },
];

export class CoolingDesigner {
  readonly root: HTMLElement;
  private balanceEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private ductNoteEl!: HTMLElement;
  private handlers: CoolingDesignerHandlers;
  private layout: CoolingLayout = { ...COOLING_PRESETS.EnduranceHeavyDuty };
  private ductAirflow = 1;
  private engine: EngineBuildPayload | undefined;
  private classId = "Hypercar";

  constructor(container: HTMLElement, handlers: CoolingDesignerHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "cooling-designer hidden";
    this.root.innerHTML = `
      <div class="cooling-designer-header">
        <h4>Cooling layout</h4>
        <p class="cooling-designer-hint">Size each heat exchanger — bigger rejects more heat but adds mass and drag.</p>
      </div>
      <div class="cooling-preset-row"></div>
      <div class="cooling-sliders"></div>
      <div class="cooling-balance-card">
        <div class="cooling-balance-header">
          <span>Heat balance</span>
          <span class="cooling-balance-total"></span>
        </div>
        <div class="cooling-balance-rows"></div>
        <p class="cooling-duct-note"></p>
      </div>
      <div class="cooling-summary-grid"></div>
    `;
    container.appendChild(this.root);

    this.balanceEl = this.root.querySelector(".cooling-balance-rows")!;
    this.summaryEl = this.root.querySelector(".cooling-summary-grid")!;
    this.ductNoteEl = this.root.querySelector(".cooling-duct-note")!;
    this.renderPresets();
    this.renderSliders();
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  setContext(classId: string, engine: EngineBuildPayload | undefined, ductAirflow = 1): void {
    this.classId = classId;
    this.engine = engine;
    this.ductAirflow = ductAirflow;
    this.renderAll();
  }

  setBuild(build: CarBuildPayload): void {
    this.layout = decodeCoolingLayout(build);
    this.ductAirflow = build.duct_airflow ?? 1;
    this.renderAll();
  }

  private renderPresets(): void {
    const row = this.root.querySelector(".cooling-preset-row")!;
    row.replaceChildren();
    for (const id of Object.keys(COOLING_PRESETS)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pt-chip-btn cooling-preset-btn";
      btn.dataset.preset = id;
      btn.textContent = PRESET_LABELS[id] ?? id;
      btn.addEventListener("click", () => {
        this.layout = { ...COOLING_PRESETS[id] };
        this.emitChange(id);
        this.renderAll();
      });
      row.appendChild(btn);
    }
  }

  private renderSliders(): void {
    const container = this.root.querySelector(".cooling-sliders")!;
    container.replaceChildren();
    for (const def of SLIDER_DEFS) {
      const wrap = document.createElement("label");
      wrap.className = "engine-slider-field cooling-slider-field";
      wrap.dataset.sliderKey = def.key;
      wrap.innerHTML = `
        <span class="engine-slider-label">
          <span class="engine-slider-name">${def.label}</span>
          <span class="engine-slider-value"></span>
        </span>
        <input type="range" class="engine-slider" min="0" max="1" step="0.01" data-key="${def.key}" />
      `;
      const slider = wrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.addEventListener("input", () => {
        const val = Math.max(0, Math.min(1, parseFloat(slider.value)));
        this.layout = { ...this.layout, [def.key]: val };
        this.emitChange();
        this.updateSliderLabels();
        this.renderBalance();
        this.renderSummary();
      });
      container.appendChild(wrap);
    }
  }

  private emitChange(presetId?: string): void {
    const matched = presetId ?? layoutMatchesPreset(this.layout);
    this.handlers.onChange(encodeCoolingBuild(this.layout, matched ?? undefined));
  }

  private renderAll(): void {
    this.updateSliderLabels();
    this.renderBalance();
    this.renderSummary();
    this.highlightPreset();
  }

  private highlightPreset(): void {
    const match = layoutMatchesPreset(this.layout);
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".cooling-preset-btn")) {
      btn.classList.toggle("active", btn.dataset.preset === match);
    }
  }

  private updateSliderLabels(): void {
    const stats = computeCoolingStats(this.layout, this.ductAirflow, this.engine, this.classId);
    const chargeAirActive = stats.circuits.find((c) => c.id === "charge_air")?.active ?? true;

    for (const def of SLIDER_DEFS) {
      const wrap = this.root.querySelector<HTMLElement>(`[data-slider-key="${def.key}"]`);
      if (!wrap) continue;
      const hideChargeAir = def.key === "chargeAirCooler" && !chargeAirActive;
      wrap.classList.toggle("dimmed", hideChargeAir);
      const slider = wrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.disabled = hideChargeAir;
      slider.value = String(this.layout[def.key]);
      const circuit = stats.circuits.find(
        (c) =>
          (def.key === "engineRadiator" && c.id === "engine") ||
          (def.key === "oilCooler" && c.id === "oil") ||
          (def.key === "chargeAirCooler" && c.id === "charge_air") ||
          (def.key === "gearboxCooler" && c.id === "gearbox"),
      );
      const valEl = wrap.querySelector(".engine-slider-value")!;
      if (circuit) {
        const pct = Math.round((circuit.supply / Math.max(0.01, circuit.demand)) * 100);
        valEl.textContent = `${Math.round(this.layout[def.key] * 100)}% · ${pct}% of need`;
      } else {
        valEl.textContent = `${Math.round(this.layout[def.key] * 100)}%`;
      }
    }
  }

  private renderBalance(): void {
    const stats = computeCoolingStats(this.layout, this.ductAirflow, this.engine, this.classId);
    const tone = coolingBalanceTone(stats.margin);
    const totalEl = this.root.querySelector(".cooling-balance-total")!;
    totalEl.className = `cooling-balance-total tone-${tone}`;
    const marginPct = Math.round(stats.margin * 100);
    totalEl.textContent =
      marginPct >= 0
        ? `+${marginPct}% headroom`
        : `${marginPct}% short`;

    const scale = Math.max(
      stats.totalDemand,
      stats.totalSupply,
      ...stats.circuits.filter((c) => c.active).map((c) => Math.max(c.demand, c.supply)),
      0.5,
    );

    this.balanceEl.innerHTML = stats.circuits
      .filter((c) => c.active)
      .map((c) => {
        const needPct = Math.min(100, (c.demand / scale) * 100);
        const supplyPct = Math.min(100, (c.supply / scale) * 100);
        const ok = c.supply >= c.demand * 0.95;
        return `
          <div class="cooling-balance-row">
            <span class="cooling-balance-label">${c.label}</span>
            <div class="cooling-balance-bars">
              <div class="cooling-need-bar" style="width:${needPct}%"></div>
              <div class="cooling-supply-bar ${ok ? "ok" : "short"}" style="width:${supplyPct}%"></div>
            </div>
            <span class="cooling-balance-val">${c.supply.toFixed(2)} / ${c.demand.toFixed(2)}</span>
          </div>
        `;
      })
      .join("");

    this.ductNoteEl.innerHTML = `
      <span class="cooling-duct-badge">Race setup</span>
      Duct airflow: <strong>${Math.round(this.ductAirflow * 100)}%</strong>
      — restrict inlets with tape at the track (Le Mans low-drag, etc.). Preview only in garage.
    `;
  }

  private renderSummary(): void {
    const stats = computeCoolingStats(this.layout, this.ductAirflow, this.engine, this.classId);
    this.summaryEl.innerHTML = `
      <div><span>Total cooling</span><strong>×${stats.dissipation.toFixed(2)}</strong></div>
      <div><span>Cooling mass</span><strong>${stats.massKg.toFixed(1)} kg</strong></div>
      <div><span>Cooling drag</span><strong>+${stats.dragCd.toFixed(3)} Cd</strong></div>
    `;
  }
}
