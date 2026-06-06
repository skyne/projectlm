import type { ClientRole } from "../ws/protocol";

export interface JoinSessionOptions {
  displayName: string;
  requestedRole: ClientRole;
}

export class JoinSessionModal {
  readonly root: HTMLElement;
  private nameInput: HTMLInputElement;
  private roleSelect: HTMLSelectElement;
  private errorEl: HTMLElement;
  private onSubmitHandler: ((opts: JoinSessionOptions) => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "join-session-overlay";
    this.root.innerHTML = `
      <div class="join-session-card" role="dialog" aria-labelledby="join-session-title">
        <header class="join-session-header">
          <h2 id="join-session-title">Join session</h2>
          <p class="join-session-subtitle">Choose a display name for the pit wall roster.</p>
        </header>
        <form class="join-session-form">
          <label class="join-session-field">
            <span>Display name</span>
            <input
              type="text"
              class="join-session-name"
              minlength="2"
              maxlength="24"
              autocomplete="nickname"
              placeholder="e.g. Daniel"
              required
            />
          </label>
          <label class="join-session-field">
            <span>Role</span>
            <select class="join-session-role">
              <option value="player">Pit crew (player)</option>
              <option value="host">Host (team manager)</option>
              <option value="spectator">Spectator (read-only)</option>
            </select>
          </label>
          <p class="join-session-hint">First joiner becomes host if no host is connected. Spectators can watch but not control the race.</p>
          <p class="join-session-error hidden"></p>
          <footer class="join-session-actions">
            <button type="submit" class="primary-btn join-session-submit">Join</button>
          </footer>
        </form>
      </div>
    `;
    container.appendChild(this.root);

    this.nameInput = this.root.querySelector(".join-session-name")!;
    this.roleSelect = this.root.querySelector(".join-session-role")!;
    this.errorEl = this.root.querySelector(".join-session-error")!;

    const form = this.root.querySelector(".join-session-form")!;
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      this.submit();
    });
    this.root.classList.add("hidden");
  }

  onSubmit(handler: (opts: JoinSessionOptions) => void): void {
    this.onSubmitHandler = handler;
  }

  show(initial?: Partial<JoinSessionOptions>): void {
    this.root.classList.remove("hidden");
    this.errorEl.classList.add("hidden");
    if (initial?.displayName) this.nameInput.value = initial.displayName;
    if (initial?.requestedRole) this.roleSelect.value = initial.requestedRole;
    this.nameInput.focus();
    this.nameInput.select();
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  setError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.classList.remove("hidden");
  }

  private submit(): void {
    const displayName = this.nameInput.value.replace(/[\x00-\x1f\x7f]/g, "").trim();
    if (displayName.length < 2 || displayName.length > 24) {
      this.setError("Display name must be 2–24 characters.");
      return;
    }
    const requestedRole = this.roleSelect.value as ClientRole;
    this.errorEl.classList.add("hidden");
    this.onSubmitHandler?.({ displayName, requestedRole });
  }
}
