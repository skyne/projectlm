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

export class TeamHQ {
  readonly root: HTMLElement;
  private summaryEl!: HTMLElement;
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
      ${mmPanelHeader("Headquarters", { subtitle: "Fleet · Staff · R&D · WEC calendar", badge: "TEAM" })}
      <div id="team-summary" class="team-summary"></div>

      <fieldset class="mm-fieldset">
        <legend>Team livery</legend>
        <div id="team-livery-editor"></div>
      </fieldset>

      <fieldset class="mm-fieldset">
        <legend>Fleet</legend>
        <ul id="team-fleet" class="team-list fleet-list"></ul>
        <div class="team-actions fleet-actions">
          <button type="button" id="buy-car-btn" class="primary-btn">+ Class Programme</button>
          <button type="button" id="open-garage" class="secondary-btn">⚙ Garage</button>
        </div>
        <div id="buy-car-panel" class="buy-car-panel hidden"></div>
      </fieldset>

      <fieldset class="mm-fieldset">
        <legend>Sponsors</legend>
        <p class="sponsor-hint">Sign up to ${3} partners for per-race income and performance bonuses.</p>
        <ul id="team-sponsors" class="team-list sponsor-list"></ul>
        <div id="sponsor-offers" class="sponsor-offers-grid"></div>
      </fieldset>

      <fieldset class="mm-fieldset">
        <legend>Personnel</legend>
        <div id="team-staff" class="hq-staff-matrix-wrap"></div>
        <div class="team-actions">
          <button type="button" id="hire-engineer" class="secondary-btn">Hire engineer</button>
          <button type="button" id="hire-mechanic" class="secondary-btn">Hire mechanic</button>
        </div>
      </fieldset>

      <fieldset class="mm-fieldset">
        <legend>R&amp;D programme</legend>
        <ul id="team-parts" class="team-list"></ul>
        <div class="team-actions">
          <button type="button" id="rd-soft" class="secondary-btn">Unlock Soft tires (15 pts)</button>
          <button type="button" id="rd-carbon" class="secondary-btn">Carbon brakes (25 pts)</button>
        </div>
      </fieldset>

      <fieldset class="mm-fieldset">
        <legend>WEC season calendar</legend>
        <ul id="team-calendar" class="team-list"></ul>
      </fieldset>

      <fieldset class="mm-fieldset team-danger-zone">
        <legend>Career</legend>
        <p class="wizard-hint">Start over from scratch — your save file is deleted and you'll walk through team setup again.</p>
        <button type="button" id="new-game-btn" class="danger-btn">Start New Game</button>
      </fieldset>
    `;
    container.appendChild(this.root);

    this.summaryEl = this.root.querySelector("#team-summary")!;
    this.fleetEl = this.root.querySelector("#team-fleet")!;
    this.buyPanelEl = this.root.querySelector("#buy-car-panel")!;
    this.staffEl = this.root.querySelector("#team-staff")!;
    this.sponsorsEl = this.root.querySelector("#team-sponsors")!;
    this.sponsorOffersEl = this.root.querySelector("#sponsor-offers")!;
    this.calendarEl = this.root.querySelector("#team-calendar")!;
    this.partsEl = this.root.querySelector("#team-parts")!;

    this.root.querySelector("#hire-engineer")!.addEventListener("click", () => {
      this.handlers.onHireStaff("engineer", "New Engineer", 70);
    });
    this.root.querySelector("#hire-mechanic")!.addEventListener("click", () => {
      this.handlers.onHireStaff("mechanic", "New Mechanic", 68);
    });
    this.root.querySelector("#rd-soft")!.addEventListener("click", () => {
      this.handlers.onRdInvest("tire.Soft", 15);
    });
    this.root.querySelector("#rd-carbon")!.addEventListener("click", () => {
      this.handlers.onRdInvest("brake.CarbonCeramic", 25);
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

    this.liveryEditor = new LiveryEditor(
      this.root.querySelector("#team-livery-editor")!,
      {
        onSave: (colors) => this.handlers.onSaveTeamColors?.(colors),
      },
    );
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
    const programmeSummary = teamProgrammeSummary(fleet, this.catalog);
    const hypercarMfg = isHypercarManufacturer(fleet);
    const liveryStyle = meta.teamColors
      ? `--livery-primary: ${meta.teamColors.primary}; --livery-secondary: ${meta.teamColors.secondary}`
      : "";

    this.summaryEl.innerHTML = `
      <div class="team-stat-cards">
        <div class="team-stat-card team-livery-card" style="${liveryStyle}">
          <span class="team-stat-label">Team</span>
          <span class="team-stat-value">${escapeHtml(meta.teamName)}</span>
          <span class="team-programme-summary">${escapeHtml(programmeSummary)}</span>
          ${hypercarMfg ? '<span class="fleet-badge-mfg">Hypercar Manufacturer</span>' : ""}
        </div>
        <div class="team-stat-card">
          <span class="team-stat-label">Fleet</span>
          <span class="team-stat-value">${fleet.length} car${fleet.length === 1 ? "" : "s"}</span>
        </div>
        <div class="team-stat-card">
          <span class="team-stat-label">Season</span>
          <span class="team-stat-value">${meta.seasonYear} · R${meta.currentRound}</span>
        </div>
        <div class="team-stat-card">
          <span class="team-stat-label">Budget</span>
          <span class="team-stat-value">$${meta.budget.toLocaleString()}</span>
        </div>
        <div class="team-stat-card">
          <span class="team-stat-label">Season earnings</span>
          <span class="team-stat-value">$${seasonEarnings.toLocaleString()}</span>
        </div>
        <div class="team-stat-card">
          <span class="team-stat-label">Sponsors</span>
          <span class="team-stat-value">${sponsors.length}/3</span>
        </div>
        <div class="team-stat-card">
          <span class="team-stat-label">R&amp;D</span>
          <span class="team-stat-value">${meta.rdPoints} pts</span>
        </div>
      </div>
    `;

    this.fleetEl.replaceChildren();
    if (fleet.length === 0) {
      const li = document.createElement("li");
      li.className = "fleet-empty";
      li.textContent = "No cars yet — start a class programme below.";
      this.fleetEl.appendChild(li);
    }

    for (const [classId, cars] of groupFleetByClass(fleet)) {
      const program = getClassProgram(fleet, classId, this.catalog);
      const header = document.createElement("li");
      header.className = "fleet-class-header";
      header.innerHTML = `
        <span class="class-badge class-${escapeHtml(classId)}">${escapeHtml(classId)}</span>
        <span class="fleet-program-label">${escapeHtml(program?.label ?? "")}</span>
        <span class="fleet-program-count">${cars.length} car${cars.length === 1 ? "" : "s"}</span>
      `;
      this.fleetEl.appendChild(header);

      for (const car of cars) {
        const li = document.createElement("li");
        li.className = "fleet-car-row";
        const isActive = car.id === meta.activeCarId;

        li.innerHTML = `
          <div class="fleet-car-info">
            <span class="fleet-car-number">#${car.carNumber}</span>
            <span class="fleet-car-name">${escapeHtml(car.build.carName)}</span>
            ${isActive ? '<span class="fleet-badge-active">Editing</span>' : ""}
          </div>
          <div class="fleet-car-actions">
            <button type="button" class="secondary-btn fleet-edit-btn">Edit</button>
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

