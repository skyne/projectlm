import type {
  DriverMarketListingPayload,
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

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

function counterpartyName(session: NegotiationSessionPayload): string {
  return (
    session.parties.find((p) => p.role === "counterparty")?.displayName ??
    "Counterparty"
  );
}

export class NegotiationPanel {
  private readonly root: HTMLElement;
  private session: NegotiationSessionPayload | null = null;
  private listing: DriverMarketListingPayload | null = null;
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
          <label>Signing fee
            <input type="number" name="signingFee" min="0" step="1000" />
          </label>
          <label>Salary / race
            <input type="number" name="salaryPerRace" min="0" step="500" />
          </label>
          <label>Contract length (seasons)
            <input type="number" name="contractSeasons" min="1" max="3" step="1" />
          </label>
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

  show(
    session: NegotiationSessionPayload,
    listing: DriverMarketListingPayload,
  ): void {
    this.session = session;
    this.listing = listing;
    this.root.classList.remove("hidden");

    const anchor = session.lastCounterOffer ?? session.anchorTerms;
    this.draft = {
      signingFee: anchor.signingFee ?? listing.signingFee,
      salaryPerRace: anchor.salaryPerRace ?? listing.salaryPerRace,
      contractSeasons: anchor.contractSeasons ?? 2,
      seatGuarantee: anchor.seatGuarantee ?? "primary",
      buyoutToTeam: anchor.buyoutToTeam,
    };
    this.fillForm();
    this.render();
  }

  updateSession(session: NegotiationSessionPayload): void {
    this.session = session;
    if (session.lastCounterOffer) {
      this.draft = {
        ...this.draft,
        ...session.lastCounterOffer,
      };
      this.fillForm();
    }
    this.render();
    if (session.status === "accepted" || session.status === "rejected" || session.status === "withdrawn") {
      this.hide();
    }
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.session = null;
    this.listing = null;
  }

  isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  activeSubjectRef(): string | null {
    return this.session?.subjectRef ?? null;
  }

  private fillForm(): void {
    const form = this.root.querySelector(".negotiation-form") as HTMLFormElement;
    (form.elements.namedItem("signingFee") as HTMLInputElement).value = String(
      this.draft.signingFee ?? 0,
    );
    (form.elements.namedItem("salaryPerRace") as HTMLInputElement).value = String(
      this.draft.salaryPerRace ?? 0,
    );
    (form.elements.namedItem("contractSeasons") as HTMLInputElement).value = String(
      this.draft.contractSeasons ?? 2,
    );
    (form.elements.namedItem("buyoutToTeam") as HTMLInputElement).value = String(
      this.draft.buyoutToTeam ?? 0,
    );
    (form.elements.namedItem("seatGuarantee") as HTMLSelectElement).value =
      this.draft.seatGuarantee ?? "primary";
  }

  private syncDraftFromForm(): void {
    const form = this.root.querySelector(".negotiation-form") as HTMLFormElement;
    this.draft = {
      signingFee: Number(
        (form.elements.namedItem("signingFee") as HTMLInputElement).value,
      ),
      salaryPerRace: Number(
        (form.elements.namedItem("salaryPerRace") as HTMLInputElement).value,
      ),
      contractSeasons: Number(
        (form.elements.namedItem("contractSeasons") as HTMLInputElement).value,
      ),
      buyoutToTeam: Number(
        (form.elements.namedItem("buyoutToTeam") as HTMLInputElement).value,
      ),
      seatGuarantee: (form.elements.namedItem("seatGuarantee") as HTMLSelectElement)
        .value as NegotiationTermsPayload["seatGuarantee"],
    };
  }

  private render(): void {
    if (!this.session || !this.listing) return;
    const s = this.session;
    const driverName = this.listing.driver.name;

    const subtitle = this.root.querySelector(".negotiation-subtitle")!;
    subtitle.textContent = `${driverName} — asking ${formatMoney(s.anchorTerms.signingFee ?? 0)} signing, ${formatMoney(s.anchorTerms.salaryPerRace ?? 0)}/race`;

    const moodEl = this.root.querySelector(".negotiation-mood")!;
    moodEl.textContent = `Mood: ${s.counterpartyMood}`;

    const patienceEl = this.root.querySelector(".negotiation-patience")!;
    patienceEl.textContent = `Patience: ${s.patience}% · Round ${s.rounds}/${s.maxRounds}`;

    const buyoutField = this.root.querySelector(".negotiation-buyout-field")!;
    if (s.kind === "driver_buyout") {
      buyoutField.classList.remove("hidden");
    } else {
      buyoutField.classList.add("hidden");
    }

    const lastNote = s.history[s.history.length - 1]?.note;
    const noteEl = this.root.querySelector(".negotiation-note")!;
    noteEl.textContent = lastNote ?? `Negotiate with ${counterpartyName(s)}.`;

    const acceptBtn = this.root.querySelector(".negotiation-accept")!;
    if (s.status === "countered" && s.lastCounterOffer) {
      acceptBtn.classList.remove("hidden");
    } else {
      acceptBtn.classList.add("hidden");
    }

    const historyEl = this.root.querySelector(".negotiation-history")!;
    if (!s.history.length) {
      historyEl.innerHTML = "";
    } else {
      historyEl.innerHTML = `<ul class="negotiation-history-list">${s.history
        .map(
          (h) =>
            `<li><strong>${escapeHtml(h.from)}</strong>: ${formatMoney(h.terms.signingFee ?? 0)} + ${formatMoney(h.terms.salaryPerRace ?? 0)}/race${h.note ? ` — ${escapeHtml(h.note)}` : ""}</li>`,
        )
        .join("")}</ul>`;
    }
  }
}
