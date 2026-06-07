import type {
  MetaStatePayload,
  RaceCompletePayload,
  WeekendSessionType,
} from "../ws/protocol";
import {
  continueSessionButtonLabel,
  resolvePendingNextSession,
  returnToHqButtonLabel,
  sessionCompleteBadge,
  sessionElapsedLabel,
  sessionLabel,
  sessionResultsTitle,
} from "../utils/weekendSessions";

export interface PostRaceHandlers {
  onContinue: () => void;
  onContinueWeekend?: (nextSession: WeekendSessionType) => void;
  onRestart?: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLapTime(seconds: number): string {
  if (seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

function formatRaceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}$${Math.abs(amount).toLocaleString()}`;
}

function podiumMedal(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

function formatCarNumber(carNumber: string): string {
  const trimmed = carNumber.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export class PostRaceOverlay {
  readonly root: HTMLElement;
  private resultsBody: HTMLTableSectionElement;
  private timeEl: HTMLElement;
  private timeLabelEl: HTMLElement;
  private titleEl: HTMLElement;
  private badgeEl: HTMLElement;
  private playerSummaryEl: HTMLElement;
  private financesEl: HTMLElement;
  private championshipEl: HTMLElement;
  private podiumEl: HTMLElement;
  private continueBtn: HTMLButtonElement;
  private weekendBtn: HTMLButtonElement;
  private handlers: PostRaceHandlers;
  private pendingNextSession: WeekendSessionType | null = null;

  constructor(container: HTMLElement, handlers: PostRaceHandlers) {
    this.handlers = handlers;
    this.root = container;
    this.root.className = "post-race-overlay hidden";
    this.root.innerHTML = `
      <div class="post-race-card wec-results-card">
        <div class="post-race-chequer" aria-hidden="true"></div>
        <div class="post-race-header">
          <div>
            <span class="post-race-badge mm-badge-wec">Session Complete</span>
            <h2 class="post-race-title">Endurance Classification</h2>
          </div>
          <div class="post-race-time-block">
            <span class="clock-block-label post-race-time-label">Race time</span>
            <span class="post-race-time endurance-time-display"></span>
          </div>
        </div>
        <div class="post-race-podium"></div>
        <p class="post-race-player-summary"></p>
        <div class="post-race-finances"></div>
        <div class="post-race-championship hidden"></div>
        <div class="post-race-results-wrap">
          <table class="post-race-table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>#</th>
                <th>Team</th>
                <th>Class</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="post-race-actions">
          <button type="button" class="primary-btn btn-weekend-next hidden">Continue to Qualifying</button>
          <button type="button" class="primary-btn btn-continue">Continue Championship</button>
          <button type="button" class="secondary-btn btn-restart">↺ Restart Session</button>
        </div>
      </div>
    `;

    this.resultsBody = this.root.querySelector("tbody")!;
    this.timeEl = this.root.querySelector(".post-race-time")!;
    this.timeLabelEl = this.root.querySelector(".post-race-time-label")!;
    this.titleEl = this.root.querySelector(".post-race-title")!;
    this.badgeEl = this.root.querySelector(".post-race-badge")!;
    this.playerSummaryEl = this.root.querySelector(".post-race-player-summary")!;
    this.financesEl = this.root.querySelector(".post-race-finances")!;
    this.championshipEl = this.root.querySelector(".post-race-championship")!;
    this.podiumEl = this.root.querySelector(".post-race-podium")!;
    this.continueBtn = this.root.querySelector(".btn-continue")!;
    this.weekendBtn = this.root.querySelector(".btn-weekend-next")!;

    this.weekendBtn.addEventListener("click", () => {
      const next = this.pendingNextSession;
      if (!next) return;
      this.hide();
      if (this.handlers.onContinueWeekend) {
        this.handlers.onContinueWeekend(next);
      } else {
        this.handlers.onContinue();
      }
    });

    this.continueBtn.addEventListener("click", () => {
      this.hide();
      this.handlers.onContinue();
    });

    this.root.querySelector(".btn-restart")!.addEventListener("click", () => {
      this.handlers.onRestart?.();
    });
  }

  show(
    payload: RaceCompletePayload,
    playerEntryId: string,
    meta?: MetaStatePayload | null,
    activeSessionType?: WeekendSessionType,
  ): void {
    const sessionType =
      payload.weekendSessionType ?? activeSessionType ?? "race";
    const isQuali = sessionType === "qualifying";
    const isPractice = sessionType === "practice";
    const isRace = sessionType === "race";
    const isTiming = isQuali || isPractice;
    this.pendingNextSession = resolvePendingNextSession(payload, sessionType, meta);

    this.badgeEl.textContent = sessionCompleteBadge(sessionType);
    this.titleEl.textContent = sessionResultsTitle(sessionType);
    this.timeLabelEl.textContent = sessionElapsedLabel(sessionType);

    const weekendLabel = continueSessionButtonLabel(this.pendingNextSession);
    if (this.pendingNextSession) {
      this.weekendBtn.textContent = weekendLabel;
      this.weekendBtn.classList.remove("hidden");
      this.continueBtn.classList.add("hidden");
    } else {
      this.weekendBtn.classList.add("hidden");
      this.continueBtn.classList.remove("hidden");
      this.continueBtn.textContent = returnToHqButtonLabel(sessionType);
    }

    this.timeEl.textContent = formatRaceTime(payload.raceTime);
    this.resultsBody.replaceChildren();
    this.podiumEl.replaceChildren();
    this.financesEl.replaceChildren();

    const sorted = isTiming
      ? [...payload.results].sort(
          (a, b) => (a.bestLapTime ?? Infinity) - (b.bestLapTime ?? Infinity),
        )
      : [...payload.results].sort((a, b) => a.position - b.position);
    const playerResult = sorted.find((r) => r.entryId === playerEntryId);

    for (const [index, result] of sorted.slice(0, 3).entries()) {
      const displayPos = isTiming ? index + 1 : result.position;
      const card = document.createElement("div");
      card.className = `podium-slot podium-p${displayPos}`;
      const carNum = formatCarNumber(result.carNumber);
      const carNumHtml = carNum
        ? `<span class="podium-car-num">${escapeHtml(carNum)}</span>`
        : "";
      card.innerHTML = `
        <span class="podium-medal">${podiumMedal(result.position)}</span>
        <span class="podium-pos">P${displayPos}</span>
        ${carNumHtml}
        <span class="podium-team" title="${escapeHtml(result.teamName)}">${escapeHtml(result.teamName)}</span>
        <span class="class-badge class-${escapeHtml(result.classId)}">${escapeHtml(result.classId)}</span>
      `;
      this.podiumEl.appendChild(card);
    }

    const tableHead = this.root.querySelector(".post-race-table thead tr");
    if (tableHead) {
      tableHead.innerHTML = isTiming
        ? `<th>Pos</th><th>#</th><th>Team</th><th>Class</th><th>Best lap</th>`
        : `<th>Pos</th><th>#</th><th>Team</th><th>Class</th>`;
    }

