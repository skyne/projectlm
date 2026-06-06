import type {
  MetaStatePayload,
  StaffMemberPayload,
  StaffRole,
  StaffStatus,
} from "../ws/protocol";

export interface TeamHqHandlers {
  onGoToWeekend?: () => void;
}

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

type HqSection = "overview" | "staff";

export class TeamHq {
  private root: HTMLElement;
  private handlers: TeamHqHandlers;
  private meta: MetaStatePayload | null = null;
  private section: HqSection = "overview";

  constructor(root: HTMLElement, handlers: TeamHqHandlers = {}) {
    this.root = root;
    this.handlers = handlers;
    this.render();
  }

  setMeta(meta: MetaStatePayload | null): void {
    this.meta = meta;
    this.render();
  }

  render(): void {
    if (!this.meta) {
      this.root.innerHTML = "";
      return;
    }

    const nextEvent = this.nextCalendarEvent();
    const budget = this.meta.budget ?? 0;
    const rdPoints = this.meta.rdPoints ?? 0;
    const lastPayout = this.meta.lastRacePayout;

    this.root.innerHTML = `
      <div class="hq-dashboard">
        <div class="hq-header">
          <h2>${escapeHtml(this.meta.teamName)}</h2>
          <nav class="hq-tabs" aria-label="HQ sections">
            <button type="button" class="hq-tab ${this.section === "overview" ? "active" : ""}" data-section="overview">Overview</button>
            <button type="button" class="hq-tab ${this.section === "staff" ? "active" : ""}" data-section="staff">Staff</button>
          </nav>
        </div>
        ${
          this.section === "overview"
            ? this.renderOverview(nextEvent, budget, rdPoints, lastPayout)
            : this.renderStaffMatrix()
        }
        <div class="hq-actions">
          <button type="button" id="hq-go-weekend" class="btn-primary">Race Weekend</button>
        </div>
      </div>`;

    for (const tab of this.root.querySelectorAll<HTMLButtonElement>(".hq-tab")) {
      tab.addEventListener("click", () => {
        this.section = tab.dataset.section as HqSection;
        this.render();
      });
    }

    this.root.querySelector("#hq-go-weekend")?.addEventListener("click", () => {
      this.handlers.onGoToWeekend?.();
    });
  }

  private nextCalendarEvent() {
    if (!this.meta) return null;
    const current = this.meta.calendar.find((e) => e.round === this.meta!.currentRound);
    if (current && !current.completed) return current;
    return this.meta.calendar.find((e) => !e.completed) ?? current ?? null;
  }

  private renderOverview(
    nextEvent: MetaStatePayload["calendar"][number] | null,
    budget: number,
    rdPoints: number,
    lastPayout: number | undefined,
  ): string {
    const payoutText =
      lastPayout !== undefined && lastPayout > 0
        ? formatBudget(lastPayout)
        : "—";

    return `
      <section class="hq-section">
        <div class="hq-stat-grid">
          <div class="hq-stat">
            <span class="hq-stat-label">Budget</span>
            <span class="hq-stat-value">${formatBudget(budget)}</span>
          </div>
          <div class="hq-stat">
            <span class="hq-stat-label">R&amp;D Points</span>
            <span class="hq-stat-value">${rdPoints}</span>
          </div>
          <div class="hq-stat">
            <span class="hq-stat-label">Last Race Payout</span>
            <span class="hq-stat-value">${payoutText}</span>
          </div>
          <div class="hq-stat">
            <span class="hq-stat-label">Next Event</span>
            <span class="hq-stat-value hq-stat-event">${escapeHtml(nextEvent?.eventName ?? "—")}</span>
          </div>
        </div>
      </section>`;
  }

  private renderStaffMatrix(): string {
    if (!this.meta) return "";

    const rows = this.meta.fleet
      .map((car) => {
        const cells = STAFF_ROLES.map((role) => {
          const member = this.staffForCar(car.id, role);
          return `<td>${this.renderStaffCell(member)}</td>`;
        }).join("");

        return `
          <tr>
            <th scope="row">#${escapeHtml(car.carNumber)} <span class="class-badge class-${escapeHtml(car.classId)}">${escapeHtml(car.classId)}</span></th>
            ${cells}
          </tr>`;
      })
      .join("");

    const headers = STAFF_ROLES.map(
      (role) => `<th scope="col">${ROLE_LABELS[role]}</th>`,
    ).join("");

    return `
      <section class="hq-section">
        <div class="hq-staff-matrix-wrap">
          <table class="hq-staff-matrix">
            <thead>
              <tr>
                <th scope="col">Car</th>
                ${headers}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }

  private staffForCar(carId: string, role: StaffRole): StaffMemberPayload | null {
    if (!this.meta?.staff?.length) return null;

    const assigned = this.meta.staff.find(
      (s) => s.role === role && s.assignedCarId === carId,
    );
    if (assigned) return assigned;

    const firstCarId = this.meta.fleet[0]?.id;
    if (carId !== firstCarId) return null;

    return this.meta.staff.find((s) => s.role === role && !s.assignedCarId) ?? null;
  }

  private renderStaffCell(member: StaffMemberPayload | null): string {
    if (!member) {
      return `<span class="hq-staff-vacant">Vacant</span>`;
    }

    const status = member.status ?? "active";
    const statusBadge =
      status !== "active"
        ? `<span class="staff-status staff-status-${status}">${STATUS_LABELS[status]}</span>`
        : "";

    return `
      <div class="hq-staff-cell">
        <span class="hq-staff-name">${escapeHtml(member.name)}</span>
        <span class="hq-staff-skill">${member.skill}</span>
        ${statusBadge}
      </div>`;
  }
}

function formatBudget(eur: number): string {
  const abs = Math.abs(eur);
  if (abs >= 1_000_000) {
    return `€${(eur / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `€${(eur / 1_000).toFixed(1)}K`;
  }
  return `€${eur}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
