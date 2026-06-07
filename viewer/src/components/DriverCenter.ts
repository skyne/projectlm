import type {
  DriverMarketListingPayload,
  DriverMarketSource,
  DriverProfilePayload,
  DriverStatDefPayload,
  FleetCarPayload,
  GameCatalogPayload,
  MetaStatePayload,
} from "../ws/protocol";
import { mmPanelHeader, escapeHtml } from "../utils/mmUi";

export interface DriverCenterHandlers {
  onSaveRoster: (
    roster: DriverProfilePayload[],
    assignments: Record<string, string[]>,
  ) => void;
  onRefreshMarket?: () => void;
  onSignContract?: (listingId: string) => void;
}

const MARKET_REFRESH_COST = 50_000;

const BASELINE: Record<string, number> = {
  dryPace: 68, wetPace: 64, consistency: 68, overtaking: 66, defending: 66,
  trafficManagement: 66, rollingStart: 64, standingStart: 64, setupFeedback: 60,
  tireManagement: 66, fuelSaving: 64, composure: 68, nightPace: 64, rainRadar: 60, stamina: 68,
};

const FIRST = ["Alex", "Marco", "Elena", "Luca", "Sofia", "Kai", "Nina", "Oliver", "Yuki", "Ines"];
const LAST = ["Voss", "Reeves", "Okonkwo", "Bianchi", "Kowalski", "Santos", "Chen", "Müller", "Dupont"];
const NATS = ["GB", "FR", "DE", "IT", "US", "BR", "JP", "ES", "NL", "AU"];

type DriverTab = "roster" | "market";
type MarketFilter = "all" | DriverMarketSource;

function inferTier(d: DriverProfilePayload): string {
  const avg = (d.dryPace + d.wetPace + d.consistency) / 3;
  if (avg >= 90) return "Platinum";
  if (avg >= 82) return "Gold";
  if (avg >= 74) return "Silver";
  return "Bronze";
}

