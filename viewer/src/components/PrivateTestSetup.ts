import type {
  FleetCarPayload,
  GameCatalogPayload,
  MetaStatePayload,
  StartPrivateTestPayload,
  TrackSetupPresetPayload,
} from "../ws/protocol";
import { escapeHtml } from "../utils/mmUi";
import { ALL_TRACK_IDS, trackDisplayName, trackIconSvg } from "../utils/trackIcons";
import {
  presetFromSessionValues,
  resolveCarTrackPreset,
  resolveSessionSetupValues,
  SESSION_SETUP_FIELDS,
  type SessionSetupFieldDef,
} from "../utils/weekendSetup";
import { PRIVATE_TEST_DEFAULT_HOURS } from "./privateTestConstants";

export interface PrivateTestSetupHandlers {
  onConfirm: (payload: StartPrivateTestPayload) => void;
  onCancel: () => void;
}

export class PrivateTestSetup {
  readonly root: HTMLElement;
  private handlers: PrivateTestSetupHandlers;
  private meta: MetaStatePayload | null = null;
  private catalog: GameCatalogPayload | null = null;
  private trackId = ALL_TRACK_IDS[0] ?? "spa";
  private selectedCarIds = new Set<string>();
  private driverAssignments = new Map<string, Set<string>>();
  private durationHours = PRIVATE_TEST_DEFAULT_HOURS;
  private activeCarId = "";
  private carPresets = new Map<string, TrackSetupPresetPayload>();

  constructor(container: HTMLElement, handlers: PrivateTestSetupHandlers) {
    this.handlers = handlers;
    this.root = container;
    this.root.className = "private-test-overlay hidden";
    this.root.innerHTML = `
      <div class="private-test-card">
        <header class="private-test-header">
          <div>
            <span class="mm-badge mm-badge-wec">Private Test</span>
            <h2>Schedule a test session</h2>
            <p class="private-test-subtitle">Solo free practice — earn driver and crew XP, try setups, no championship impact.</p>
          </div>
          <button type="button" class="secondary-btn private-test-close" aria-label="Cancel">✕</button>
        </header>
        <div class="private-test-body">
          <section class="private-test-section">
            <h3>Track</h3>
            <div class="private-test-track-grid"></div>
          </section>
          <section class="private-test-section">
            <h3>Cars</h3>
            <div class="private-test-cars"></div>
          </section>
          <section class="private-test-section">
            <h3>Drivers</h3>
            <p class="private-test-hint">Temporary assignment for this session only — each driver on one car.</p>
            <div class="private-test-drivers"></div>
          </section>
          <section class="private-test-section">
            <h3>Duration</h3>
            <label class="private-test-duration">
              <input type="range" min="1" max="72" step="1" class="private-test-duration-slider" />
              <span class="private-test-duration-label"></span>
            </label>
          </section>
          <section class="private-test-section private-test-setup-section hidden">
            <h3>Chassis setup</h3>
            <div class="private-test-car-tabs"></div>
            <div class="private-test-sliders"></div>
          </section>
        </div>
        <footer class="private-test-footer">
          <button type="button" class="secondary-btn private-test-cancel">Cancel</button>
          <button type="button" class="primary-btn private-test-start">
            <span class="btn-icon" aria-hidden="true">🏎</span>
            Start Private Test
          </button>
        </footer>
      </div>
    `;

    this.root.querySelector(".private-test-close")!.addEventListener("click", () => {
      this.handlers.onCancel();
    });
    this.root.querySelector(".private-test-cancel")!.addEventListener("click", () => {
      this.handlers.onCancel();
    });
    this.root.querySelector(".private-test-start")!.addEventListener("click", () => {
      this.confirm();
    });
    const slider = this.root.querySelector(
      ".private-test-duration-slider",
    ) as HTMLInputElement;
    slider.addEventListener("input", () => {
      this.durationHours = Number(slider.value);
      this.updateDurationLabel();
    });
  }

