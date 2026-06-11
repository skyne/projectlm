import type {
  DriverMarketListingPayload,
  NegotiationKind,
  NegotiationSessionPayload,
  NegotiationTermsPayload,
} from "../ws/protocol";
import { escapeHtml } from "../utils/mmUi";
import { ALL_TRACK_IDS, trackDisplayName } from "../utils/trackIcons";

const INTER_TEAM_COST_MIN = 50_000;
const INTER_TEAM_COST_MAX = 500_000;
const INTER_TEAM_COST_STEP = 10_000;
const INTER_TEAM_TEST_DAYS_MIN = 1;
const INTER_TEAM_TEST_DAYS_MAX = 5;
const INTER_TEAM_HOURS_PER_DAY_MIN = 1;
const INTER_TEAM_HOURS_PER_DAY_MAX = 24;

export interface NegotiationPanelHandlers {
  onSubmitOffer: (negotiationId: string, terms: NegotiationTermsPayload) => void;
  onAcceptCounter: (negotiationId: string) => void;
  onWithdraw: (negotiationId: string) => void;
  onClose: () => void;
}

export interface NegotiationPanelContext {
  title?: string;
  listing?: DriverMarketListingPayload;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

function moneySliderBounds(
  ref: number,
  step: number,
  floor = 0.45,
  ceil = 1.55,
): { min: number; max: number; step: number } {
  const safe = Math.max(step, ref);
  const min = Math.max(step, Math.round((safe * floor) / step) * step);
  const max = Math.round((safe * ceil) / step) * step;
  return { min, max: Math.max(max, min + step), step };
}

function clampMoney(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round(value / step) * step;
  return Math.max(min, Math.min(max, stepped));
}

function counterpartyTeams(session: NegotiationSessionPayload): string[] {
  const fromTerms = session.anchorTerms.partnerTeams;
  if (fromTerms?.length) return fromTerms;
  if (session.anchorTerms.partnerTeam) return [session.anchorTerms.partnerTeam];
  return session.parties
    .filter((p) => p.role === "counterparty")
    .map((p) => p.displayName);
}

function counterpartyName(session: NegotiationSessionPayload): string {
  const teams = counterpartyTeams(session);
  if (!teams.length) return "Counterparty";
  if (teams.length === 1) return teams[0]!;
  return `${teams.length} teams`;
}

function kindTitle(kind: NegotiationKind): string {
  switch (kind) {
    case "sponsor_partnership":
      return "Sponsor partnership";
    case "inter_team_agreement":
      return "Inter-team agreement";
    case "regulatory_petition":
      return "Regulatory petition";
    case "driver_buyout":
      return "Driver buyout";
    default:
      return "Contract negotiation";
  }
}

export class NegotiationPanel {
  private readonly root: HTMLElement;
  private session: NegotiationSessionPayload | null = null;
  private context: NegotiationPanelContext = {};
  private draft: NegotiationTermsPayload = {};

