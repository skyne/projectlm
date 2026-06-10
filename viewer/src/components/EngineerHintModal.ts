import type { EngineerHintPayload } from "../ws/protocol";

export interface EngineerHintModalHandlers {
  onBox: (hint: EngineerHintPayload) => void;
  onDismiss: (hint: EngineerHintPayload) => void;
}

export class EngineerHintModal {
  readonly root: HTMLElement;
  private titleEl: HTMLElement;
  private messageEl: HTMLElement;
  private carEl: HTMLElement;
  private boxBtn: HTMLButtonElement;
  private dismissBtn: HTMLButtonElement;
  private handlers: EngineerHintModalHandlers;
  private activeHint: EngineerHintPayload | null = null;

  constructor(container: HTMLElement, handlers: EngineerHintModalHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "engineer-hint-overlay hidden";
    this.root.innerHTML = `
      <div class="engineer-hint-card" role="alertdialog" aria-modal="true" aria-labelledby="engineer-hint-title">
        <header class="engineer-hint-header">
          <span class="engineer-hint-radio-badge">Radio</span>
          <h2 id="engineer-hint-title">Race Engineer</h2>
          <p class="engineer-hint-car"></p>
        </header>
        <p class="engineer-hint-message"></p>
        <footer class="engineer-hint-actions">
          <button type="button" class="secondary-btn engineer-hint-dismiss">Ignore</button>
          <button type="button" class="primary-btn engineer-hint-box">Box now</button>
        </footer>
      </div>
    `;
    container.appendChild(this.root);

    this.titleEl = this.root.querySelector("h2")!;
    this.carEl = this.root.querySelector(".engineer-hint-car")!;
    this.messageEl = this.root.querySelector(".engineer-hint-message")!;
    this.boxBtn = this.root.querySelector(".engineer-hint-box")!;
    this.dismissBtn = this.root.querySelector(".engineer-hint-dismiss")!;

    this.boxBtn.addEventListener("click", () => {
      if (!this.activeHint) return;
      const hint = this.activeHint;
      this.hide();
      this.handlers.onBox(hint);
    });
    this.dismissBtn.addEventListener("click", () => {
      if (!this.activeHint) return;
      const hint = this.activeHint;
      this.hide();
      this.handlers.onDismiss(hint);
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.isVisible()) {
        if (!this.activeHint) return;
        const hint = this.activeHint;
        this.hide();
        this.handlers.onDismiss(hint);
      }
    });
  }

  show(hint: EngineerHintPayload): void {
    this.activeHint = hint;
    this.titleEl.textContent = "Race Engineer";
    this.carEl.textContent = `Car #${hint.carNumber}`;
    this.messageEl.textContent = hint.text;
    this.root.classList.remove("hidden");
    this.boxBtn.focus();
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.activeHint = null;
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  getActiveHint(): EngineerHintPayload | null {
    return this.activeHint;
  }
}
