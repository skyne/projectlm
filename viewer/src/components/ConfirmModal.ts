export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export class ConfirmModal {
  readonly root: HTMLElement;
  private titleEl: HTMLElement;
  private messageEl: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private resolvePending: ((confirmed: boolean) => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "confirm-modal-overlay hidden";
    this.root.innerHTML = `
      <div class="confirm-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <header class="confirm-modal-header">
          <h2 id="confirm-modal-title"></h2>
          <p class="confirm-modal-message"></p>
        </header>
        <footer class="confirm-modal-actions">
          <button type="button" class="secondary-btn confirm-modal-cancel">Cancel</button>
          <button type="button" class="primary-btn confirm-modal-confirm">Confirm</button>
        </footer>
      </div>
    `;
    container.appendChild(this.root);

    this.titleEl = this.root.querySelector("h2")!;
    this.messageEl = this.root.querySelector(".confirm-modal-message")!;
    this.confirmBtn = this.root.querySelector(".confirm-modal-confirm")!;
    this.cancelBtn = this.root.querySelector(".confirm-modal-cancel")!;

    this.cancelBtn.addEventListener("click", () => this.close(false));
    this.confirmBtn.addEventListener("click", () => this.close(true));
    this.root.addEventListener("click", (ev) => {
      if (ev.target === this.root) this.close(false);
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.isVisible()) this.close(false);
    });
  }

  show(options: ConfirmModalOptions): Promise<boolean> {
    if (this.resolvePending) this.close(false);

    this.titleEl.textContent = options.title;
    this.messageEl.textContent = options.message;
    this.confirmBtn.textContent = options.confirmLabel ?? "Confirm";
    this.cancelBtn.textContent = options.cancelLabel ?? "Cancel";
    this.confirmBtn.classList.toggle("danger-btn", options.destructive === true);
    this.confirmBtn.classList.toggle("primary-btn", options.destructive !== true);

    this.root.classList.remove("hidden");
    this.cancelBtn.focus();

    return new Promise((resolve) => {
      this.resolvePending = resolve;
    });
  }

  hide(): void {
    this.close(false);
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  private close(confirmed: boolean): void {
    this.root.classList.add("hidden");
    const resolve = this.resolvePending;
    this.resolvePending = null;
    resolve?.(confirmed);
  }
}
