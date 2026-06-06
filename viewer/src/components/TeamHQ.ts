import type {
  BuyCarPayload,
  CarAffiliation,
  GameCatalogPayload,
  MetaStatePayload,
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
  defaultQuantity,
  getClassProgram,
  groupFleetByClass,
  hypercarMfgWarning,
  isHypercarManufacturer,
  teamProgrammeSummary,
  unitCostForBuy,
} from "../utils/fleetUi";
import { mmPanelHeader } from "../utils/mmUi";
import { LiveryEditor } from "./LiveryEditor";

export interface TeamHQHandlers {
  onHireStaff: (role: string, name: string, skill: number) => void;
  onRdInvest: (partId: string, points: number) => void;
  onSignSponsor?: (offerId: string) => void;
  onDropSponsor?: (offerId: string) => void;
  onOpenGarage?: () => void;
  onBuyCar?: (payload: BuyCarPayload) => void;
  onSetActiveCar?: (carId: string) => void;
  onSetPlayerEntry?: (carId: string) => void;
  onRemoveCar?: (carId: string) => void;
  onSaveTeamColors?: (colors: { primary: string; secondary: string }) => void;
  onNewGame?: () => void;
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

  private buyClassId = "Hypercar";
  private buyAffiliation: CarAffiliation = "privateer";
  private buyPlatformId = "";
  private buyQuantity = 1;
  private showBuyPanel = false;
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
            <div class="hq-panel-actions">
              <button type="button" id="hire-engineer" class="secondary-btn">Hire engineer</button>
              <button type="button" id="hire-mechanic" class="secondary-btn">Hire mechanic</button>
            </div>
          </div>
          <div id="team-staff" class="hq-crew-grid"></div>
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
    this.sponsorsEl = this.root.querySelector("#team-sponsors")!;
    this.sponsorOffersEl = this.root.querySelector("#sponsor-offers")!;
    this.calendarEl = this.root.querySelector("#team-calendar")!;
    this.partsEl = this.root.querySelector("#team-parts")!;

    this.renderTabs();

    this.root.querySelector("#hire-engineer")!.addEventListener("click", () => {
      this.handlers.onHireStaff("engineer", "New Engineer", 70);
    });
    this.root.querySelector("#hire-mechanic")!.addEventListener("click", () => {
      this.handlers.onHireStaff("mechanic", "New Mechanic", 68);
    });
    this.root.querySelector("#open-garage")!.addEventListener("click", () => {
      this.handlers.onOpenGarage?.();
    });
    this.root.querySelector("#buy-car-btn")!.addEventListener("click", () => {
      this.showBuyPanel = !this.showBuyPanel;
      this.renderBuyPanel();
    });
    this.root.querySelector("#new-game-btn")!.addEventListener("click", () => {
      this.handlers.onNewGame?.();
    });

    this.renderRdUnlocks();

    this.liveryEditor = new LiveryEditor(
      this.root.querySelector("#team-livery-editor")!,
      {
        onSave: (colors) => this.handlers.onSaveTeamColors?.(colors),
      },
    );
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
    const primary = meta.teamColors?.primary ?? "#d4a843";
    const secondary = meta.teamColors?.secondary ?? "#1a2a44";

    this.heroEl.style.setProperty("--hq-primary", primary);
    this.heroEl.style.setProperty("--hq-secondary", secondary);
    this.heroEl.innerHTML = `
      <div class="hq-hero-strip" aria-hidden="true"></div>
      <div class="hq-hero-body">
        <div class="hq-hero-identity">
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

    const rdMeta = this.root.querySelector("#rd-points-meta");
    if (rdMeta) rdMeta.textContent = `${meta.rdPoints} points available`;

    const sponsorMeta = this.root.querySelector("#sponsor-slots-meta");
    if (sponsorMeta) sponsorMeta.textContent = `${sponsors.length}/3 slots filled`;

    this.renderFleet(meta, fleet);
    this.renderBuyPanel();
    this.renderCrew(meta, fleet);
    this.renderSponsors(meta);
    this.renderRd(meta);
    this.renderCalendar(meta);
    this.updateRdUnlockStates(meta);
  }

  private renderFleet(meta: MetaStatePayload, fleet: typeof meta.fleet): void {
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

    for (const [classId, cars] of groupFleetByClass(fleet)) {
      const program = getClassProgram(fleet, classId, this.catalog);
      const header = document.createElement("li");
      header.className = "fleet-class-banner";
      header.innerHTML = `
        <span class="class-badge class-${escapeHtml(classId)}">${escapeHtml(classId)}</span>
        <span class="fleet-program-label">${escapeHtml(program?.label ?? "")}</span>
        <span class="fleet-program-count">${cars.length} car${cars.length === 1 ? "" : "s"}</span>
      `;
      this.fleetEl.appendChild(header);

      for (const car of cars) {
        const li = document.createElement("li");
        li.className = "fleet-car-card";
        const isActive = car.id === meta.activeCarId;
        const isPlayer = car.id === meta.playerCarId;

        li.innerHTML = `
          <div class="fleet-car-card-top">
            <span class="fleet-car-number">#${car.carNumber}</span>
            <span class="class-badge class-${escapeHtml(car.classId)}">${escapeHtml(car.classId)}</span>
            ${isActive ? '<span class="fleet-badge-active">Active</span>' : ""}
            ${isPlayer ? '<span class="fleet-badge-player">Player</span>' : ""}
          </div>
          <span class="fleet-car-name">${escapeHtml(car.build.carName)}</span>
          <div class="fleet-car-actions">
            <button type="button" class="secondary-btn fleet-edit-btn">Configure</button>
            <button type="button" class="secondary-btn fleet-remove-btn">Sell</button>
          </div>
        `;

        li.querySelector(".fleet-edit-btn")!.addEventListener("click", () => {
          this.handlers.onSetActiveCar?.(car.id);
          this.handlers.onOpenGarage?.();
        });
        li.querySelector(".fleet-remove-btn")!.addEventListener("click", () => {
          if (fleet.length <= 1) return;
          this.handlers.onRemoveCar?.(car.id);
        });

        this.fleetEl.appendChild(li);
      }
    }
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
        const status = member?.status ?? "active";
        const roleCard = document.createElement("div");
        roleCard.className = `hq-crew-role-card${member ? "" : " vacant"}`;
        roleCard.innerHTML = `
          <span class="hq-crew-role-icon" aria-hidden="true">${ROLE_ICONS[role]}</span>
          <div class="hq-crew-role-body">
            <span class="hq-crew-role-label">${ROLE_LABELS[role]}</span>
            <span class="hq-crew-role-name">${escapeHtml(member?.name ?? "Vacant")}</span>
            ${member ? `<span class="hq-crew-skill-bar"><span class="hq-crew-skill-fill" style="width:${member.skill}%"></span></span>` : ""}
            ${member && status !== "active" ? `<span class="staff-status staff-status-${status}">${STATUS_LABELS[status as Exclude<StaffStatus, "active">]}</span>` : ""}
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

