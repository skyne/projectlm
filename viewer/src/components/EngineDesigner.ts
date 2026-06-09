import type { ClassInfoPayload, EngineBuildPayload } from "../ws/protocol";
import {
  ASPIRATION_BY_CLASS,
  CLASS_POWER_BAND,
  DRIVETRAIN_BY_CLASS,
  encodePowertrainBuild,
  decodePowertrainUi,
  effectiveHorsepower,
  fuelCellBufferTraits,
  FUEL_BY_CLASS,
  FUEL_TYPES,
  isComboLegal,
  isChoiceLegal,
  LAYOUT_BY_CLASS,
  LAYOUTS,
  resolvePowertrainTraits,
  traitChips,
  type AspirationId,
  type DrivetrainId,
  type EnergyConverterId,
  type FuelType,
  type LayoutId,
  type PowertrainUiState,
} from "../utils/powertrain_traits";

export interface PowertrainSuggestions {
  hybrid_system?: string;
  fuel_system?: string;
  transmission?: string;
}

export interface EngineDesignerHandlers {
  onChange: (engine: EngineBuildPayload, suggestions?: PowertrainSuggestions) => void;
}

const ASPIRATION_LABELS: Record<AspirationId, string> = {
  NA: "NA",
  Single: "Single",
  TwinParallel: "Twin",
  TwinSequential: "Seq Twin",
  Quad: "Quad",
  EBoost: "E-Boost",
};

const DRIVETRAIN_LABELS: Record<DrivetrainId, string> = {
  Mechanical: "Mechanical",
  ParallelHybrid: "Parallel",
  FrontAxleHybrid: "Front e-Axle",
  RangeExtender: "REX",
  FullEV: "E-drive",
};

const ELECTRIC_DRIVE_OPTIONS: Array<{ id: DrivetrainId; label: string; hint: string }> = [
  { id: "FullEV", label: "Battery EV", hint: "Battery → e-motors → wheels" },
  { id: "RangeExtender", label: "REX", hint: "ICE generator charges the pack" },
];

export class EngineDesigner {
  readonly root: HTMLElement;
  private summaryEl!: HTMLElement;
  private capNoteEl!: HTMLElement;
  private traitChipsEl!: HTMLElement;
  private energyFlowEl!: HTMLElement;
  private handlers: EngineDesignerHandlers;
  private ui: PowertrainUiState | null = null;
  private classInfo: ClassInfoPayload | null = null;
  private classId = "Hypercar";

