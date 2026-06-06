import type {
  MetaStatePayload,
  SessionInitPayload,
  StaffMemberPayload,
  StaffRole,
  StaffStatus,
} from "../ws/protocol";
import {
  calendarRoundLabel,
  formatDurationLabel,
  trackDisplayName,
  trackIconSvg,
} from "../utils/trackIcons";
import {
  resolveNextSession,
  sessionDurationLabel,
  startSessionButtonLabel,
  weekendScheduleActive,
  WEEKEND_STEPS,
} from "../utils/weekendSessions";

export interface RaceHubHandlers {
  onStartRace: () => void;
  onOpenGarage?: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class RaceHub {
  readonly root: HTMLElement;
  private calendarEl: HTMLElement;
  private roundInfoEl: HTMLElement;
  private pointsEl: HTMLElement;
  private startBtn: HTMLButtonElement;
  private garageBtn: HTMLButtonElement;
  private handlers: RaceHubHandlers;
  private latestMeta: MetaStatePayload | null = null;
  private sessionInfo: SessionInitPayload | null = null;
  private hostControlsEnabled = true;

  constructor(container: HTMLElement, handlers: RaceHubHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel race-hub panel-wec";
    this.root.innerHTML = `
      <div class="race-hub-header">
        <div class="race-hub-title-block">
          <span class="mm-badge mm-badge-wec">FIA WEC</span>
          <h2>Championship Hub</h2>
          <p class="race-hub-subtitle"></p>
        </div>
        <div class="championship-card wec-points-card">
          <span class="championship-label">World Championship</span>
          <span class="championship-points">0</span>
          <span class="championship-unit">points</span>
          <div class="championship-progress">
            <div class="championship-progress-bar"></div>
          </div>
        </div>
        <div class="championship-card budget-card">
          <span class="championship-label">Team budget</span>
          <span class="championship-budget">$0</span>
        </div>
      </div>

      <div class="current-round-card wec-round-card">
        <div class="wec-round-strip" aria-hidden="true"></div>
        <div class="current-round-hero">
          <div class="current-round-icon" aria-hidden="true"></div>
          <div class="current-round-body">
            <h3>Next Endurance Event</h3>
            <div class="round-info"></div>
            <div class="weekend-schedule hidden" aria-label="Weekend schedule"></div>
            <div class="race-hub-staff"></div>
            <div class="round-actions">
              <button type="button" class="secondary-btn garage-link-btn">⚙ Garage</button>
              <button type="button" class="primary-btn start-race-btn">
                <span class="btn-icon" aria-hidden="true">🏁</span>
                Prepare &amp; Start
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="calendar-section">
        <h3 class="mm-section-title">Season Calendar</h3>
        <ul class="calendar-grid"></ul>
      </div>
    `;

    container.appendChild(this.root);
    this.calendarEl = this.root.querySelector(".calendar-grid")!;
    this.roundInfoEl = this.root.querySelector(".round-info")!;
    this.pointsEl = this.root.querySelector(".championship-points")!;
    this.startBtn = this.root.querySelector(".start-race-btn")!;
    this.garageBtn = this.root.querySelector(".garage-link-btn")!;

    this.startBtn.addEventListener("click", () => {
      this.handlers.onStartRace();
    });

    this.root.querySelector(".garage-link-btn")!.addEventListener("click", () => {
      this.handlers.onOpenGarage?.();
    });
  }

  setSessionInfo(info: SessionInitPayload | null): void {
    this.sessionInfo = info;
    this.renderRoundInfo();
  }

  setInteractionEnabled(enabled: boolean): void {
    this.hostControlsEnabled = enabled;
    this.syncHostControls();
  }

  private syncHostControls(): void {
    const meta = this.latestMeta;
    const current = meta?.calendar.find((e) => e.round === meta.currentRound);
    const blocked =
      !meta?.setupComplete || !current || current.completed || !this.hostControlsEnabled;
    this.startBtn.disabled = blocked;
    this.garageBtn.disabled = !this.hostControlsEnabled;

    if (!blocked && current) {
      const isTest = current.eventType === "test" || current.format === "test";
      const next = resolveNextSession(meta!);
      const label = startSessionButtonLabel(next, isTest);
      this.startBtn.innerHTML = `
        <span class="btn-icon" aria-hidden="true">🏁</span>
        ${label}
      `;
    }
  }

  update(meta: MetaStatePayload): void {
    this.latestMeta = meta;
    const subtitle = this.root.querySelector(".race-hub-subtitle");
    if (subtitle) {
      subtitle.textContent = `${meta.teamName} · Season ${meta.seasonYear}`;
    }

    const totalPoints = meta.calendar.reduce(
      (sum, event) => sum + (event.completed ? event.championshipPoints : 0),
      0,
    );
    this.pointsEl.textContent = String(totalPoints);

    const budgetEl = this.root.querySelector(".championship-budget");
    if (budgetEl) budgetEl.textContent = `$${meta.budget.toLocaleString()}`;

    const completedCount = meta.calendar.filter((e) => e.completed).length;
    const progressPct = meta.calendar.length
      ? Math.round((completedCount / meta.calendar.length) * 100)
      : 0;
    const progressBar = this.root.querySelector(".championship-progress-bar");
    if (progressBar instanceof HTMLElement) {
      progressBar.style.width = `${progressPct}%`;
    }

    this.calendarEl.replaceChildren();
    for (const event of meta.calendar) {
      const li = document.createElement("li");
      li.className = "calendar-card";
      if (event.completed) li.classList.add("completed");
      if (event.round === meta.currentRound) li.classList.add("current");

      const status = event.completed
        ? `${event.championshipPoints} pts · $${(event.prizeMoney ?? 0).toLocaleString()}`
        : event.round === meta.currentRound
          ? "Next up"
          : "Upcoming";
      const statusClass = event.completed
        ? "status-done"
        : event.round === meta.currentRound
          ? "status-next"
          : "status-upcoming";

      const label = event.eventName ?? trackDisplayName(event.trackId);
      li.innerHTML = `
        <span class="calendar-round">${calendarRoundLabel(event.round, event.eventType)}</span>
        <span class="calendar-icon">${trackIconSvg(event.trackId)}</span>
        <span class="calendar-track">${escapeHtml(label)}</span>
        <span class="calendar-format">${escapeHtml(formatDurationLabel(event.format, event.eventType))}</span>
        <span class="calendar-status ${statusClass}">${status}</span>
      `;
      this.calendarEl.appendChild(li);
    }

    this.renderRoundInfo();
    this.renderWeekendSchedule(meta);
    this.renderStaffRow(meta);
    this.syncHostControls();
  }

  private renderStaffRow(meta: MetaStatePayload): void {
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

    const container = this.root.querySelector(".race-hub-staff");
    if (!container) return;

    const carId = meta.activeCarId || meta.playerCarId || meta.fleet?.[0]?.id;
    if (!carId || !meta.staff?.length) {
      container.innerHTML = "";
      return;
    }

    const items = STAFF_ROLES.map((role) => {
      const member = this.staffForCar(meta, carId, role);
      return `<div class="weekend-staff-item">
        <span class="weekend-staff-role">${ROLE_LABELS[role]}</span>
        <span class="weekend-staff-name">${escapeHtml(member?.name ?? "—")}</span>
        <span class="weekend-staff-skill">${member?.skill ?? "—"}</span>
      </div>`;
    }).join("");

    const warnings = STAFF_ROLES.flatMap((role) => {
      const member = this.staffForCar(meta, carId, role);
      if (!member || (member.status ?? "active") === "active") return [];
      const status = member.status as Exclude<StaffStatus, "active">;
      return [
        `<p class="weekend-staff-warning">${ROLE_LABELS[role]} ${escapeHtml(member.name)} — ${STATUS_LABELS[status]}</p>`,
      ];
    }).join("");

    container.innerHTML = `
      <div class="weekend-staff">
        <div class="weekend-staff-row">${items}</div>
        ${warnings ? `<div class="weekend-staff-warnings">${warnings}</div>` : ""}
      </div>`;
  }

  private staffForCar(
    meta: MetaStatePayload,
    carId: string,
    role: StaffRole,
  ): StaffMemberPayload | null {
    const assigned = meta.staff?.find(
      (s) => s.role === role && s.assignedCarId === carId,
    );
    if (assigned) return assigned;

    const firstCarId = meta.fleet?.[0]?.id;
    if (carId !== firstCarId) return null;
    return meta.staff?.find((s) => s.role === role && !s.assignedCarId) ?? null;
  }

  private renderWeekendSchedule(meta: MetaStatePayload): void {
    const container = this.root.querySelector(".weekend-schedule");
    if (!container) return;

    const current = meta.calendar.find((e) => e.round === meta.currentRound);
    if (!current || !weekendScheduleActive(current)) {
      container.classList.add("hidden");
      container.replaceChildren();
      return;
    }

    const completed =
      meta.weekendProgress?.round === meta.currentRound
        ? meta.weekendProgress.completedSessions
        : [];

    const steps = WEEKEND_STEPS.map((step) => {
      const done = completed.includes(step.type);
      const active = !done && resolveNextSession(meta) === step.type;
      const classes = [
        "weekend-step",
        done ? "weekend-step-done" : "",
        active ? "weekend-step-active" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const duration = sessionDurationLabel(step.type, current.format);
      return `
        <div class="${classes}">
          <span class="weekend-step-short">${step.short}</span>
          <span class="weekend-step-label">${step.label}</span>
          <span class="weekend-step-duration">${escapeHtml(duration)}</span>
        </div>
      `;
    }).join('<span class="weekend-step-arrow" aria-hidden="true">→</span>');

    container.innerHTML = `<div class="weekend-schedule-track">${steps}</div>`;
    container.classList.remove("hidden");
  }

  private renderRoundInfo(): void {
    if (!this.latestMeta) {
      this.roundInfoEl.textContent = "Waiting for season data…";
      return;
    }

    const current = this.latestMeta.calendar.find(
      (e) => e.round === this.latestMeta!.currentRound,
    );
    if (!current) {
      this.roundInfoEl.textContent = "No upcoming rounds.";
      return;
    }

    const isTest = current.eventType === "test" || current.format === "test";
    const trackLabel =
      current.eventName ??
      this.sessionInfo?.trackName ??
      trackDisplayName(current.trackId);
    const formatLabel = this.sessionInfo?.raceFormat ?? current.format;
    const roundNum = this.sessionInfo?.roundNumber ?? current.round;
    const roundLabel = calendarRoundLabel(roundNum, current.eventType);

    const heroTitle = this.root.querySelector(".current-round-body h3");
    if (heroTitle) {
      heroTitle.textContent = isTest ? "Pre-Season Test" : "Next Endurance Event";
    }

    const nextSession = resolveNextSession(this.latestMeta!);
    let raceDesc = isTest
      ? "Official test session"
      : nextSession
        ? `${sessionDurationLabel(nextSession, formatLabel)} — ${WEEKEND_STEPS.find((s) => s.type === nextSession)?.label ?? "Session"}`
        : `${formatDurationLabel(formatLabel, current.eventType)} race`;
    if (this.sessionInfo?.weekendSessionType && this.sessionInfo.targetDurationSeconds) {
      const hours = this.sessionInfo.targetDurationSeconds / 3600;
      raceDesc =
        hours >= 1
          ? `${hours}h duration`
          : `${Math.round(this.sessionInfo.targetDurationSeconds / 60)} min session`;
    } else if (this.sessionInfo?.targetDurationSeconds && this.sessionInfo.targetDurationSeconds > 0) {
      const hours = this.sessionInfo.targetDurationSeconds / 3600;
      raceDesc = hours >= 1 ? `${hours}h duration` : `${Math.round(this.sessionInfo.targetDurationSeconds / 60)}min duration`;
    } else if (this.sessionInfo?.targetLaps) {
      raceDesc = `${this.sessionInfo.targetLaps} lap(s)`;
    }

    const iconEl = this.root.querySelector(".current-round-icon");
    if (iconEl) iconEl.innerHTML = trackIconSvg(current.trackId);

    this.roundInfoEl.innerHTML = `
      <div class="round-detail round-title"><strong>${roundLabel}</strong> — ${escapeHtml(trackLabel)}</div>
      <div class="format-tag endurance-format-tag">${escapeHtml(raceDesc)}</div>
    `;
  }
}
