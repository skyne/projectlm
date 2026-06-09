import type { MetaStatePayload } from "../ws/protocol";

export interface InterTeamDealModalHandlers {
  onPrivateTest: () => void;
  onStartJointTesting: (teamNames: string[]) => void;
  onStartTechSharing: (teamName: string) => void;
}

type Step = "testing_mode" | "joint_teams" | "tech_team";

export class InterTeamDealModal {
  private readonly root: HTMLElement;
  private meta: MetaStatePayload | null = null;
  private step: Step = "testing_mode";
  private selectedTeams = new Set<string>();

  constructor(
    container: HTMLElement,
    private readonly handlers: InterTeamDealModalHandlers,
  ) {
    this.root = document.createElement("div");
    this.root.className = "inter-team-deal-overlay hidden";
    this.root.innerHTML = `
      <div class="inter-team-deal-card" role="dialog" aria-modal="true">
        <header class="inter-team-deal-header">
          <div>
            <h2 class="inter-team-deal-title"></h2>
            <p class="inter-team-deal-subtitle wizard-hint"></p>
          </div>
          <button type="button" class="secondary-btn inter-team-deal-close" aria-label="Close">✕</button>
        </header>
        <div class="inter-team-deal-body"></div>
        <footer class="inter-team-deal-footer">
          <button type="button" class="secondary-btn inter-team-deal-back hidden">Back</button>
          <button type="button" class="secondary-btn inter-team-deal-cancel">Cancel</button>
          <button type="button" class="primary-btn inter-team-deal-confirm hidden">Continue</button>
        </footer>
      </div>
    `;
    container.appendChild(this.root);

    this.root.querySelector(".inter-team-deal-close")!.addEventListener("click", () => {
      this.hide();
    });
    this.root.querySelector(".inter-team-deal-cancel")!.addEventListener("click", () => {
      this.hide();
    });
    this.root.querySelector(".inter-team-deal-back")!.addEventListener("click", () => {
      if (this.step === "joint_teams" || this.step === "tech_team") {
        this.step = "testing_mode";
        this.selectedTeams.clear();
        this.render();
      }
    });
    this.root.querySelector(".inter-team-deal-confirm")!.addEventListener("click", () => {
      this.confirm();
    });
    this.root.addEventListener("click", (ev) => {
      if (ev.target === this.root) this.hide();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.isOpen()) this.hide();
    });
  }

  openTesting(meta: MetaStatePayload): void {
    this.meta = meta;
    this.step = "testing_mode";
    this.selectedTeams.clear();
    this.root.classList.remove("hidden");
    this.render();
  }

  openTechSharing(meta: MetaStatePayload): void {
    this.meta = meta;
    this.step = "tech_team";
    this.selectedTeams.clear();
    this.root.classList.remove("hidden");
    this.render();
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.selectedTeams.clear();
  }

  isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  private rivalTeamNames(): string[] {
    return (
      this.meta?.aiRivalSeason?.teams
        ?.filter((t) => !t.isPlayerTeam)
        .map((t) => t.teamName)
        .sort((a, b) => a.localeCompare(b)) ?? []
    );
  }

  private render(): void {
    const titleEl = this.root.querySelector(".inter-team-deal-title")!;
    const subtitleEl = this.root.querySelector(".inter-team-deal-subtitle")!;
    const bodyEl = this.root.querySelector(".inter-team-deal-body") as HTMLElement;
    const backBtn = this.root.querySelector(".inter-team-deal-back")!;
    const confirmBtn = this.root.querySelector(".inter-team-deal-confirm") as HTMLButtonElement;

    const rivals = this.rivalTeamNames();

    if (this.step === "testing_mode") {
      titleEl.textContent = "Organize Testing";
      subtitleEl.textContent =
        "Run a private session on your own, or negotiate joint testing with rival teams.";
      backBtn.classList.add("hidden");
      confirmBtn.classList.add("hidden");
      bodyEl.innerHTML = `
        <div class="inter-team-deal-mode-grid">
          <button type="button" class="inter-team-deal-mode-btn" data-mode="private">
            <strong>Private testing</strong>
            <span>Solo session — no rival approval needed. Earn driver and crew XP between race weekends.</span>
          </button>
          <button type="button" class="inter-team-deal-mode-btn" data-mode="joint">
            <strong>Joint testing</strong>
            <span>Share track time with one or more rival teams. Rivals respond as soon as you submit an offer.</span>
          </button>
        </div>
      `;
      for (const btn of bodyEl.querySelectorAll<HTMLButtonElement>(".inter-team-deal-mode-btn")) {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.mode;
          if (mode === "private") {
            this.hide();
            this.handlers.onPrivateTest();
            return;
          }
          this.step = "joint_teams";
          this.selectedTeams.clear();
          this.render();
        });
      }
      return;
    }

    if (this.step === "joint_teams") {
      titleEl.textContent = "Joint testing partners";
      subtitleEl.textContent =
        "Select one or more rival teams to approach. You'll negotiate with all of them in one session.";
      backBtn.classList.remove("hidden");
      confirmBtn.classList.remove("hidden");
      confirmBtn.textContent = "Start negotiations";
      confirmBtn.disabled = this.selectedTeams.size === 0;
      this.renderTeamList(bodyEl, rivals, "checkbox");
      this.wireTeamList(bodyEl, "checkbox", confirmBtn);
      return;
    }

    titleEl.textContent = "Technology sharing partner";
    subtitleEl.textContent =
      "Choose one rival team for a technology-sharing deal. They respond as soon as you submit an offer.";
    backBtn.classList.add("hidden");
    confirmBtn.classList.remove("hidden");
    confirmBtn.textContent = "Start negotiation";
    confirmBtn.disabled = this.selectedTeams.size !== 1;
    this.renderTeamList(bodyEl, rivals, "radio");
    this.wireTeamList(bodyEl, "radio", confirmBtn);
  }

  private renderTeamList(
    bodyEl: HTMLElement,
    teams: string[],
    inputType: "checkbox" | "radio",
  ): void {
    bodyEl.replaceChildren();
    if (!teams.length) {
      const empty = document.createElement("p");
      empty.className = "wizard-hint";
      empty.textContent = "No rival teams available in the championship.";
      bodyEl.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "inter-team-deal-team-list";
    const name = inputType === "checkbox" ? "joint-team" : "tech-team";

    for (const team of teams) {
      const label = document.createElement("label");
      label.className = "inter-team-deal-team-option";

      const input = document.createElement("input");
      input.type = inputType;
      input.name = name;
      input.value = team;
      input.checked = this.selectedTeams.has(team);

      const text = document.createElement("span");
      text.textContent = team;

      label.append(input, text);
      list.appendChild(label);
    }

    bodyEl.appendChild(list);
  }

  private wireTeamList(
    bodyEl: Element,
    inputType: "checkbox" | "radio",
    confirmBtn: HTMLButtonElement,
  ): void {
    for (const input of bodyEl.querySelectorAll<HTMLInputElement>("input")) {
      input.addEventListener("change", () => {
        const team = input.value;
        if (inputType === "radio") {
          this.selectedTeams.clear();
          if (input.checked) this.selectedTeams.add(team);
        } else if (input.checked) {
          this.selectedTeams.add(team);
        } else {
          this.selectedTeams.delete(team);
        }
        confirmBtn.disabled =
          inputType === "radio"
            ? this.selectedTeams.size !== 1
            : this.selectedTeams.size === 0;
      });
    }
  }

  private confirm(): void {
    const teams = [...this.selectedTeams];
    if (this.step === "joint_teams" && teams.length > 0) {
      this.hide();
      this.handlers.onStartJointTesting(teams);
      return;
    }
    if (this.step === "tech_team" && teams.length === 1) {
      this.hide();
      this.handlers.onStartTechSharing(teams[0]!);
    }
  }
}
