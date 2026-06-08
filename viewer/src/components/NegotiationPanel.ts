import type {
  DriverMarketListingPayload,
  NegotiationKind,
  NegotiationSessionPayload,
  NegotiationTermsPayload,
} from "../ws/protocol";
import { escapeHtml } from "../utils/mmUi";

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

function counterpartyName(session: NegotiationSessionPayload): string {
  return (
    session.parties.find((p) => p.role === "counterparty")?.displayName ??
    "Counterparty"
  );
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
            <label>Signing fee <input type="number" name="signingFee" min="0" step="1000" /></label>
            <label>Salary / race <input type="number" name="salaryPerRace" min="0" step="500" /></label>
            <label>Contract length (seasons) <input type="number" name="contractSeasons" min="1" max="3" step="1" /></label>
            <label class="negotiation-buyout-field hidden">Buyout to current team
              <input type="number" name="buyoutToTeam" min="0" step="5000" />
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
            <label>Signing fee <input type="number" name="sponsorSigningFee" min="0" step="1000" /></label>
            <label>Per-race income <input type="number" name="perRaceIncome" min="0" step="1000" /></label>
            <label>Podium bonus <input type="number" name="podiumBonus" min="0" step="1000" /></label>
            <label>Win bonus <input type="number" name="winBonus" min="0" step="1000" /></label>
            <label>Contract seasons <input type="number" name="sponsorSeasons" min="1" max="3" step="1" /></label>
          </fieldset>
          <fieldset class="negotiation-fields-inter hidden">
            <label>Your cost contribution <input type="number" name="costContribution" min="0" step="5000" /></label>
            <label>Test days <input type="number" name="testDays" min="1" max="5" step="1" /></label>
            <label>Track ID <input type="text" name="sharedTrackId" /></label>
          </fieldset>
          <fieldset class="negotiation-fields-regulatory hidden">
            <label>Petition fee <input type="number" name="petitionFee" min="0" step="10000" readonly /></label>
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
      input.addEventListener("input", () => this.syncDraftFromForm());
    }
  }

  show(session: NegotiationSessionPayload, context: NegotiationPanelContext = {}): void {
    this.session = session;
    this.context = context;
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
    }

    this.fillForm();
    this.render();
  }

  updateSession(session: NegotiationSessionPayload): void {
    this.session = session;
    if (session.lastCounterOffer) {
      this.draft = { ...this.draft, ...session.lastCounterOffer };
      this.fillForm();
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
      if (el) el.value = String(value);
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
    set("costContribution", this.draft.costContribution ?? 0);
    set("testDays", this.draft.testDays ?? 2);
    set("sharedTrackId", this.draft.sharedTrackId ?? "");
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
        sharedTrackId: (form.elements.namedItem("sharedTrackId") as HTMLInputElement).value,
        agreementSubtype: this.draft.agreementSubtype,
        partnerTeam: this.draft.partnerTeam,
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
      const sub = s.anchorTerms.agreementSubtype === "tech_share" ? "Technology sharing" : "Joint private testing";
      subtitle.textContent = `${sub} with ${counterpartyName(s)}`;
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
    if (s.status === "pending_response") {
      noteEl.textContent = "Proposal submitted — rival/regulator responds after the next race weekend.";
    } else {
      noteEl.textContent = lastNote ?? `Negotiate with ${counterpartyName(s)}.`;
    }

    const acceptBtn = this.root.querySelector(".negotiation-accept")!;
    const asyncDeal =
      s.kind === "inter_team_agreement" || s.kind === "regulatory_petition";
    if (!asyncDeal && s.status === "countered" && s.lastCounterOffer) {
      acceptBtn.classList.remove("hidden");
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
            const summary =
              h.terms.perRaceIncome != null
                ? `${formatMoney(h.terms.perRaceIncome)}/race`
                : h.terms.costContribution != null
                  ? formatMoney(h.terms.costContribution)
                  : `${formatMoney(h.terms.signingFee ?? 0)} signing`;
            return `<li><strong>${escapeHtml(h.from)}</strong>: ${summary}${h.note ? ` — ${escapeHtml(h.note)}` : ""}</li>`;
          })
          .join("")}</ul>`
      : "";
  }
}