  open(meta: MetaStatePayload, catalog: GameCatalogPayload | null): void {
    this.meta = meta;
    this.catalog = catalog;
    this.trackId = meta.calendar.find((e) => e.round === meta.currentRound)?.trackId
      ?? ALL_TRACK_IDS[0]
      ?? "spa";
    this.selectedCarIds = new Set((meta.fleet ?? []).map((c) => c.id));
    this.driverAssignments.clear();
    for (const car of meta.fleet ?? []) {
      const ids = (car.assignedDriverIds ?? [])
        .filter((id) => meta.driverRoster?.some((d) => d.id === id));
      this.driverAssignments.set(car.id, new Set(ids.length ? ids : []));
    }
    this.durationHours = PRIVATE_TEST_DEFAULT_HOURS;
    this.activeCarId = meta.playerCarId ?? meta.activeCarId ?? meta.fleet?.[0]?.id ?? "";
    this.initPresets();
    this.render();
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  private initPresets(): void {
    this.carPresets.clear();
    if (!this.meta) return;
    for (const car of this.meta.fleet ?? []) {
      const saved = resolveCarTrackPreset(car, this.trackId, this.meta);
      const values = resolveSessionSetupValues(
        car.build,
        this.trackId,
        saved,
        this.catalog?.partsBySlot?.suspension,
        car.classId,
      );
      this.carPresets.set(car.id, values);
    }
  }

  private fleet(): FleetCarPayload[] {
    return this.meta?.fleet ?? [];
  }

  private selectedCars(): FleetCarPayload[] {
    return this.fleet().filter((c) => this.selectedCarIds.has(c.id));
  }

  private confirm(): void {
    if (!this.meta) return;
    const carIds = this.selectedCars().map((c) => c.id);
    if (!carIds.length) return;

    const driverAssignments: StartPrivateTestPayload["driverAssignments"] = {};
    for (const carId of carIds) {
      const ids = [...(this.driverAssignments.get(carId) ?? [])];
      if (!ids.length) return;
      driverAssignments[carId] = ids;
    }

    const carSetups = carIds
      .map((carId) => {
        const preset = this.carPresets.get(carId);
        return preset ? { carId, preset } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    this.handlers.onConfirm({
      trackId: this.trackId,
      carIds,
      driverAssignments,
      durationHours: this.durationHours,
      carSetups: carSetups.length ? carSetups : undefined,
    });
  }

  private updateDurationLabel(): void {
    const label = this.root.querySelector(".private-test-duration-label");
    if (label) label.textContent = `${this.durationHours} h`;
    const slider = this.root.querySelector(
      ".private-test-duration-slider",
    ) as HTMLInputElement;
    if (slider) slider.value = String(this.durationHours);
  }

  private render(): void {
    this.renderTracks();
    this.renderCars();
    this.renderDrivers();
    this.updateDurationLabel();
    this.renderSetup();
  }

  private renderTracks(): void {
    const grid = this.root.querySelector(".private-test-track-grid")!;
    grid.replaceChildren();
    for (const trackId of ALL_TRACK_IDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `private-test-track-btn${trackId === this.trackId ? " active" : ""}`;
      btn.innerHTML = `
        <span class="private-test-track-icon">${trackIconSvg(trackId)}</span>
        <span class="private-test-track-name">${escapeHtml(trackDisplayName(trackId))}</span>
      `;
      btn.addEventListener("click", () => {
        this.trackId = trackId;
        this.initPresets();
        this.renderTracks();
        this.renderSetup();
      });
      grid.appendChild(btn);
    }
  }

  private renderCars(): void {
    const host = this.root.querySelector(".private-test-cars")!;
    host.replaceChildren();
    for (const car of this.fleet()) {
      const label = document.createElement("label");
      label.className = "private-test-car-option";
      const checked = this.selectedCarIds.has(car.id);
      label.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""} />
        <span class="fleet-car-number">#${escapeHtml(car.carNumber)}</span>
        <span class="class-badge class-${escapeHtml(car.classId)}">${escapeHtml(car.classId)}</span>
        <span>${escapeHtml(car.build.carName)}</span>
      `;
      const input = label.querySelector("input")!;
      input.addEventListener("change", () => {
        if (input.checked) this.selectedCarIds.add(car.id);
        else if (this.selectedCarIds.size > 1) this.selectedCarIds.delete(car.id);
        else input.checked = true;
        if (!this.selectedCarIds.has(this.activeCarId)) {
          this.activeCarId = [...this.selectedCarIds][0] ?? "";
        }
        this.renderDrivers();
        this.renderSetup();
      });
      host.appendChild(label);
    }
  }

  private renderDrivers(): void {
    const host = this.root.querySelector(".private-test-drivers")!;
    host.replaceChildren();
    const roster = this.meta?.driverRoster ?? [];
    if (!roster.length) {
      host.innerHTML = `<p class="private-test-hint">No drivers on roster.</p>`;
      return;
    }

    const claimedElsewhere = (driverId: string, carId: string): boolean => {
      for (const [cid, set] of this.driverAssignments) {
        if (cid !== carId && set.has(driverId)) return true;
      }
      return false;
    };

    for (const car of this.selectedCars()) {
      const block = document.createElement("div");
      block.className = "private-test-driver-block";
      block.innerHTML = `<h4>Car #${escapeHtml(car.carNumber)}</h4>`;
      const list = document.createElement("div");
      list.className = "private-test-driver-list";

      for (const driver of roster) {
        const id = driver.id?.trim();
        if (!id) continue;
        const assigned = this.driverAssignments.get(car.id) ?? new Set();
        if (!assigned.has(id) && claimedElsewhere(id, car.id)) continue;

        const label = document.createElement("label");
        label.className = "private-test-driver-option";
        const checked = assigned.has(id);
        label.innerHTML = `
          <input type="checkbox" ${checked ? "checked" : ""} />
          <span>${escapeHtml(driver.name)}</span>
          <span class="driver-roster-meta">${escapeHtml(driver.nationality)} · DRY ${driver.dryPace}</span>
        `;
        const input = label.querySelector("input")!;
        input.addEventListener("change", () => {
          let set = this.driverAssignments.get(car.id) ?? new Set();
          if (input.checked) {
            for (const [cid, other] of this.driverAssignments) {
              if (cid !== car.id) other.delete(id);
            }
            set.add(id);
          } else if (set.size > 1) {
            set.delete(id);
          } else {
            input.checked = true;
          }
          this.driverAssignments.set(car.id, set);
          this.renderDrivers();
        });
        list.appendChild(label);
      }

      block.appendChild(list);
      host.appendChild(block);
    }
  }

  private renderSetup(): void {
    const section = this.root.querySelector(".private-test-setup-section")!;
    const cars = this.selectedCars();
    section.classList.toggle("hidden", cars.length === 0);

    const tabs = this.root.querySelector(".private-test-car-tabs")!;
    tabs.replaceChildren();
    for (const car of cars) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `private-test-car-tab${car.id === this.activeCarId ? " active" : ""}`;
      btn.textContent = `#${car.carNumber}`;
      btn.addEventListener("click", () => {
        this.activeCarId = car.id;
        this.renderSetup();
      });
      tabs.appendChild(btn);
    }

    const slidersHost = this.root.querySelector(".private-test-sliders")!;
    slidersHost.replaceChildren();
    const car = cars.find((c) => c.id === this.activeCarId) ?? cars[0];
    if (!car || !this.meta) return;
    this.activeCarId = car.id;

    const preset = this.carPresets.get(car.id);
    if (!preset) return;

    const sections: Array<{ id: SessionSetupFieldDef["section"]; title: string }> = [
      { id: "aero", title: "Aero & brakes" },
      { id: "chassis", title: "Chassis" },
    ];

    for (const section of sections) {
      const fields = SESSION_SETUP_FIELDS.filter((f) => f.section === section.id);
      if (!fields.length) continue;
      const block = document.createElement("div");
      block.className = "private-test-slider-section";
      block.innerHTML = `<h4>${escapeHtml(section.title)}</h4>`;
      for (const def of fields) {
        const value = preset[def.key] as number;
        const row = document.createElement("label");
        row.className = "private-test-slider-row";
        row.innerHTML = `
          <span>${escapeHtml(def.label)}</span>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}" />
          <span class="private-test-slider-value">${def.format(value)}</span>
        `;
        const input = row.querySelector("input") as HTMLInputElement;
        const valueEl = row.querySelector(".private-test-slider-value")!;
        input.addEventListener("input", () => {
          const next = parseFloat(input.value);
          const current = this.carPresets.get(car.id);
          if (!current) return;
          this.carPresets.set(car.id, { ...current, [def.key]: next });
          valueEl.textContent = def.format(next);
        });
        block.appendChild(row);
      }
      slidersHost.appendChild(block);
    }
  }
}
