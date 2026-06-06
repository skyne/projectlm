import type { CarSessionSetupPayload } from "../ws/protocol";

export interface SetupChangeHandler {
  onSetupChange: (setup: CarSessionSetupPayload) => void;
}

function sliderRow(
  label: string,
  id: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit: string,
  display: (v: number) => string,
): string {
  return `
    <div class="setup-row">
      <label for="${id}">${label}</label>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" />
      <span class="setup-value" id="${id}-val">${display(value)}${unit}</span>
    </div>`;
}

export class WeekendSetup {
  private root: HTMLElement;
  private handler: SetupChangeHandler;
  private setup: CarSessionSetupPayload;

  constructor(root: HTMLElement, handler: SetupChangeHandler) {
    this.root = root;
    this.handler = handler;
    this.setup = {
      frontWingAngle: 0.5,
      rearWingAngle: 0.5,
      rideHeightMm: 45,
      frontSpringStiffness: 110000,
      rearSpringStiffness: 120000,
      frontDamper: 0.5,
      rearDamper: 0.5,
      engineRadiatorOpening: 0.85,
      oilCoolerOpening: 0.75,
      chargeAirCoolerOpening: 0.8,
      gearboxCoolerOpening: 0.65,
    };
    this.render();
    this.bind();
  }

  setSetup(setup: CarSessionSetupPayload): void {
    this.setup = { ...setup };
    this.syncInputs();
    this.updatePreview();
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="setup-panel">
        <h3>Car Setup</h3>
        <div class="setup-section">
          <h4>Aero</h4>
          ${sliderRow("Front wing", "fw-wing", 0, 100, 1, 50, "%", (v) => String(v))}
          ${sliderRow("Rear wing", "rw-wing", 0, 100, 1, 50, "%", (v) => String(v))}
        </div>
        <div class="setup-section">
          <h4>Suspension</h4>
          ${sliderRow("Ride height", "ride-h", 28, 80, 1, 45, " mm", (v) => String(v))}
          ${sliderRow("Front springs", "f-spring", 60, 220, 5, 110, " kN/m", (v) => String(v))}
          ${sliderRow("Rear springs", "r-spring", 60, 240, 5, 120, " kN/m", (v) => String(v))}
          ${sliderRow("Front dampers", "f-damp", 0, 100, 1, 50, "%", (v) => String(v))}
          ${sliderRow("Rear dampers", "r-damp", 0, 100, 1, 50, "%", (v) => String(v))}
        </div>
        <div class="setup-section">
          <h4>Cooling ducts</h4>
          ${sliderRow("Engine radiator", "duct-eng", 0, 100, 1, 85, "% open", (v) => String(v))}
          ${sliderRow("Oil cooler", "duct-oil", 0, 100, 1, 75, "% open", (v) => String(v))}
          ${sliderRow("Charge air", "duct-cac", 0, 100, 1, 80, "% open", (v) => String(v))}
          ${sliderRow("Gearbox", "duct-gbx", 0, 100, 1, 65, "% open", (v) => String(v))}
        </div>
        <div class="setup-preview" id="setup-preview"></div>
      </div>`;
  }

  private bind(): void {
    const bindSlider = (
      id: string,
      apply: (v: number) => void,
      display: (v: number) => string,
      unit = "",
    ) => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`)!;
      const label = this.root.querySelector(`#${id}-val`)!;
      input.addEventListener("input", () => {
        const v = Number(input.value);
        label.textContent = `${display(v)}${unit}`;
        apply(v);
        this.emit();
      });
    };

    bindSlider("fw-wing", (v) => (this.setup.frontWingAngle = v / 100), String);
    bindSlider("rw-wing", (v) => (this.setup.rearWingAngle = v / 100), String);
    bindSlider("ride-h", (v) => (this.setup.rideHeightMm = v), String, " mm");
    bindSlider(
      "f-spring",
      (v) => (this.setup.frontSpringStiffness = v * 1000),
      String,
      " kN/m",
    );
    bindSlider(
      "r-spring",
      (v) => (this.setup.rearSpringStiffness = v * 1000),
      String,
      " kN/m",
    );
    bindSlider("f-damp", (v) => (this.setup.frontDamper = v / 100), String);
    bindSlider("r-damp", (v) => (this.setup.rearDamper = v / 100), String);
    bindSlider(
      "duct-eng",
      (v) => (this.setup.engineRadiatorOpening = v / 100),
      String,
      "% open",
    );
    bindSlider(
      "duct-oil",
      (v) => (this.setup.oilCoolerOpening = v / 100),
      String,
      "% open",
    );
    bindSlider(
      "duct-cac",
      (v) => (this.setup.chargeAirCoolerOpening = v / 100),
      String,
      "% open",
    );
    bindSlider(
      "duct-gbx",
      (v) => (this.setup.gearboxCoolerOpening = v / 100),
      String,
      "% open",
    );
  }

  private syncInputs(): void {
    const set = (id: string, value: number) => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`);
      if (input) input.value = String(value);
    };
    set("fw-wing", Math.round(this.setup.frontWingAngle * 100));
    set("rw-wing", Math.round(this.setup.rearWingAngle * 100));
    set("ride-h", this.setup.rideHeightMm);
    set("f-spring", Math.round(this.setup.frontSpringStiffness / 1000));
    set("r-spring", Math.round(this.setup.rearSpringStiffness / 1000));
    set("f-damp", Math.round(this.setup.frontDamper * 100));
    set("r-damp", Math.round(this.setup.rearDamper * 100));
    set("duct-eng", Math.round(this.setup.engineRadiatorOpening * 100));
    set("duct-oil", Math.round(this.setup.oilCoolerOpening * 100));
    set("duct-cac", Math.round(this.setup.chargeAirCoolerOpening * 100));
    set("duct-gbx", Math.round(this.setup.gearboxCoolerOpening * 100));
    this.root.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((input) => {
      const val = this.root.querySelector(`#${input.id}-val`);
      if (val) val.textContent = `${input.value}${val.textContent?.replace(/^[\d.]+/, "").trim() ? "" : ""}`;
    });
    this.updatePreview();
  }

  private updatePreview(): void {
    const el = this.root.querySelector("#setup-preview");
    if (!el) return;
    const df = Math.round(
      50 * (this.setup.frontWingAngle + this.setup.rearWingAngle),
    );
    const cool = Math.round(
      (0.45 * this.setup.engineRadiatorOpening +
        0.2 * this.setup.oilCoolerOpening +
        0.25 * this.setup.chargeAirCoolerOpening +
        0.1 * this.setup.gearboxCoolerOpening) *
        100,
    );
    el.innerHTML = `
      <span>Downforce ${df}</span>
      <span>Cooling ${cool}</span>
      <span>Ride ${this.setup.rideHeightMm} mm</span>`;
  }

  private emit(): void {
    this.updatePreview();
    this.handler.onSetupChange({ ...this.setup });
  }
}
