import type {
  BuyCarPayload,
  CarAffiliation,
  CarConditionPayload,
  FleetCarPayload,
  FleetEntryMode,
  GameCatalogPayload,
  MetaStatePayload,
  TeamLiveryPayload,
  StaffMarketListingPayload,
  StaffMarketSource,
  StaffMemberPayload,
  StaffRole,
  StaffStatus,
} from "../ws/protocol";
import {
  calendarRoundLabel,
  formatDurationLabel,
  trackDisplayName,
  trackIconSvg,
} from "../utils/trackIcons";
import {
  affiliationHintForClass,
  canRemoveFleetCar,
  defaultQuantity,
  getClassProgram,
  groupFleetByClass,
  hypercarMfgWarning,
  isHypercarManufacturer,
  teamProgrammeSummary,
  unitCostForBuy,
  unitCostForExperimentalBuy,
  experimentalAffiliationHint,
  experimentalHypercarBuyLimits,
  fleetEntryMode,
  suggestedExperimentalBuyQuantity,
} from "../utils/fleetUi";
import { mmPanelHeader } from "../utils/mmUi";
import { formatProgressionLine, xpBarPercent } from "../utils/progression";
import { mountLiveryCanvas } from "../graphics/liveryRenderer";
import { resolveTeamLivery } from "../utils/teamLivery";
import { LiveryEditor } from "./LiveryEditor";

const STAFF_MARKET_REFRESH_COST = 25_000;

type CrewTab = "roster" | "market";
type StaffMarketFilter = "all" | StaffRole | StaffMarketSource;

export interface TeamHQHandlers {
  onRefreshStaffMarket?: () => void;
  onSignStaffContract?: (listingId: string, carId?: string) => void;
  onRdInvest: (partId: string, points: number) => void;
  onSignSponsor?: (offerId: string) => void;
  onDropSponsor?: (offerId: string) => void;
  onOpenGarage?: () => void;
  onConfigureCar?: (carId: string) => void;
  onBuyCar?: (payload: BuyCarPayload) => void;
  onSetActiveCar?: (carId: string) => void;
  onSetPlayerEntry?: (carId: string) => void;
  onRemoveCar?: (carId: string) => void;
  onSaveTeamLivery?: (livery: TeamLiveryPayload) => void;
  onNewGame?: () => void;
  onRepairCarCondition?: (
    carId: string,
    options?: { rebuild?: boolean; reveal?: boolean },
  ) => void;
}

type HqTab = "fleet" | "livery" | "commercial" | "crew" | "rd" | "season";

const HQ_TABS: { id: HqTab; label: string; icon: string }[] = [
  { id: "fleet", label: "Fleet", icon: "🏎" },
  { id: "livery", label: "Livery", icon: "🎨" },
  { id: "commercial", label: "Commercial", icon: "💼" },
  { id: "crew", label: "Crew", icon: "👥" },
  { id: "rd", label: "R&D", icon: "🔬" },
  { id: "season", label: "Season", icon: "📅" },
];

const RD_UNLOCKS = [
  { partId: "tire.Soft", label: "Soft Tyres", cost: 15, desc: "Peak grip compound for qualifying and sprint stints" },
  { partId: "brake.CarbonCeramic", label: "Carbon Brakes", cost: 25, desc: "Higher thermal capacity for endurance traffic" },
] as const;

const HIDDEN_FAULT_LABELS: Record<string, string> = {
  cooling_hose_leak: "Cooling hose leak",
  powertrain_seal_leak: "Powertrain seal leak",
  hairline_crack: "Hairline crack",
  wiring_chafe: "Wiring chafe",
};

function hasUnrevealedFaults(condition?: CarConditionPayload): boolean {
  return (condition?.hiddenFaults ?? []).some((f) => !f.revealed);
}

function hasCarDamage(condition?: CarConditionPayload): boolean {
  if (!condition) return false;
  if (Object.keys(condition.partHealth ?? {}).length > 0) return true;
  if ((condition.irreparable?.length ?? 0) > 0) return true;
  return hasUnrevealedFaults(condition);
}

function formatCarCondition(condition?: CarConditionPayload): string {
  if (!condition) return "";
  const bits: string[] = [];
  const worst = Object.entries(condition.partHealth ?? {})
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([p, h]) => `${p} ${h.toFixed(0)}%`);
  bits.push(...worst);
  if ((condition.irreparable?.length ?? 0) > 0) {
    bits.push(`${condition.irreparable!.length} need garage rebuild`);
  }
  const unrevealed = (condition.hiddenFaults ?? []).filter((f) => !f.revealed).length;
  if (unrevealed > 0) bits.push(`${unrevealed} suspected hidden fault${unrevealed > 1 ? "s" : ""}`);
  for (const fault of (condition.hiddenFaults ?? []).filter((f) => f.revealed).slice(0, 2)) {
    const label = HIDDEN_FAULT_LABELS[fault.kind] ?? fault.kind;
    bits.push(`${label} (${fault.linkedPart})`);
  }
  if (!bits.length) return "";
  return `<p class="fleet-car-condition">${bits.join(" · ")}</p>`;
}

export class TeamHQ {
  readonly root: HTMLElement;
  private heroEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private panelsEl!: HTMLElement;
  private fleetEl!: HTMLElement;
  private staffEl!: HTMLElement;
  private sponsorsEl!: HTMLElement;
  private sponsorOffersEl!: HTMLElement;
  private calendarEl!: HTMLElement;
  private partsEl!: HTMLElement;
  private buyPanelEl!: HTMLElement;
  private handlers: TeamHQHandlers;
  private catalog: GameCatalogPayload | null = null;
  private meta: MetaStatePayload | null = null;
  private activeTab: HqTab = "fleet";
  private crewTab: CrewTab = "roster";
  private staffMarketFilter: StaffMarketFilter = "all";
  private staffMarket: StaffMarketListingPayload[] = [];
  private crewStatusEl!: HTMLElement;
  private crewRosterPanelEl!: HTMLElement;
  private crewMarketPanelEl!: HTMLElement;
  private crewMarketGridEl!: HTMLElement;
  private crewMarketMetaEl!: HTMLElement;

  private buyClassId = "Hypercar";
  private buyAffiliation: CarAffiliation = "privateer";
  private buyPlatformId = "";
  private buyQuantity = 1;
  private buyEntryMode: FleetEntryMode = "homologated";
  /** null = panel closed; new = start a class programme */
  private buyPanelMode: "new" | null = null;
  private fleetConfirmEl!: HTMLElement;
  private fleetConfirmKind: "withdraw" | "add" | null = null;
  private fleetConfirmCarId: string | null = null;
  private fleetConfirmClassId: string | null = null;
  private fleetConfirmQuantity = 1;
  private liveryEditor: LiveryEditor;