  constructor(container: HTMLElement, handlers: EngineDesignerHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "engine-designer hidden";
    this.root.innerHTML = `
      <div class="engine-designer-header">
        <h4>Powertrain</h4>
        <p class="engine-designer-hint">Fuel, architecture, aspiration, and drivetrain each trade something. No free lunch.</p>
      </div>
      <div class="pt-section">
        <span class="engine-field-label">Fuel</span>
        <div class="pt-picker-row pt-fuel-row"></div>
      </div>
      <div class="pt-section pt-h2-system-section hidden">
        <span class="engine-field-label">H₂ system</span>
        <p class="pt-h2-hint engine-designer-hint"></p>
        <div class="pt-picker-row pt-h2-system-row"></div>
      </div>
      <div class="pt-section pt-arch-section">
        <span class="engine-field-label">Arch</span>
        <div class="engine-layout-grid pt-arch-grid"></div>
      </div>
      <div class="pt-section pt-boost-section">
        <span class="engine-field-label">Boost</span>
        <div class="pt-picker-row pt-aspiration-row"></div>
      </div>
      <div class="pt-section pt-drive-section">
        <span class="engine-field-label">Drive</span>
        <div class="pt-picker-row pt-drivetrain-row"></div>
      </div>
      <div class="pt-reg-note hidden"></div>
      <div class="engine-sliders"></div>
      <div class="pt-trait-chips"></div>
      <div class="pt-energy-flow hidden"></div>
      <div class="engine-summary-card">
        <div class="engine-summary-grid"></div>
        <p class="engine-cap-note"></p>
      </div>
    `;
    container.appendChild(this.root);

    this.summaryEl = this.root.querySelector(".engine-summary-grid")!;
    this.capNoteEl = this.root.querySelector(".engine-cap-note")!;
    this.traitChipsEl = this.root.querySelector(".pt-trait-chips")!;
    this.energyFlowEl = this.root.querySelector(".pt-energy-flow")!;
    this.renderPickers();
    this.renderSliders();
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  setClassInfo(classInfo: ClassInfoPayload | null): void {
    this.classInfo = classInfo;
    this.classId = classInfo?.id ?? "Hypercar";
    this.renderPickers();
    this.clampUiToRegulations();
    this.renderAll();
  }

  setEngine(engine: EngineBuildPayload): void {
    this.ui = decodePowertrainUi(engine, this.classId);
    this.clampUiToRegulations();
    this.renderAll();
  }

  getEngine(): EngineBuildPayload | null {
    if (!this.ui) return null;
    return encodePowertrainBuild(this.ui, this.classId);
  }

  private clampUiToRegulations(): void {
    if (!this.ui) return;
    if (!isChoiceLegal(this.classId, "fuel", this.ui.fuel)) {
      this.ui.fuel = (FUEL_BY_CLASS[this.classId] ?? ["Gasoline"])[0];
    }
    if (!isChoiceLegal(this.classId, "layout", this.ui.layout)) {
      this.ui.layout = (LAYOUT_BY_CLASS[this.classId] ?? ["V6"])[0];
    }
    if (!isChoiceLegal(this.classId, "aspiration", this.ui.aspiration)) {
      this.ui.aspiration = (ASPIRATION_BY_CLASS[this.classId] ?? ["NA"])[0];
    }
    if (!isChoiceLegal(this.classId, "drivetrain", this.ui.drivetrain)) {
      this.ui.drivetrain = (DRIVETRAIN_BY_CLASS[this.classId] ?? ["Mechanical"])[0];
    }
    this.fixComboViolations();
  }

  private fixComboViolations(): void {
    if (!this.ui) return;
    let err = isComboLegal(
      this.classId,
      this.ui.layout,
      this.ui.aspiration,
      this.ui.drivetrain,
      this.ui.fuel,
      this.ui.energyConverter,
    );
    if (!err) return;
    if (this.ui.aspiration === "EBoost" && this.ui.drivetrain === "Mechanical") {
      this.ui.drivetrain = "ParallelHybrid";
    }
    if (this.ui.layout === "Rotary" && this.ui.aspiration === "Quad") {
      this.ui.aspiration = "TwinSequential";
    }
    err = isComboLegal(
      this.classId,
      this.ui.layout,
      this.ui.aspiration,
      this.ui.drivetrain,
      this.ui.fuel,
      this.ui.energyConverter,
    );
    if (err && this.ui.drivetrain === "FullEV" && this.ui.fuel !== "Electric" && this.ui.fuel !== "Hydrogen") {
      this.ui.fuel = "Electric";
    }
    if (err && this.ui.fuel === "Electric" && this.ui.drivetrain !== "FullEV" && this.ui.drivetrain !== "RangeExtender") {
      this.ui.drivetrain = "FullEV";
    }
    if (err && this.ui.fuel !== "Electric" && this.ui.drivetrain === "FullEV") {
      this.ui.drivetrain = "Mechanical";
    }
  }

  private renderPickers(): void {
    this.renderFuelRow();
    this.renderH2SystemRow();
    this.renderArchGrid();
    this.renderAspirationRow();
    this.renderDrivetrainRow();
  }

  private isH2FuelCell(): boolean {
    return this.ui?.fuel === "Hydrogen" && this.ui?.energyConverter === "FuelCell";
  }

  private isElectricFuel(): boolean {
    return this.ui?.fuel === "Electric";
  }

  private isElectricRex(): boolean {
    return this.isElectricFuel() && this.ui?.drivetrain === "RangeExtender";
  }

  private isElectricBev(): boolean {
    return this.isElectricFuel() && this.ui?.drivetrain === "FullEV";
  }

  private renderH2SystemRow(): void {
    const row = this.root.querySelector(".pt-h2-system-row")!;
    row.replaceChildren();
    const options: Array<{ id: EnergyConverterId; label: string; hint: string }> = [
      { id: "Combustion", label: "Combustion", hint: "Turbocharged H₂ engine" },
      { id: "FuelCell", label: "Fuel cell", hint: "Stack → battery → e-drive" },
    ];
    for (const opt of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pt-chip-btn";
      btn.dataset.h2System = opt.id;
      btn.textContent = opt.label;
      btn.title = opt.hint;
      btn.addEventListener("click", () => {
        if (!this.ui) return;
        const energyConverter = opt.id;
        const drivetrain =
          energyConverter === "FuelCell" ? "FullEV" : this.ui.drivetrain === "FullEV" ? "Mechanical" : this.ui.drivetrain;
        this.ui = { ...this.ui, energyConverter, drivetrain };
        this.fixComboViolations();
        this.emitChange();
      });
      row.appendChild(btn);
    }
  }

  private renderFuelRow(): void {
    const row = this.root.querySelector(".pt-fuel-row")!;
    row.replaceChildren();
    const allowed = FUEL_BY_CLASS[this.classId] ?? FUEL_TYPES;
    for (const fuel of FUEL_TYPES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "engine-fuel-btn";
      btn.dataset.fuel = fuel;
      btn.textContent = fuel;
      if (!allowed.includes(fuel)) {
        btn.disabled = true;
        btn.title = "Outlawed in this class";
      }
      btn.addEventListener("click", () => {
        if (!this.ui || btn.disabled) return;
        const fuel = btn.dataset.fuel as FuelType;
        let energyConverter = "Combustion" as EnergyConverterId;
        let drivetrain = this.ui.drivetrain;
        let aspiration = this.ui.aspiration;
        if (fuel === "Hydrogen") {
          energyConverter = this.ui.energyConverter;
          drivetrain =
            energyConverter === "FuelCell"
              ? "FullEV"
              : this.ui.drivetrain === "FullEV"
                ? "Mechanical"
                : this.ui.drivetrain;
        } else if (fuel === "Electric") {
          drivetrain = "FullEV";
          aspiration = "NA";
          energyConverter = "Combustion";
        } else {
          if (this.ui.fuel === "Electric" && this.ui.drivetrain === "FullEV") {
            drivetrain = "Mechanical";
          }
        }
        this.ui = { ...this.ui, fuel, energyConverter, drivetrain, aspiration };
        this.fixComboViolations();
        this.emitChange();
      });
      row.appendChild(btn);
    }
  }

  private renderArchGrid(): void {
    const grid = this.root.querySelector(".pt-arch-grid")!;
    grid.replaceChildren();
    const allowed = new Set(LAYOUT_BY_CLASS[this.classId] ?? LAYOUTS.map((l) => l.id));
    for (const layout of LAYOUTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "engine-layout-btn";
      btn.dataset.layout = layout.id;
      if (!allowed.has(layout.id)) {
        btn.disabled = true;
        btn.title = "Not legal in this class";
      }
      btn.innerHTML = `
        <span class="engine-layout-name">${layout.label}</span>
        <span class="engine-layout-cyl">${layout.cylinders} cyl</span>
      `;
      btn.addEventListener("click", () => {
        if (!this.ui || btn.disabled) return;
        this.ui = { ...this.ui, layout: layout.id };
        this.fixComboViolations();
        this.emitChange();
      });
      grid.appendChild(btn);
    }
  }

  private renderAspirationRow(): void {
    const row = this.root.querySelector(".pt-aspiration-row")!;
    row.replaceChildren();
    const allowed = new Set(ASPIRATION_BY_CLASS[this.classId] ?? ["NA"]);
    const ids = Object.keys(ASPIRATION_LABELS) as AspirationId[];
    for (const id of ids) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pt-chip-btn";
      btn.dataset.aspiration = id;
      btn.textContent = ASPIRATION_LABELS[id];
      if (!allowed.has(id)) {
        btn.disabled = true;
        btn.title = "Outlawed in this class";
      }
      btn.addEventListener("click", () => {
        if (!this.ui || btn.disabled) return;
        this.ui = { ...this.ui, aspiration: id };
        this.fixComboViolations();
        this.emitChange();
      });
      row.appendChild(btn);
    }
  }