  private syncBuyStateForClass(): void {
    if (!this.meta || !this.catalog) return;
    const program = getClassProgram(
      this.meta.fleet ?? [],
      this.buyClassId,
      this.catalog,
    );
    const mfgMin = this.catalog.fleetRules.manufacturerHypercarMinCars ?? 2;

    if (program) {
      this.buyAffiliation = program.affiliation;
      this.buyPlatformId = program.platformId ?? this.buyPlatformId;
      this.buyQuantity = 1;
      return;
    }

    if (
      this.buyClassId === "Hypercar" &&
      this.buyAffiliation === "manufacturer" &&
      this.buyQuantity < mfgMin
    ) {
      this.buyQuantity = mfgMin;
    }
  }

  private renderBuyPanel(): void {
    if (!this.showBuyPanel || !this.catalog || !this.meta) {
      this.buyPanelEl.classList.add("hidden");
      return;
    }

    this.syncBuyStateForClass();

    this.buyPanelEl.classList.remove("hidden");
    const rules = this.catalog.fleetRules;
    const mfgMin = rules.manufacturerHypercarMinCars ?? 2;
    const maxQty = rules.maxCarsPerPurchase ?? 6;
    const fleet = this.meta.fleet ?? [];
    const program = getClassProgram(fleet, this.buyClassId, this.catalog);
    const programLocked = program !== null;
    const platforms =
      this.catalog.carPlatforms?.filter((p) => p.classId === this.buyClassId) ?? [];

    const unitCost = unitCostForBuy(
      this.catalog,
      this.buyClassId,
      this.buyAffiliation,
      this.buyPlatformId,
    );
    const totalCost = unitCost * this.buyQuantity;
    const mfgWarning = hypercarMfgWarning(
      this.buyClassId,
      this.buyAffiliation,
      program
        ? program.carCount + this.buyQuantity
        : this.buyQuantity,
      mfgMin,
    );

    this.buyPanelEl.innerHTML = `
      <h4>${programLocked ? "Add Entries" : "Start Class Programme"}</h4>
      <p class="wizard-hint">Affiliation is per class — you can be a Hypercar manufacturer and a GT3 privateer on the same team. One car type per class; pick how many entries.</p>
      <div class="buy-class-tabs"></div>
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
        <button type="button" class="primary-btn buy-confirm-btn">${programLocked ? "Add Cars" : "Start Programme"}</button>
      </div>
    `;

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
      const enrolled = getClassProgram(fleet, cls.id, this.catalog);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `garage-slot-tab${cls.id === this.buyClassId ? " active" : ""}`;
      btn.textContent = enrolled ? `${cls.displayName} (${enrolled.carCount})` : cls.displayName;
      btn.addEventListener("click", () => {
        this.buyClassId = cls.id;
        const plats = this.catalog?.carPlatforms?.filter((p) => p.classId === cls.id) ?? [];
        if (!getClassProgram(fleet, cls.id, this.catalog)) {
          this.buyPlatformId = plats[0]?.id ?? "";
        }
        this.renderBuyPanel();
      });
      classTabs.appendChild(btn);
    }

    const platformArea = this.buyPanelEl.querySelector(".buy-platform-area")!;
    if (programLocked) {
      platformArea.innerHTML = `<p class="confirm-detail">Adding more ${escapeHtml(this.buyClassId)} entries using the same ${escapeHtml(program.label)} programme.</p>`;
    } else if (this.buyAffiliation === "manufacturer") {
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
            }
          : {
              classId: this.buyClassId,
              affiliation: "privateer",
              acquisition: "privateer",
              platformId: this.buyPlatformId,
              quantity: this.buyQuantity,
            };
      this.handlers.onBuyCar?.(payload);
      this.showBuyPanel = false;
      this.renderBuyPanel();
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
