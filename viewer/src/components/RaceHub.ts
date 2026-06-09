import type {
  CarConditionPayload,
  FleetCarPayload,
  MetaStatePayload,
  SessionInitPayload,
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
import { isSeasonFinished } from "../utils/seasonState";
import { canStartPrivateTest, privateTestBlockedReason } from "../utils/privateTest";

export interface RaceHubHandlers {
  onStartRace: () => void;
  onPrivateTest?: () => void;
  onOpenGarage?: () => void;
  onViewSeasonResults?: () => void;
  onStartNextSeason?: () => void;
  onRestartSeason?: () => void;
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
  private privateTestBtn: HTMLButtonElement;
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
            <div class="race-hub-snapshot"></div>
            <div class="round-actions">
              <button type="button" class="secondary-btn garage-link-btn">⚙ Garage</button>
              <button type="button" class="secondary-btn private-test-btn" title="Solo practice between race weekends">Private Test</button>
              <button type="button" class="secondary-btn restart-season-btn hidden">↺ Restart Season</button>
              <button type="button" class="primary-btn start-race-btn">
                <span class="btn-icon" aria-hidden="true">🏁</span>
                Prepare &amp; Start
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="season-complete-card hidden">
        <div class="season-complete-body">
          <span class="mm-badge mm-badge-wec">Season Complete</span>
          <h3>Championship settled</h3>
          <p class="season-complete-copy"></p>
          <div class="season-complete-actions">
            <button type="button" class="primary-btn season-results-btn">View Results &amp; Payouts</button>
            <button type="button" class="secondary-btn season-restart-btn">↺ Restart Season</button>
            <button type="button" class="secondary-btn season-next-btn">Start Next Season</button>
          </div>
        </div>
      </div>

      <div class="calendar-section">
        <h3 class="mm-section-title">Season Calendar</h3>
        <ul class="calendar-grid"></ul>
      </div>

      <div class="rival-standings-section hidden">
        <h3 class="mm-section-title">Team Championships</h3>
        <div class="rival-standings-grid"></div>
        <p class="rival-offweek-headline hidden"></p>
        <ul class="rival-offweek-events hidden"></ul>
        <p class="rival-market-note"></p>
      </div>

      <div class="driver-standings-section hidden">
        <h3 class="mm-section-title">Drivers' Championships</h3>
        <div class="driver-standings-grid"></div>
      </div>
    `;

    container.appendChild(this.root);
    this.calendarEl = this.root.querySelector(".calendar-grid")!;
    this.roundInfoEl = this.root.querySelector(".round-info")!;
    this.pointsEl = this.root.querySelector(".championship-points")!;
    this.startBtn = this.root.querySelector(".start-race-btn")!;
    this.privateTestBtn = this.root.querySelector(".private-test-btn")!;
    this.garageBtn = this.root.querySelector(".garage-link-btn")!;

    this.startBtn.addEventListener("click", () => {
      this.handlers.onStartRace();
    });

    this.privateTestBtn.addEventListener("click", () => {
      this.handlers.onPrivateTest?.();
    });

    this.root.querySelector(".garage-link-btn")!.addEventListener("click", () => {
      this.handlers.onOpenGarage?.();
    });

    this.root.querySelector(".season-results-btn")!.addEventListener("click", () => {
      this.handlers.onViewSeasonResults?.();
    });

    this.root.querySelector(".season-next-btn")!.addEventListener("click", () => {
      this.handlers.onStartNextSeason?.();
    });

    this.root.querySelector(".restart-season-btn")!.addEventListener("click", () => {
      this.handlers.onRestartSeason?.();
    });

    this.root.querySelector(".season-restart-btn")!.addEventListener("click", () => {
      this.handlers.onRestartSeason?.();
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
    const seasonComplete = meta ? isSeasonFinished(meta) : false;
    const roundCard = this.root.querySelector(".current-round-card");
    const completeCard = this.root.querySelector(".season-complete-card");
    if (roundCard instanceof HTMLElement) {
      roundCard.classList.toggle("hidden", seasonComplete);
    }
    if (completeCard instanceof HTMLElement) {
      completeCard.classList.toggle("hidden", !seasonComplete);
    }

    if (seasonComplete && meta?.seasonSummary) {
      const copy = completeCard?.querySelector(".season-complete-copy");
      const nextBtn = completeCard?.querySelector(".season-next-btn");
      const positions = Object.entries(meta.seasonSummary.playerTeamPositions)
        .map(([cls, pos]) => `${cls} P${pos}`)
        .join(" · ");
      const payout = meta.seasonSummary.totalPayout;
      if (copy instanceof HTMLElement) {
        copy.textContent = positions
          ? `${positions} · $${payout.toLocaleString()} season payouts credited`
          : `$${payout.toLocaleString()} season payouts credited`;
      }
      if (nextBtn instanceof HTMLButtonElement) {
        nextBtn.textContent = `Start Season ${meta.seasonYear + 1}`;
        nextBtn.disabled = !this.hostControlsEnabled;
      }
      const resultsBtn = completeCard?.querySelector(".season-results-btn");
      if (resultsBtn instanceof HTMLButtonElement) {
        resultsBtn.disabled = !this.hostControlsEnabled;
      }
    } else if (seasonComplete && completeCard instanceof HTMLElement) {
      const copy = completeCard.querySelector(".season-complete-copy");
      if (copy instanceof HTMLElement) {
        copy.textContent =
          "All rounds complete — open results to view standings and payouts.";
      }
    }

    const restartBtn = this.root.querySelector(".restart-season-btn");
    const seasonRestartBtn = this.root.querySelector(".season-restart-btn");
    const showRestart =
      Boolean(meta?.setupComplete) && this.hostControlsEnabled;
    if (restartBtn instanceof HTMLButtonElement) {
      restartBtn.classList.toggle("hidden", seasonComplete || !meta?.setupComplete);
      restartBtn.disabled = !showRestart;
    }
    if (seasonRestartBtn instanceof HTMLButtonElement) {
      seasonRestartBtn.disabled = !showRestart;
    }

    const current = meta?.calendar.find((e) => e.round === meta.currentRound);
    const blocked =
      seasonComplete ||
      !meta?.setupComplete ||
      !current ||
      current.completed ||
      !this.hostControlsEnabled;
    this.startBtn.disabled = blocked;
    this.garageBtn.disabled = !this.hostControlsEnabled;

    const privateTestAllowed =
      Boolean(meta?.setupComplete) &&
      this.hostControlsEnabled &&
      !seasonComplete &&
      meta &&
      canStartPrivateTest(meta);
    this.privateTestBtn.disabled = !privateTestAllowed;
    this.privateTestBtn.title = privateTestAllowed
      ? "Solo free practice — drivers and crew earn XP"
      : meta
        ? privateTestBlockedReason(meta) ?? "Private test unavailable"
        : "Private test unavailable";

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
      if (event.round === meta.currentRound && !isSeasonFinished(meta)) {
        li.classList.add("current");
      }

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
    this.renderTeamSnapshot(meta);
    this.renderRivalStandings(meta);
    this.renderDriverStandings(meta);
    this.syncHostControls();
  }

  private renderRivalStandings(meta: MetaStatePayload): void {
    const section = this.root.querySelector(".rival-standings-section");
    const grid = this.root.querySelector(".rival-standings-grid");
    const noteEl = this.root.querySelector(".rival-market-note");
    if (!(section instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
      return;
    }

    const season = meta.aiRivalSeason;
    const classes = ["Hypercar", "LMP2", "LMGT3"] as const;
    const hasAnyClass = classes.some((classId) =>
      (season?.teams ?? []).some((t) => t.primaryClassId === classId),
    );

    if (!season?.teams.length || !hasAnyClass) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    grid.replaceChildren();

    for (const classId of classes) {
      const sorted = season.teams
        .filter((t) => t.primaryClassId === classId)
        .sort(
          (a, b) =>
            b.championshipPoints - a.championshipPoints ||
            Number(b.isPlayerTeam ?? 0) - Number(a.isPlayerTeam ?? 0) ||
            b.form - a.form,
        );
      const player = sorted.find((t) => t.isPlayerTeam);
      let rivals = sorted.slice(0, 3);
      if (player && !rivals.some((t) => t.isPlayerTeam)) {
        rivals = [
          ...sorted.filter((t) => !t.isPlayerTeam).slice(0, 2),
          player,
        ];
      }

      if (!rivals.length) continue;

      const panel = document.createElement("div");
      panel.className = "rival-class-panel";
      panel.innerHTML = `<h4 class="rival-class-title">${classId}</h4>`;

      const list = document.createElement("ol");
      list.className = "rival-standings-list";
      for (const rival of rivals) {
          const li = document.createElement("li");
          li.className = "rival-standing-item";
          if (rival.isPlayerTeam) li.classList.add("rival-standing-player");
          const arc =
            rival.arc && rival.arc !== "underdog"
              ? ` · ${rival.arc.replace(/_/g, " ")}`
              : "";
          li.innerHTML = `
            <span class="rival-standing-name">${escapeHtml(rival.teamName)}</span>
            <span class="rival-standing-pts">${rival.championshipPoints} pts</span>
            <span class="rival-standing-meta">form ${rival.form >= 0 ? "+" : ""}${rival.form}${arc}</span>
          `;
          list.appendChild(li);
      }

      panel.appendChild(list);
      grid.appendChild(panel);
    }

    if (noteEl instanceof HTMLElement) {
      noteEl.textContent = season.lastMarketNote ?? "";
      noteEl.classList.toggle("hidden", !season.lastMarketNote);
    }

    const headlineEl = this.root.querySelector(".rival-offweek-headline");
    const eventsEl = this.root.querySelector(".rival-offweek-events");
    const headline = season.lastOffWeekHeadline ?? "";
    const events = season.lastOffWeekEvents ?? [];

    if (headlineEl instanceof HTMLElement) {
      headlineEl.textContent = headline;
      headlineEl.classList.toggle("hidden", !headline);
    }

    if (eventsEl instanceof HTMLElement) {
      eventsEl.replaceChildren();
      for (const event of events.slice(0, 5)) {
        const li = document.createElement("li");
        li.className = `rival-offweek-event rival-offweek-${event.type}`;
        li.textContent = event.text;
        eventsEl.appendChild(li);
      }
      eventsEl.classList.toggle("hidden", events.length === 0);
    }
  }

  private renderDriverStandings(meta: MetaStatePayload): void {
    const section = this.root.querySelector(".driver-standings-section");
    const grid = this.root.querySelector(".driver-standings-grid");
    if (!(section instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
      return;
    }

    const season = meta.aiRivalSeason;
    const classes = ["Hypercar", "LMP2", "LMGT3"] as const;
    const hasDrivers = (season?.drivers?.length ?? 0) > 0;

    if (!hasDrivers) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    grid.replaceChildren();

    for (const classId of classes) {
      const drivers = (season?.drivers ?? [])
        .filter((d) => d.classId === classId)
        .sort(
          (a, b) =>
            b.championshipPoints - a.championshipPoints ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 3);

      if (!drivers.length) continue;

      const panel = document.createElement("div");
      panel.className = "rival-class-panel";
      panel.innerHTML = `<h4 class="rival-class-title">${classId} Drivers</h4>`;

      const list = document.createElement("ol");
      list.className = "rival-standings-list";
      for (const driver of drivers) {
        const li = document.createElement("li");
        li.className = "rival-standing-item";
        if (driver.isPlayerDriver) li.classList.add("rival-standing-player");
        li.innerHTML = `
          <span class="rival-standing-name">${escapeHtml(driver.name)}</span>
          <span class="rival-standing-pts">${driver.championshipPoints} pts</span>
          <span class="rival-standing-meta">${escapeHtml(driver.teamName)} · ${escapeHtml(driver.nationality)}</span>
        `;
        list.appendChild(li);
      }

      panel.appendChild(list);
      grid.appendChild(panel);
    }
  }

  private renderTeamSnapshot(meta: MetaStatePayload): void {
    const STAFF_STATUS_LABELS: Record<Exclude<StaffStatus, "active">, string> = {
      injured: "Injured",
      ill: "Ill",
      poached: "Poached",
    };

    const container = this.root.querySelector(".race-hub-snapshot");
    if (!container) return;

    const fleet = meta.fleet ?? [];
    if (!fleet.length) {
      container.innerHTML = "";
      return;
    }

    const chips = fleet
      .map(
        (car) => `
        <span class="hub-fleet-chip">
          <span class="hub-fleet-num">#${escapeHtml(car.carNumber)}</span>
          <span class="class-badge class-${escapeHtml(car.classId)}">${escapeHtml(car.classId)}</span>
        </span>`,
      )
      .join("");

    const alerts = this.teamSnapshotAlerts(meta, fleet, STAFF_STATUS_LABELS);
    const alertHtml = alerts
      .map((text) => `<p class="hub-snapshot-alert">${escapeHtml(text)}</p>`)
      .join("");

    container.innerHTML = `
      <div class="hub-team-snapshot">
        <div class="hub-fleet-line">
          <span class="hub-snapshot-label">${fleet.length} ${fleet.length === 1 ? "entry" : "entries"}</span>
          <div class="hub-fleet-chips">${chips}</div>
        </div>
        ${alertHtml ? `<div class="hub-snapshot-alerts">${alertHtml}</div>` : ""}
      </div>`;
  }

  private teamSnapshotAlerts(
    meta: MetaStatePayload,
    fleet: FleetCarPayload[],
    staffStatusLabels: Record<Exclude<StaffStatus, "active">, string>,
  ): string[] {
    const alerts: string[] = [];

    for (const member of meta.staff ?? []) {
      const status = member.status ?? "active";
      if (status === "active") continue;
      const label = staffStatusLabels[status as Exclude<StaffStatus, "active">];
      alerts.push(`${member.name} (${member.role}) — ${label}`);
    }

    for (const car of fleet) {
      if (this.carNeedsAttention(car.carCondition)) {
        alerts.push(`#${car.carNumber} needs garage attention`);
      }
    }

    const hasRoster = (meta.driverRoster?.length ?? 0) > 0;
    if (hasRoster) {
      for (const car of fleet) {
        if ((car.assignedDriverIds?.length ?? 0) === 0) {
          alerts.push(`#${car.carNumber} has no drivers assigned`);
        }
      }
    }

    return alerts;
  }

  private carNeedsAttention(condition?: CarConditionPayload): boolean {
    if (!condition) return false;
    if (Object.keys(condition.partHealth ?? {}).length > 0) return true;
    if ((condition.irreparable?.length ?? 0) > 0) return true;
    return (condition.hiddenFaults ?? []).some((fault) => !fault.revealed);
  }

  private renderWeekendSchedule(meta: MetaStatePayload): void {
    const container = this.root.querySelector(".weekend-schedule");
    if (!container) return;

    const current = meta.calendar.find((e) => e.round === meta.currentRound);
    if (!current || !weekendScheduleActive(current) || current.completed || isSeasonFinished(meta)) {
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
    if (this.sessionInfo) {
      if (this.sessionInfo.weekendSessionType && this.sessionInfo.targetDurationSeconds) {
        const hours = this.sessionInfo.targetDurationSeconds / 3600;
        raceDesc =
          hours >= 1
            ? `${hours}h duration`
            : `${Math.round(this.sessionInfo.targetDurationSeconds / 60)} min session`;
      } else if (this.sessionInfo.targetDurationSeconds && this.sessionInfo.targetDurationSeconds > 0) {
        const hours = this.sessionInfo.targetDurationSeconds / 3600;
        raceDesc =
          hours >= 1
            ? `${hours}h duration`
            : `${Math.round(this.sessionInfo.targetDurationSeconds / 60)} min duration`;
      } else if (!isTest && this.sessionInfo.targetLaps > 0) {
        raceDesc = `${this.sessionInfo.targetLaps} lap(s)`;
      }
    }

    const iconEl = this.root.querySelector(".current-round-icon");
    if (iconEl) iconEl.innerHTML = trackIconSvg(current.trackId);

    this.roundInfoEl.innerHTML = `
      <div class="round-detail round-title"><strong>${roundLabel}</strong> — ${escapeHtml(trackLabel)}</div>
      <div class="format-tag endurance-format-tag">${escapeHtml(raceDesc)}</div>
    `;
  }
}