  constructor(container: HTMLElement, handlers: TeamHQHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel team-hq panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Headquarters", { subtitle: "Team operations centre", badge: "HQ" })}
      <div class="hq-hero"></div>
      <nav class="hq-tabs" aria-label="Headquarters sections"></nav>
      <div class="hq-panels">
        <section class="hq-panel" data-tab="fleet">
          <div class="hq-panel-head">
            <h3 class="hq-panel-title">Race Fleet</h3>
            <div class="hq-panel-actions">
              <button type="button" id="buy-car-btn" class="primary-btn">+ Class Programme</button>
              <button type="button" id="open-garage" class="secondary-btn">Garage</button>
            </div>
          </div>
          <ul id="team-fleet" class="fleet-grid"></ul>
          <div id="buy-car-panel" class="buy-car-panel hidden"></div>
        </section>
        <section class="hq-panel hidden" data-tab="livery">
          <div class="hq-panel-head">
            <h3 class="hq-panel-title">Team Livery</h3>
          </div>
          <div id="team-livery-editor"></div>
        </section>
        <section class="hq-panel hidden" data-tab="commercial">
          <div class="hq-panel-head">
            <h3 class="hq-panel-title">Sponsor Partners</h3>
            <span class="hq-panel-meta" id="sponsor-slots-meta"></span>
          </div>
          <p class="sponsor-hint">Sign up to three partners for per-race income and performance bonuses.</p>
          <h4 class="hq-subsection-title">Active contracts</h4>
          <ul id="team-sponsors" class="sponsor-list"></ul>
          <h4 class="hq-subsection-title">Available offers</h4>
          <div id="sponsor-offers" class="sponsor-offers-grid"></div>
        </section>
        <section class="hq-panel hidden" data-tab="crew">
          <div class="hq-panel-head">
            <h3 class="hq-panel-title">Pit Crew &amp; Engineers</h3>
          </div>
          <div class="hq-crew-tabs">
            <button type="button" class="hq-crew-tab-btn active" data-crew-tab="roster">My crew</button>
            <button type="button" class="hq-crew-tab-btn" data-crew-tab="market">Staff market</button>
          </div>
          <div class="hq-crew-roster-panel">
            <p class="wizard-hint">Each car needs a race engineer, chief mechanic, and strategist.</p>
            <div id="team-staff" class="hq-crew-grid"></div>
          </div>
          <div class="hq-crew-market-panel hidden">
            <div class="hq-crew-market-toolbar">
              <div class="hq-crew-market-filters"></div>
              <div class="hq-crew-market-actions">
                <p class="hq-crew-market-meta"></p>
                <button type="button" class="secondary-btn hq-crew-market-refresh">Refresh listings ($${STAFF_MARKET_REFRESH_COST.toLocaleString()})</button>
              </div>
            </div>
            <p class="wizard-hint">Browse veterans, experienced paddock hires, and budget prospects — pick a car slot when signing.</p>
            <div class="hq-crew-market-grid"></div>
          </div>
          <p class="hq-crew-status"></p>
        </section>
        <section class="hq-panel hidden" data-tab="rd">
          <div class="hq-panel-head">
            <h3 class="hq-panel-title">Development Programme</h3>
            <span class="hq-panel-meta" id="rd-points-meta"></span>
          </div>
          <div class="hq-rd-unlocks"></div>
          <h4 class="hq-subsection-title">Unlocked technology</h4>
          <ul id="team-parts" class="hq-unlocked-list"></ul>
        </section>
        <section class="hq-panel hidden" data-tab="season">
          <div class="hq-panel-head">
            <h3 class="hq-panel-title">WEC Season Calendar</h3>
          </div>
          <ul id="team-calendar" class="calendar-grid hq-calendar-grid"></ul>
          <div class="hq-career-block">
            <h4 class="hq-subsection-title">Career</h4>
            <p class="wizard-hint">Start over from scratch — your save file is deleted and you'll walk through team setup again.</p>
            <button type="button" id="new-game-btn" class="danger-btn">Start New Game</button>
          </div>
        </section>
      </div>
    `;
    container.appendChild(this.root);

    this.heroEl = this.root.querySelector(".hq-hero")!;
    this.tabsEl = this.root.querySelector(".hq-tabs")!;
    this.panelsEl = this.root.querySelector(".hq-panels")!;
    this.fleetEl = this.root.querySelector("#team-fleet")!;
    this.buyPanelEl = this.root.querySelector("#buy-car-panel")!;
    this.staffEl = this.root.querySelector("#team-staff")!;
    this.crewStatusEl = this.root.querySelector(".hq-crew-status")!;
    this.crewRosterPanelEl = this.root.querySelector(".hq-crew-roster-panel")!;
    this.crewMarketPanelEl = this.root.querySelector(".hq-crew-market-panel")!;
    this.crewMarketGridEl = this.root.querySelector(".hq-crew-market-grid")!;
    this.crewMarketMetaEl = this.root.querySelector(".hq-crew-market-meta")!;
    this.sponsorsEl = this.root.querySelector("#team-sponsors")!;
    this.sponsorOffersEl = this.root.querySelector("#sponsor-offers")!;
    this.calendarEl = this.root.querySelector("#team-calendar")!;
    this.partsEl = this.root.querySelector("#team-parts")!;

    this.renderTabs();

    for (const btn of this.root.querySelectorAll(".hq-crew-tab-btn")) {
      btn.addEventListener("click", () => {
        const tab = (btn as HTMLElement).dataset.crewTab as CrewTab;
        this.setCrewTab(tab);
      });
    }
    this.root.querySelector(".hq-crew-market-refresh")!.addEventListener("click", () => {
      this.handlers.onRefreshStaffMarket?.();
      this.setCrewStatus("Refreshing staff market…");
    });
    this.root.querySelector("#open-garage")!.addEventListener("click", () => {
      this.handlers.onOpenGarage?.();
    });
    this.root.querySelector("#buy-car-btn")!.addEventListener("click", () => {
      if (this.buyPanelMode === "new") {
        this.closeBuyPanel();
      } else {
        this.openBuyPanel("new");
      }
    });
    this.root.querySelector("#new-game-btn")!.addEventListener("click", () => {
      this.handlers.onNewGame?.();
    });

    this.renderRdUnlocks();

    this.liveryEditor = new LiveryEditor(
      this.root.querySelector("#team-livery-editor")!,
      {
        onSave: (livery) => this.handlers.onSaveTeamLivery?.(livery),
      },
    );

    this.fleetConfirmEl = document.createElement("div");
    this.fleetConfirmEl.className = "fleet-confirm-overlay hidden";
    this.fleetConfirmEl.addEventListener("click", (e) => {
      if (e.target === this.fleetConfirmEl) this.closeFleetConfirm();
    });
    document.body.appendChild(this.fleetConfirmEl);
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren();
    for (const tab of HQ_TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `hq-tab${tab.id === this.activeTab ? " active" : ""}`;
      btn.dataset.tab = tab.id;
      btn.innerHTML = `
        <span class="hq-tab-icon" aria-hidden="true">${tab.icon}</span>
        <span class="hq-tab-label">${tab.label}</span>
      `;
      btn.addEventListener("click", () => this.setActiveTab(tab.id));
      this.tabsEl.appendChild(btn);
    }
  }

  showTab(tab: HqTab): void {
    this.setActiveTab(tab);
  }

  private setActiveTab(tab: HqTab): void {
    this.activeTab = tab;
    for (const btn of this.tabsEl.querySelectorAll<HTMLButtonElement>(".hq-tab")) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    }
    for (const panel of this.panelsEl.querySelectorAll<HTMLElement>(".hq-panel")) {
      panel.classList.toggle("hidden", panel.dataset.tab !== tab);
    }
  }

  private renderRdUnlocks(): void {
    const wrap = this.root.querySelector(".hq-rd-unlocks")!;
    wrap.replaceChildren();
    for (const unlock of RD_UNLOCKS) {
      const card = document.createElement("div");
      card.className = "hq-rd-card";
      card.innerHTML = `
        <div class="hq-rd-card-body">
          <span class="hq-rd-card-title">${escapeHtml(unlock.label)}</span>
          <span class="hq-rd-card-desc">${escapeHtml(unlock.desc)}</span>
        </div>
        <button type="button" class="secondary-btn hq-rd-unlock-btn" data-part="${escapeHtml(unlock.partId)}">${unlock.cost} pts</button>
      `;
      card.querySelector(".hq-rd-unlock-btn")!.addEventListener("click", () => {
        this.handlers.onRdInvest(unlock.partId, unlock.cost);
      });
      wrap.appendChild(card);
    }
  }

  setLiveryStatus(message: string, isError = false): void {
    this.liveryEditor.setStatus(message, isError);
  }

  setCatalog(catalog: GameCatalogPayload): void {
    this.catalog = catalog;
    if (catalog.classes.length > 0) {
      this.buyClassId = catalog.classes[0].id;
    }
    const platforms = catalog.carPlatforms?.filter((p) => p.classId === this.buyClassId) ?? [];
    if (platforms.length > 0) this.buyPlatformId = platforms[0].id;
    if (this.meta) this.renderBuyPanel();
  }

  update(meta: MetaStatePayload): void {
    this.meta = meta;
    this.liveryEditor.update(meta);
    const fleet = meta.fleet ?? [];
    const sponsors = meta.sponsors ?? [];
    const seasonEarnings = meta.calendar.reduce(
      (sum, e) => sum + (e.prizeMoney ?? 0),
      0,
    );
    const totalPoints = meta.calendar.reduce(
      (sum, e) => sum + (e.completed ? e.championshipPoints : 0),
      0,
    );
    const programmeSummary = teamProgrammeSummary(fleet, this.catalog);
    const hypercarMfg = isHypercarManufacturer(fleet);
    const livery = resolveTeamLivery(meta);

    this.heroEl.style.setProperty("--hq-primary", livery.primary);
    this.heroEl.style.setProperty("--hq-secondary", livery.secondary);
    this.heroEl.innerHTML = `
      <div class="hq-hero-strip" aria-hidden="true"></div>
      <div class="hq-hero-body">
        <div class="hq-hero-identity">
          <div class="hq-hero-logo-slot"></div>
          <span class="hq-hero-badge mm-badge mm-badge-wec">${escapeHtml(meta.teamName)}</span>
          <h2 class="hq-hero-title">Season ${meta.seasonYear}</h2>
          <p class="hq-hero-sub">${escapeHtml(programmeSummary)}${hypercarMfg ? ' · <span class="fleet-badge-mfg">Hypercar Manufacturer</span>' : ""}</p>
        </div>
        <div class="hq-hero-stats">
          <div class="hq-hero-stat">
            <span class="hq-hero-stat-value">${totalPoints}</span>
            <span class="hq-hero-stat-label">Championship pts</span>
          </div>
          <div class="hq-hero-stat">
            <span class="hq-hero-stat-value">$${meta.budget.toLocaleString()}</span>
            <span class="hq-hero-stat-label">Budget</span>
          </div>
          <div class="hq-hero-stat">
            <span class="hq-hero-stat-value">${fleet.length}</span>
            <span class="hq-hero-stat-label">Cars</span>
          </div>
          <div class="hq-hero-stat">
            <span class="hq-hero-stat-value">$${seasonEarnings.toLocaleString()}</span>
            <span class="hq-hero-stat-label">Season earnings</span>
          </div>
          <div class="hq-hero-stat">
            <span class="hq-hero-stat-value">${meta.rdPoints}</span>
            <span class="hq-hero-stat-label">R&amp;D pts</span>
          </div>
        </div>
      </div>
    `;

    const logoSlot = this.heroEl.querySelector<HTMLElement>(".hq-hero-logo-slot");
    if (logoSlot) {
      if (livery.logoDataUrl) {
        const img = document.createElement("img");
        img.className = "hq-hero-logo";
        img.src = livery.logoDataUrl;
        img.alt = "";
        logoSlot.appendChild(img);
      } else {
        logoSlot.remove();
      }
    }

    const rdMeta = this.root.querySelector("#rd-points-meta");
    if (rdMeta) rdMeta.textContent = `${meta.rdPoints} points available`;

    const sponsorMeta = this.root.querySelector("#sponsor-slots-meta");
    if (sponsorMeta) sponsorMeta.textContent = `${sponsors.length}/3 slots filled`;

    this.staffMarket = (meta.staffMarket ?? []).map((l) => ({ ...l }));
    this.renderFleet(meta, fleet);
    this.updateFleetActions(fleet);
    this.renderBuyPanel();
    this.renderCrew(meta, fleet);
    if (this.crewTab === "market") this.renderStaffMarket();
    this.renderSponsors(meta);
    this.renderRd(meta);
    this.renderCalendar(meta);
    this.updateRdUnlockStates(meta);
  }

  private renderFleet(meta: MetaStatePayload, fleet: typeof meta.fleet): void {
    const livery = resolveTeamLivery(meta);
    this.fleetEl.replaceChildren();
    if (!fleet || fleet.length === 0) {
      const li = document.createElement("li");
      li.className = "fleet-empty-card";
      li.innerHTML = `
        <span class="fleet-empty-icon" aria-hidden="true">🏁</span>
        <p>No cars in the fleet yet.</p>
        <p class="wizard-hint">Start a class programme to enter the WEC.</p>
      `;
      this.fleetEl.appendChild(li);
      return;
    }

    const mfgMin = this.catalog?.fleetRules.manufacturerHypercarMinCars ?? 2;

    for (const [classId, cars] of groupFleetByClass(fleet)) {
      const homologated = cars.filter((c) => fleetEntryMode(c) === "homologated");
      const experimental = cars.filter((c) => fleetEntryMode(c) === "experimental");
      const sections: { mode: FleetEntryMode; list: typeof cars }[] = [
        { mode: "homologated", list: homologated },
        { mode: "experimental", list: experimental },
      ];
      for (const section of sections) {
        if (!section.list.length) continue;
        const program = getClassProgram(fleet, classId, this.catalog, section.mode);
        const header = document.createElement("li");
        header.className = "fleet-class-banner";
        header.innerHTML = `
          <div class="fleet-class-banner-main">
            <span class="class-badge class-${escapeHtml(classId)}">${escapeHtml(classId)}</span>
            ${section.mode === "experimental" ? '<span class="entry-badge entry-exp">EXP</span>' : ""}
            <span class="fleet-program-label">${escapeHtml(program?.label ?? "")}</span>
          </div>
          <div class="fleet-class-banner-actions">
            <span class="fleet-program-count">${section.list.length} car${section.list.length === 1 ? "" : "s"}</span>
            <button type="button" class="secondary-btn fleet-add-entry-btn">+ Add car</button>
          </div>
        `;
        header.querySelector(".fleet-add-entry-btn")!.addEventListener("click", () => {
          this.openAddCarConfirm(classId);
        });
        this.fleetEl.appendChild(header);

        for (const car of section.list) {
        const li = document.createElement("li");
        li.className = "fleet-car-card";
        const isActive = car.id === meta.activeCarId;
        const isPlayer = car.id === meta.playerCarId;
        const withdraw = canRemoveFleetCar(fleet, car.id, mfgMin);

        li.innerHTML = `
          <div class="fleet-car-card-top">
            <span class="fleet-car-number">#${car.carNumber}</span>
            <span class="class-badge class-${escapeHtml(car.classId)}">${escapeHtml(car.classId)}</span>
            ${fleetEntryMode(car) === "experimental" ? '<span class="entry-badge entry-exp">EXP</span>' : ""}
            ${isActive ? '<span class="fleet-badge-active">Active</span>' : ""}
            ${isPlayer ? '<span class="fleet-badge-player">Player</span>' : ""}
          </div>
          <div class="fleet-car-livery-host" aria-hidden="true"></div>
          <span class="fleet-car-name">${escapeHtml(car.build.carName)}</span>
          ${formatCarCondition(car.carCondition)}
          <div class="fleet-car-actions">
            <button type="button" class="secondary-btn fleet-edit-btn">Configure</button>
            ${hasUnrevealedFaults(car.carCondition) ? '<button type="button" class="secondary-btn fleet-diagnose-btn">Tear down</button>' : ""}
            ${hasCarDamage(car.carCondition) ? '<button type="button" class="secondary-btn fleet-repair-btn">Workshop repair</button>' : ""}
            <button type="button" class="secondary-btn fleet-remove-btn"${withdraw.allowed ? "" : ` disabled title="${escapeHtml(withdraw.reason ?? "")}"`}>Withdraw</button>
          </div>
        `;

        const liveryHost = li.querySelector<HTMLElement>(".fleet-car-livery-host");
        if (liveryHost) {
          mountLiveryCanvas(liveryHost, {
            primary: livery.primary,
            secondary: livery.secondary,
            pattern: livery.pattern,
            logoDataUrl: livery.logoDataUrl,
            classId: car.classId,
            teamName: meta.teamName,
            width: 280,
            height: 72,
          });
        }

        li.querySelector(".fleet-edit-btn")!.addEventListener("click", () => {
          if (this.handlers.onConfigureCar) {
            this.handlers.onConfigureCar(car.id);
          } else {
            this.handlers.onSetActiveCar?.(car.id);
            this.handlers.onOpenGarage?.();
          }
        });
        li.querySelector(".fleet-diagnose-btn")?.addEventListener("click", () => {
          this.handlers.onRepairCarCondition?.(car.id, { reveal: true });
        });
        li.querySelector(".fleet-repair-btn")?.addEventListener("click", () => {
          this.handlers.onRepairCarCondition?.(car.id, { rebuild: true });
        });
        li.querySelector(".fleet-remove-btn")!.addEventListener("click", () => {
          if (!canRemoveFleetCar(fleet, car.id, mfgMin).allowed) return;
          this.openWithdrawConfirm(car, fleet, mfgMin);
        });

        this.fleetEl.appendChild(li);
      }
      }
    }
  }

  setCrewStatus(message: string): void {
    this.crewStatusEl.textContent = message;
  }

  private setCrewTab(tab: CrewTab): void {
    this.crewTab = tab;
    for (const btn of this.root.querySelectorAll(".hq-crew-tab-btn")) {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.crewTab === tab);
    }
    this.crewRosterPanelEl.classList.toggle("hidden", tab !== "roster");
    this.crewMarketPanelEl.classList.toggle("hidden", tab !== "market");
    if (tab === "market") this.renderStaffMarket();
  }

  private renderStaffMarket(): void {
    if (!this.meta) return;
    const budget = this.meta.budget ?? 0;
    const fleet = this.meta.fleet ?? [];
    const listings = this.filteredStaffMarket();
    this.crewMarketMetaEl.textContent = `Budget $${budget.toLocaleString()} · ${listings.length} listing${listings.length === 1 ? "" : "s"}`;

    const filtersEl = this.root.querySelector(".hq-crew-market-filters")!;
    const filters: Array<{ id: StaffMarketFilter; label: string }> = [
      { id: "all", label: "All" },
      { id: "engineer", label: "Engineers" },
      { id: "mechanic", label: "Mechanics" },
      { id: "strategist", label: "Strategists" },
      { id: "veteran", label: "Veterans" },
      { id: "experienced", label: "Experienced" },
      { id: "prospect", label: "Prospects" },
    ];
    filtersEl.replaceChildren();
    for (const f of filters) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `hq-crew-market-filter${this.staffMarketFilter === f.id ? " active" : ""}`;
      btn.dataset.filter = f.id;
      btn.textContent = f.label;
      btn.addEventListener("click", () => {
        this.staffMarketFilter = f.id;
        this.renderStaffMarket();
      });
      filtersEl.appendChild(btn);
    }

    this.crewMarketGridEl.replaceChildren();
    if (!listings.length) {
      const empty = document.createElement("p");
      empty.className = "wizard-hint";
      empty.textContent =
        "No listings in this category — try another filter or refresh the market.";
      this.crewMarketGridEl.appendChild(empty);
      return;
    }

    for (const listing of listings) {
      const slots = fleet.map((car) => {
        const member = this.staffForCar(this.meta!, car.id, listing.role);
        const vacant = !isStaffSlotFilled(member);
        const severance =
          member && !vacant ? staffSeveranceCost(member) : 0;
        return { car, carId: car.id, member, vacant, severance };
      });
      const slotCost = (slot: (typeof slots)[number]) =>
        listing.signingFee + slot.severance;
      const canAffordSlot = (slot: (typeof slots)[number]) =>
        budget >= slotCost(slot);
      const affordableSlots = slots.filter(canAffordSlot);
      const defaultSlot =
        affordableSlots.find((s) => s.vacant) ?? affordableSlots[0];
      const canHire = affordableSlots.length > 0;
      const card = document.createElement("article");
      card.className = `hq-crew-market-card source-${listing.source}`;
      const traits = listing.traits?.length
        ? listing.traits.join(" · ")
        : "";
      const carOptions = slots
        .map((slot) => {
          const label = slot.vacant
            ? `#${slot.car.carNumber} ${slot.car.build.carName} — vacant`
            : `#${slot.car.carNumber} ${slot.car.build.carName} — replace ${slot.member!.name} · $${slot.severance.toLocaleString()} severance`;
          return `<option value="${escapeHtml(slot.carId)}"${!canAffordSlot(slot) ? " disabled" : ""}>${escapeHtml(label)}</option>`;
        })
        .join("");
      const singleSlot = slots.length === 1 ? slots[0] : undefined;
      const slotHint = singleSlot
        ? singleSlot.vacant
          ? `<p class="wizard-hint hq-crew-market-slot">Fills car #${singleSlot.car.carNumber}</p>`
          : `<p class="wizard-hint hq-crew-market-slot">Replaces ${escapeHtml(singleSlot.member!.name)} on #${singleSlot.car.carNumber} · $${singleSlot.severance.toLocaleString()} severance</p>`
        : "";
      card.innerHTML = `
        <header class="hq-crew-market-card-head">
          <span class="hq-crew-market-role">${escapeHtml(staffRoleLabel(listing.role))}</span>
          <span class="hq-crew-market-source">${escapeHtml(staffSourceLabel(listing.source))}</span>
        </header>
        <h4 class="hq-crew-market-name">${escapeHtml(listing.name)}</h4>
        <p class="hq-crew-market-stats">Skill ${listing.skill} · XP ${listing.experience} yrs · Morale ${listing.morale}${traits ? ` · ${escapeHtml(traits)}` : ""}</p>
        <span class="hq-crew-skill-bar"><span class="hq-crew-skill-fill" style="width:${listing.skill}%"></span></span>
        <p class="hq-crew-market-tagline">${escapeHtml(listing.tagline)}</p>
        <div class="hq-crew-market-fees">
          <span>Signing $${listing.signingFee.toLocaleString()}</span>
          <span class="hq-crew-market-salary">$${listing.salaryPerRace.toLocaleString()}/race</span>
        </div>
        ${slots.length > 1 ? `
          <label class="hq-crew-market-car-pick">
            <span>Assign to</span>
            <select class="hq-crew-market-car-select">${carOptions}</select>
          </label>
        ` : slotHint}
        <button type="button" class="primary-btn hq-crew-sign-btn" data-listing="${escapeHtml(listing.id)}" ${canHire ? "" : "disabled"}>
          ${singleSlot && !singleSlot.vacant ? "Replace staff" : "Sign contract"}
        </button>
      `;
      const signBtn = card.querySelector(".hq-crew-sign-btn")!;
      const carSelect = card.querySelector<HTMLSelectElement>(
        ".hq-crew-market-car-select",
      );
      if (carSelect && defaultSlot) {
        carSelect.value = defaultSlot.carId;
      }
      const updateSignLabel = () => {
        const selectedId = carSelect?.value ?? singleSlot?.carId;
        const selected = slots.find((s) => s.carId === selectedId);
        signBtn.textContent =
          selected && !selected.vacant ? "Replace staff" : "Sign contract";
      };
      carSelect?.addEventListener("change", updateSignLabel);
      signBtn.addEventListener("click", () => {
        const carId = carSelect?.value ?? defaultSlot?.carId ?? singleSlot?.carId;
        this.handlers.onSignStaffContract?.(listing.id, carId);
        const selected = slots.find((s) => s.carId === carId);
        const verb = selected && !selected.vacant ? "Replacing" : "Signing";
        this.setCrewStatus(`${verb} ${listing.name}…`);
      });
      this.crewMarketGridEl.appendChild(card);
    }
  }

  private filteredStaffMarket(): StaffMarketListingPayload[] {
    if (this.staffMarketFilter === "all") return this.staffMarket;
    if (
      this.staffMarketFilter === "engineer" ||
      this.staffMarketFilter === "mechanic" ||
      this.staffMarketFilter === "strategist"
    ) {
      return this.staffMarket.filter((l) => l.role === this.staffMarketFilter);
    }
    return this.staffMarket.filter((l) => l.source === this.staffMarketFilter);
  }

  private renderCrew(meta: MetaStatePayload, fleet: NonNullable<MetaStatePayload["fleet"]>): void {
    const STAFF_ROLES: StaffRole[] = ["engineer", "mechanic", "strategist"];
    const ROLE_LABELS: Record<StaffRole, string> = {
      engineer: "Race Engineer",
      mechanic: "Chief Mechanic",
      strategist: "Strategist",
    };
    const ROLE_ICONS: Record<StaffRole, string> = {
      engineer: "📊",
      mechanic: "🔧",
      strategist: "📋",
    };
    const STATUS_LABELS: Record<Exclude<StaffStatus, "active">, string> = {
      injured: "Injured",
      ill: "Ill",
      poached: "Poached",
    };

    this.staffEl.replaceChildren();
    if (fleet.length === 0) {
      this.staffEl.innerHTML = `<p class="wizard-hint">No cars in fleet — crew assign per car once a programme is started.</p>`;
      return;
    }

    for (const car of fleet) {
      const card = document.createElement("article");
      card.className = "hq-crew-car-card";
      card.innerHTML = `
        <header class="hq-crew-car-head">
          <span class="fleet-car-number">#${car.carNumber}</span>
          <span class="class-badge class-${escapeHtml(car.classId)}">${escapeHtml(car.classId)}</span>
          <span class="hq-crew-car-name">${escapeHtml(car.build.carName)}</span>
        </header>
        <div class="hq-crew-roles"></div>
      `;
      const rolesEl = card.querySelector(".hq-crew-roles")!;

      for (const role of STAFF_ROLES) {
        const member = this.staffForCar(meta, car.id, role);
        const filled = isStaffSlotFilled(member);
        const status = member?.status ?? "active";
        const roleCard = document.createElement("div");
        roleCard.className = `hq-crew-role-card${filled ? "" : " vacant"}`;
        const statsLine = filled && member
          ? `Skill ${member.skill}${member.experience != null ? ` · ${member.experience} yrs` : ""} · ${formatProgressionLine(member.progressionXp)}${member.morale != null ? ` · Morale ${member.morale}` : ""}${member.salaryPerRace ? ` · $${member.salaryPerRace.toLocaleString()}/race` : ""}`
          : "";
        const traitsLine = filled && member?.traits?.length
          ? member.traits.join(" · ")
          : "";
        roleCard.innerHTML = `
          <span class="hq-crew-role-icon" aria-hidden="true">${ROLE_ICONS[role]}</span>
          <div class="hq-crew-role-body">
            <span class="hq-crew-role-label">${ROLE_LABELS[role]}</span>
            <span class="hq-crew-role-name">${escapeHtml(filled && member ? member.name : "Vacant")}</span>
            ${filled && member ? `<span class="hq-crew-skill-bar"><span class="hq-crew-skill-fill" style="width:${member.skill}%"></span></span>` : ""}
            ${filled && member ? `<span class="progression-xp-bar hq-crew-xp-bar" aria-hidden="true"><span class="progression-xp-fill" style="width:${xpBarPercent(member.progressionXp ?? 0)}%"></span></span>` : ""}
            ${statsLine ? `<span class="hq-crew-role-stats">${escapeHtml(statsLine)}</span>` : ""}
            ${traitsLine ? `<span class="hq-crew-role-traits">${escapeHtml(traitsLine)}</span>` : ""}
            ${filled && member && status !== "active" ? `<span class="staff-status staff-status-${status}">${STATUS_LABELS[status as Exclude<StaffStatus, "active">]}</span>` : ""}
          </div>
        `;
        rolesEl.appendChild(roleCard);
      }

      this.staffEl.appendChild(card);
    }
  }

  private renderRd(meta: MetaStatePayload): void {
    this.partsEl.replaceChildren();
    if (meta.unlockedParts.length === 0) {
      const li = document.createElement("li");
      li.className = "hq-unlocked-empty";
      li.textContent = "No parts unlocked yet — invest R&D points above.";
      this.partsEl.appendChild(li);
      return;
    }
    for (const part of meta.unlockedParts) {
      const li = document.createElement("li");
      li.className = "hq-unlocked-item";
      li.textContent = part.replace(".", " · ");
      this.partsEl.appendChild(li);
    }
  }

  private updateRdUnlockStates(meta: MetaStatePayload): void {
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(".hq-rd-unlock-btn")) {
      const partId = btn.dataset.part ?? "";
      const unlock = RD_UNLOCKS.find((u) => u.partId === partId);
      if (!unlock) continue;
      const owned = meta.unlockedParts.includes(partId);
      const canAfford = meta.rdPoints >= unlock.cost;
      btn.disabled = owned || !canAfford;
      btn.textContent = owned ? "Unlocked" : `${unlock.cost} pts`;
    }
  }

  private renderCalendar(meta: MetaStatePayload): void {
    this.calendarEl.replaceChildren();
    for (const event of meta.calendar) {
      const li = document.createElement("li");
      li.className = "calendar-card";
      if (event.completed) li.classList.add("completed");
      if (event.round === meta.currentRound) li.classList.add("current");

      const status = event.completed
        ? `${event.championshipPoints} pts · $${(event.prizeMoney ?? 0).toLocaleString()}`
        : event.round === meta.currentRound
          ? "Next up"
          : "Upcoming";
      const statusClass = event.completed
        ? "status-done"
        : event.round === meta.currentRound
          ? "status-next"
          : "status-upcoming";

      const label = event.eventName ?? trackDisplayName(event.trackId);
      li.innerHTML = `
        <span class="calendar-round">${calendarRoundLabel(event.round, event.eventType)}</span>
        <span class="calendar-icon">${trackIconSvg(event.trackId)}</span>
        <span class="calendar-track">${escapeHtml(label)}</span>
        <span class="calendar-format">${escapeHtml(formatDurationLabel(event.format, event.eventType))}</span>
        <span class="calendar-status ${statusClass}">${status}</span>
      `;
      this.calendarEl.appendChild(li);
    }
  }

  private renderSponsors(meta: MetaStatePayload): void {
    const sponsors = meta.sponsors ?? [];
    const offers = this.catalog?.sponsorOffers ?? [];
    const signedIds = new Set(sponsors.map((s) => s.offerId));

    this.sponsorsEl.replaceChildren();
    if (sponsors.length === 0) {
      const li = document.createElement("li");
      li.className = "sponsor-empty";
      li.textContent = "No active sponsor contracts.";
      this.sponsorsEl.appendChild(li);
    } else {
      for (const contract of sponsors) {
        const offer = offers.find((o) => o.id === contract.offerId);
        const li = document.createElement("li");
        li.className = "sponsor-contract-row";
        li.innerHTML = `
          <div class="sponsor-contract-info">
            <strong>${escapeHtml(contract.name)}</strong>
            <span class="sponsor-contract-detail">$${(offer?.perRaceIncome ?? 0).toLocaleString()}/race</span>
          </div>
          <button type="button" class="secondary-btn sponsor-drop-btn">End contract</button>
        `;
        li.querySelector(".sponsor-drop-btn")!.addEventListener("click", () => {
          this.handlers.onDropSponsor?.(contract.offerId);
        });
        this.sponsorsEl.appendChild(li);
      }
    }

    this.sponsorOffersEl.replaceChildren();
    for (const offer of offers) {
      if (signedIds.has(offer.id)) continue;
      const canAfford = (meta.budget ?? 0) >= offer.signingFee;
      const slotsFull = sponsors.length >= 3;
      const card = document.createElement("button");
      card.type = "button";
      card.className = `sponsor-offer-card${canAfford && !slotsFull ? "" : " sponsor-offer-disabled"}`;
      card.disabled = !canAfford || slotsFull;
      const bonuses: string[] = [];
      if (offer.perRaceIncome > 0) bonuses.push(`$${offer.perRaceIncome.toLocaleString()}/race`);
      if (offer.podiumBonus > 0) bonuses.push(`$${offer.podiumBonus.toLocaleString()} podium`);
      if (offer.winBonus > 0) bonuses.push(`$${offer.winBonus.toLocaleString()} win`);
      if (offer.topFiveBonus > 0) bonuses.push(`$${offer.topFiveBonus.toLocaleString()} top-5`);
      if (offer.rdPointsPerRace > 0) bonuses.push(`+${offer.rdPointsPerRace} R&D/race`);

      card.innerHTML = `
        <span class="sponsor-offer-name">${escapeHtml(offer.name)}</span>
        <span class="sponsor-offer-tagline">${escapeHtml(offer.tagline)}</span>
        <span class="sponsor-offer-fee">Signing fee: $${offer.signingFee.toLocaleString()}</span>
        <span class="sponsor-offer-bonuses">${escapeHtml(bonuses.join(" · "))}</span>
      `;
      card.addEventListener("click", () => {
        if (canAfford && !slotsFull) this.handlers.onSignSponsor?.(offer.id);
      });
      this.sponsorOffersEl.appendChild(card);
    }
  }

  private unenrolledClasses(): { id: string; displayName: string }[] {
    if (!this.catalog) return [];
    const fleet = this.meta?.fleet ?? [];
    return this.catalog.classes.filter(
      (cls) => !getClassProgram(fleet, cls.id, this.catalog),
    );
  }

  private updateFleetActions(fleet: MetaStatePayload["fleet"]): void {
    const buyBtn = this.root.querySelector<HTMLButtonElement>("#buy-car-btn");
    if (!buyBtn || !this.catalog) return;
    const enrolledClassIds = new Set((fleet ?? []).map((c) => c.classId));
    const canAddProgramme = this.catalog.classes.some(
      (cls) => !enrolledClassIds.has(cls.id),
    );
    buyBtn.disabled = !canAddProgramme;
    buyBtn.title = canAddProgramme
      ? "Enter a new WEC class"
      : "All available classes already entered";
  }

  private openWithdrawConfirm(
    car: FleetCarPayload,
    fleet: FleetCarPayload[],
    mfgMin: number,
  ): void {
    this.fleetConfirmKind = "withdraw";
    this.fleetConfirmCarId = car.id;
    this.fleetConfirmClassId = null;
    this.renderFleetConfirm(car, fleet, mfgMin);
    this.fleetConfirmEl.classList.remove("hidden");
  }

  private openAddCarConfirm(classId: string): void {
    if (!this.catalog || !this.meta) return;
    const program = getClassProgram(this.meta.fleet ?? [], classId, this.catalog);
    if (!program) return;

    this.fleetConfirmKind = "add";
    this.fleetConfirmCarId = null;
    this.fleetConfirmClassId = classId;
    this.fleetConfirmQuantity = 1;
    this.renderFleetConfirm();
    this.fleetConfirmEl.classList.remove("hidden");
  }

  private closeFleetConfirm(): void {
    this.fleetConfirmKind = null;
    this.fleetConfirmCarId = null;
    this.fleetConfirmClassId = null;
    this.fleetConfirmEl.classList.add("hidden");
    this.fleetConfirmEl.replaceChildren();
  }

  private renderFleetConfirm(
    withdrawCar?: FleetCarPayload,
    fleet?: FleetCarPayload[],
    mfgMin = 2,
  ): void {
    if (!this.catalog || !this.meta || !this.fleetConfirmKind) return;

    const card = document.createElement("div");
    card.className = "fleet-confirm-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    if (this.fleetConfirmKind === "withdraw" && withdrawCar && fleet) {
      const remaining = fleet.length - 1;
      card.innerHTML = `
        <header class="fleet-confirm-head">
          <h4>Withdraw entry?</h4>
        </header>
        <p class="fleet-confirm-summary">
          <strong>#${escapeHtml(withdrawCar.carNumber)} ${escapeHtml(withdrawCar.build.carName)}</strong>
          <span class="class-badge class-${escapeHtml(withdrawCar.classId)}">${escapeHtml(withdrawCar.classId)}</span>
        </p>
        <p class="wizard-hint">This removes the car from your race fleet. Crew assigned to this entry may need reassignment.</p>
        ${remaining === 0 ? `<p class="wizard-hint fleet-rule-warning">This is your last car — withdrawing ends your current programmes.</p>` : ""}
        <footer class="fleet-confirm-actions">
          <button type="button" class="secondary-btn fleet-confirm-cancel">Cancel</button>
          <button type="button" class="danger-btn fleet-confirm-ok">Withdraw</button>
        </footer>
      `;
      card.querySelector(".fleet-confirm-cancel")!.addEventListener("click", () => {
        this.closeFleetConfirm();
      });
      card.querySelector(".fleet-confirm-ok")!.addEventListener("click", () => {
        if (!canRemoveFleetCar(fleet, withdrawCar.id, mfgMin).allowed) return;
        this.handlers.onRemoveCar?.(withdrawCar.id);
        this.closeFleetConfirm();
      });
    } else if (
      this.fleetConfirmKind === "add" &&
      this.fleetConfirmClassId
    ) {
      const classId = this.fleetConfirmClassId;
      const program = getClassProgram(this.meta.fleet ?? [], classId, this.catalog);
      if (!program) {
        this.closeFleetConfirm();
        return;
      }

      const rules = this.catalog.fleetRules;
      const maxQty = rules.maxCarsPerPurchase ?? 6;
      const platformId = program.platformId ?? "";
      const unitCost = unitCostForBuy(
        this.catalog,
        classId,
        program.affiliation,
        platformId,
      );
      const budget = this.meta.budget ?? 0;

      const renderCost = (qty: number) => {
        const total = unitCost * qty;
        const costEl = card.querySelector(".fleet-confirm-cost");
        const okBtn = card.querySelector<HTMLButtonElement>(".fleet-confirm-ok");
        if (costEl) {
          costEl.textContent = `$${unitCost.toLocaleString()} × ${qty} = $${total.toLocaleString()} · Budget $${budget.toLocaleString()}`;
        }
        if (okBtn) {
          okBtn.disabled = total > budget;
          okBtn.title = total > budget ? "Insufficient budget" : "";
        }
      };

      card.innerHTML = `
        <header class="fleet-confirm-head">
          <h4>Add ${escapeHtml(classId)} entry</h4>
        </header>
        <p class="fleet-confirm-summary">
          <strong>${escapeHtml(program.label)}</strong> — ${program.carCount} car${program.carCount === 1 ? "" : "s"} in programme
        </p>
        <p class="wizard-hint">New entries share the same build as your existing ${escapeHtml(classId)} cars.</p>
        <label class="wizard-field fleet-confirm-qty-field">
          <span>Number of cars</span>
          <input type="number" class="wizard-input fleet-confirm-qty" min="1" max="${maxQty}" value="${this.fleetConfirmQuantity}" />
        </label>
        <p class="fleet-confirm-cost wizard-hint"></p>
        <footer class="fleet-confirm-actions">
          <button type="button" class="secondary-btn fleet-confirm-cancel">Cancel</button>
          <button type="button" class="primary-btn fleet-confirm-ok">Add cars</button>
        </footer>
      `;

      const qtyInput = card.querySelector<HTMLInputElement>(".fleet-confirm-qty")!;
      qtyInput.addEventListener("input", () => {
        this.fleetConfirmQuantity = Math.max(
          1,
          Math.min(maxQty, parseInt(qtyInput.value, 10) || 1),
        );
        qtyInput.value = String(this.fleetConfirmQuantity);
        renderCost(this.fleetConfirmQuantity);
      });

      card.querySelector(".fleet-confirm-cancel")!.addEventListener("click", () => {
        this.closeFleetConfirm();
      });
      card.querySelector(".fleet-confirm-ok")!.addEventListener("click", () => {
        const qty = this.fleetConfirmQuantity;
        const payload: BuyCarPayload =
          program.affiliation === "manufacturer"
            ? {
                classId,
                affiliation: "manufacturer",
                acquisition: "build",
                quantity: qty,
              }
            : {
                classId,
                affiliation: "privateer",
                acquisition: "privateer",
                platformId: program.platformId,
                quantity: qty,
              };
        this.handlers.onBuyCar?.(payload);
        this.closeFleetConfirm();
      });

      renderCost(this.fleetConfirmQuantity);
    }

    this.fleetConfirmEl.replaceChildren(card);
  }

  private openBuyPanel(mode: "new"): void {
    if (!this.catalog) return;

    const available = this.unenrolledClasses();
    if (available.length === 0) return;

    this.buyPanelMode = "new";
    this.buyClassId = available.some((c) => c.id === this.buyClassId)
      ? this.buyClassId
      : available[0].id;
    this.buyAffiliation = "privateer";
    const plats =
      this.catalog.carPlatforms?.filter((p) => p.classId === this.buyClassId) ?? [];
    this.buyPlatformId = plats[0]?.id ?? "";
    const mfgMin = this.catalog.fleetRules.manufacturerHypercarMinCars ?? 2;
    this.buyQuantity = defaultQuantity(this.buyClassId, this.buyAffiliation, mfgMin);
    this.renderBuyPanel();
  }

  private closeBuyPanel(): void {
    this.buyPanelMode = null;
    this.renderBuyPanel();
  }

  private syncBuyStateForClass(): void {
    if (!this.meta || !this.catalog) return;
    const program = getClassProgram(
      this.meta.fleet ?? [],
      this.buyClassId,
      this.catalog,
      this.buyEntryMode,
    );
    const mfgMin = this.catalog.fleetRules.manufacturerHypercarMinCars ?? 2;

    if (program) {
      this.buyAffiliation = program.affiliation;
      this.buyPlatformId = program.platformId ?? this.buyPlatformId;
      this.buyQuantity = 1;
      return;
    }

    if (this.buyEntryMode === "experimental") {
      const expProgram = getClassProgram(
        this.meta.fleet ?? [],
        this.buyClassId,
        this.catalog,
        "experimental",
      );
      this.buyQuantity = suggestedExperimentalBuyQuantity(
        this.buyClassId,
        this.buyAffiliation,
        this.meta.fleet ?? [],
        this.catalog,
        expProgram?.carCount ?? 0,
      );
      return;
    }

    if (
      this.buyPanelMode === "new" &&
      this.buyClassId === "Hypercar" &&
      this.buyAffiliation === "manufacturer" &&
      this.buyQuantity < mfgMin
    ) {
      this.buyQuantity = mfgMin;
    }
  }

  private renderBuyPanel(): void {
    if (!this.buyPanelMode || !this.catalog || !this.meta) {
      this.buyPanelEl.classList.add("hidden");
      return;
    }

    this.syncBuyStateForClass();

    this.buyPanelEl.classList.remove("hidden");
    const rules = this.catalog.fleetRules;
    const mfgMin = rules.manufacturerHypercarMinCars ?? 2;
    const maxQty = rules.maxCarsPerPurchase ?? 6;
    const fleet = this.meta.fleet ?? [];
    const homProgram = getClassProgram(fleet, this.buyClassId, this.catalog, "homologated");
    const expProgram = getClassProgram(fleet, this.buyClassId, this.catalog, "experimental");
    const program = getClassProgram(fleet, this.buyClassId, this.catalog, this.buyEntryMode);
    const programLocked = program !== null;
    const platforms =
      this.catalog.carPlatforms?.filter((p) => p.classId === this.buyClassId) ?? [];

    const unitCost =
      this.buyEntryMode === "experimental"
        ? Math.round(
            unitCostForExperimentalBuy(
              this.catalog,
              this.buyClassId,
              this.buyAffiliation,
              this.buyPlatformId,
              fleet,
              1,
            ),
          )
        : unitCostForBuy(
            this.catalog,
            this.buyClassId,
            this.buyAffiliation,
            this.buyPlatformId,
          );
    const totalCost =
      this.buyEntryMode === "experimental"
        ? unitCostForExperimentalBuy(
            this.catalog,
            this.buyClassId,
            this.buyAffiliation,
            this.buyPlatformId,
            fleet,
            this.buyQuantity,
          )
        : unitCost * this.buyQuantity;
    const mfgWarning = hypercarMfgWarning(
      this.buyClassId,
      this.buyAffiliation,
      this.buyQuantity,
      mfgMin,
    );

    this.buyPanelEl.innerHTML = `
      <div class="buy-panel-head">
        <h4>Start Class Programme</h4>
        <button type="button" class="secondary-btn buy-panel-close">Cancel</button>
      </div>
      <p class="wizard-hint">Affiliation is per class — you can be a Hypercar manufacturer and a GT3 privateer on the same team. One car type per class; pick how many entries.</p>
      <div class="buy-class-tabs"></div>
      <div class="buy-entry-mode-tabs">
        <button type="button" class="entry-mode-btn" data-mode="homologated">Homologated</button>
        <button type="button" class="entry-mode-btn" data-mode="experimental">Experimental EXP</button>
      </div>
      ${this.buyEntryMode === "experimental" ? `<p class="wizard-hint">${escapeHtml(experimentalAffiliationHint(this.buyClassId, this.buyAffiliation, fleet, this.catalog))}</p>` : ""}
      ${this.buyEntryMode === "experimental" && this.buyClassId === "Hypercar" ? (() => {
        const lim = experimentalHypercarBuyLimits(fleet, this.buyAffiliation, this.catalog);
        return `<p class="wizard-hint fleet-rule-warning">EXP Hypercar: order ${lim.min}${lim.min !== lim.max ? `–${lim.max}` : ""} car${lim.max === 1 ? "" : "s"}${lim.exceptionPath ? " (mule alongside homologated pair)" : " (standalone programme)"}.</p>`;
      })() : ""}
      ${programLocked ? `<div class="fleet-program-locked"><strong>${escapeHtml(program.label)}</strong> — ${program.carCount} car${program.carCount === 1 ? "" : "s"} already entered</div>` : `
        <div class="buy-car-affiliation">
          <button type="button" class="affiliation-btn" data-aff="privateer">${escapeHtml(this.buyClassId)} Privateer</button>
          <button type="button" class="affiliation-btn" data-aff="manufacturer">${escapeHtml(this.buyClassId)} Manufacturer</button>
        </div>
      `}
      <div class="buy-platform-area"></div>
      <label class="wizard-field buy-quantity-field">
        <span>Number of cars</span>
        <input type="number" class="wizard-input buy-quantity-input" min="1" max="${maxQty}" value="${this.buyQuantity}" />
      </label>
      ${mfgWarning ? `<p class="wizard-hint fleet-rule-warning">${escapeHtml(mfgWarning)}</p>` : ""}
      <div class="buy-car-footer">
        <span class="buy-cost">$${unitCost.toLocaleString()} × ${this.buyQuantity} = $${totalCost.toLocaleString()} · Budget $${this.meta.budget.toLocaleString()}</span>
        <button type="button" class="primary-btn buy-confirm-btn">Start Programme</button>
      </div>
    `;

    this.buyPanelEl.querySelector(".buy-panel-close")!.addEventListener("click", () => {
      this.closeBuyPanel();
    });

    for (const btn of this.buyPanelEl.querySelectorAll<HTMLButtonElement>(".entry-mode-btn")) {
      const mode = btn.dataset.mode as FleetEntryMode;
      const disabled =
        mode === "homologated"
          ? !!homProgram && programLocked && this.buyEntryMode !== "homologated"
          : !!expProgram && programLocked && this.buyEntryMode !== "experimental";
      if (mode === this.buyEntryMode) btn.classList.add("selected");
      btn.disabled = disabled && mode !== this.buyEntryMode;
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        this.buyEntryMode = mode;
        this.syncBuyStateForClass();
        this.renderBuyPanel();
      });
    }

    if (!programLocked) {
      for (const btn of this.buyPanelEl.querySelectorAll<HTMLButtonElement>(".affiliation-btn")) {
        const aff = btn.dataset.aff as CarAffiliation;
        if (aff === this.buyAffiliation) btn.classList.add("selected");
        btn.addEventListener("click", () => {
          this.buyAffiliation = aff;
          const mfgMinLocal = rules.manufacturerHypercarMinCars ?? 2;
          this.buyQuantity = defaultQuantity(this.buyClassId, aff, mfgMinLocal);
          this.renderBuyPanel();
        });
      }
    }

    const classTabs = this.buyPanelEl.querySelector(".buy-class-tabs")!;
    classTabs.replaceChildren();
    for (const cls of this.catalog.classes) {
      const hom = getClassProgram(fleet, cls.id, this.catalog, "homologated");
      const exp = getClassProgram(fleet, cls.id, this.catalog, "experimental");
      const count = (hom?.carCount ?? 0) + (exp?.carCount ?? 0);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `garage-slot-tab${cls.id === this.buyClassId ? " active" : ""}`;
      btn.textContent = count > 0 ? `${cls.displayName} (${count})` : cls.displayName;
      btn.addEventListener("click", () => {
        this.buyClassId = cls.id;
        const plats = this.catalog?.carPlatforms?.filter((p) => p.classId === cls.id) ?? [];
        const hom = getClassProgram(fleet, cls.id, this.catalog, "homologated");
        const exp = getClassProgram(fleet, cls.id, this.catalog, "experimental");
        if (!hom && !exp) {
          this.buyPlatformId = plats[0]?.id ?? "";
          this.buyEntryMode = "homologated";
        } else if (hom && !exp) {
          this.buyEntryMode = "homologated";
        } else if (exp && !hom) {
          this.buyEntryMode = "experimental";
        }
        this.renderBuyPanel();
      });
      classTabs.appendChild(btn);
    }

    const platformArea = this.buyPanelEl.querySelector(".buy-platform-area")!;
    if (this.buyAffiliation === "manufacturer") {
      platformArea.innerHTML = `
        <p class="confirm-detail">${escapeHtml(affiliationHintForClass(this.buyClassId, "manufacturer", mfgMin))}</p>
        <p class="confirm-detail">$${unitCost.toLocaleString()} per car from the ${escapeHtml(this.buyClassId)} template.</p>
      `;
    } else {
      platformArea.innerHTML = `
        <p class="confirm-detail">${escapeHtml(affiliationHintForClass(this.buyClassId, "privateer", mfgMin))}</p>
        <div class="platform-select-grid"></div>
      `;
      const grid = platformArea.querySelector(".platform-select-grid")!;
      for (const platform of platforms) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = `platform-card${platform.id === this.buyPlatformId ? " selected" : ""}`;
        card.innerHTML = `
          <span class="platform-name">${escapeHtml(platform.displayName)}</span>
          <span class="platform-meta">${escapeHtml(platform.manufacturerName)} · $${platform.privateerCost.toLocaleString()}</span>
        `;
        card.addEventListener("click", () => {
          this.buyPlatformId = platform.id;
          this.renderBuyPanel();
        });
        grid.appendChild(card);
      }
    }

    const qtyInput = this.buyPanelEl.querySelector<HTMLInputElement>(".buy-quantity-input")!;
    qtyInput.addEventListener("input", () => {
      this.buyQuantity = Math.max(
        1,
        Math.min(maxQty, parseInt(qtyInput.value, 10) || 1),
      );
      this.renderBuyPanel();
    });

    this.buyPanelEl.querySelector(".buy-confirm-btn")!.addEventListener("click", () => {
      const payload: BuyCarPayload =
        this.buyAffiliation === "manufacturer"
          ? {
              classId: this.buyClassId,
              affiliation: "manufacturer",
              acquisition: "build",
              quantity: this.buyQuantity,
              entryMode: this.buyEntryMode,
            }
          : {
              classId: this.buyClassId,
              affiliation: "privateer",
              acquisition: "privateer",
              platformId: this.buyPlatformId,
              quantity: this.buyQuantity,
              entryMode: this.buyEntryMode,
            };
      this.handlers.onBuyCar?.(payload);
      this.closeBuyPanel();
    });
  }

  private staffForCar(
    meta: MetaStatePayload,
    carId: string,
    role: StaffRole,
  ): StaffMemberPayload | null {
    const assigned = meta.staff?.find(
      (s) => s.role === role && s.assignedCarId === carId,
    );
    if (assigned) return assigned;

    const firstCarId = meta.fleet?.[0]?.id;
    if (carId !== firstCarId) return null;
    return meta.staff?.find((s) => s.role === role && !s.assignedCarId) ?? null;
  }
}

const JUNIOR_STAFF_NAMES: Record<StaffRole, string> = {
  engineer: "Junior Engineer",
  mechanic: "Junior Mechanic",
  strategist: "Junior Strategist",
};

function isJuniorPlaceholder(member: StaffMemberPayload): boolean {
  if (member.id?.startsWith("staff-junior-")) return true;
  return member.name === JUNIOR_STAFF_NAMES[member.role as StaffRole];
}

function isStaffSlotFilled(
  member: StaffMemberPayload | null | undefined,
): boolean {
  return member != null && !isJuniorPlaceholder(member);
}

function staffSeveranceCost(member: StaffMemberPayload): number {
  return Math.round((member.salaryPerRace ?? 0) * 2);
}

function staffRoleLabel(role: StaffRole): string {
  switch (role) {
    case "engineer":
      return "Race Engineer";
    case "mechanic":
      return "Chief Mechanic";
    default:
      return "Strategist";
  }
}

function staffSourceLabel(source: StaffMarketSource): string {
  switch (source) {
    case "veteran":
      return "Veteran";
    case "experienced":
      return "Experienced";
    default:
      return "Prospect";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
