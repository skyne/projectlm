import type { ChassisBias } from "../utils/briefingUi";

export interface SetupSuggestionChipsHandlers {
  onApply: (bias: ChassisBias) => void;
}

export class SetupSuggestionChips {
  readonly root: HTMLElement;
  private handlers: SetupSuggestionChipsHandlers;
  private activeBias: ChassisBias | null = null;

  constructor(handlers: SetupSuggestionChipsHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "briefing-setup-chips hidden";
    this.root.innerHTML = `
      <span class="briefing-chips-label">Setup suggestion</span>
      <div class="briefing-chip-row">
        <button type="button" class="secondary-btn briefing-chip" data-bias="quali">Quali trim</button>
        <button type="button" class="secondary-btn briefing-chip" data-bias="race">Race trim</button>
        <button type="button" class="secondary-btn briefing-chip" data-bias="stable">Stable</button>
      </div>
    `;
    this.root.querySelectorAll<HTMLButtonElement>(".briefing-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bias = btn.dataset.bias as ChassisBias;
        this.activeBias = bias;
        this.renderActive();
        this.handlers.onApply(bias);
      });
    });
  }

  setSuggested(bias: ChassisBias | undefined): void {
    if (!bias) {
      this.root.classList.add("hidden");
      return;
    }
    this.root.classList.remove("hidden");
    this.activeBias = null;
    this.renderActive();
  }

  private renderActive(): void {
    this.root.querySelectorAll<HTMLButtonElement>(".briefing-chip").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.bias === this.activeBias);
    });
  }
}
