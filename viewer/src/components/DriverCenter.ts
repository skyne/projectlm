import type {
  DriverGenderPayload,
  DriverMarketListingPayload,
  DriverMarketSource,
  DriverProfilePayload,
  DriverStatDefPayload,
  FleetCarPayload,
  GameCatalogPayload,
  MetaStatePayload,
} from "../ws/protocol";
import { formatNationality } from "../utils/countryFlag";
import {
  createCustomBronzeDriver,
  customDriverPointPool,
  driverPointBudget,
  isCustomDriver,
  isDraftCustomDriver,
  isSignedDriver,
  normalizeRosterDriver,
  statFloorValue,
  wecCatalogIdSet,
} from "../utils/driverOrigin";
import {
  maxDriverRosterForFleet,
  maxDriversPerCar,
} from "../utils/driverRosterCaps";
import { mmPanelHeader, escapeHtml } from "../utils/mmUi";
import { mountHelpTip } from "./HelpTip";

export interface DriverCenterHandlers {
  onSaveRoster: (
    roster: DriverProfilePayload[],
    assignments: Record<string, string[]>,
  ) => void;
  onRefreshMarket?: () => void;
  onSignContract?: (listingId: string) => void;
  onNegotiate?: (listing: DriverMarketListingPayload) => void;
}

const MARKET_REFRESH_COST = 50_000;

const BASELINE: Record<string, number> = {
  dryPace: 68, wetPace: 64, consistency: 68, overtaking: 66, defending: 66,
  trafficManagement: 66, rollingStart: 64, standingStart: 64, setupFeedback: 60,
  tireManagement: 66, fuelSaving: 64, composure: 68, nightPace: 64, rainRadar: 60, stamina: 68,
};

const NATS = ["GB", "FR", "DE", "IT", "US", "BR", "JP", "ES", "NL", "AU"];

const STAT_GROUPS: Array<{ id: string; label: string; keys: string[] }> = [
  { id: "pace", label: "Pace", keys: ["dryPace", "wetPace", "consistency", "nightPace"] },
  {
    id: "racecraft",
    label: "Racecraft",
    keys: ["overtaking", "defending", "trafficManagement", "rollingStart", "standingStart"],
  },
  {
    id: "endurance",
    label: "Endurance",
    keys: ["setupFeedback", "tireManagement", "fuelSaving", "composure", "stamina", "adaptability", "rainRadar"],
  },
];

const DRAG_DRIVER_MIME = "application/x-projectlm-driver-id";
const DRAG_SOURCE_CAR_MIME = "application/x-projectlm-source-car";

/** Radar axes for profile view — averages of underlying stats (0–1 normalized for chart). */
const RADAR_AXES: Array<{ label: string; keys: string[] }> = [
  { label: "Pace", keys: ["dryPace", "consistency", "nightPace"] },
  { label: "Wet", keys: ["wetPace", "rainRadar"] },
  {
    label: "Racecraft",
    keys: ["overtaking", "defending", "trafficManagement", "rollingStart", "standingStart"],
  },
  { label: "Stamina", keys: ["stamina", "tireManagement", "fuelSaving"] },
  { label: "Technical", keys: ["setupFeedback", "adaptability"] },
  { label: "Mental", keys: ["composure"] },
];

type DriverTab = "roster" | "market";
type EditorView = "build" | "profile";
type MarketFilter = "all" | DriverMarketSource;

function driverStatValue(
  d: DriverProfilePayload,
  key: string,
  def?: DriverStatDefPayload,
): number {
  const v = d[key as keyof DriverProfilePayload] as number;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return BASELINE[key] ?? def?.min ?? 66;
}

function ensureDriverStats(d: DriverProfilePayload, defs: DriverStatDefPayload[]): DriverProfilePayload {
  if (!defs.length) return d;
  let changed = false;
  const out = { ...d };
  for (const def of defs) {
    const v = out[def.key as keyof DriverProfilePayload] as number;
    if (typeof v !== "number" || Number.isNaN(v)) {
      (out[def.key as keyof DriverProfilePayload] as number) = BASELINE[def.key] ?? def.min;
      changed = true;
    }
  }
  return changed ? out : d;
}

function pointCost(d: DriverProfilePayload, defs: DriverStatDefPayload[]): number {
  let cost = 0;
  for (const def of defs) {
    const v = driverStatValue(d, def.key, def);
    const base = BASELINE[def.key] ?? 66;
    cost += Math.max(0, v - base) * def.costPerPoint;
  }
  const tierBonus = d.tier === "Platinum" ? 80 : d.tier === "Gold" ? 40 : 0;
  return Math.round(cost + tierBonus);
}

function newDriverId(): string {
  return crypto.randomUUID();
}

function ensureDriverId(driver: DriverProfilePayload): DriverProfilePayload {
  return { ...driver, id: driver.id?.trim() || newDriverId() };
}

function defaultRoster(team: string, catalog: GameCatalogPayload | null): DriverProfilePayload[] {
  return [
    createCustomBronzeDriver(catalog, { name: `${team} Ace`, nationality: "GB", gender: "female" }),
    createCustomBronzeDriver(catalog, { name: `${team} Endurance`, nationality: "FR", gender: "male" }),
  ];
}