    for (const [index, result] of sorted.entries()) {
      const displayPos = isTiming ? index + 1 : result.position;
      const row = document.createElement("tr");
      if (result.entryId === playerEntryId) row.className = "player-row";
      if (displayPos <= 3) row.classList.add("podium-row");
      const medal = podiumMedal(displayPos);
      const lapCell = isTiming
        ? `<td class="lap-time">${formatLapTime(result.bestLapTime ?? 0)}</td>`
        : "";
      row.innerHTML = `
        <td>${medal ? `${medal} ` : ""}${displayPos}</td>
        <td class="car-num">${result.carNumber ? result.carNumber : "—"}</td>
        <td>${escapeHtml(result.teamName)}</td>
        <td><span class="class-badge class-${escapeHtml(result.classId)}">${escapeHtml(result.classId)}</span></td>
        ${lapCell}
      `;
      this.resultsBody.appendChild(row);
    }

    if (playerResult) {
      const displayPos = isTiming
        ? sorted.findIndex((r) => r.entryId === playerResult.entryId) + 1
        : playerResult.position;
      const medal = podiumMedal(displayPos);
      if (isRace) {
        const pts = payload.finances?.championshipPoints ?? payload.championshipPoints ?? 0;
        this.playerSummaryEl.innerHTML = `
          Your finish: <strong>P${displayPos}</strong>${medal ? ` ${medal}` : ""}
          · Class <span class="class-badge class-${escapeHtml(playerResult.classId)}">${escapeHtml(playerResult.classId)}</span>
          · <strong>+${pts}</strong> championship pts
        `;
      } else if (isQuali) {
        this.playerSummaryEl.innerHTML = `
          ${escapeHtml(sessionLabel("qualifying"))} grid slot: <strong>P${displayPos}</strong>
          · Best lap <strong>${formatLapTime(playerResult.bestLapTime ?? 0)}</strong>
          · Class <span class="class-badge class-${escapeHtml(playerResult.classId)}">${escapeHtml(playerResult.classId)}</span>
        `;
      } else if (isPractice) {
        this.playerSummaryEl.innerHTML = `
          ${escapeHtml(sessionLabel("practice"))}: <strong>P${displayPos}</strong> by best lap
          · Best lap <strong>${formatLapTime(playerResult.bestLapTime ?? 0)}</strong>
          · Class <span class="class-badge class-${escapeHtml(playerResult.classId)}">${escapeHtml(playerResult.classId)}</span>
        `;
      } else {
        this.playerSummaryEl.textContent = "";
      }
    } else {
      this.playerSummaryEl.textContent = "";
    }