    this.renderBuyPanel();

    this.renderStaffMatrix(meta);

    this.partsEl.replaceChildren();
    for (const part of meta.unlockedParts) {
      const li = document.createElement("li");
      li.textContent = part;
      this.partsEl.appendChild(li);
    }

    this.calendarEl.replaceChildren();
    for (const event of meta.calendar) {
      const li = document.createElement("li");
      const status = event.completed
        ? `done · ${event.championshipPoints} pts`
        : event.round === meta.currentRound
          ? "current"
          : "upcoming";
      const label = event.eventName ?? trackDisplayName(event.trackId);
      const fmt = formatDurationLabel(event.format, event.eventType);
      li.textContent = `${calendarRoundLabel(event.round, event.eventType)} ${label} (${fmt}) — ${status}`;
      if (event.round === meta.currentRound) li.className = "current-round";
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

  private renderStaffMatrix(meta: MetaStatePayload): void {
    const STAFF_ROLES: StaffRole[] = ["engineer", "mechanic", "strategist"];
    const ROLE_LABELS: Record<StaffRole, string> = {
      engineer: "Engineer",
      mechanic: "Mechanic",
      strategist: "Strategist",
    };
    const STATUS_LABELS: Record<Exclude<StaffStatus, "active">, string> = {
      injured: "Injured",
      ill: "Ill",
      poached: "Poached",
    };

    const fleet = meta.fleet ?? [];
    if (fleet.length === 0) {
      this.staffEl.innerHTML = `<p class="wizard-hint">No cars in fleet — staff assign per car once a programme is started.</p>`;
      return;
    }

    const headerCells = STAFF_ROLES.map(
      (role) => `<th scope="col">${ROLE_LABELS[role]}</th>`,
    ).join("");

    const rows = fleet
      .map((car) => {
        const cells = STAFF_ROLES.map((role) => {
          const member = this.staffForCar(meta, car.id, role);
          if (!member) {
            return `<td><span class="hq-staff-vacant">Vacant</span></td>`;
          }
          const status = member.status ?? "active";
          const badge =
            status !== "active"
              ? `<span class="staff-status staff-status-${status}">${STATUS_LABELS[status]}</span>`
              : "";
          return `<td>
            <div class="hq-staff-cell">
              <span class="hq-staff-name">${escapeHtml(member.name)}</span>
              <span class="hq-staff-skill">${member.skill}</span>
              ${badge}
            </div>
          </td>`;
        }).join("");
        return `<tr>
          <th scope="row">#${escapeHtml(car.carNumber)} <span class="class-badge">${escapeHtml(car.classId)}</span></th>
          ${cells}
        </tr>`;
      })
      .join("");

    this.staffEl.innerHTML = `
      <table class="hq-staff-matrix">
        <thead>
          <tr><th scope="col">Car</th>${headerCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
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
