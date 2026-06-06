import type { MetaStatePayload, SessionInitPayload } from "../ws/protocol";
import {
  calendarRoundLabel,
  formatDurationLabel,
  trackDisplayName,
  trackIconSvg,
} from "../utils/trackIcons";

export interface RaceHubHandlers {
  onStartRace: () => void;
  onOpenGarage?: () => void;
  onSetWeekendCompound?: (compound: string) => void;
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
            <div class="weekend-setup">
              <label class="weekend-compound-field">
                <span>Race tyre compound</span>
                <select class="weekend-compound-select">
                  <option value="Soft">Soft — peak grip, high wear</option>
                  <option value="Medium" selected>Medium — balanced</option>
                  <option value="Hard">Hard — durable, lower grip</option>
                </select>
              </label>
              <p class="wizard-hint">Change compound anytime before the session or at pit stops during the race.</p>
            </div>
            <div class="round-actions">
              <button type="button" class="secondary-btn garage-link-btn">⚙ Garage</button>
              <button type="button" class="primary-btn start-race-btn">
                <span class="btn-icon" aria-hidden="true">🏁</span>
                Start Session
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

    const compoundSelect = this.root.querySelector<HTMLSelectElement>(".weekend-compound-select")!;
    compoundSelect.addEventListener("change", () => {
      this.handlers.onSetWeekendCompound?.(compoundSelect.value);
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

    const compoundSelect = this.root.querySelector<HTMLSelectElement>(".weekend-compound-select");
    if (compoundSelect) {
      compoundSelect.value = meta.weekendTireCompound ?? "Medium";
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
    this.syncHostControls();
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

    let raceDesc = isTest
      ? "Official test session"
      : `${formatDurationLabel(formatLabel, current.eventType)} race`;
    if (this.sessionInfo?.targetDurationSeconds && this.sessionInfo.targetDurationSeconds > 0) {
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
