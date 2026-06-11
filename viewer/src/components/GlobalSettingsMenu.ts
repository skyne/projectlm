export interface GlobalSettingsHandlers {
  onRestartRace: () => void;
  onEndSession: () => void;
  onChangeIdentity: () => void;
  onEngineerHintsChange?: (enabled: boolean) => void;
}

export interface GlobalSettingsOptions {
  engineerHintsEnabled?: boolean;
}

const SETTINGS_ICON = `<svg class="global-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m9.4 4a7.4 7.4 0 0 1-.1 1l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-1.7 1l-.4 2.6H9.2l-.4-2.6a7.6 7.6 0 0 1-1.7-1l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1-.1-1 7.4 7.4 0 0 1 .1-1l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 1.7-1l.4-2.6h5.6l.4 2.6a7.6 7.6 0 0 1 1.7 1l2.4-1 2 3.4-2 1.6q.1.5.1 1"/>
</svg>`;

export class GlobalSettingsMenu {
  readonly root: HTMLElement;
  readonly audioMount: HTMLElement;
  private menu: HTMLElement;
  private btn: HTMLButtonElement;
  private restartBtn: HTMLButtonElement;
  private endBtn: HTMLButtonElement;
  private identityBtn: HTMLButtonElement;
  private identitySection: HTMLElement;
  private engineerHintsToggle: HTMLInputElement;
  private docListener: ((ev: MouseEvent) => void) | null = null;

  constructor(
    container: HTMLElement,
    handlers: GlobalSettingsHandlers,
    options: GlobalSettingsOptions = {},
  ) {
    this.root = document.createElement("div");
    this.root.className = "global-settings";
    this.root.innerHTML = `
      <button
        type="button"
        class="global-settings-btn"
        aria-label="Settings"
        aria-expanded="false"
        aria-haspopup="true"
        title="Settings"
      >
        ${SETTINGS_ICON}
      </button>
      <div class="global-settings-menu hidden" role="menu">
        <div class="global-settings-menu-head">
          <span class="global-settings-menu-title">Settings</span>
        </div>
        <div class="global-settings-session">
          <p class="global-settings-heading">Session</p>
          <div class="global-settings-actions">
            <button type="button" class="global-settings-action secondary-btn" data-action="restart">
              ↺ Restart session
            </button>
            <button type="button" class="global-settings-action secondary-btn danger-btn" data-action="end">
              End session
            </button>
          </div>
        </div>
        <div class="global-settings-gameplay">
          <p class="global-settings-heading">Gameplay</p>
          <label class="audio-toggle-row">
            <input type="checkbox" class="engineer-hints-toggle" checked />
            <span>Engineer radio hints</span>
          </label>
        </div>
        <p class="global-settings-heading">Audio</p>
        <div class="global-settings-audio"></div>
        <div class="global-settings-identity hidden">
          <p class="global-settings-heading">Account</p>
          <button type="button" class="global-settings-action secondary-btn" data-action="identity">
            Change identity
          </button>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.btn = this.root.querySelector(".global-settings-btn")!;
    this.menu = this.root.querySelector(".global-settings-menu")!;
    this.audioMount = this.root.querySelector(".global-settings-audio")!;
    this.restartBtn = this.root.querySelector('[data-action="restart"]')!;
    this.endBtn = this.root.querySelector('[data-action="end"]')!;
    this.identityBtn = this.root.querySelector('[data-action="identity"]')!;
    this.identitySection = this.root.querySelector(".global-settings-identity")!;
    this.engineerHintsToggle = this.root.querySelector(".engineer-hints-toggle")!;
    this.engineerHintsToggle.checked = options.engineerHintsEnabled ?? true;

    this.btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.toggleMenu();
    });

    this.restartBtn.addEventListener("click", () => {
      this.closeMenu();
      handlers.onRestartRace();
    });

    this.endBtn.addEventListener("click", () => {
      this.closeMenu();
      handlers.onEndSession();
    });

    this.identityBtn.addEventListener("click", () => {
      this.closeMenu();
      handlers.onChangeIdentity();
    });

    this.engineerHintsToggle.addEventListener("change", () => {
      handlers.onEngineerHintsChange?.(this.engineerHintsToggle.checked);
    });
  }

  setEngineerHintsEnabled(enabled: boolean): void {
    this.engineerHintsToggle.checked = enabled;
  }

  setIdentityVisible(visible: boolean): void {
    this.identitySection.classList.toggle("hidden", !visible);
  }

  setSessionActionsVisible(visible: boolean): void {
    this.root.querySelector(".global-settings-session")?.classList.toggle("hidden", !visible);
  }

  setControlsEnabled(enabled: boolean): void {
    this.restartBtn.disabled = !enabled;
    this.endBtn.disabled = !enabled;
    this.root.classList.toggle("spectator-readonly", !enabled);
  }

  markRaceComplete(): void {
    this.restartBtn.disabled = true;
    this.endBtn.disabled = true;
  }

  resetSession(): void {
    this.restartBtn.disabled = false;
    this.endBtn.disabled = false;
  }

  private toggleMenu(): void {
    const willOpen = this.menu.classList.contains("hidden");
    if (!willOpen) {
      this.closeMenu();
      return;
    }
    this.menu.classList.remove("hidden");
    this.btn.setAttribute("aria-expanded", "true");
    this.docListener = (ev: MouseEvent) => {
      if (!this.menu.contains(ev.target as Node) && !this.btn.contains(ev.target as Node)) {
        this.closeMenu();
      }
    };
    document.addEventListener("click", this.docListener);
  }

  private closeMenu(): void {
    this.menu.classList.add("hidden");
    this.btn.setAttribute("aria-expanded", "false");
    if (this.docListener) {
      document.removeEventListener("click", this.docListener);
      this.docListener = null;
    }
  }
}
