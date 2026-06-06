import type { RaceCompletePayload } from "../ws/protocol";

export interface PostRaceHandlers {
  onContinue: () => void;
  onRestart?: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  private playerSummaryEl: HTMLElement;
  private financesEl: HTMLElement;
  private podiumEl: HTMLElement;
  private handlers: PostRaceHandlers;

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
            <h2>Endurance Classification</h2>
          </div>
          <div class="post-race-time-block">
            <span class="clock-block-label">Race time</span>
            <span class="post-race-time endurance-time-display"></span>
          </div>
        </div>
        <div class="post-race-podium"></div>
        <p class="post-race-player-summary"></p>
        <div class="post-race-finances"></div>
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
          <button type="button" class="primary-btn btn-continue">Continue Championship</button>
          <button type="button" class="secondary-btn btn-restart">↺ Restart Session</button>
        </div>
      </div>
    `;

    this.resultsBody = this.root.querySelector("tbody")!;
    this.timeEl = this.root.querySelector(".post-race-time")!;
    this.playerSummaryEl = this.root.querySelector(".post-race-player-summary")!;
    this.financesEl = this.root.querySelector(".post-race-finances")!;
    this.podiumEl = this.root.querySelector(".post-race-podium")!;

    this.root.querySelector(".btn-continue")!.addEventListener("click", () => {
      this.hide();
      this.handlers.onContinue();
    });

    this.root.querySelector(".btn-restart")!.addEventListener("click", () => {
      this.hide();
      this.handlers.onRestart?.();
    });
  }

  show(payload: RaceCompletePayload, playerEntryId: string): void {
    this.timeEl.textContent = formatRaceTime(payload.raceTime);
    this.resultsBody.replaceChildren();
    this.podiumEl.replaceChildren();
    this.financesEl.replaceChildren();

    const sorted = [...payload.results].sort((a, b) => a.position - b.position);
    const playerResult = sorted.find((r) => r.entryId === playerEntryId);

    for (const result of sorted.slice(0, 3)) {
      const card = document.createElement("div");
      card.className = `podium-slot podium-p${result.position}`;
      const carNum = formatCarNumber(result.carNumber);
      const carNumHtml = carNum
        ? `<span class="podium-car-num">${escapeHtml(carNum)}</span>`
        : "";
      card.innerHTML = `
        <span class="podium-medal">${podiumMedal(result.position)}</span>
        <span class="podium-pos">P${result.position}</span>
        ${carNumHtml}
        <span class="podium-team" title="${escapeHtml(result.teamName)}">${escapeHtml(result.teamName)}</span>
        <span class="class-badge class-${escapeHtml(result.classId)}">${escapeHtml(result.classId)}</span>
      `;
      this.podiumEl.appendChild(card);
    }

    for (const result of sorted) {
      const row = document.createElement("tr");
      if (result.entryId === playerEntryId) row.className = "player-row";
      if (result.position <= 3) row.classList.add("podium-row");
      const medal = podiumMedal(result.position);
      row.innerHTML = `
        <td>${medal ? `${medal} ` : ""}${result.position}</td>
        <td class="car-num">${result.carNumber ? result.carNumber : "—"}</td>
        <td>${escapeHtml(result.teamName)}</td>
        <td><span class="class-badge class-${escapeHtml(result.classId)}">${escapeHtml(result.classId)}</span></td>
      `;
      this.resultsBody.appendChild(row);
    }

    if (playerResult) {
      const medal = podiumMedal(playerResult.position);
      const pts = payload.finances?.championshipPoints ?? payload.championshipPoints ?? 0;
      this.playerSummaryEl.innerHTML = `
        Your finish: <strong>P${playerResult.position}</strong>${medal ? ` ${medal}` : ""}
        · Class <span class="class-badge class-${escapeHtml(playerResult.classId)}">${escapeHtml(playerResult.classId)}</span>
        · <strong>+${pts}</strong> championship pts
      `;
    } else {
      this.playerSummaryEl.textContent = "";
    }

    const finances = payload.finances;
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

    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }
}
