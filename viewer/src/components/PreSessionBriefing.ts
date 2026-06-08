import type {
  FleetCarPayload,
  GameCatalogPayload,
  MetaStatePayload,
  StartRoundPayload,
  TrackSetupPresetPayload,
} from "../ws/protocol";
import {
  compileCarStats,
  DEFAULT_TIRE_GRIP,
  SIM_STAT_BARS,
  statBarHtml,
  toBarValues,
  type CompiledCarStats,
  type SimBarId,
} from "../utils/carStats";
import { escapeHtml } from "../utils/mmUi";
import { calendarRoundLabel, formatDurationLabel, trackDisplayName } from "../utils/trackIcons";
import {
  mergeBuildWithTrackPreset,
  presetFromSessionValues,
  resolveCarTrackPreset,
  resolveSessionSetupValues,
  SESSION_SETUP_FIELDS,
  trackDefaultSessionValues,
  type SessionSetupFieldDef,
} from "../utils/weekendSetup";

export interface PreSessionBriefingHandlers {
  onConfirm: (prep: StartRoundPayload) => void;
  onCancel: () => void;
}

const PREVIEW_STAT_IDS: SimBarId[] = ["grip", "cornering", "downforce", "drag"];

function formatCarNumber(carNumber: string): string {
  const trimmed = carNumber.trim();
  if (!trimmed) return "Car";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export class PreSessionBriefing {
  readonly root: HTMLElement;
  private handlers: PreSessionBriefingHandlers;
  private meta: MetaStatePayload | null = null;
  private catalog: GameCatalogPayload | null = null;
  private trackId = "";
  private activeCarId = "";
  /** Working presets per fleet car for this track. */
  private carPresets = new Map<string, TrackSetupPresetPayload>();
  private garageBaselines = new Map<string, CompiledCarStats>();

  constructor(container: HTMLElement, handlers: PreSessionBriefingHandlers) {
    this.handlers = handlers;
    this.root = container;
    this.root.className = "pre-session-overlay hidden";
    this.root.innerHTML = `
      <div class="pre-session-card">
        <div class="pre-session-header">
          <div>
            <span class="mm-badge mm-badge-wec">Pre-Session Briefing</span>
            <h2 class="pre-session-title"></h2>
            <p class="pre-session-subtitle"></p>
          </div>
          <button type="button" class="secondary-btn pre-session-close-btn" aria-label="Cancel">✕</button>
        </div>
        <div class="pre-session-body">
          <aside class="pre-session-sidebar">
            <p class="pre-session-hint">Chassis baseline per entry. Tyre compound is chosen on the grid once the session loads.</p>
            <div class="pre-session-car-tabs"></div>
          </aside>
          <div class="pre-session-main">
            <p class="pre-session-track-notes"></p>
            <div class="pre-session-sliders"></div>
          </div>
          <aside class="pre-session-stats">
            <h3>Sim preview</h3>
            <p class="pre-session-stats-hint">vs garage platform · green/red deltas</p>
            <div class="pre-session-stat-bars"></div>
            <p class="pre-session-wing-note">Wing angle applies at race start — not reflected in garage downforce preview.</p>
          </aside>
        </div>
        <div class="pre-session-footer">
          <button type="button" class="secondary-btn pre-session-reset-btn">Reset car to track default</button>
          <div class="pre-session-footer-end">
            <button type="button" class="secondary-btn pre-session-cancel-btn">Back</button>
            <button type="button" class="primary-btn pre-session-start-btn">
              <span class="btn-icon" aria-hidden="true">🏁</span>
              Start session
            </button>
          </div>
        </div>
      </div>
    `;

    this.root.querySelector(".pre-session-close-btn")!.addEventListener("click", () => {
      this.handlers.onCancel();
    });
    this.root.querySelector(".pre-session-cancel-btn")!.addEventListener("click", () => {
      this.handlers.onCancel();
    });
    this.root.querySelector(".pre-session-start-btn")!.addEventListener("click", () => {
      this.confirm();
    });
    this.root.querySelector(".pre-session-reset-btn")!.addEventListener("click", () => {
      this.resetActiveCarToTrackDefault();
    });
  }

  open(meta: MetaStatePayload, catalog: GameCatalogPayload | null): void {
    const round = meta.calendar.find((e) => e.round === meta.currentRound);
    if (!round || !meta.fleet?.length) return;

    this.meta = meta;
    this.catalog = catalog;
    this.trackId = round.trackId;
    this.carPresets.clear();
    this.garageBaselines.clear();

    for (const car of meta.fleet) {
      const saved = resolveCarTrackPreset(car, this.trackId, meta);
      const values = resolveSessionSetupValues(
        car.build,
        this.trackId,
        saved,
        catalog?.partsBySlot?.suspension,
        car.classId,
      );
      this.carPresets.set(car.id, values);
      this.garageBaselines.set(car.id, this.compileForCar(car, car.build));
    }

    this.activeCarId = meta.playerCarId ?? meta.activeCarId ?? meta.fleet[0].id;
    this.render();
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  private fleetCars(): FleetCarPayload[] {
    return this.meta?.fleet ?? [];
  }

  private activeCar(): FleetCarPayload | null {
    return this.fleetCars().find((c) => c.id === this.activeCarId) ?? null;
  }

  private confirm(): void {
    if (!this.meta || !this.trackId) return;
    const carSetups = this.fleetCars().map((car) => ({
      carId: car.id,
      preset: presetFromSessionValues(this.trackId, this.carPresets.get(car.id)!),
    }));
    this.handlers.onConfirm({
      trackId: this.trackId,
      carSetups,
    });
  }

  private resetActiveCarToTrackDefault(): void {
    const car = this.activeCar();
    if (!car) return;
    const values = trackDefaultSessionValues(
      car.build,
      this.trackId,
      this.catalog?.partsBySlot?.suspension,
      car.classId,
    );
    this.carPresets.set(car.id, values);
    this.renderSliders();
    this.renderStats();
  }

  private render(): void {
    if (!this.meta) return;
    const round = this.meta.calendar.find((e) => e.round === this.meta!.currentRound);
    if (!round) return;

    const label = round.eventName ?? trackDisplayName(round.trackId);
    const fmt = formatDurationLabel(round.format, round.eventType);
    this.root.querySelector(".pre-session-title")!.textContent = label;
    this.root.querySelector(".pre-session-subtitle")!.textContent = `${calendarRoundLabel(round.round, round.eventType)} · ${fmt}`;

    this.renderCarTabs();
    this.renderSliders();
    this.renderStats();
  }

  private renderCarTabs(): void {
    const host = this.root.querySelector(".pre-session-car-tabs")!;
    host.replaceChildren();
    for (const car of this.fleetCars()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pre-session-car-tab";
      if (car.id === this.activeCarId) btn.classList.add("active");
      btn.innerHTML = `
        <span class="pre-session-car-num">${escapeHtml(formatCarNumber(car.carNumber))}</span>
        <span class="pre-session-car-class">${escapeHtml(car.classId)}</span>
      `;
      btn.addEventListener("click", () => {
        this.activeCarId = car.id;
        this.renderCarTabs();
        this.renderSliders();
        this.renderStats();
        const notes = this.carPresets.get(car.id)?.notes;
        this.root.querySelector(".pre-session-track-notes")!.textContent =
          notes ?? "Baseline for this circuit — merged onto your garage platform at session start.";
      });
      host.appendChild(btn);
    }

    const activePreset = this.carPresets.get(this.activeCarId);
    this.root.querySelector(".pre-session-track-notes")!.textContent =
      activePreset?.notes ??
      "Baseline for this circuit — merged onto your garage platform at session start.";
  }

  private renderSliders(): void {
    const host = this.root.querySelector(".pre-session-sliders")!;
    const preset = this.carPresets.get(this.activeCarId);
    if (!preset) {
      host.innerHTML = "";
      return;
    }

    const sections: Array<{ id: SessionSetupFieldDef["section"]; title: string }> = [
      { id: "aero", title: "Aero & brakes" },
      { id: "chassis", title: "Chassis" },
      { id: "alignment", title: "Alignment & gearing" },
    ];

    host.replaceChildren();
    for (const section of sections) {
      const fields = SESSION_SETUP_FIELDS.filter((f) => f.section === section.id);
      if (!fields.length) continue;

      const block = document.createElement("div");
      block.className = "pre-session-slider-section";
      block.innerHTML = `<h4 class="chassis-setup-heading">${section.title}</h4>`;
      const grid = document.createElement("div");
      grid.className = "pre-session-slider-grid";

      for (const def of fields) {
        const value = preset[def.key] as number;
        const wrap = document.createElement("label");
        wrap.className = "engine-slider-field chassis-slider-field";
        wrap.innerHTML = `
          <span class="engine-slider-label">
            <span class="engine-slider-name">${def.label}</span>
            <span class="engine-slider-value">${def.format(value)}</span>
          </span>
          <input type="range" class="engine-slider" />
        `;
        const slider = wrap.querySelector<HTMLInputElement>(".engine-slider")!;
        slider.min = String(def.min);
        slider.max = String(def.max);
        slider.step = String(def.step);
        slider.value = String(value);
        slider.addEventListener("input", () => {
          const next = parseFloat(slider.value);
          const current = this.carPresets.get(this.activeCarId);
          if (!current) return;
          const updated = { ...current, [def.key]: next };
          this.carPresets.set(this.activeCarId, updated);
          wrap.querySelector(".engine-slider-value")!.textContent = def.format(next);
          this.renderStats();
        });
        grid.appendChild(wrap);
      }

      block.appendChild(grid);
      host.appendChild(block);
    }
  }

  private compileForCar(
    car: FleetCarPayload,
    build: import("../ws/protocol").CarBuildPayload,
  ): CompiledCarStats {
    if (!this.catalog) {
      return compileCarStats(build, {}, { classId: car.classId });
    }
    const classInfo = this.catalog.classes.find((c) => c.id === car.classId);
    return compileCarStats(build, this.catalog.partsBySlot, {
      classId: car.classId,
      tireGripMultiplier: DEFAULT_TIRE_GRIP,
      minWeightKg: classInfo?.minWeightKg,
      maxWeightKg: classInfo?.maxWeightKg,
      assemblyMassOffsetKg: classInfo?.assemblyMassOffsetKg ?? 0,
      powerCapHp: classInfo?.powerCapHp,
    });
  }

  private renderStats(): void {
    const host = this.root.querySelector(".pre-session-stat-bars")!;
    const car = this.activeCar();
    const preset = this.carPresets.get(this.activeCarId);
    if (!car || !preset || !this.catalog) {
      host.innerHTML = `<p class="pre-session-stats-empty">Loading catalog…</p>`;
      return;
    }

    const mergedBuild = mergeBuildWithTrackPreset(
      car.build,
      presetFromSessionValues(this.trackId, preset),
    );
    const compiled = this.compileForCar(car, mergedBuild);
    const baseline = this.garageBaselines.get(car.id);
    const bars = toBarValues(compiled);
    const baselineBars = baseline ? toBarValues(baseline) : undefined;

    host.replaceChildren();
    for (const id of PREVIEW_STAT_IDS) {
      const def = SIM_STAT_BARS.find((d) => d.id === id)!;
      const row = document.createElement("div");
      row.innerHTML = statBarHtml(
        def,
        bars[id],
        compiled,
        baseline,
        baselineBars?.[id],
      );
      host.appendChild(row.firstElementChild!);
    }
  }
}