  constructor(
    parent: HTMLElement,
    private readonly handlers: NegotiationPanelHandlers,
  ) {
    this.root = document.createElement("div");
    this.root.className = "negotiation-overlay hidden";
    this.root.innerHTML = `
      <div class="negotiation-modal" role="dialog" aria-modal="true">
        <header class="negotiation-header">
          <h3 class="negotiation-title">Contract negotiation</h3>
          <button type="button" class="secondary-btn negotiation-close">Close</button>
        </header>
        <p class="negotiation-subtitle"></p>
        <div class="negotiation-meters">
          <span class="negotiation-mood"></span>
          <span class="negotiation-patience"></span>
        </div>
        <form class="negotiation-form">
          <fieldset class="negotiation-fields-driver">
            <div class="negotiation-opening negotiation-driver-opening hidden">
              <p class="negotiation-inter-opening-label">Their opening ask</p>
              <p class="negotiation-opening-text negotiation-driver-opening-text"></p>
            </div>
            <p class="wizard-hint negotiation-driver-hint"></p>
            <label class="negotiation-slider-label">
              Signing fee
              <input type="range" name="signingFee" class="negotiation-signing-slider" />
              <span class="negotiation-slider-value negotiation-signing-value"></span>
            </label>
            <label class="negotiation-slider-label">
              Salary / race
              <input type="range" name="salaryPerRace" class="negotiation-salary-slider" />
              <span class="negotiation-slider-value negotiation-salary-value"></span>
            </label>
            <label class="negotiation-slider-label">
              Contract length (seasons)
              <input type="range" name="contractSeasons" min="1" max="3" step="1" class="negotiation-seasons-slider" />
              <span class="negotiation-slider-value negotiation-seasons-value"></span>
            </label>
            <label class="negotiation-slider-label negotiation-buyout-field hidden">
              Buyout to current team
              <input type="range" name="buyoutToTeam" class="negotiation-buyout-slider" />
              <span class="negotiation-slider-value negotiation-buyout-value"></span>
            </label>
            <label>Seat guarantee
              <select name="seatGuarantee">
                <option value="primary">Primary race seat</option>
                <option value="reserve">Reserve / shared</option>
                <option value="none">No guarantee</option>
              </select>
            </label>
          </fieldset>
          <fieldset class="negotiation-fields-sponsor hidden">
            <div class="negotiation-opening negotiation-sponsor-opening hidden">
              <p class="negotiation-inter-opening-label">Their opening ask</p>
              <p class="negotiation-opening-text negotiation-sponsor-opening-text"></p>
            </div>
            <p class="wizard-hint negotiation-sponsor-hint"></p>
            <label class="negotiation-slider-label">
              Signing fee
              <input type="range" name="sponsorSigningFee" class="negotiation-sponsor-signing-slider" />
              <span class="negotiation-slider-value negotiation-sponsor-signing-value"></span>
            </label>
            <label class="negotiation-slider-label">
              Per-race income
              <input type="range" name="perRaceIncome" class="negotiation-income-slider" />
              <span class="negotiation-slider-value negotiation-income-value"></span>
            </label>
            <label class="negotiation-slider-label">
              Podium bonus
              <input type="range" name="podiumBonus" class="negotiation-podium-slider" />
              <span class="negotiation-slider-value negotiation-podium-value"></span>
            </label>
            <label class="negotiation-slider-label">
              Win bonus
              <input type="range" name="winBonus" class="negotiation-win-slider" />
              <span class="negotiation-slider-value negotiation-win-value"></span>
            </label>
            <label class="negotiation-slider-label">
              Contract seasons
              <input type="range" name="sponsorSeasons" min="1" max="3" step="1" class="negotiation-sponsor-seasons-slider" />
              <span class="negotiation-slider-value negotiation-sponsor-seasons-value"></span>
            </label>
          </fieldset>
          <fieldset class="negotiation-fields-inter hidden">
            <div class="negotiation-parties-panel hidden">
              <p class="negotiation-inter-opening-label">Participants</p>
              <ul class="negotiation-parties-list"></ul>
            </div>
            <div class="negotiation-inter-opening hidden">
              <p class="negotiation-inter-opening-label">Their opening ask</p>
              <p class="negotiation-inter-opening-text"></p>
            </div>
            <div class="negotiation-inter-team-asks hidden">
              <p class="negotiation-inter-opening-label">Each team's opening ask</p>
              <ul class="negotiation-inter-team-asks-list"></ul>
            </div>
            <p class="wizard-hint negotiation-inter-hint"></p>
            <label class="negotiation-slider-label">
              Your cost contribution
              <input type="range" name="costContribution" min="${INTER_TEAM_COST_MIN}" max="${INTER_TEAM_COST_MAX}" step="${INTER_TEAM_COST_STEP}" class="negotiation-cost-slider" />
              <span class="negotiation-slider-value negotiation-cost-value"></span>
            </label>
            <label class="negotiation-slider-label negotiation-test-days-field">
              Test days
              <input type="range" name="testDays" min="${INTER_TEAM_TEST_DAYS_MIN}" max="${INTER_TEAM_TEST_DAYS_MAX}" step="1" class="negotiation-days-slider" />
              <span class="negotiation-slider-value negotiation-days-value"></span>
            </label>
            <label class="negotiation-slider-label negotiation-test-hours-field">
              Hours per day
              <input type="range" name="testHoursPerDay" min="${INTER_TEAM_HOURS_PER_DAY_MIN}" max="${INTER_TEAM_HOURS_PER_DAY_MAX}" step="1" class="negotiation-hours-slider" />
              <span class="negotiation-slider-value negotiation-hours-value"></span>
            </label>
            <label class="negotiation-track-field">
              Track
              <select name="sharedTrackId" class="negotiation-track-select"></select>
            </label>
          </fieldset>
          <fieldset class="negotiation-fields-regulatory hidden">
            <div class="negotiation-opening negotiation-reg-opening">
              <p class="negotiation-inter-opening-label">Filing requirement</p>
              <p class="negotiation-opening-text negotiation-reg-fee-text"></p>
            </div>
            <input type="hidden" name="petitionFee" />
            <p class="wizard-hint negotiation-reg-desc"></p>
          </fieldset>
        </form>
        <p class="negotiation-note wizard-hint"></p>
        <div class="negotiation-history"></div>
        <div class="negotiation-actions">
          <button type="button" class="primary-btn negotiation-submit">Submit offer</button>
          <button type="button" class="secondary-btn negotiation-accept hidden">Accept counter</button>
          <button type="button" class="secondary-btn negotiation-withdraw">Walk away</button>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    this.root.querySelector(".negotiation-close")!.addEventListener("click", () => {
      this.handlers.onClose();
      this.hide();
    });
    this.root.querySelector(".negotiation-submit")!.addEventListener("click", () => {
      if (!this.session) return;
      this.handlers.onSubmitOffer(this.session.id, { ...this.draft });
    });
    this.root.querySelector(".negotiation-accept")!.addEventListener("click", () => {
      if (!this.session) return;
      this.handlers.onAcceptCounter(this.session.id);
    });
    this.root.querySelector(".negotiation-withdraw")!.addEventListener("click", () => {
      if (!this.session) return;
      this.handlers.onWithdraw(this.session.id);
      this.hide();
    });

    const form = this.root.querySelector(".negotiation-form")!;
    for (const input of form.querySelectorAll("input, select")) {
      input.addEventListener("input", () => {
        this.syncDraftFromForm();
        this.updateSliderLabels();
      });
    }

    const trackSelect = form.querySelector(".negotiation-track-select")!;
    trackSelect.replaceChildren();
    for (const trackId of ALL_TRACK_IDS) {
      const opt = document.createElement("option");
      opt.value = trackId;
      opt.textContent = trackDisplayName(trackId);
      trackSelect.appendChild(opt);
    }
  }

  activeSession(): NegotiationSessionPayload | null {
    return this.session;
  }

  setErrorMessage(message: string): void {
    const noteEl = this.root.querySelector(".negotiation-note")!;
    noteEl.textContent = message;
    noteEl.classList.add("negotiation-error");
  }

  clearErrorMessage(): void {
    const noteEl = this.root.querySelector(".negotiation-note")!;
    noteEl.classList.remove("negotiation-error");
  }

  show(session: NegotiationSessionPayload, context: NegotiationPanelContext = {}): void {
    this.session = session;
    this.context = context;
    this.clearErrorMessage();
    this.root.classList.remove("hidden");

    const anchor = session.lastCounterOffer ?? session.anchorTerms;
    this.draft = { ...anchor };

    if (session.kind === "sponsor_partnership") {
      this.draft = {
        signingFee: anchor.signingFee,
        perRaceIncome: anchor.perRaceIncome,
        podiumBonus: anchor.podiumBonus,
        winBonus: anchor.winBonus,
        topFiveBonus: anchor.topFiveBonus,
        rdPointsPerRace: anchor.rdPointsPerRace,
        contractSeasons: anchor.contractSeasons ?? 2,
        brandingTier: anchor.brandingTier,
      };
    } else if (session.kind === "driver_employment" || session.kind === "driver_buyout") {
      const listing = context.listing;
      this.draft = {
        signingFee: anchor.signingFee ?? listing?.signingFee,
        salaryPerRace: anchor.salaryPerRace ?? listing?.salaryPerRace,
        contractSeasons: anchor.contractSeasons ?? 2,
        seatGuarantee: anchor.seatGuarantee ?? "primary",
        buyoutToTeam: anchor.buyoutToTeam,
      };
    } else if (session.kind === "inter_team_agreement") {
      this.draft = {
        agreementSubtype: anchor.agreementSubtype,
        partnerTeam: anchor.partnerTeam,
        partnerTeams: anchor.partnerTeams,
        costContribution: anchor.costContribution ?? 180_000,
        testDays: anchor.testDays ?? 2,
        testHoursPerDay: anchor.testHoursPerDay ?? 8,
        sharedTrackId: anchor.sharedTrackId ?? "lemans_la_sarthe",
        contractSeasons: anchor.contractSeasons ?? 1,
        techSharePartIds: anchor.techSharePartIds,
      };
    }

    this.configureSliderRanges(session);
    this.fillForm();
    this.updateSliderLabels();
    this.render();
  }

  updateSession(session: NegotiationSessionPayload): void {
    this.session = session;
    if (session.lastCounterOffer) {
      this.draft = { ...this.draft, ...session.lastCounterOffer };
      this.configureSliderRanges(session);
      this.fillForm();
      this.updateSliderLabels();
    }
    this.render();
    if (
      session.status === "accepted" ||
      session.status === "rejected" ||
      session.status === "withdrawn"
    ) {
      this.hide();
    }
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.session = null;
    this.context = {};
  }

  isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  activeSubjectRef(): string | null {
    return this.session?.subjectRef ?? null;
  }

  private fillForm(): void {
    const form = this.root.querySelector(".negotiation-form") as HTMLFormElement;
    const set = (name: string, value: string | number) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (!el) return;
      if (el.type === "range") {
        const min = Number(el.min);
        const max = Number(el.max);
        const step = Number(el.step) || 1;
        el.value = String(clampMoney(Number(value), min, max, step));
        return;
      }
      el.value = String(value);
    };
    set("signingFee", this.draft.signingFee ?? 0);
    set("salaryPerRace", this.draft.salaryPerRace ?? 0);
    set("contractSeasons", this.draft.contractSeasons ?? 2);
    set("buyoutToTeam", this.draft.buyoutToTeam ?? 0);
    set("sponsorSigningFee", this.draft.signingFee ?? 0);
    set("perRaceIncome", this.draft.perRaceIncome ?? 0);
    set("podiumBonus", this.draft.podiumBonus ?? 0);
    set("winBonus", this.draft.winBonus ?? 0);
    set("sponsorSeasons", this.draft.contractSeasons ?? 2);
    set(
      "costContribution",
      this.clampInterTeamCost(this.draft.costContribution ?? 180_000),
    );
    set(
      "testDays",
      this.clampInterTeamDays(this.draft.testDays ?? 2),
    );
    set(
      "testHoursPerDay",
      this.clampInterTeamHours(this.draft.testHoursPerDay ?? 8),
    );
    const trackSelect = form.elements.namedItem("sharedTrackId") as HTMLSelectElement | null;
    if (trackSelect) {
      const trackId = this.draft.sharedTrackId ?? "lemans_la_sarthe";
      trackSelect.value = ALL_TRACK_IDS.includes(trackId) ? trackId : "lemans_la_sarthe";
    }
    set("petitionFee", this.draft.petitionFee ?? 0);
    const seat = form.elements.namedItem("seatGuarantee") as HTMLSelectElement | null;
    if (seat) seat.value = this.draft.seatGuarantee ?? "primary";
  }

  private syncDraftFromForm(): void {
    const form = this.root.querySelector(".negotiation-form") as HTMLFormElement;
    const num = (name: string) =>
      Number((form.elements.namedItem(name) as HTMLInputElement).value);
    const kind = this.session?.kind;
    if (kind === "sponsor_partnership") {
      this.draft = {
        signingFee: num("sponsorSigningFee"),
        perRaceIncome: num("perRaceIncome"),
        podiumBonus: num("podiumBonus"),
        winBonus: num("winBonus"),
        contractSeasons: num("sponsorSeasons"),
      };
      return;
    }
    if (kind === "inter_team_agreement") {
      this.draft = {
        ...this.draft,
        costContribution: num("costContribution"),
        testDays: num("testDays"),
        testHoursPerDay: num("testHoursPerDay"),
        sharedTrackId: (form.elements.namedItem("sharedTrackId") as HTMLSelectElement).value,
        agreementSubtype: this.draft.agreementSubtype,
        partnerTeam: this.draft.partnerTeam,
        partnerTeams: this.draft.partnerTeams,
        contractSeasons: this.draft.contractSeasons ?? 1,
      };
      return;
    }
    if (kind === "regulatory_petition") {
      this.draft = {
        ...this.draft,
        petitionFee: num("petitionFee"),
        ruleProposalId: this.draft.ruleProposalId,
      };
      return;
    }
    this.draft = {
      signingFee: num("signingFee"),
      salaryPerRace: num("salaryPerRace"),
      contractSeasons: num("contractSeasons"),
      buyoutToTeam: num("buyoutToTeam"),
      seatGuarantee: (form.elements.namedItem("seatGuarantee") as HTMLSelectElement)
        .value as NegotiationTermsPayload["seatGuarantee"],
    };
  }

  private render(): void {
    if (!this.session) return;
    const s = this.session;

    const titleEl = this.root.querySelector(".negotiation-title")!;
    titleEl.textContent = this.context.title ?? kindTitle(s.kind);

    const subtitle = this.root.querySelector(".negotiation-subtitle")!;
    if (s.kind === "sponsor_partnership") {
      subtitle.textContent = `${counterpartyName(s)} — ${formatMoney(s.anchorTerms.perRaceIncome ?? 0)}/race stipend`;
    } else if (s.kind === "inter_team_agreement") {
      const teams = counterpartyTeams(s);
      const sub = s.anchorTerms.agreementSubtype === "tech_share" ? "Technology sharing" : "Joint private testing";
      subtitle.textContent =
        teams.length > 1
          ? `${sub} with ${teams.join(", ")}`
          : `${sub} with ${teams[0] ?? counterpartyName(s)}`;
    } else if (s.kind === "regulatory_petition") {
      subtitle.textContent = this.context.title ?? "ACR regulatory petition";
    } else if (this.context.listing) {
      const d = this.context.listing.driver.name;
      subtitle.textContent = `${d} — ${formatMoney(s.anchorTerms.signingFee ?? 0)} signing`;
    } else {
      subtitle.textContent = counterpartyName(s);
    }

    const moodEl = this.root.querySelector(".negotiation-mood")!;
    moodEl.textContent = `Mood: ${s.counterpartyMood}`;

    const patienceEl = this.root.querySelector(".negotiation-patience")!;
    const pending = s.status === "pending_response" ? " · Awaiting response" : "";
    patienceEl.textContent = `Patience: ${s.patience}% · Round ${s.rounds}/${s.maxRounds}${pending}`;

    this.root.querySelector(".negotiation-fields-driver")!.classList.toggle(
      "hidden",
      s.kind !== "driver_employment" && s.kind !== "driver_buyout",
    );
    this.root.querySelector(".negotiation-fields-sponsor")!.classList.toggle(
      "hidden",
      s.kind !== "sponsor_partnership",
    );
    this.root.querySelector(".negotiation-fields-inter")!.classList.toggle(
      "hidden",
      s.kind !== "inter_team_agreement",
    );
    this.root.querySelector(".negotiation-fields-regulatory")!.classList.toggle(
      "hidden",
      s.kind !== "regulatory_petition",
    );

    const buyoutField = this.root.querySelector(".negotiation-buyout-field")!;
    buyoutField.classList.toggle("hidden", s.kind !== "driver_buyout");

    const lastNote = s.history[s.history.length - 1]?.note;
    const noteEl = this.root.querySelector(".negotiation-note")!;
    if (noteEl.classList.contains("negotiation-error")) {
      // Keep inline validation errors until the next show() or clearErrorMessage().
    } else if (s.status === "pending_response") {
      noteEl.textContent = "Proposal submitted — awaiting response…";
    } else if (s.kind === "inter_team_agreement") {
      const teams = counterpartyTeams(s);
      noteEl.textContent =
        teams.length > 1
          ? "Each team responds independently — testing proceeds with any team that accepts."
          : "Adjust your offer or accept their terms. Rivals respond when you submit.";
    } else {
      noteEl.textContent = lastNote ?? `Negotiate with ${counterpartyName(s)}.`;
    }

    this.renderInterTeamGuidance(s);
    this.renderDriverGuidance(s);
    this.renderSponsorGuidance(s);
    this.renderRegulatoryGuidance(s);

    const acceptBtn = this.root.querySelector(".negotiation-accept")!;
    const asyncDeal = s.kind === "regulatory_petition";
    const canAccept =
      !asyncDeal && s.status === "countered" && Boolean(s.lastCounterOffer);
    if (canAccept) {
      acceptBtn.classList.remove("hidden");
      acceptBtn.textContent = "Accept their offer";
    } else {
      acceptBtn.classList.add("hidden");
    }

    const submitBtn = this.root.querySelector(".negotiation-submit") as HTMLButtonElement;
    submitBtn.disabled = s.status === "pending_response";
    submitBtn.textContent =
      s.status === "pending_response" ? "Awaiting response" : "Submit offer";

    const historyEl = this.root.querySelector(".negotiation-history")!;
    historyEl.innerHTML = s.history.length
      ? `<ul class="negotiation-history-list">${s.history
          .map((h) => {
            const summary = this.historySummary(s.kind, h.terms);
            return `<li><strong>${escapeHtml(h.from)}</strong>: ${summary}${h.note ? ` — ${escapeHtml(h.note)}` : ""}</li>`;
          })
          .join("")}</ul>`
      : "";
  }

  private clampInterTeamCost(value: number): number {
    const stepped =
      Math.round(value / INTER_TEAM_COST_STEP) * INTER_TEAM_COST_STEP;
    return Math.max(INTER_TEAM_COST_MIN, Math.min(INTER_TEAM_COST_MAX, stepped));
  }

  private clampInterTeamDays(value: number): number {
    return Math.max(
      INTER_TEAM_TEST_DAYS_MIN,
      Math.min(INTER_TEAM_TEST_DAYS_MAX, Math.round(value)),
    );
  }

  private clampInterTeamHours(value: number): number {
    return Math.max(
      INTER_TEAM_HOURS_PER_DAY_MIN,
      Math.min(INTER_TEAM_HOURS_PER_DAY_MAX, Math.round(value)),
    );
  }

  private formatInterTeamTestSchedule(terms: NegotiationTermsPayload): string {
    const days = terms.testDays ?? 2;
    const hours = this.clampInterTeamHours(terms.testHoursPerDay ?? 8);
    if (hours >= 24) {
      return `${days} full day${days === 1 ? "" : "s"} (24 h each)`;
    }
    return `${days} day${days === 1 ? "" : "s"} × ${hours} h`;
  }

  private configureSliderRanges(session: NegotiationSessionPayload): void {
    const form = this.root.querySelector(".negotiation-form") as HTMLFormElement;
    const anchor = session.anchorTerms;
    const ask = session.lastCounterOffer ?? anchor;
    const listing = this.context.listing;

    const applyMoney = (
      name: string,
      ref: number,
      step: number,
      floor?: number,
      ceil?: number,
    ) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (!el || el.type !== "range") return;
      const bounds = moneySliderBounds(ref, step, floor, ceil);
      el.min = String(bounds.min);
      el.max = String(bounds.max);
      el.step = String(bounds.step);
    };

    if (
      session.kind === "driver_employment" ||
      session.kind === "driver_buyout"
    ) {
      const signingRef = Math.max(
        anchor.signingFee ?? listing?.signingFee ?? 0,
        ask.signingFee ?? 0,
      );
      const salaryRef = Math.max(
        anchor.salaryPerRace ?? listing?.salaryPerRace ?? 0,
        ask.salaryPerRace ?? 0,
      );
      applyMoney("signingFee", signingRef, 5_000);
      applyMoney("salaryPerRace", salaryRef, 500);
      if (session.kind === "driver_buyout") {
        const buyoutRef = Math.max(
          anchor.buyoutToTeam ?? 0,
          ask.buyoutToTeam ?? 0,
          signingRef * 0.4,
        );
        applyMoney("buyoutToTeam", buyoutRef, 5_000, 0.55, 1.45);
      }
    }

    if (session.kind === "sponsor_partnership") {
      applyMoney(
        "sponsorSigningFee",
        Math.max(anchor.signingFee ?? 0, ask.signingFee ?? 0),
        5_000,
      );
      applyMoney(
        "perRaceIncome",
        Math.max(anchor.perRaceIncome ?? 0, ask.perRaceIncome ?? 0),
        1_000,
      );
      applyMoney(
        "podiumBonus",
        Math.max(anchor.podiumBonus ?? 0, ask.podiumBonus ?? 0),
        1_000,
        0.5,
        1.8,
      );
      applyMoney(
        "winBonus",
        Math.max(anchor.winBonus ?? 0, ask.winBonus ?? 0),
        1_000,
        0.5,
        1.8,
      );
    }
  }

  private updateSliderLabels(): void {
    const setMoney = (selector: string, value: number) => {
      const el = this.root.querySelector(selector);
      if (el) el.textContent = formatMoney(value);
    };
    const setSeasons = (selector: string, seasons: number) => {
      const el = this.root.querySelector(selector);
      if (el) {
        el.textContent = `${seasons} season${seasons === 1 ? "" : "s"}`;
      }
    };

    setMoney(".negotiation-cost-value", this.draft.costContribution ?? 0);
    const days = this.draft.testDays ?? 2;
    const daysEl = this.root.querySelector(".negotiation-days-value");
    if (daysEl) {
      daysEl.textContent = `${days} day${days === 1 ? "" : "s"}`;
    }
    const hours = this.clampInterTeamHours(this.draft.testHoursPerDay ?? 8);
    const hoursEl = this.root.querySelector(".negotiation-hours-value");
    if (hoursEl) {
      hoursEl.textContent =
        hours >= 24 ? "24 h (full day)" : `${hours} h`;
    }

    setMoney(".negotiation-signing-value", this.draft.signingFee ?? 0);
    setMoney(".negotiation-salary-value", this.draft.salaryPerRace ?? 0);
    setSeasons(".negotiation-seasons-value", this.draft.contractSeasons ?? 2);
    setMoney(".negotiation-buyout-value", this.draft.buyoutToTeam ?? 0);

    setMoney(".negotiation-sponsor-signing-value", this.draft.signingFee ?? 0);
    setMoney(".negotiation-income-value", this.draft.perRaceIncome ?? 0);
    setMoney(".negotiation-podium-value", this.draft.podiumBonus ?? 0);
    setMoney(".negotiation-win-value", this.draft.winBonus ?? 0);
    setSeasons(
      ".negotiation-sponsor-seasons-value",
      this.draft.contractSeasons ?? 2,
    );
  }

  private renderDriverGuidance(s: NegotiationSessionPayload): void {
    const fieldset = this.root.querySelector(".negotiation-fields-driver");
    if (
      !fieldset ||
      (s.kind !== "driver_employment" && s.kind !== "driver_buyout")
    ) {
      return;
    }

    const opening = s.lastCounterOffer ?? s.history[0]?.terms;
    const openingBox = fieldset.querySelector(".negotiation-driver-opening")!;
    const openingText = fieldset.querySelector(".negotiation-driver-opening-text")!;
    const hintEl = fieldset.querySelector(".negotiation-driver-hint")!;
    const driverName = this.context.listing?.driver.name ?? counterpartyName(s);

    if (opening && s.status === "countered") {
      openingBox.classList.remove("hidden");
      const parts = [
        `${formatMoney(opening.signingFee ?? 0)} signing`,
        `${formatMoney(opening.salaryPerRace ?? 0)} per race`,
        `${opening.contractSeasons ?? 2} season(s)`,
      ];
      if (s.kind === "driver_buyout" && opening.buyoutToTeam) {
        parts.push(`${formatMoney(opening.buyoutToTeam)} buyout`);
      }
      openingText.textContent = parts.join(" · ");
      const listSigning = s.anchorTerms.signingFee ?? 0;
      const askSigning = opening.signingFee ?? listSigning;
      hintEl.textContent =
        askSigning > listSigning
          ? `Listed at ${formatMoney(listSigning)} signing — ${driverName} opened above the listing. Match or beat their ask on pay and seat guarantee to improve acceptance odds.`
          : `Ballpark: meet ${formatMoney(askSigning)} signing and primary seat guarantee. Stronger offers on salary improve acceptance odds.`;
    } else {
      openingBox.classList.add("hidden");
      hintEl.textContent = "";
    }
  }

  private renderSponsorGuidance(s: NegotiationSessionPayload): void {
    const fieldset = this.root.querySelector(".negotiation-fields-sponsor");
    if (!fieldset || s.kind !== "sponsor_partnership") return;

    const opening = s.lastCounterOffer ?? s.history[0]?.terms;
    const openingBox = fieldset.querySelector(".negotiation-sponsor-opening")!;
    const openingText = fieldset.querySelector(".negotiation-sponsor-opening-text")!;
    const hintEl = fieldset.querySelector(".negotiation-sponsor-hint")!;
    const sponsorName = counterpartyName(s);

    if (opening && s.status === "countered") {
      openingBox.classList.remove("hidden");
      openingText.textContent = [
        `${formatMoney(opening.signingFee ?? 0)} signing`,
        `${formatMoney(opening.perRaceIncome ?? 0)}/race`,
        `${formatMoney(opening.podiumBonus ?? 0)} podium`,
        `${opening.contractSeasons ?? 2} season(s)`,
      ].join(" · ");
      const listIncome = s.anchorTerms.perRaceIncome ?? 0;
      const askIncome = opening.perRaceIncome ?? listIncome;
      hintEl.textContent =
        askIncome > listIncome
          ? `Catalog rate is ${formatMoney(listIncome)}/race — ${sponsorName} wants more. Beat their opening on income and bonuses to close the deal.`
          : `Ballpark: ${formatMoney(askIncome)}/race plus signing fee. Higher per-race income and longer contracts improve acceptance odds.`;
    } else {
      openingBox.classList.add("hidden");
      hintEl.textContent = "";
    }
  }

  private renderRegulatoryGuidance(s: NegotiationSessionPayload): void {
    const fieldset = this.root.querySelector(".negotiation-fields-regulatory");
    if (!fieldset || s.kind !== "regulatory_petition") return;

    const fee = s.anchorTerms.petitionFee ?? 0;
    const feeText = fieldset.querySelector(".negotiation-reg-fee-text")!;
    feeText.textContent = `${formatMoney(fee)} petition fee — payable when you file.`;
    const descEl = fieldset.querySelector(".negotiation-reg-desc")!;
    descEl.textContent =
      "The ACR reviews petitions when you file. Higher prestige and a clear class case improve approval odds.";
  }

  private renderInterTeamGuidance(s: NegotiationSessionPayload): void {
    const fieldset = this.root.querySelector(".negotiation-fields-inter");
    if (!fieldset || s.kind !== "inter_team_agreement") return;

    const teams = counterpartyTeams(s);
    const isTechShare = s.anchorTerms.agreementSubtype === "tech_share";
    const multiParty = teams.length > 1;

    fieldset.querySelector(".negotiation-test-days-field")?.classList.toggle(
      "hidden",
      isTechShare,
    );
    fieldset.querySelector(".negotiation-track-field")?.classList.toggle(
      "hidden",
      isTechShare,
    );

    const partiesPanel = fieldset.querySelector(".negotiation-parties-panel")!;
    const partiesList = fieldset.querySelector(".negotiation-parties-list")!;
    if (multiParty) {
      partiesPanel.classList.remove("hidden");
      partiesList.innerHTML = teams
        .map((team) => `<li>${escapeHtml(team)}</li>`)
        .join("");
    } else {
      partiesPanel.classList.add("hidden");
      partiesList.innerHTML = "";
    }

    const opening = s.lastCounterOffer ?? s.history[0]?.terms;
    const openingBox = fieldset.querySelector(".negotiation-inter-opening")!;
    const openingText = fieldset.querySelector(".negotiation-inter-opening-text")!;
    const teamAsksBox = fieldset.querySelector(".negotiation-inter-team-asks")!;
    const teamAsksList = fieldset.querySelector(".negotiation-inter-team-asks-list")!;

    if (multiParty && s.status === "countered") {
      openingBox.classList.add("hidden");
      teamAsksBox.classList.remove("hidden");
      const openingEntries = s.history.filter(
        (entry) => entry.from !== "player" && teams.includes(entry.from),
      );
      teamAsksList.innerHTML = openingEntries
        .map((entry) => {
          const terms = entry.terms;
          const summary = isTechShare
            ? formatMoney(terms.costContribution ?? 0)
            : `${this.formatInterTeamTestSchedule(terms)} · ${trackDisplayName(terms.sharedTrackId ?? "lemans_la_sarthe")} · ${formatMoney(terms.costContribution ?? 0)}`;
          return `<li><strong>${escapeHtml(entry.from)}</strong>: ${escapeHtml(summary)}</li>`;
        })
        .join("");
    } else if (opening && s.status === "countered") {
      teamAsksBox.classList.add("hidden");
      openingBox.classList.remove("hidden");
      if (isTechShare) {
        openingText.textContent = `${formatMoney(opening.costContribution ?? 0)} cost contribution for shared R&D access.`;
      } else {
        openingText.textContent = `${this.formatInterTeamTestSchedule(opening)} at ${trackDisplayName(opening.sharedTrackId ?? "lemans_la_sarthe")} · ${formatMoney(opening.costContribution ?? 0)} from your budget.`;
      }
    } else {
      openingBox.classList.add("hidden");
      teamAsksBox.classList.add("hidden");
    }

    const hintEl = fieldset.querySelector(".negotiation-inter-hint")!;
    const ask = opening?.costContribution ?? s.anchorTerms.costContribution ?? 180_000;
    if (isTechShare) {
      hintEl.textContent = `Match or exceed ${formatMoney(ask)} to improve acceptance odds. Stronger teams ask for more — counter with a higher contribution if they seem reluctant.`;
      return;
    }
    const trackHint = opening?.sharedTrackId
      ? ` Use ${trackDisplayName(opening.sharedTrackId)} if you want to align with their preference.`
      : "";
    if (multiParty) {
      hintEl.textContent = `Combined ballpark: ${formatMoney(ask)}+ contribution for ${opening?.testDays ?? 2} test day(s).${trackHint} Each team decides independently — you may get a partial deal if only some accept.`;
      return;
    }
    hintEl.textContent = `Ballpark: ${formatMoney(ask)}+ contribution for ${opening?.testDays ?? 2} test day(s).${trackHint} Meeting or beating their ask on cost improves the chance they accept after the next weekend.`;
  }

  private historySummary(
    kind: NegotiationKind,
    terms: NegotiationTermsPayload,
  ): string {
    if (kind === "inter_team_agreement") {
      if (terms.agreementSubtype === "tech_share" || terms.techSharePartIds) {
        return formatMoney(terms.costContribution ?? 0);
      }
      const track = terms.sharedTrackId
        ? trackDisplayName(terms.sharedTrackId)
        : "TBD";
      return `${this.formatInterTeamTestSchedule(terms)} · ${track} · ${formatMoney(terms.costContribution ?? 0)}`;
    }
    if (terms.perRaceIncome != null) {
      return `${formatMoney(terms.perRaceIncome)}/race`;
    }
    if (terms.costContribution != null) {
      return formatMoney(terms.costContribution);
    }
    return `${formatMoney(terms.signingFee ?? 0)} signing`;
  }
}