  private renderDrivetrainRow(): void {
    const row = this.root.querySelector(".pt-drivetrain-row")!;
    row.replaceChildren();
    const allowed = new Set(DRIVETRAIN_BY_CLASS[this.classId] ?? ["Mechanical"]);

    if (this.isElectricFuel()) {
      for (const opt of ELECTRIC_DRIVE_OPTIONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pt-chip-btn";
        btn.dataset.drivetrain = opt.id;
        btn.textContent = opt.label;
        btn.title = opt.hint;
        btn.addEventListener("click", () => {
          if (!this.ui) return;
          this.ui = { ...this.ui, drivetrain: opt.id, aspiration: "NA" };
          this.fixComboViolations();
          this.emitChange();
        });
        row.appendChild(btn);
      }
      return;
    }

    const ids = (Object.keys(DRIVETRAIN_LABELS) as DrivetrainId[]).filter((id) => id !== "FullEV");
    for (const id of ids) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pt-chip-btn";
      btn.dataset.drivetrain = id;
      btn.textContent = DRIVETRAIN_LABELS[id];
      if (!allowed.has(id)) {
        btn.disabled = true;
        btn.title = "Outlawed in this class";
      }
      btn.addEventListener("click", () => {
        if (!this.ui || btn.disabled) return;
        this.ui = { ...this.ui, drivetrain: id };
        this.fixComboViolations();
        this.emitChange();
      });
      row.appendChild(btn);
    }
  }

  private renderSliders(): void {
    const container = this.root.querySelector(".engine-sliders")!;
    container.replaceChildren();

    const defs: Array<{ key: keyof PowertrainUiState; label: string; step: number }> = [
      { key: "powerTargetHp", label: "Power target", step: 5 },
      { key: "revCharacter", label: "Rev character", step: 0.01 },
      { key: "blockSize", label: "Block size", step: 0.01 },
      { key: "generatorSize", label: "Generator size", step: 0.01 },
      { key: "bufferSize", label: "Buffer size", step: 0.01 },
    ];

    for (const def of defs) {
      const wrap = document.createElement("label");
      wrap.className = "engine-slider-field";
      wrap.dataset.sliderKey = def.key;
      wrap.innerHTML = `
        <span class="engine-slider-label">
          <span class="engine-slider-name">${def.label}</span>
          <span class="engine-slider-value"></span>
        </span>
        <input type="range" class="engine-slider" data-key="${def.key}" />
      `;
      const slider = wrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.step = String(def.step);
      slider.addEventListener("input", () => {
        if (!this.ui) return;
        let val = parseFloat(slider.value);
        if (def.key !== "powerTargetHp") val = Math.max(0, Math.min(1, val));
        this.ui = { ...this.ui, [def.key]: val };
        this.updateSliderLabels();
        this.renderSummary();
        this.renderTraitChips();
        this.emitChange();
      });
      container.appendChild(wrap);
    }
  }

  private powerBand() {
    return CLASS_POWER_BAND[this.classId] ?? CLASS_POWER_BAND.Hypercar;
  }

  private updateSliderLabels(): void {
    if (!this.ui) return;
    const band = this.powerBand();

    const powerWrap = this.root.querySelector('[data-slider-key="powerTargetHp"]');
    const revWrap = this.root.querySelector('[data-slider-key="revCharacter"]');
    const blockWrap = this.root.querySelector('[data-slider-key="blockSize"]');
    const genWrap = this.root.querySelector('[data-slider-key="generatorSize"]');
    const bufferWrap = this.root.querySelector('[data-slider-key="bufferSize"]');

    if (powerWrap) {
      const show =
        this.isElectricBev() ||
        (!this.isH2FuelCell() &&
          this.ui.drivetrain !== "FullEV" &&
          this.ui.drivetrain !== "RangeExtender");
      powerWrap.classList.toggle("hidden", !show);
      const slider = powerWrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.min = String(band.min);
      slider.max = String(band.max + 40);
      slider.value = String(this.ui.powerTargetHp);
      const valEl = powerWrap.querySelector(".engine-slider-value")!;
      const powerLabel = this.isElectricBev() ? "Motor power" : "Power target";
      powerWrap.querySelector(".engine-slider-name")!.textContent = powerLabel;
      valEl.textContent = `${Math.round(this.ui.powerTargetHp)} hp`;
    }

    if (revWrap) {
      const isRex = this.ui.drivetrain === "RangeExtender";
      const hideRev = this.isElectricBev() || this.isH2FuelCell();
      revWrap.classList.toggle("hidden", hideRev);
      const nameEl = revWrap.querySelector(".engine-slider-name")!;
      nameEl.textContent = isRex ? "Generator RPM" : "Rev character";
      const engine = encodePowertrainBuild(this.ui, this.classId);
      const valEl = revWrap.querySelector(".engine-slider-value")!;
      valEl.textContent = `${engine.max_rpm} rpm`;
      const slider = revWrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.min = "0";
      slider.max = "1";
      slider.value = String(this.ui.revCharacter);
    }

    if (blockWrap) {
      const hide =
        this.isH2FuelCell() ||
        this.isElectricBev() ||
        (this.ui.drivetrain === "RangeExtender" && !this.isElectricFuel());
      blockWrap.classList.toggle("hidden", hide);
      const engine = encodePowertrainBuild(this.ui, this.classId);
      const disp = engine.bore > 0 ? (engine.cylinders * Math.PI * (engine.bore / 2) ** 2 * engine.stroke * 1000) : 0;
      const valEl = blockWrap.querySelector(".engine-slider-value")!;
      valEl.textContent = disp > 0 ? `${disp.toFixed(1)} L` : "—";
      const slider = blockWrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.min = "0";
      slider.max = "1";
      slider.value = String(this.ui.blockSize);
    }

    if (genWrap) {
      const showFc = this.isH2FuelCell();
      const showRex = this.ui.drivetrain === "RangeExtender";
      genWrap.classList.toggle("hidden", !showFc && !showRex);
      const traits = this.ui
        ? resolvePowertrainTraits(encodePowertrainBuild(this.ui, this.classId), this.classId)
        : null;
      const valEl = genWrap.querySelector(".engine-slider-value")!;
      if (traits) {
        if (showFc) {
          valEl.textContent = `${Math.round(traits.generatorKw)} kW stack · ${Math.round(traits.peakHp)} hp sustained`;
        } else if (this.isElectricRex()) {
          valEl.textContent = `${Math.round(traits.generatorKw)} kW charge · ${Math.round(traits.deployKw)} kW burst`;
        } else {
          const disp = traits.displacementL > 0 ? `${traits.displacementL.toFixed(1)} L ICE` : "";
          valEl.textContent = `${Math.round(traits.generatorKw)} kW gen · ${Math.round(traits.deployKw)} kW burst${disp ? ` · ${disp}` : ""}`;
        }
      } else {
        valEl.textContent = "—";
      }
      const slider = genWrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.min = "0";
      slider.max = "1";
      slider.value = String(this.ui.generatorSize);
      const nameEl = genWrap.querySelector(".engine-slider-name")!;
      nameEl.textContent = showFc ? "Stack power" : this.isElectricRex() ? "Charge rate" : "Generator size";
    }

    if (bufferWrap) {
      const show = this.isH2FuelCell();
      bufferWrap.classList.toggle("hidden", !show);
      const traits = this.ui
        ? resolvePowertrainTraits(encodePowertrainBuild(this.ui, this.classId), this.classId)
        : null;
      const valEl = bufferWrap.querySelector(".engine-slider-value")!;
      valEl.textContent = traits
        ? `${Math.round(traits.deployKw)} kW · ~${(traits.stintBudgetMj / Math.max(traits.deployKw / 1000, 0.01)).toFixed(1)}s @ full · +${Math.round(fuelCellBufferTraits(this.ui.bufferSize, traits.generatorKw).bufferMassKg)} kg buffer`
        : "—";
      const slider = bufferWrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.min = "0";
      slider.max = "1";
      slider.value = String(this.ui.bufferSize);
      const nameEl = bufferWrap.querySelector(".engine-slider-name")!;
      nameEl.textContent = "Buffer battery";
    }
  }

  private updateSectionVisibility(): void {
    const h2 = this.ui?.fuel === "Hydrogen";
    const fc = this.isH2FuelCell();
    const ev = this.isElectricFuel();
    this.root.querySelector(".pt-h2-system-section")?.classList.toggle("hidden", !h2);
    this.root.querySelector(".pt-arch-section")?.classList.toggle("hidden", fc || this.isElectricBev());
    this.root.querySelector(".pt-boost-section")?.classList.toggle("hidden", fc || ev);
    this.root.querySelector(".pt-drive-section")?.classList.toggle("hidden", fc);
    const hint = this.root.querySelector(".pt-h2-hint");
    if (hint) {
      hint.textContent = fc
        ? "Fuel cell — stack → battery → e-drive"
        : "Combustion — turbocharged H₂ engine";
    }
    const headerHint = this.root.querySelector(".engine-designer-hint");
    if (headerHint && ev) {
      headerHint.textContent = this.isElectricRex()
        ? "Battery e-drive with a range-extender ICE — generator tuning sets charge rate, not wheel power."
        : "Battery electric — motor power and pack mass trade against stint length.";
    } else if (headerHint) {
      headerHint.textContent = "Fuel, architecture, aspiration, and drivetrain each trade something. No free lunch.";
    }
  }

  private syncPickerActive(): void {
    if (!this.ui) return;
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".engine-fuel-btn")) {
      btn.classList.toggle("active", btn.dataset.fuel === this.ui!.fuel);
    }
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".engine-layout-btn")) {
      btn.classList.toggle("active", btn.dataset.layout === this.ui!.layout);
    }
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".pt-chip-btn[data-aspiration]")) {
      btn.classList.toggle("active", btn.dataset.aspiration === this.ui!.aspiration);
    }
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".pt-chip-btn[data-drivetrain]")) {
      btn.classList.toggle("active", btn.dataset.drivetrain === this.ui!.drivetrain);
    }
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".pt-chip-btn[data-h2-system]")) {
      btn.classList.toggle("active", btn.dataset.h2System === this.ui!.energyConverter);
    }
  }

  private renderRegNote(): void {
    const el = this.root.querySelector(".pt-reg-note")!;
    if (!this.ui) {
      el.classList.add("hidden");
      return;
    }
    const err = isComboLegal(
      this.classId,
      this.ui.layout,
      this.ui.aspiration,
      this.ui.drivetrain,
      this.ui.fuel,
      this.ui.energyConverter,
    );
    if (err) {
      el.textContent = err;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  private renderTraitChips(): void {
    if (!this.ui) {
      this.traitChipsEl.replaceChildren();
      return;
    }
    const engine = encodePowertrainBuild(this.ui, this.classId);
    const traits = resolvePowertrainTraits(engine, this.classId);
    const chips = traitChips(traits);
    this.traitChipsEl.replaceChildren();
    for (const chip of chips) {
      const span = document.createElement("span");
      span.className = `pt-trait-chip pt-trait-${chip.tone}`;
      span.textContent = chip.label;
      this.traitChipsEl.appendChild(span);
    }
  }

  private renderEnergyFlow(): void {
    if (!this.ui) return;
    const fc = this.isH2FuelCell();
    const show =
      fc ||
      this.isElectricFuel() ||
      this.ui.drivetrain === "RangeExtender" ||
      this.ui.drivetrain === "FullEV";
    this.energyFlowEl.classList.toggle("hidden", !show);
    if (!show) return;

    if (fc) {
      this.energyFlowEl.innerHTML = `
        <span class="pt-flow-node">H₂ tank</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Stack</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Buffer</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">E-motors</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Wheels</span>
      `;
    } else if (this.ui.drivetrain === "RangeExtender") {
      const rexIce = this.isElectricRex() ? "REX ICE" : "ICE gen";
      this.energyFlowEl.innerHTML = `
        <span class="pt-flow-node">${rexIce}</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Inverter</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Battery</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">E-motors</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Wheels</span>
      `;
    } else if (this.isElectricBev()) {
      this.energyFlowEl.innerHTML = `
        <span class="pt-flow-node">Battery</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Inverter</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">E-motors</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Wheels</span>
      `;
    } else {
      this.energyFlowEl.innerHTML = `
        <span class="pt-flow-node">Battery</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">E-motors</span>
        <span class="pt-flow-arrow">→</span>
        <span class="pt-flow-node">Wheels</span>
      `;
    }
  }

  private renderSummary(): void {
    if (!this.ui) {
      this.summaryEl.innerHTML = "";
      this.capNoteEl.textContent = "";
      return;
    }

    const engine = encodePowertrainBuild(this.ui, this.classId);
    const traits = resolvePowertrainTraits(engine, this.classId);
    const cap = this.classInfo?.powerCapHp ?? this.powerBand().cap;
    const rawHp = Math.round(traits.peakHp);
    const effective = Math.round(effectiveHorsepower(engine, cap, this.classId));

    const fuelBurnIdx = Math.round(traits.fuelBurnMult * 100);
    const throttleIdx = Math.round(traits.throttleMult * 100);
    const stressIdx = Math.round(traits.stressMult * 100);

    const isRex = this.ui.drivetrain === "RangeExtender";
    const isEvRex = this.isElectricRex();
    const dispLabel = isEvRex ? "REX ICE" : isRex ? "ICE size" : "Displacement";
    const torqueLabel = isEvRex ? "Charge rate" : isRex ? "Generator" : "Peak torque";
    const powerLabel = isRex ? "Sustained elec." : this.isElectricBev() ? "Motor power" : "Peak power";
    const torqueValue = isRex
      ? `${Math.round(traits.generatorKw)} kW`
      : `${Math.round(traits.peakTorqueNm)} Nm`;
    this.summaryEl.innerHTML = `
      <div><span>${dispLabel}</span><strong>${traits.displacementL > 0 ? `${traits.displacementL.toFixed(1)} L` : "E-drive"}</strong></div>
      <div><span>${torqueLabel}</span><strong>${torqueValue}</strong></div>
      <div><span>${powerLabel}</span><strong>${rawHp} hp</strong></div>
      <div><span>Unit mass</span><strong>${Math.round(traits.engineMassKg + traits.drivetrainExtraMassKg)} kg</strong></div>
      <div><span>Stint index</span><strong>${fuelBurnIdx}%</strong></div>
      <div><span>Throttle</span><strong>${throttleIdx}%</strong></div>
      <div><span>Reliability</span><strong>${Math.max(0, Math.min(100, 110 - stressIdx))}%</strong></div>
      <div><span>${isRex || this.isElectricBev() ? "Battery burst" : "Deploy"}</span><strong>${traits.deployKw > 0 ? `${traits.deployKw} kW` : "—"}</strong></div>
    `;

    if (cap > 0 && rawHp > cap) {
      this.capNoteEl.textContent = `Class BoP restricts output to ${cap} hp (${effective} hp effective).`;
      this.capNoteEl.className = "engine-cap-note warn";
    } else if (cap > 0) {
      this.capNoteEl.textContent = `Within ${cap} hp class power cap.`;
      this.capNoteEl.className = "engine-cap-note ok";
    } else {
      this.capNoteEl.textContent = "";
      this.capNoteEl.className = "engine-cap-note";
    }
  }

  private renderAll(): void {
    // Drive row swaps between ICE hybrids and Battery EV / REX when fuel changes.
    this.renderDrivetrainRow();
    this.syncPickerActive();
    this.updateSectionVisibility();
    this.updateSliderLabels();
    this.renderRegNote();
    this.renderTraitChips();
    this.renderEnergyFlow();
    this.renderSummary();
  }

  private buildSuggestions(engine: EngineBuildPayload): PowertrainSuggestions {
    const traits = resolvePowertrainTraits(engine, this.classId);
    const suggestions: PowertrainSuggestions = {};
    if (traits.hybridHint && traits.hybridHint !== "None") {
      suggestions.hybrid_system = traits.hybridHint;
    } else if (traits.drivetrain === "Mechanical" || traits.isGeneratorOnly || traits.isElectricDrive) {
      suggestions.hybrid_system = "None";
    }
    if (traits.fuelSystemHint) suggestions.fuel_system = traits.fuelSystemHint;
    if (traits.transmissionHint) suggestions.transmission = traits.transmissionHint;
    if (traits.isFuelCell || traits.fuel === "Electric") suggestions.hybrid_system = "None";
    if (traits.fuel === "Electric" && traits.transmissionHint) {
      suggestions.transmission = traits.transmissionHint;
    }
    return suggestions;
  }

  private emitChange(): void {
    if (!this.ui) return;
    const engine = encodePowertrainBuild(this.ui, this.classId);
    this.renderAll();
    this.handlers.onChange(engine, this.buildSuggestions(engine));
  }
}