function sanitizeDriverIds(
  driverIds: string[] | undefined,
  roster: DriverProfilePayload[],
): string[] {
  if (!driverIds?.length) return [];
  const valid = new Set(
    roster.map((d) => d.id?.trim()).filter((id): id is string => Boolean(id)),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of driverIds) {
    const trimmed = id.trim();
    if (!valid.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function assignmentsFromFleet(
  fleet: FleetCarPayload[],
  roster: DriverProfilePayload[],
): Record<string, string[]> {
  const rosterIds = roster.map((d) => d.id!).filter(Boolean);
  const out: Record<string, string[]> = {};
  for (const car of fleet) {
    const sanitized = sanitizeDriverIds(car.assignedDriverIds, roster);
    if (sanitized.length > 0) {
      out[car.id] = sanitized;
    } else if (fleet.length === 1) {
      out[car.id] = [...rosterIds];
    } else {
      out[car.id] = [];
    }
  }
  return out;
}

function sourceLabel(source: DriverMarketSource): string {
  switch (source) {
    case "wec_active":
      return "WEC grid";
    case "wec_retired":
      return "Retired legend";
    case "free_agent":
      return "Free agent";
    default:
      return "Prospect";
  }
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

function normalizedStat(
  d: DriverProfilePayload,
  key: string,
  def?: DriverStatDefPayload,
): number {
  const v = d[key as keyof DriverProfilePayload] as number;
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  const min = def?.min ?? 50;
  const max = def?.max ?? 98;
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

function radarAxisNormalized(
  d: DriverProfilePayload,
  keys: string[],
  defByKey: Map<string, DriverStatDefPayload>,
): number {
  if (!keys.length) return 0;
  const sum = keys.reduce(
    (acc, key) => acc + normalizedStat(d, key, defByKey.get(key)),
    0,
  );
  return sum / keys.length;
}

function radarAxisScore(d: DriverProfilePayload, keys: string[]): number {
  const vals = keys
    .map((key) => d[key as keyof DriverProfilePayload] as number)
    .filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function renderRadarSvg(
  d: DriverProfilePayload,
  defs: DriverStatDefPayload[],
): string {
  const defByKey = new Map(defs.map((def) => [def.key, def]));
  const values = RADAR_AXES.map((axis) => radarAxisNormalized(d, axis.keys, defByKey));
  const cx = 120;
  const cy = 120;
  const r = 82;
  const n = RADAR_AXES.length;

  const polar = (i: number, radius: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  };

  const rings = [0.25, 0.5, 0.75, 1].map((frac) => {
    const pts = Array.from({ length: n }, (_, i) => polar(i, r * frac));
    return `<polygon class="driver-radar-ring" points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" />`;
  }).join("");

  const spokes = Array.from({ length: n }, (_, i) => {
    const p = polar(i, r);
    return `<line class="driver-radar-spoke" x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" />`;
  }).join("");

  const polyPts = values
    .map((v, i) => {
      const p = polar(i, r * v);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

  const labels = RADAR_AXES.map((axis, i) => {
    const p = polar(i, r * 1.16);
    return `<text class="driver-radar-label" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(axis.label)}</text>`;
  }).join("");

  const dots = values
    .map((v, i) => {
      const p = polar(i, r * v);
      return `<circle class="driver-radar-vertex" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" />`;
    })
    .join("");

  return `
    <svg class="driver-radar-chart" viewBox="0 0 240 240" role="img" aria-label="Driver attribute radar">
      ${rings}
      ${spokes}
      <polygon class="driver-radar-fill" points="${polyPts}" />
      <polygon class="driver-radar-stroke" points="${polyPts}" />
      ${dots}
      ${labels}
    </svg>
  `;
}

function carAssignmentLabel(car: FleetCarPayload): string {
  return `#${car.carNumber} ${car.classId}`;
}

function natSelectOptions(selected: string): string {
  return NATS.map((n) => {
    const label = formatNationality(n);
    return `<option value="${n}"${n === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function genderBadge(gender?: DriverGenderPayload): string {
  if (!gender) return "";
  const cls = gender === "female" ? "female" : "male";
  const letter = gender === "female" ? "F" : "M";
  return `<span class="driver-gender-badge ${cls}" title="${gender === "female" ? "Female" : "Male"}">${letter}</span>`;
}

function driverAssignedCarId(
  driverId: string,
  fleet: FleetCarPayload[],
  assignments: Record<string, string[]>,
): string | null {
  for (const car of fleet) {
    if ((assignments[car.id] ?? []).includes(driverId)) return car.id;
  }
  return null;
}

export class DriverCenter {
  readonly root: HTMLElement;
  private tabBarEl!: HTMLElement;
  private introEl!: HTMLElement;
  private rosterPanelEl!: HTMLElement;
  private marketPanelEl!: HTMLElement;
  private rosterEl!: HTMLElement;
  private rosterBenchEl!: HTMLElement;
  private heroEl!: HTMLElement;
  private editorEl!: HTMLElement;
  private assignmentEl!: HTMLElement;
  private marketGridEl!: HTMLElement;
  private marketMetaEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private handlers: DriverCenterHandlers;
  private catalog: GameCatalogPayload | null = null;
  private meta: MetaStatePayload | null = null;
  private roster: DriverProfilePayload[] = [];
  private market: DriverMarketListingPayload[] = [];
  private fleet: FleetCarPayload[] = [];
  private assignments: Record<string, string[]> = {};
  private selected = 0;
  private activeTab: DriverTab = "roster";
  private marketFilter: MarketFilter = "all";
  private editorView: EditorView = "build";
  private editorViewToggleEl!: HTMLElement;

  constructor(container: HTMLElement, handlers: DriverCenterHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel driver-center panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Driver Center", { subtitle: "Roster builder · WEC driver market · contract offers", badge: "DRIVERS" })}
      <p class="driver-center-intro"></p>
      <div class="driver-center-tabs">
        <button type="button" class="driver-tab-btn active" data-tab="roster">My roster</button>
        <button type="button" class="driver-tab-btn" data-tab="market">Driver market</button>
      </div>
      <div class="driver-roster-panel">
        <div class="driver-center-layout">
          <aside class="driver-roster-col driver-center-pane">
            <h3 class="driver-section-title">Your roster</h3>
            <p class="wizard-hint driver-roster-hint">Drag a driver onto a car to assign. Drop on the bench to unassign.</p>
            <div class="driver-roster-bench" data-drop-zone="bench">
              <span class="driver-roster-bench-label">Unassigned bench</span>
              <div class="driver-roster-bench-chips"></div>
            </div>
            <ul class="driver-roster-list"></ul>
            <div class="driver-roster-actions">
              <button type="button" class="secondary-btn driver-add-btn">+ Add driver</button>
              <button type="button" class="secondary-btn driver-random-btn">Randomize</button>
            </div>
          </aside>
          <main class="driver-editor-col driver-center-pane">
            <div class="driver-editor-head">
              <h3 class="driver-section-title">Driver editor</h3>
              <div class="driver-editor-view-toggle" role="tablist" aria-label="Editor view">
                <button type="button" class="driver-view-btn active" data-view="build" role="tab" aria-selected="true">Build</button>
                <button type="button" class="driver-view-btn" data-view="profile" role="tab" aria-selected="false">Profile</button>
              </div>
            </div>
            <div class="driver-editor-hero"></div>
            <div class="driver-editor-card"></div>
          </main>
          <aside class="driver-assign-col driver-center-pane">
            <h3 class="driver-section-title">Car assignments</h3>
            <p class="wizard-hint driver-assign-hint">Each driver can only be on one car. Drag between cars to reassign.</p>
            <div class="driver-assignment-grid"></div>
            <div class="driver-editor-actions">
              <button type="button" class="primary-btn driver-save-btn">Save roster &amp; assignments</button>
            </div>
          </aside>
        </div>
      </div>
      <div class="driver-market-panel hidden">
        <div class="driver-market-toolbar">
          <div class="driver-market-filters"></div>
          <div class="driver-market-actions">
            <p class="driver-market-meta"></p>
            <button type="button" class="secondary-btn driver-market-refresh">Refresh listings (${formatMoney(MARKET_REFRESH_COST)})</button>
          </div>
        </div>
        <p class="wizard-hint driver-market-hint">Sign pre-built templates from the 2026 WEC grid, retired endurance legends, or generated prospects — no manual stat sliders required.</p>
        <div class="driver-market-grid"></div>
      </div>
      <p class="driver-center-status"></p>
    `;
    container.appendChild(this.root);

    this.introEl = this.root.querySelector(".driver-center-intro")!;
    this.tabBarEl = this.root.querySelector(".driver-center-tabs")!;
    this.rosterPanelEl = this.root.querySelector(".driver-roster-panel")!;
    this.marketPanelEl = this.root.querySelector(".driver-market-panel")!;
    this.rosterEl = this.root.querySelector(".driver-roster-list")!;
    this.rosterBenchEl = this.root.querySelector(".driver-roster-bench-chips")!;
    this.heroEl = this.root.querySelector(".driver-editor-hero")!;
    this.editorEl = this.root.querySelector(".driver-editor-card")!;
    this.editorViewToggleEl = this.root.querySelector(".driver-editor-view-toggle")!;
    this.assignmentEl = this.root.querySelector(".driver-assignment-grid")!;
    this.marketGridEl = this.root.querySelector(".driver-market-grid")!;
    this.marketMetaEl = this.root.querySelector(".driver-market-meta")!;
    this.statusEl = this.root.querySelector(".driver-center-status")!;

    for (const btn of this.tabBarEl.querySelectorAll(".driver-tab-btn")) {
      btn.addEventListener("click", () => {
        const tab = (btn as HTMLElement).dataset.tab as DriverTab;
        this.setTab(tab);
      });
    }

    this.root.querySelector(".driver-add-btn")!.addEventListener("click", () => {
      if (this.roster.length >= this.rosterCap()) {
        this.setStatus(`Roster full (${this.rosterCap()} drivers for ${this.fleet.length || 1} car(s))`);
        return;
      }
      this.roster.push(createCustomBronzeDriver(this.catalog));
      this.selected = this.roster.length - 1;
      this.syncAssignmentsAfterRosterChange();
      this.render();
    });

    this.root.querySelector(".driver-random-btn")!.addEventListener("click", () => {
      const count = Math.max(2, this.roster.length || 2);
      this.roster = Array.from({ length: count }, () => createCustomBronzeDriver(this.catalog));
      this.selected = 0;
      this.syncAssignmentsAfterRosterChange();
      this.render();
    });

    this.root.querySelector(".driver-save-btn")!.addEventListener("click", () => {
      const err = this.validateBeforeSave();
      if (err) {
        this.setStatus(err);
        return;
      }
      this.handlers.onSaveRoster(
        this.roster.map((d) =>
          ensureDriverId(
            isCustomDriver(d, this.catalog)
              ? { ...d, tier: "Bronze", origin: "custom" as const }
              : d,
          ),
        ),
        this.assignments,
      );
      this.setStatus("Saving roster…");
    });

    this.root.querySelector(".driver-market-refresh")!.addEventListener("click", () => {
      this.handlers.onRefreshMarket?.();
    });

    const bench = this.root.querySelector(".driver-roster-bench") as HTMLElement;
    bench.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      bench.classList.add("drag-over");
    });
    bench.addEventListener("dragleave", (e) => {
      if (!bench.contains(e.relatedTarget as Node)) bench.classList.remove("drag-over");
    });
    bench.addEventListener("drop", (e) => {
      e.preventDefault();
      bench.classList.remove("drag-over");
      const payload = this.readDragPayload(e);
      if (payload) this.unassignDriver(payload.driverId);
    });

    this.assignmentEl.addEventListener("dragover", (e) => {
      const zone = (e.target as HTMLElement).closest(".driver-car-dropzone") as HTMLElement | null;
      if (!zone) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      zone.classList.add("drag-over");
    });
    this.assignmentEl.addEventListener("dragleave", (e) => {
      const zone = (e.target as HTMLElement).closest(".driver-car-dropzone") as HTMLElement | null;
      if (zone && !zone.contains(e.relatedTarget as Node)) zone.classList.remove("drag-over");
    });
    this.assignmentEl.addEventListener("drop", (e) => {
      const zone = (e.target as HTMLElement).closest(".driver-car-dropzone") as HTMLElement | null;
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove("drag-over");
      const payload = this.readDragPayload(e);
      const carId = zone.dataset.carId ?? "";
      if (payload && carId) this.assignDriverToCar(payload.driverId, carId);
    });

    for (const btn of this.editorViewToggleEl.querySelectorAll(".driver-view-btn")) {
      btn.addEventListener("click", () => {
        this.editorView = (btn as HTMLElement).dataset.view as EditorView;
        this.syncEditorViewToggle();
        this.renderEditorBody();
      });
    }
  }

  setCatalog(catalog: GameCatalogPayload): void {
    this.catalog = catalog;
    if (this.roster.length) {
      this.roster = this.roster.map((d) => normalizeRosterDriver(d, catalog));
    }
    this.renderIntro();
    this.render();
  }

  update(meta: MetaStatePayload): void {
    this.meta = meta;
    const defs = this.catalog?.driverStatDefs ?? [];
    if (meta.driverRoster?.length) {
      this.roster = meta.driverRoster.map((d) =>
        ensureDriverStats(
          normalizeRosterDriver(ensureDriverId({ ...d }), this.catalog),
          defs,
        ),
      );
    } else if (!this.roster.length) {
      this.roster = defaultRoster(meta.teamName, this.catalog);
    }
    this.market = (meta.driverMarket ?? []).map((l) => ({ ...l, driver: { ...l.driver } }));
    this.fleet = (meta.fleet ?? []).map((c) => ({ ...c }));
    this.assignments = assignmentsFromFleet(this.fleet, this.roster);
    this.selected = Math.min(this.selected, Math.max(0, this.roster.length - 1));
    this.renderIntro();
    this.render();
  }

  setStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }

  private setTab(tab: DriverTab): void {
    this.activeTab = tab;
    for (const btn of this.tabBarEl.querySelectorAll(".driver-tab-btn")) {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.tab === tab);
    }
    this.rosterPanelEl.classList.toggle("hidden", tab !== "roster");
    this.marketPanelEl.classList.toggle("hidden", tab !== "market");
    this.render();
  }

  private renderIntro(): void {
    const count = this.catalog?.lemansDriverCount ?? 0;
    const pool = customDriverPointPool(this.catalog);
    this.introEl.textContent =
      `${count} real WEC drivers in the database. Custom bronze builds start from the WEC bronze baseline ` +
      `with a ${pool}-point budget — sign stars from the driver market for fixed stats.`;
  }

  private customPool(): number {
    return customDriverPointPool(this.catalog);
  }

  private rosterBudget(d: DriverProfilePayload) {
    return driverPointBudget(d, this.statDefs(), this.catalog, pointCost);
  }

  private rosterCap(): number {
    return maxDriverRosterForFleet(this.fleet.length || 1, this.catalog ?? undefined);
  }

  private perCarDriverCap(): number {
    return maxDriversPerCar(this.catalog ?? undefined);
  }

  private syncAssignmentsAfterRosterChange(): void {
    for (const car of this.fleet) {
      this.assignments[car.id] = sanitizeDriverIds(this.assignments[car.id], this.roster);
    }
    if (this.fleet.length === 1) {
      const car = this.fleet[0];
      if (!(this.assignments[car.id]?.length)) {
        this.assignments[car.id] = this.roster.map((d) => d.id!).filter(Boolean);
      }
    }
  }

  private validateBeforeSave(): string | null {
    if (this.roster.length < 1) return "Add at least one driver";
    const cap = this.rosterCap();
    if (this.roster.length > cap) {
      return `Roster cannot exceed ${cap} drivers for ${this.fleet.length || 1} car(s)`;
    }
    const pool = this.customPool();
    const defs = this.catalog?.driverStatDefs ?? [];
    for (const driver of this.roster) {
      if (!driver.name.trim()) return "Every driver needs a name";
      if (!isCustomDriver(driver, this.catalog)) continue;
      const cost = pointCost({ ...driver, tier: "Bronze" }, defs);
      if (cost > pool) {
        return `${driver.name.trim() || "A driver"} exceeds the ${pool}-point budget (${cost} pts)`;
      }
    }
    const perCarCap = this.perCarDriverCap();
    for (const car of this.fleet) {
      const assigned = this.assignments[car.id] ?? [];
      if (assigned.length < 1) {
        return `Car #${car.carNumber} needs at least one assigned driver`;
      }
      if (assigned.length > perCarCap) {
        return `Car #${car.carNumber} cannot have more than ${perCarCap} assigned drivers`;
      }
    }
    const claimed = new Map<string, string>();
    for (const car of this.fleet) {
      for (const driverId of this.assignments[car.id] ?? []) {
        const other = claimed.get(driverId);
        if (other && other !== car.id) {
          const driver = this.roster.find((d) => d.id === driverId);
          return `${driver?.name ?? "A driver"} cannot be assigned to more than one car`;
        }
        claimed.set(driverId, car.id);
      }
    }
    return null;
  }

  private filteredMarket(): DriverMarketListingPayload[] {
    if (this.marketFilter === "all") return this.market;
    return this.market.filter((l) => l.source === this.marketFilter);
  }

  private render(): void {
    if (this.activeTab === "roster") {
      this.renderRoster();
      this.renderEditor();
      this.renderAssignments();
    } else {
      this.renderMarket();
    }
  }

  private statDefs(): DriverStatDefPayload[] {
    return this.catalog?.driverStatDefs ?? [];
  }

  private driverPointCost(d: DriverProfilePayload): number {
    const defs = this.statDefs();
    return defs.length ? pointCost(d, defs) : 0;
  }

  private canAffordStatBump(
    d: DriverProfilePayload,
    def: DriverStatDefPayload,
    defs: DriverStatDefPayload[],
    pool: number,
  ): boolean {
    const val = driverStatValue(d, def.key, def);
    if (val >= def.max) return false;
    const bumped = { ...d, [def.key]: val + 1, tier: "Bronze", origin: "custom" as const };
    return pointCost(bumped, defs) <= pool;
  }

  private assignDriverToCar(driverId: string, carId: string): void {
    if (!driverId || !carId) return;
    const perCarCap = this.perCarDriverCap();
    const targetIds = [...(this.assignments[carId] ?? [])];
    const alreadyOnCar = targetIds.includes(driverId);
    if (!alreadyOnCar && targetIds.length >= perCarCap) {
      const car = this.fleet.find((c) => c.id === carId);
      this.setStatus(`Car #${car?.carNumber ?? "?"} already has ${perCarCap} drivers`);
      return;
    }
    for (const car of this.fleet) {
      this.assignments[car.id] = (this.assignments[car.id] ?? []).filter((id) => id !== driverId);
    }
    const current = [...(this.assignments[carId] ?? [])];
    if (!current.includes(driverId)) current.push(driverId);
    this.assignments[carId] = current;
    this.renderRoster();
    this.renderAssignments();
  }

  private unassignDriver(driverId: string): void {
    if (!driverId) return;
    for (const car of this.fleet) {
      this.assignments[car.id] = (this.assignments[car.id] ?? []).filter((id) => id !== driverId);
    }
    this.renderRoster();
    this.renderAssignments();
  }

  private readDragPayload(e: DragEvent): { driverId: string; sourceCarId: string | null } | null {
    const driverId = e.dataTransfer?.getData(DRAG_DRIVER_MIME)?.trim();
    if (!driverId) return null;
    const sourceCarId = e.dataTransfer?.getData(DRAG_SOURCE_CAR_MIME)?.trim() || null;
    return { driverId, sourceCarId };
  }

  private dragPreviewHost: HTMLElement | null = null;

  private installDragPreview(e: DragEvent, driverId: string): void {
    const driver = this.roster.find((d) => d.id === driverId);
    if (!driver || !e.dataTransfer) return;

    const preview = document.createElement("div");
    preview.className = "driver-drag-preview";
    preview.innerHTML = `
      <span class="driver-drag-grip" aria-hidden="true">⠿</span>
      <span class="driver-tier tier-${escapeHtml(driver.tier.toLowerCase())}">${escapeHtml(driver.tier)}</span>
      <span class="driver-chip-flag" aria-hidden="true">${formatNationality(driver.nationality, { showCode: false })}</span>
      ${genderBadge(driver.gender)}
      <span class="driver-drag-preview-name">${escapeHtml(driver.name)}</span>
    `;
    preview.style.position = "fixed";
    preview.style.top = "-1000px";
    preview.style.left = "-1000px";
    document.body.appendChild(preview);
    this.dragPreviewHost = preview;
    const w = preview.offsetWidth;
    const h = preview.offsetHeight;
    e.dataTransfer.setDragImage(preview, Math.round(w / 2), Math.round(h / 2));
  }

  private clearDragPreview(): void {
    this.dragPreviewHost?.remove();
    this.dragPreviewHost = null;
  }

  private bindDriverDrag(el: HTMLElement, driverId: string, sourceCarId: string | null): void {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      if (!driverId) {
        e.preventDefault();
        return;
      }
      e.dataTransfer?.setData(DRAG_DRIVER_MIME, driverId);
      e.dataTransfer?.setData(DRAG_SOURCE_CAR_MIME, sourceCarId ?? "");
      e.dataTransfer!.effectAllowed = "move";
      this.installDragPreview(e, driverId);
      el.classList.add("driver-dragging");
      el.closest(".driver-roster-item")?.classList.add("driver-dragging");
      el.closest(".driver-roster-bench")?.classList.add("bench-drag-active");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("driver-dragging");
      el.closest(".driver-roster-item")?.classList.remove("driver-dragging");
      el.closest(".driver-roster-bench")?.classList.remove("bench-drag-active");
      this.clearDragPreview();
      this.root.querySelectorAll(".drag-over").forEach((node) => node.classList.remove("drag-over"));
    });
  }

  private renderDriverChip(
    d: DriverProfilePayload,
    sourceCarId: string | null,
    opts?: { compact?: boolean },
  ): string {
    const id = d.id ?? "";
    const compact = opts?.compact ?? false;
    return `
      <div class="driver-assign-chip ${compact ? "compact" : ""}" data-driver-id="${escapeHtml(id)}" data-source-car="${escapeHtml(sourceCarId ?? "")}" title="Drag to assign or move">
        <span class="driver-drag-grip" aria-hidden="true">⠿</span>
        <span class="driver-tier tier-${escapeHtml(d.tier.toLowerCase())}">${escapeHtml(d.tier)}</span>
        <span class="driver-chip-flag" aria-hidden="true">${formatNationality(d.nationality, { showCode: false })}</span>
        ${genderBadge(d.gender)}
        <span class="driver-assign-chip-name">${escapeHtml(d.name)}</span>
        ${sourceCarId ? `<button type="button" class="driver-assign-chip-remove" data-driver-id="${escapeHtml(id)}" title="Unassign">×</button>` : ""}
      </div>
    `;
  }

  private bindDriverChips(container: HTMLElement): void {
    for (const chip of container.querySelectorAll<HTMLElement>(".driver-assign-chip")) {
      const driverId = chip.dataset.driverId ?? "";
      const sourceCarId = chip.dataset.sourceCar?.trim() || null;
      this.bindDriverDrag(chip, driverId, sourceCarId);
    }
    for (const btn of container.querySelectorAll<HTMLButtonElement>(".driver-assign-chip-remove")) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.unassignDriver(btn.dataset.driverId ?? "");
      });
    }
  }

  private unassignedDrivers(): DriverProfilePayload[] {
    return this.roster.filter((d) => {
      if (!d.id) return false;
      return !driverAssignedCarId(d.id, this.fleet, this.assignments);
    });
  }

  private renderRosterBench(): void {
    const unassigned = this.unassignedDrivers();
    if (!unassigned.length) {
      this.rosterBenchEl.innerHTML =
        `<span class="driver-roster-bench-empty">Drop a driver here to unassign</span>`;
      return;
    }
    this.rosterBenchEl.innerHTML = unassigned
      .map((d) => this.renderDriverChip(d, null))
      .join("");
    this.bindDriverChips(this.rosterBenchEl);
  }

  private renderRoster(): void {
    const defsReady = this.statDefs().length > 0;
    const rosterCap = this.rosterCap();
    const rosterTitle = this.root.querySelector(".driver-roster-col .driver-section-title");
    if (rosterTitle) {
      rosterTitle.textContent = `Your roster (${this.roster.length}/${rosterCap})`;
    }
    const addBtn = this.root.querySelector<HTMLButtonElement>(".driver-add-btn");
    if (addBtn) {
      addBtn.disabled = this.roster.length >= rosterCap;
      addBtn.title =
        this.roster.length >= rosterCap
          ? `Roster full — cap is ${rosterCap} for ${this.fleet.length || 1} car(s)`
          : "Add a custom bronze driver";
    }

    this.renderRosterBench();

    this.rosterEl.innerHTML = this.roster.map((d, i) => {
      const budget = defsReady ? this.rosterBudget(d) : null;
      const signed = budget?.signed ?? false;
      const spare = budget?.spare ?? 0;
      const overBudget = budget ? budget.custom && budget.cost > budget.pool : false;
      const hasSpare = spare > 0 && !overBudget;
      const assignedCarId = d.id ? driverAssignedCarId(d.id, this.fleet, this.assignments) : null;
      const assignedCar = assignedCarId ? this.fleet.find((c) => c.id === assignedCarId) : null;
      const assignLine = assignedCar
        ? carAssignmentLabel(assignedCar)
        : "Unassigned";
      return `
      <li class="driver-roster-item ${i === this.selected ? "active" : ""} ${overBudget ? "over-budget" : ""} ${hasSpare ? "has-spare-points" : ""} ${signed ? "signed" : ""}" data-idx="${i}">
        <span class="driver-roster-drag" draggable="true" data-driver-id="${escapeHtml(d.id ?? "")}" title="Drag to a car">⠿</span>
        <button type="button" class="driver-roster-btn">
          <span class="driver-roster-flag" aria-hidden="true">${formatNationality(d.nationality, { showCode: false }) || "🏁"}</span>
          <span class="driver-roster-body">
            <span class="driver-roster-top">
              <strong class="driver-roster-name">${escapeHtml(d.name)}</strong>
              <span class="driver-tier tier-${escapeHtml(d.tier.toLowerCase())}">${escapeHtml(d.tier)}</span>
              ${genderBadge(d.gender)}
            </span>
            <span class="driver-roster-meta">
              DRY ${d.dryPace}
              ${signed
                ? ` · ${budget!.cost} pts`
                : defsReady && budget
                  ? ` · ${budget.cost}/${budget.pool} pts`
                  : ""}
              ${hasSpare ? ` · <span class="driver-roster-spare-inline">${spare} free</span>` : ""}
            </span>
            <span class="driver-roster-assign ${assignedCar ? "assigned" : "unassigned"}">${escapeHtml(assignLine)}</span>
          </span>
        </button>
        ${this.roster.length > 1 ? `<button type="button" class="driver-remove-btn" data-remove="${i}" title="Remove">✕</button>` : ""}
      </li>
    `;
    }).join("");

    for (const handle of this.rosterEl.querySelectorAll<HTMLElement>(".driver-roster-drag")) {
      this.bindDriverDrag(handle, handle.dataset.driverId ?? "", null);
    }

    for (const btn of this.rosterEl.querySelectorAll(".driver-roster-btn")) {
      btn.addEventListener("click", () => {
        const li = btn.closest(".driver-roster-item") as HTMLElement;
        this.selected = Number(li.dataset.idx);
        this.render();
      });
    }
    for (const btn of this.rosterEl.querySelectorAll(".driver-remove-btn")) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number((btn as HTMLElement).dataset.remove);
        const removedId = this.roster[idx]?.id;
        this.roster.splice(idx, 1);
        this.selected = Math.min(this.selected, this.roster.length - 1);
        if (removedId) {
          for (const car of this.fleet) {
            this.assignments[car.id] = (this.assignments[car.id] ?? []).filter(
              (id) => id !== removedId,
            );
          }
        }
        this.syncAssignmentsAfterRosterChange();
        this.render();
      });
    }
  }

  private renderMarket(): void {
    const budget = this.meta?.budget ?? 0;
    const listings = this.filteredMarket();
    this.marketMetaEl.textContent = `Budget ${formatMoney(budget)} · ${listings.length} listing${listings.length === 1 ? "" : "s"}`;

    const filtersEl = this.root.querySelector(".driver-market-filters")!;
    const filters: Array<{ id: MarketFilter; label: string }> = [
      { id: "all", label: "All" },
      { id: "wec_active", label: "WEC grid" },
      { id: "wec_retired", label: "Legends" },
      { id: "free_agent", label: "Free agents" },
      { id: "prospect", label: "Prospects" },
    ];
    filtersEl.innerHTML = filters.map((f) => `
      <button type="button" class="driver-market-filter ${this.marketFilter === f.id ? "active" : ""}" data-filter="${f.id}">${f.label}</button>
    `).join("");
    for (const btn of filtersEl.querySelectorAll(".driver-market-filter")) {
      btn.addEventListener("click", () => {
        this.marketFilter = (btn as HTMLElement).dataset.filter as MarketFilter;
        this.renderMarket();
      });
    }

    if (!listings.length) {
      this.marketGridEl.innerHTML =
        `<p class="wizard-hint">No listings in this category — try another filter or refresh the market.</p>`;
      return;
    }

    this.marketGridEl.innerHTML = listings.map((listing) => {
      const d = listing.driver;
      const canAfford = budget >= listing.signingFee;
      const teamLine = listing.contractedTeam
        ? `<span class="driver-market-team">${escapeHtml(listing.contractedTeam)}</span>`
        : "";
      return `
        <article class="driver-market-card source-${listing.source}">
          <header class="driver-market-card-head">
            <span class="driver-tier tier-${escapeHtml(d.tier.toLowerCase())}">${escapeHtml(d.tier)}</span>
            <span class="driver-market-source">${escapeHtml(sourceLabel(listing.source))}</span>
          </header>
          <h4 class="driver-market-name">${escapeHtml(d.name)}</h4>
          <p class="driver-market-stats">${escapeHtml(formatNationality(d.nationality))}${d.gender ? ` · ${d.gender === "female" ? "F" : "M"}` : ""} · DRY ${d.dryPace} · WET ${d.wetPace} · CON ${d.consistency}</p>
          ${teamLine}
          <p class="driver-market-tagline">${escapeHtml(listing.tagline)}</p>
          <div class="driver-market-fees">
            <span>Signing ${formatMoney(listing.signingFee)}</span>
            <span class="driver-market-salary">${formatMoney(listing.salaryPerRace)}/race</span>
          </div>
          <div class="driver-market-actions-row">
            <button type="button" class="primary-btn driver-negotiate-btn" data-listing="${escapeHtml(listing.id)}">
              Negotiate
            </button>
            <button type="button" class="secondary-btn driver-sign-btn" data-listing="${escapeHtml(listing.id)}" ${canAfford ? "" : "disabled"} title="Quick sign at listed terms">
              Quick sign
            </button>
          </div>
        </article>
      `;
    }).join("");

    for (const btn of this.marketGridEl.querySelectorAll(".driver-sign-btn")) {
      btn.addEventListener("click", () => {
        const listingId = (btn as HTMLElement).dataset.listing!;
        this.handlers.onSignContract?.(listingId);
      });
    }
    for (const btn of this.marketGridEl.querySelectorAll(".driver-negotiate-btn")) {
      btn.addEventListener("click", () => {
        const listingId = (btn as HTMLElement).dataset.listing!;
        const listing = this.market.find((l) => l.id === listingId);
        if (listing) this.handlers.onNegotiate?.(listing);
      });
    }
  }

  private renderAssignments(): void {
    if (!this.fleet.length) {
      this.assignmentEl.innerHTML =
        `<p class="wizard-hint">Buy a car in Team HQ before assigning drivers.</p>`;
      return;
    }

    this.assignmentEl.innerHTML = this.fleet
      .map((car) => {
        const assignedIds = this.assignments[car.id] ?? [];
        const assignedDrivers = assignedIds
          .map((id) => this.roster.find((d) => d.id === id))
          .filter((d): d is DriverProfilePayload => Boolean(d));
        const chips = assignedDrivers.length
          ? assignedDrivers.map((d) => this.renderDriverChip(d, car.id)).join("")
          : "";
        const count = assignedDrivers.length;
        const emptyClass = count ? "has-drivers" : "empty";
        const countClass =
          count >= 4 ? "many-drivers" : count === 3 ? "three-drivers" : "";
        return `
          <article class="driver-car-card ${countClass}" data-car-id="${escapeHtml(car.id)}" data-driver-count="${count}">
            <header class="driver-car-card-head">
              <div class="driver-car-card-identity">
                <span class="driver-car-number">#${escapeHtml(car.carNumber)}</span>
                <span class="driver-car-class">${escapeHtml(car.classId)}</span>
              </div>
              <span class="driver-car-count">${count} driver${count === 1 ? "" : "s"}</span>
            </header>
            <div class="driver-car-dropzone ${emptyClass}" data-car-id="${escapeHtml(car.id)}">
              <p class="driver-car-drop-hint">Drop drivers here</p>
              <div class="driver-car-chips">${chips}</div>
            </div>
          </article>
        `;
      })
      .join("");

    this.bindDriverChips(this.assignmentEl);
  }

  private renderStatRow(
    def: DriverStatDefPayload,
    d: DriverProfilePayload,
    canUpgrade: boolean,
    readOnly: boolean,
    minVal: number,
  ): string {
    const val = driverStatValue(d, def.key, def);
    return `
      <label class="driver-stat-row ${canUpgrade ? "can-upgrade" : ""} ${readOnly ? "read-only" : ""}" title="${escapeHtml(def.description)}">
        <span class="driver-stat-label">${escapeHtml(def.label)}<span class="driver-stat-help" data-glossary="driver.${def.key}"></span></span>
        <input type="range" min="${minVal}" max="${def.max}" step="1"
          data-stat="${def.key}" value="${val}" aria-label="${escapeHtml(def.label)}" ${readOnly ? "disabled" : ""} />
        <strong class="driver-stat-val">${val}</strong>
      </label>
    `;
  }

  private syncEditorViewToggle(): void {
    for (const btn of this.editorViewToggleEl.querySelectorAll(".driver-view-btn")) {
      const view = (btn as HTMLElement).dataset.view as EditorView;
      const active = view === this.editorView;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
    this.editorEl.classList.toggle("driver-editor-profile-mode", this.editorView === "profile");
  }

  private renderEditorBody(): void {
    const d = this.roster[this.selected];
    if (!d) return;

    const defs = this.statDefs();
    const defsReady = defs.length > 0;
    if (!defsReady) {
      this.editorEl.innerHTML = `<p class="wizard-hint">Loading driver stats…</p>`;
      return;
    }

    if (this.editorView === "profile") {
      this.renderEditorProfile(d, defs);
      return;
    }

    const budget = this.rosterBudget(d);
    const signed = budget.signed;
    const draft = budget.draft;
    const defByKey = new Map(defs.map((def) => [def.key, def]));
    this.editorEl.innerHTML = `
      ${signed ? `<p class="driver-signed-banner">Signed driver — stats are fixed. View Profile or assign to a car.</p>` : ""}
      ${!signed && !draft && budget.spare === 0 ? `<p class="driver-signed-banner">All points assigned — stats are locked until you earn more.</p>` : ""}
      <div class="driver-stat-groups">
        ${STAT_GROUPS.map((group) => {
          const rows = group.keys
            .map((key) => defByKey.get(key))
            .filter((def): def is DriverStatDefPayload => Boolean(def))
            .map((def) => {
              const floor = statFloorValue(d, def.key, def.min, this.catalog);
              const readOnly = signed || (!draft && budget.spare === 0);
              return this.renderStatRow(
                def,
                d,
                !readOnly && this.canAffordStatBump(d, def, defs, budget.pool),
                readOnly,
                draft ? def.min : floor,
              );
            })
            .join("");
          return `
            <section class="driver-stat-group" data-group="${group.id}">
              <h4 class="driver-stat-group-title">${escapeHtml(group.label)}</h4>
              <div class="driver-stat-grid">${rows}</div>
            </section>
          `;
        }).join("")}
      </div>
    `;

    if (signed) return;

    for (const slot of this.editorEl.querySelectorAll<HTMLElement>(".driver-stat-help")) {
      const key = slot.dataset.glossary ?? "";
      slot.replaceChildren();
      mountHelpTip(slot, this.catalog, key);
    }

    for (const input of this.editorEl.querySelectorAll<HTMLInputElement>("[data-stat]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.stat as keyof DriverProfilePayload;
        const def = defs.find((x) => x.key === key);
        if (!def) return;
        const prev = driverStatValue(d, key, def);
        let newVal = Number(input.value);
        const liveBudget = this.rosterBudget(d);
        const floor = statFloorValue(d, key, def.min, this.catalog);
        if (!liveBudget.draft) {
          if (newVal < floor) newVal = floor;
          if (newVal < prev) {
            input.value = String(prev);
            return;
          }
        }
        const trial = {
          ...d,
          [key]: newVal,
          tier: "Bronze",
          origin: "custom" as const,
        };
        if (pointCost(trial, defs) > liveBudget.pool) {
          input.value = String(prev);
          return;
        }
        (d[key] as number) = newVal;
        const valEl = input.parentElement?.querySelector(".driver-stat-val");
        if (valEl) valEl.textContent = String(newVal);
        this.updateHeroBudget(d);
        this.updateStatUpgradeHighlights(d);
        this.renderRoster();
      });
    }
  }

  private updateStatUpgradeHighlights(d: DriverProfilePayload): void {
    const defs = this.statDefs();
    if (!defs.length || this.editorView !== "build") return;
    const budget = this.rosterBudget(d);
    if (budget.signed || (!budget.draft && budget.spare === 0)) return;
    for (const row of this.editorEl.querySelectorAll<HTMLElement>(".driver-stat-row")) {
      const input = row.querySelector<HTMLInputElement>("[data-stat]");
      if (!input) continue;
      const def = defs.find((x) => x.key === input.dataset.stat);
      if (!def) continue;
      row.classList.toggle("can-upgrade", this.canAffordStatBump(d, def, defs, budget.pool));
    }
  }

  private renderEditorProfile(d: DriverProfilePayload, defs: DriverStatDefPayload[]): void {
    const axisRows = RADAR_AXES.map((axis) => {
      const score = radarAxisScore(d, axis.keys);
      const pct = Math.min(100, Math.max(0, score));
      return `
        <li class="driver-radar-axis-row">
          <span class="driver-radar-axis-label">${escapeHtml(axis.label)}</span>
          <div class="driver-radar-axis-bar"><span class="driver-radar-axis-fill" style="width: ${pct}%"></span></div>
          <span class="driver-radar-axis-score">${score}</span>
        </li>
      `;
    }).join("");

    this.editorEl.innerHTML = `
      <div class="driver-profile-view">
        <div class="driver-radar-wrap">
          ${renderRadarSvg(d, defs)}
        </div>
        <ul class="driver-radar-axes" aria-label="Attribute scores">
          ${axisRows}
        </ul>
        <p class="wizard-hint driver-profile-hint">${
          isSignedDriver(d, wecCatalogIdSet(this.catalog))
            ? "Signed driver — stats are fixed."
            : 'Radar averages related stats. Switch to <strong>Build</strong> to tune sliders.'
        }</p>
      </div>
    `;
  }

  private updateHeroBudget(d: DriverProfilePayload): void {
    const defsReady = this.statDefs().length > 0;
    const budget = defsReady ? this.rosterBudget(d) : null;
    const costLabel = budget
      ? budget.signed
        ? `${budget.cost} pts`
        : `${budget.cost} / ${budget.pool}`
      : "—";
    const fillPct =
      budget && budget.pool > 0 ? Math.min(100, (budget.cost / budget.pool) * 100) : 0;
    const over = budget ? budget.custom && budget.cost > budget.pool : false;

    const strong = this.heroEl.querySelector(".driver-hero-budget strong");
    if (strong) strong.textContent = costLabel;
    const budgetWrap = this.heroEl.querySelector(".driver-hero-budget");
    budgetWrap?.classList.toggle(
      "has-spare-points",
      Boolean(budget?.custom && budget.spare > 0 && !over),
    );
    const spareEl = this.heroEl.querySelector(".pool-spare-label");
    if (spareEl) {
      spareEl.textContent =
        budget?.custom && budget.spare > 0 && !over ? `${budget.spare} pts to assign` : "";
    }
    const bar = this.heroEl.querySelector(".pool-bar") as HTMLElement | null;
    if (bar) {
      bar.style.setProperty("--pool-fill", `${fillPct}%`);
      bar.classList.toggle("over", over);
    }
    const tierEl = this.heroEl.querySelector(".driver-hero-tier");
    if (tierEl) {
      tierEl.className = `driver-tier driver-hero-tier tier-${d.tier.toLowerCase()}`;
      tierEl.textContent = d.tier;
    }
  }

  private renderEditor(): void {
    const d = this.roster[this.selected];
    this.syncEditorViewToggle();
    this.editorViewToggleEl.classList.toggle("hidden", !d);

    if (!d) {
      this.heroEl.innerHTML = "";
      this.editorEl.textContent = "Add a driver to begin";
      return;
    }

    const defsReady = this.statDefs().length > 0;
    const budget = defsReady ? this.rosterBudget(d) : null;
    const signed = budget?.signed ?? false;
    const fillPct =
      budget && budget.pool > 0 ? Math.min(100, (budget.cost / budget.pool) * 100) : 0;
    const over = budget ? budget.custom && budget.cost > budget.pool : false;
    const gender = d.gender ?? "male";
    const flag = formatNationality(d.nationality, { showCode: false }) || "🏁";
    const budgetLabel = budget
      ? signed
        ? `Signed · ${budget.cost} pts`
        : `${budget.cost} / ${budget.pool}`
      : "—";
    const readOnly = signed ? "disabled readonly" : "";

    this.heroEl.innerHTML = `
      <div class="driver-hero-identity">
        <span class="driver-hero-flag" aria-hidden="true">${flag}</span>
        <div class="driver-hero-fields">
          <label class="mm-field driver-hero-name">Name
            <input type="text" class="driver-name-input" value="${escapeHtml(d.name)}" maxlength="40" ${readOnly} />
          </label>
          <div class="driver-hero-meta-row">
            <label class="mm-field driver-hero-nat">Nationality
              <select class="driver-nat-input" ${readOnly}>
                ${natSelectOptions(d.nationality)}
              </select>
            </label>
            <label class="mm-field driver-hero-gender">Gender
              <select class="driver-gender-input" ${readOnly}>
                <option value="female"${gender === "female" ? " selected" : ""}>Female</option>
                <option value="male"${gender === "male" ? " selected" : ""}>Male</option>
              </select>
            </label>
            <span class="driver-tier driver-hero-tier tier-${escapeHtml(d.tier.toLowerCase())}">${escapeHtml(d.tier)}</span>
          </div>
        </div>
      </div>
      <div class="driver-hero-budget ${signed ? "signed" : ""} ${budget?.custom && budget.spare > 0 && !over ? "has-spare-points" : ""}">
        <span class="pool-label">${signed ? "Contract value" : "Point budget"}</span>
        <div class="pool-bar-wrap">
          <div class="pool-bar ${over ? "over" : ""} ${signed ? "signed" : ""}" style="--pool-fill: ${signed ? 100 : fillPct}%"></div>
          <strong>${budgetLabel}</strong>
        </div>
        <span class="pool-spare-label">${budget?.custom && budget.spare > 0 && !over ? `${budget.spare} pts to assign` : ""}</span>
      </div>
    `;

    this.renderEditorBody();

    if (signed) return;

    const nameInput = this.heroEl.querySelector(".driver-name-input") as HTMLInputElement;
    const natInput = this.heroEl.querySelector(".driver-nat-input") as HTMLSelectElement;
    const genderInput = this.heroEl.querySelector(".driver-gender-input") as HTMLSelectElement;
    nameInput.addEventListener("input", () => {
      d.name = nameInput.value;
      this.renderRoster();
      this.renderAssignments();
    });
    natInput.addEventListener("change", () => {
      d.nationality = natInput.value;
      this.renderRoster();
      this.renderAssignments();
    });
    genderInput.addEventListener("change", () => {
      d.gender = genderInput.value as DriverGenderPayload;
      this.renderRoster();
      this.renderAssignments();
    });
  }
}
