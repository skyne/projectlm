import type { MetaStatePayload, TrackSetupPresetPayload } from "../ws/protocol";
import { defaultTrackPreset } from "../utils/weekendSetup";

export interface WeekendSetupHandlers {
  onSave: (trackId: string, preset: TrackSetupPresetPayload) => void;
}

function numInput(
  label: string,
  value: number | undefined,
  step: number,
  min: number,
  max: number,
): string {
  const v = value ?? "";
  return `
    <label class="mm-field weekend-field">
      <span>${label}</span>
      <input type="number" step="${step}" min="${min}" max="${max}" value="${v}" data-field />
    </label>`;
}

export class WeekendSetupPanel {
  readonly root: HTMLElement;
  private handlers: WeekendSetupHandlers;
  private trackId = "";
  private preset: TrackSetupPresetPayload = { trackId: "" };

  constructor(container: HTMLElement, handlers: WeekendSetupHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "weekend-setup-panel hidden";
    container.appendChild(this.root);
  }

  bindTrack(meta: MetaStatePayload): void {
    const round = meta.calendar.find((e) => e.round === meta.currentRound);
    if (!round) {
      this.root.classList.add("hidden");
      return;
    }
    this.trackId = round.trackId;
    this.preset = {
      ...defaultTrackPreset(round.trackId),
      ...(meta.trackSetupPresets?.[round.trackId] ?? {}),
      trackId: round.trackId,
    };
    this.render();
    this.root.classList.remove("hidden");
  }

  private render(): void {
    const p = this.preset;
    this.root.innerHTML = `
      <div class="weekend-setup-sheet">
        <h4 class="weekend-setup-title">Track setup sheet</h4>
        <p class="weekend-setup-notes">${p.notes ? escapeHtml(p.notes) : "Baseline for this circuit — merged onto your garage platform at session start. Mid-race changes stay as small deltas."}</p>
        <div class="weekend-setup-grid">
          ${numInput("Wing baseline", p.wingBaseline, 0.01, -0.12, 0.12)}
          ${numInput("Brake bias", p.brakeBiasBaseline, 0.01, 0.4, 0.6)}
          ${numInput("Duct airflow", p.ductAirflow, 0.01, 0.5, 1)}
          ${numInput("Front RH (mm)", p.frontRideHeightMm, 1, 28, 70)}
          ${numInput("Rear RH (mm)", p.rearRideHeightMm, 1, 28, 70)}
          ${numInput("Front spring (N/m)", p.frontSpringNm, 1000, 80000, 220000)}
          ${numInput("Rear spring (N/m)", p.rearSpringNm, 1000, 80000, 220000)}
          ${numInput("Front ARB ×", p.frontArbStiffness, 0.05, 0.7, 1.3)}
          ${numInput("Rear ARB ×", p.rearArbStiffness, 0.05, 0.7, 1.3)}
          ${numInput("Front camber (°)", p.frontCamberDeg, 0.1, -4, 0)}
          ${numInput("Rear camber (°)", p.rearCamberDeg, 0.1, -4, 0)}
          ${numInput("Final drive", p.finalDriveRatio, 0.05, 3, 4.2)}
        </div>
        <div class="weekend-setup-actions">
          <button type="button" class="secondary-btn weekend-reset-btn">Reset to track default</button>
          <button type="button" class="primary-btn weekend-save-btn">Save setup sheet</button>
        </div>
      </div>
    `;

    const fields = [
      "wingBaseline",
      "brakeBiasBaseline",
      "ductAirflow",
      "frontRideHeightMm",
      "rearRideHeightMm",
      "frontSpringNm",
      "rearSpringNm",
      "frontArbStiffness",
      "rearArbStiffness",
      "frontCamberDeg",
      "rearCamberDeg",
      "finalDriveRatio",
    ] as const;

    const inputs = this.root.querySelectorAll<HTMLInputElement>("[data-field]");
    inputs.forEach((input, i) => {
      input.dataset.key = fields[i];
    });

    this.root.querySelector(".weekend-save-btn")!.addEventListener("click", () => {
      this.readForm();
      this.handlers.onSave(this.trackId, this.preset);
    });
    this.root.querySelector(".weekend-reset-btn")!.addEventListener("click", () => {
      this.preset = defaultTrackPreset(this.trackId);
      this.render();
    });
  }

  private readForm(): void {
    const next: TrackSetupPresetPayload = {
      trackId: this.trackId,
      label: this.preset.label,
      notes: this.preset.notes,
    };
    for (const input of this.root.querySelectorAll<HTMLInputElement>("[data-field]")) {
      const key = input.dataset.key as keyof TrackSetupPresetPayload;
      const raw = input.value.trim();
      if (!raw) continue;
      const v = parseFloat(raw);
      if (!Number.isFinite(v)) continue;
      (next as unknown as Record<string, unknown>)[key] = v;
    }
    this.preset = next;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