function pointCost(d: DriverProfilePayload, defs: DriverStatDefPayload[]): number {
  let cost = 0;
  for (const def of defs) {
    const v = d[def.key as keyof DriverProfilePayload] as number;
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

function randomDriver(): DriverProfilePayload {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const j = (b: number, s: number) => Math.round(Math.min(96, Math.max(55, b + (Math.random() - 0.5) * s)));
  const d: DriverProfilePayload = {
    id: newDriverId(),
    name: `${pick(FIRST)} ${pick(LAST)}`,
    nationality: pick(NATS),
    tier: "Silver",
    dryPace: j(76, 18), wetPace: j(72, 16), consistency: j(74, 16),
    overtaking: j(72, 14), defending: j(70, 14), trafficManagement: j(72, 12),
    rollingStart: j(70, 12), standingStart: j(70, 12), setupFeedback: j(66, 14),
    tireManagement: j(72, 12), fuelSaving: j(68, 12), composure: j(72, 16),
    nightPace: j(70, 12), rainRadar: j(66, 12), stamina: j(74, 14),
    maxStintHours: Math.random() > 0.7 ? 3 : 2.5,
  };
  d.tier = inferTier(d);
  return d;
}

function defaultRoster(team: string): DriverProfilePayload[] {
  return [
    {
      id: newDriverId(),
      name: `${team} Ace`, nationality: "GB", tier: "Gold",
      dryPace: 84, wetPace: 78, consistency: 82, overtaking: 80, defending: 78,
      trafficManagement: 80, rollingStart: 78, standingStart: 76, setupFeedback: 74,
      tireManagement: 80, fuelSaving: 76, composure: 82, nightPace: 78, rainRadar: 72,
      stamina: 80, maxStintHours: 3,
    },
    {
      id: newDriverId(),
      name: `${team} Endurance`, nationality: "FR", tier: "Silver",
      dryPace: 78, wetPace: 74, consistency: 80, overtaking: 72, defending: 76,
      trafficManagement: 78, rollingStart: 74, standingStart: 72, setupFeedback: 70,
      tireManagement: 82, fuelSaving: 80, composure: 78, nightPace: 76, rainRadar: 70,
      stamina: 84, maxStintHours: 3.5,
    },
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
    default:
      return "Prospect";
  }
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

export class DriverCenter {
  readonly root: HTMLElement;
  private tabBarEl!: HTMLElement;
  private introEl!: HTMLElement;
  private rosterPanelEl!: HTMLElement;
  private marketPanelEl!: HTMLElement;
  private rosterEl!: HTMLElement;
  private editorEl!: HTMLElement;
  private poolEl!: HTMLElement;
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
          <div class="driver-roster-col">
            <h3 class="driver-section-title">Your roster</h3>
            <ul class="driver-roster-list"></ul>
            <div class="driver-roster-actions">
              <button type="button" class="secondary-btn driver-add-btn">+ Add driver</button>
              <button type="button" class="secondary-btn driver-random-btn">🎲 Randomize</button>
            </div>
          </div>
          <div class="driver-editor-col">
            <h3 class="driver-section-title">Driver editor</h3>
            <div class="driver-editor-card"></div>
            <p class="driver-point-pool"></p>
            <fieldset class="mm-fieldset driver-assignment-fieldset">
              <legend>Car assignments</legend>
              <p class="wizard-hint">Each driver can only be assigned to one car. Pit-stop swaps use that car's pool.</p>
              <div class="driver-assignment-grid"></div>
            </fieldset>
            <div class="driver-editor-actions">
              <button type="button" class="primary-btn driver-save-btn">Save roster &amp; assignments</button>
            </div>
          </div>
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
    this.editorEl = this.root.querySelector(".driver-editor-card")!;
    this.poolEl = this.root.querySelector(".driver-point-pool")!;
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
      this.roster.push(randomDriver());
      this.selected = this.roster.length - 1;
      this.syncAssignmentsAfterRosterChange();
      this.render();
    });

    this.root.querySelector(".driver-random-btn")!.addEventListener("click", () => {
      const count = Math.max(2, this.roster.length || 2);
      this.roster = Array.from({ length: count }, () => randomDriver());
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
        this.roster.map((d) => ensureDriverId({ ...d, tier: inferTier(d) })),
        this.assignments,
      );
      this.setStatus("Saving roster…");
    });

    this.root.querySelector(".driver-market-refresh")!.addEventListener("click", () => {
      this.handlers.onRefreshMarket?.();
    });
  }

  setCatalog(catalog: GameCatalogPayload): void {
    this.catalog = catalog;
    this.renderIntro();
    this.render();
  }

  update(meta: MetaStatePayload): void {
    this.meta = meta;
    if (meta.driverRoster?.length) {
      this.roster = meta.driverRoster.map((d) => ensureDriverId({ ...d }));
    } else if (!this.roster.length) {
      this.roster = defaultRoster(meta.teamName);
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
    const pool = this.catalog?.driverPointPool ?? 750;
    this.introEl.textContent =
      `${count} real WEC drivers in the database. Custom builds use a ${pool}-point budget, ` +
      `or pick ready-made templates from the driver market.`;
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
    const pool = this.catalog?.driverPointPool ?? 750;
    const defs = this.catalog?.driverStatDefs ?? [];
    for (const driver of this.roster) {
      if (!driver.name.trim()) return "Every driver needs a name";
      const cost = pointCost(driver, defs);
      if (cost > pool) {
        return `${driver.name.trim() || "A driver"} exceeds the ${pool}-point budget (${cost} pts)`;
      }
    }
    for (const car of this.fleet) {
      const assigned = this.assignments[car.id] ?? [];
      if (assigned.length < 1) {
        return `Car #${car.carNumber} needs at least one assigned driver`;
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

  private renderRoster(): void {
    this.rosterEl.innerHTML = this.roster.map((d, i) => `
      <li class="driver-roster-item ${i === this.selected ? "active" : ""}" data-idx="${i}">
        <button type="button" class="driver-roster-btn">
          <span class="driver-tier tier-${escapeHtml(d.tier.toLowerCase())}">${escapeHtml(d.tier)}</span>
          <strong>${escapeHtml(d.name)}</strong>
          <span class="driver-roster-meta">${escapeHtml(d.nationality)} · DRY ${d.dryPace}</span>
        </button>
        ${this.roster.length > 1 ? `<button type="button" class="driver-remove-btn" data-remove="${i}" title="Remove">✕</button>` : ""}
      </li>
    `).join("");

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
          <p class="driver-market-stats">${escapeHtml(d.nationality)} · DRY ${d.dryPace} · WET ${d.wetPace} · CON ${d.consistency}</p>
          ${teamLine}
          <p class="driver-market-tagline">${escapeHtml(listing.tagline)}</p>
          <div class="driver-market-fees">
            <span>Signing ${formatMoney(listing.signingFee)}</span>
            <span class="driver-market-salary">${formatMoney(listing.salaryPerRace)}/race</span>
          </div>
          <button type="button" class="primary-btn driver-sign-btn" data-listing="${escapeHtml(listing.id)}" ${canAfford ? "" : "disabled"}>
            Offer contract
          </button>
        </article>
      `;
    }).join("");

    for (const btn of this.marketGridEl.querySelectorAll(".driver-sign-btn")) {
      btn.addEventListener("click", () => {
        const listingId = (btn as HTMLElement).dataset.listing!;
        this.handlers.onSignContract?.(listingId);
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
        const assigned = new Set(this.assignments[car.id] ?? []);
        const checks = this.roster
          .map(
            (d) => `
          <label class="driver-assignment-check">
            <input type="checkbox" data-car="${escapeHtml(car.id)}" data-driver="${escapeHtml(d.id ?? "")}"
              ${d.id && assigned.has(d.id) ? "checked" : ""}
              ${!d.id ? "disabled" : ""} />
            ${escapeHtml(d.name)}
          </label>
        `,
          )
          .join("");
        const count = assigned.size;
        return `
          <div class="driver-assignment-car">
            <div class="driver-assignment-car-head">
              <strong>#${escapeHtml(car.carNumber)} ${escapeHtml(car.classId)}</strong>
              <span class="driver-assignment-count">${count} assigned</span>
            </div>
            <div class="driver-assignment-checks">${checks}</div>
          </div>
        `;
      })
      .join("");

    for (const input of this.assignmentEl.querySelectorAll<HTMLInputElement>(
      "input[type=checkbox]",
    )) {
      input.addEventListener("change", () => {
        const carId = input.dataset.car!;
        const driverId = input.dataset.driver!;
        if (!driverId) return;

        if (input.checked) {
          for (const otherCar of this.fleet) {
            if (otherCar.id === carId) continue;
            this.assignments[otherCar.id] = (this.assignments[otherCar.id] ?? []).filter(
              (id) => id !== driverId,
            );
          }
          const current = new Set(this.assignments[carId] ?? []);
          current.add(driverId);
          this.assignments[carId] = [...current];
        } else {
          this.assignments[carId] = (this.assignments[carId] ?? []).filter(
            (id) => id !== driverId,
          );
        }
        this.renderAssignments();
      });
    }
  }

  private renderEditor(): void {
    const d = this.roster[this.selected];
    if (!d) {
      this.editorEl.textContent = "Add a driver to begin";
      return;
    }

    const defs = this.catalog?.driverStatDefs ?? [];
    const cost = pointCost(d, defs);
    const pool = this.catalog?.driverPointPool ?? 750;

    this.poolEl.innerHTML = `
      <span class="pool-label">Point budget</span>
      <div class="pool-bar-wrap">
        <div class="pool-bar ${cost > pool ? "over" : ""}" style="--pool-fill: ${Math.min(100, (cost / pool) * 100)}%"></div>
        <strong>${cost} / ${pool}</strong>
      </div>
    `;

    this.editorEl.innerHTML = `
      <label class="mm-field">Name
        <input type="text" class="driver-name-input" value="${escapeHtml(d.name)}" maxlength="40" />
      </label>
      <label class="mm-field">Nationality
        <input type="text" class="driver-nat-input" value="${escapeHtml(d.nationality)}" maxlength="3" />
      </label>
      <div class="driver-stat-grid">
        ${defs.map((def) => {
          const val = d[def.key as keyof DriverProfilePayload] as number;
          return `
            <label class="driver-stat-row" title="${escapeHtml(def.description)}">
              <span class="driver-stat-label">${escapeHtml(def.short)}</span>
              <input type="range" min="${def.min}" max="${def.max}" step="1"
                data-stat="${def.key}" value="${val}" />
              <strong class="driver-stat-val">${val}</strong>
            </label>
          `;
        }).join("")}
      </div>
    `;

    const nameInput = this.editorEl.querySelector(".driver-name-input") as HTMLInputElement;
    const natInput = this.editorEl.querySelector(".driver-nat-input") as HTMLInputElement;
    nameInput.addEventListener("input", () => { d.name = nameInput.value; this.renderRoster(); this.renderAssignments(); });
    natInput.addEventListener("input", () => { d.nationality = natInput.value.toUpperCase(); this.renderRoster(); });

    for (const input of this.editorEl.querySelectorAll<HTMLInputElement>("[data-stat]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.stat as keyof DriverProfilePayload;
        (d[key] as number) = Number(input.value);
        d.tier = inferTier(d);
        const valEl = input.parentElement?.querySelector(".driver-stat-val");
        if (valEl) valEl.textContent = input.value;
        this.poolEl.querySelector("strong")!.textContent = `${pointCost(d, defs)} / ${pool}`;
        const bar = this.poolEl.querySelector(".pool-bar") as HTMLElement;
        const c = pointCost(d, defs);
        bar.style.setProperty("--pool-fill", `${Math.min(100, (c / pool) * 100)}%`);
        bar.classList.toggle("over", c > pool);
        this.renderRoster();
      });
    }
  }
}