    const finances = isRace ? payload.finances : undefined;
    if (finances) {
      const panel = document.createElement("div");
      panel.className = "post-race-finances-panel";
      const lines = finances.breakdown
        .map(
          (line) => `
            <div class="finance-line ${line.amount < 0 ? "finance-negative" : "finance-positive"}">
              <span>${escapeHtml(line.label)}</span>
              <span>${formatMoney(line.amount)}</span>
            </div>
          `,
        )
        .join("");

      const rdNote =
        finances.rdPointsEarned > 0
          ? `<div class="finance-rd-note">+${finances.rdPointsEarned} R&amp;D points from sponsors</div>`
          : "";

      panel.innerHTML = `
        <h3 class="mm-section-title">Team Finances</h3>
        <div class="finance-breakdown">${lines}</div>
        <div class="finance-total">
          <span>Net earnings</span>
          <span class="finance-total-amount">${formatMoney(finances.netEarnings)}</span>
        </div>
        ${rdNote}
      `;
      this.financesEl.appendChild(panel);
    }

    this.renderChampionshipSummary(meta, payload, playerEntryId, isRace);

    this.root.classList.remove("hidden");
  }

  refreshChampionship(meta: MetaStatePayload | null | undefined): void {
    if (!meta?.aiRivalSeason) return;
    const panel = this.championshipEl.querySelector(".post-race-championship-panel");
    if (!panel) return;

    this.updateOffWeekNarrative(panel, meta.aiRivalSeason);

    const driverBlock = panel.querySelector(".post-race-driver-pts");
    if (driverBlock instanceof HTMLElement) {
      const playerDrivers = meta.aiRivalSeason.drivers.filter(
        (d) => d.isPlayerDriver && d.lastRoundPoints > 0,
      );
      if (playerDrivers.length) {
        driverBlock.innerHTML = playerDrivers
          .map(
            (d) =>
              `<span class="post-race-driver-chip">${escapeHtml(d.name)} <strong>+${d.lastRoundPoints}</strong></span>`,
          )
          .join("");
        driverBlock.classList.remove("hidden");
      }
    }
  }

  private renderChampionshipSummary(
    meta: MetaStatePayload | null | undefined,
    payload: RaceCompletePayload,
    playerEntryId: string,
    isRace: boolean,
  ): void {
    this.championshipEl.replaceChildren();
    if (!isRace) {
      this.championshipEl.classList.add("hidden");
      return;
    }

    const season = meta?.aiRivalSeason;
    const playerResult = payload.results.find((r) => r.entryId === playerEntryId);
    const teamPts =
      payload.finances?.championshipPoints ?? payload.championshipPoints ?? 0;
    const playerDrivers =
      season?.drivers.filter(
        (d) => d.isPlayerDriver && d.lastRoundPoints > 0,
      ) ?? [];
    const hypercarLead = season?.teams
      .filter((t) => t.primaryClassId === (playerResult?.classId ?? "Hypercar"))
      .sort((a, b) => b.championshipPoints - a.championshipPoints)[0];
    const headline = season?.lastOffWeekHeadline ?? "";
    const events = season?.lastOffWeekEvents ?? [];
    const marketNote = season?.lastMarketNote ?? "";

    if (
      teamPts <= 0 &&
      !playerDrivers.length &&
      !marketNote &&
      !headline &&
      !events.length &&
      !hypercarLead
    ) {
      this.championshipEl.classList.add("hidden");
      return;
    }

    const panel = document.createElement("div");
    panel.className = "post-race-championship-panel";
    panel.innerHTML = `
      <h3 class="mm-section-title">Championship</h3>
      ${
        teamPts > 0
          ? `<p class="post-race-team-pts">Team <strong>+${teamPts}</strong> pts this round${
              playerResult
                ? ` · ${escapeHtml(playerResult.classId)} P${playerResult.position}`
                : ""
            }</p>`
          : ""
      }
      <div class="post-race-driver-pts ${
        playerDrivers.length ? "" : "hidden"
      }"></div>
      ${
        hypercarLead && !hypercarLead.isPlayerTeam
          ? `<p class="post-race-rival-lead">${escapeHtml(hypercarLead.teamName)} leads ${escapeHtml(playerResult?.classId ?? "Hypercar")} with ${hypercarLead.championshipPoints} pts</p>`
          : ""
      }
      <p class="post-race-offweek-headline ${headline ? "" : "hidden"}">${escapeHtml(headline)}</p>
      <ul class="post-race-offweek-events ${events.length ? "" : "hidden"}">
        ${events
          .slice(0, 4)
          .map((e) => `<li class="post-race-offweek-event">${escapeHtml(e.text)}</li>`)
          .join("")}
      </ul>
      <p class="post-race-rival-note ${marketNote ? "" : "hidden"}">${escapeHtml(marketNote)}</p>
    `;

    const driverBlock = panel.querySelector(".post-race-driver-pts");
    if (driverBlock instanceof HTMLElement && playerDrivers.length) {
      driverBlock.innerHTML = playerDrivers
        .map(
          (d) =>
            `<span class="post-race-driver-chip">${escapeHtml(d.name)} <strong>+${d.lastRoundPoints}</strong></span>`,
        )
        .join("");
    }

    this.championshipEl.appendChild(panel);
    this.championshipEl.classList.remove("hidden");
  }

  private updateOffWeekNarrative(
    panel: Element,
    season: NonNullable<MetaStatePayload["aiRivalSeason"]>,
  ): void {
    const headlineEl = panel.querySelector(".post-race-offweek-headline");
    const eventsEl = panel.querySelector(".post-race-offweek-events");
    const noteEl = panel.querySelector(".post-race-rival-note");

    const headline = season.lastOffWeekHeadline ?? "";
    const events = season.lastOffWeekEvents ?? [];
    const marketNote = season.lastMarketNote ?? "";

    if (headlineEl instanceof HTMLElement) {
      headlineEl.textContent = headline;
      headlineEl.classList.toggle("hidden", !headline);
    }

    if (eventsEl instanceof HTMLElement) {
      eventsEl.replaceChildren();
      for (const event of events.slice(0, 4)) {
        const li = document.createElement("li");
        li.className = "post-race-offweek-event";
        li.textContent = event.text;
        eventsEl.appendChild(li);
      }
      eventsEl.classList.toggle("hidden", events.length === 0);
    }

    if (noteEl instanceof HTMLElement) {
      noteEl.textContent = marketNote;
      noteEl.classList.toggle("hidden", !marketNote);
    }
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }
}
