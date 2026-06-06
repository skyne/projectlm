import type {
  MetaStatePayload,
  StaffMemberPayload,
  StaffRole,
  StaffStatus,
  WeekendSessionType,
} from "../ws/protocol";

export interface RaceWeekendHubHandlers {
  onStartSession: () => void;
  onSelectCar: (carId: string) => void;
  onAdvanceWeekend: () => void;
  onBackToHq: () => void;
}

const SESSION_LABELS: Record<WeekendSessionType, string> = {
  practice: "Free Practice",
  qualifying: "Qualifying",
  race: "Race",
};

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

export class RaceWeekendHub {
  private root: HTMLElement;
  private handlers: RaceWeekendHubHandlers;
  private meta: MetaStatePayload | null = null;
  private sessionComplete = false;

  constructor(root: HTMLElement, handlers: RaceWeekendHubHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.render();
  }

  setMeta(meta: MetaStatePayload | null): void {
    this.meta = meta;
    this.sessionComplete = false;
    this.render();
  }

  markSessionComplete(): void {
    this.sessionComplete = true;
    this.render();
  }

  private currentEvent() {
    if (!this.meta) return null;
    return (
      this.meta.calendar.find((e) => e.round === this.meta!.currentRound) ??
      null
    );
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

  private renderStaffRow(carId: string): string {
    const items = STAFF_ROLES.map((role) => {
      const member = this.staffForCar(carId, role);
      const name = member?.name ?? "—";
      const skill = member?.skill ?? "—";
      return `
        <div class="weekend-staff-item">
          <span class="weekend-staff-role">${ROLE_LABELS[role]}</span>
          <span class="weekend-staff-name">${escapeHtml(name)}</span>
          <span class="weekend-staff-skill">${skill}</span>
        </div>`;
    }).join("");

    const warnings = STAFF_ROLES.flatMap((role) => {
      const member = this.staffForCar(carId, role);
      if (!member) return [];
      const status = member.status ?? "active";
      if (status === "active") return [];
      return [
        `<p class="weekend-staff-warning">${ROLE_LABELS[role]} ${escapeHtml(member.name)} — ${STATUS_LABELS[status]}</p>`,
      ];
    }).join("");

    return `
      <div class="weekend-staff">
        <div class="weekend-staff-row">${items}</div>
        ${warnings ? `<div class="weekend-staff-warnings">${warnings}</div>` : ""}
      </div>`;
  }

  private render(): void {
    if (!this.meta) {
      this.root.classList.add("hidden");
      return;
    }
    this.root.classList.remove("hidden");

    const event = this.currentEvent();
    const session = this.meta.weekendSession;
    const activeCarId = this.meta.activeCarId;
    const activeCar =
      this.meta.fleet.find((c) => c.id === activeCarId) ?? this.meta.fleet[0];

    const carOptions = this.meta.fleet
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === activeCar?.id ? "selected" : ""}>#${c.carNumber} ${c.classId}</option>`,
      )
      .join("");

    const steps = (["practice", "qualifying", "race"] as WeekendSessionType[])
      .map((s) => {
        const idx = ["practice", "qualifying", "race"].indexOf(session);
        const stepIdx = ["practice", "qualifying", "race"].indexOf(s);
        let cls = "weekend-step";
        if (stepIdx < idx) cls += " done";
        if (stepIdx === idx) cls += " active";
        return `<span class="${cls}">${SESSION_LABELS[s]}</span>`;
      })
      .join('<span class="weekend-arrow">→</span>');

    const primaryLabel = this.sessionComplete
      ? session === "race"
        ? "Round complete"
        : `Continue to ${SESSION_LABELS[session === "practice" ? "qualifying" : "race"]}`
      : `Start ${SESSION_LABELS[session]}`;

    this.root.innerHTML = `
      <div class="weekend-hub">
        <div class="weekend-header">
          <button type="button" id="weekend-back-hq" class="btn-link">← Back to HQ</button>
          <h2>${escapeHtml(event?.eventName ?? "Race Weekend")}</h2>
          <p class="weekend-team">${escapeHtml(this.meta.teamName)}</p>
        </div>
        <div class="weekend-steps">${steps}</div>
        <div class="weekend-controls">
          <label>Car <select id="weekend-car">${carOptions}</select></label>
          <label>Tyres <select id="weekend-tyre" disabled>
            <option>${this.meta.weekendTireCompound}</option>
          </select></label>
        </div>
        ${this.renderStaffRow(activeCarId)}
        <div class="weekend-actions">
          <button type="button" id="weekend-start" class="btn-primary">${primaryLabel}</button>
        </div>
      </div>`;

    this.root.querySelector("#weekend-car")?.addEventListener("change", (ev) => {
      const carId = (ev.target as HTMLSelectElement).value;
      if (this.meta) this.meta = { ...this.meta, activeCarId: carId };
      this.render();
      this.handlers.onSelectCar(carId);
    });

    this.root.querySelector("#weekend-start")?.addEventListener("click", () => {
      if (this.sessionComplete) {
        this.handlers.onAdvanceWeekend();
        this.sessionComplete = false;
      } else {
        this.handlers.onStartSession();
      }
    });

    this.root.querySelector("#weekend-back-hq")?.addEventListener("click", () => {
      this.handlers.onBackToHq();
    });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
