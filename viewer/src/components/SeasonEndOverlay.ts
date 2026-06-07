import type { MetaStatePayload, SeasonSummaryPayload } from "../ws/protocol";
import { isSeasonFinished } from "../utils/seasonState";

export interface SeasonEndHandlers {
  onStartNextSeason: () => void;
  onClose: () => void;
}

const CLASS_IDS = ["Hypercar", "LMP2", "LMGT3"] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(amount: number): string {
  const prefix = amount >= 0 ? "+" : "";
  return `${prefix}$${Math.abs(amount).toLocaleString()}`;
}

function medal(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

export class SeasonEndOverlay {
  readonly root: HTMLElement;
  private handlers: SeasonEndHandlers;
  private startBtn: HTMLButtonElement;

  constructor(container: HTMLElement, handlers: SeasonEndHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "season-end-overlay hidden";
    this.root.innerHTML = `
      <div class="season-end-card wec-results-card">
        <div class="post-race-chequer" aria-hidden="true"></div>
        <div class="season-end-header">
          <span class="post-race-badge mm-badge-wec">Season Complete</span>
          <h2 class="season-end-title">Championship Results</h2>
          <p class="season-end-subtitle"></p>
        </div>
        <div class="season-end-standings"></div>
        <div class="season-end-payouts hidden">
          <h3 class="mm-section-title">Season Payouts</h3>
          <div class="season-end-payout-lines"></div>
          <div class="finance-total season-end-payout-total">
            <span>Total credited</span>
            <span class="finance-total-amount season-end-total-amount"></span>
          </div>
        </div>
        <div class="season-end-actions">
          <button type="button" class="primary-btn season-end-start-btn">Start Season <span class="season-end-next-year"></span></button>
          <button type="button" class="secondary-btn season-end-close-btn">Back to Hub</button>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.startBtn = this.root.querySelector(".season-end-start-btn")!;
    this.startBtn.addEventListener("click", () => this.handlers.onStartNextSeason());
    this.root.querySelector(".season-end-close-btn")!.addEventListener("click", () => {
      this.hide();
      this.handlers.onClose();
    });
  }

  show(meta: MetaStatePayload): void {
    if (!isSeasonFinished(meta)) return;

    const summary = meta.seasonSummary;
    if (!summary) return;

    const subtitle = this.root.querySelector(".season-end-subtitle");
    if (subtitle) {
      subtitle.textContent = `${meta.teamName} · ${summary.seasonYear} FIA WEC`;
    }

    const nextYear = this.root.querySelector(".season-end-next-year");
    if (nextYear) nextYear.textContent = String(meta.seasonYear + 1);

    this.renderStandings(summary);
    this.renderPayouts(summary);

    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  setInteractionEnabled(enabled: boolean): void {
    this.startBtn.disabled = !enabled;
  }

  private renderStandings(summary: SeasonSummaryPayload): void {
    const container = this.root.querySelector(".season-end-standings");
    if (!container) return;
    container.replaceChildren();

    for (const classId of CLASS_IDS) {
      const teams = summary.teamStandings[classId] ?? [];
      if (!teams.length) continue;

      const section = document.createElement("section");
      section.className = "season-end-class-block";
      section.innerHTML = `<h3 class="mm-section-title">${escapeHtml(classId)} Teams' Championship</h3>`;

      const list = document.createElement("ol");
      list.className = "season-end-standings-list";
      for (const entry of teams.slice(0, 5)) {
        const li = document.createElement("li");
        li.className = "season-end-standing-row";
        if (entry.isPlayerTeam) li.classList.add("season-end-player-row");
        const posLabel = summary.playerTeamPositions[classId] === entry.position
          ? " · your team"
          : "";
        li.innerHTML = `
          <span class="season-end-pos">${medal(entry.position)} P${entry.position}</span>
          <span class="season-end-name">${escapeHtml(entry.teamName)}</span>
          <span class="season-end-pts">${entry.championshipPoints} pts${posLabel}</span>
        `;
        list.appendChild(li);
      }
      section.appendChild(list);

      const drivers = summary.driverStandings[classId] ?? [];
      const playerDrivers = drivers.filter((d) => d.isPlayerDriver).slice(0, 3);
      if (playerDrivers.length) {
        const driverBlock = document.createElement("div");
        driverBlock.className = "season-end-driver-block";
        driverBlock.innerHTML = `<h4 class="season-end-driver-title">Your drivers</h4>`;
        const dList = document.createElement("ul");
        dList.className = "season-end-driver-list";
        for (const d of playerDrivers) {
          const li = document.createElement("li");
          li.innerHTML = `${escapeHtml(d.name)} · P${d.position} · <strong>${d.championshipPoints}</strong> pts`;
          dList.appendChild(li);
        }
        driverBlock.appendChild(dList);
        section.appendChild(driverBlock);
      }

      container.appendChild(section);
    }
  }

  private renderPayouts(summary: SeasonSummaryPayload): void {
    const panel = this.root.querySelector(".season-end-payouts");
    const linesEl = this.root.querySelector(".season-end-payout-lines");
    const totalEl = this.root.querySelector(".season-end-total-amount");
    if (!(panel instanceof HTMLElement) || !(linesEl instanceof HTMLElement)) return;

    if (!summary.payouts.length) {
      panel.classList.add("hidden");
      return;
    }

    panel.classList.remove("hidden");
    linesEl.replaceChildren();
    for (const line of summary.payouts) {
      const row = document.createElement("div");
      row.className = `finance-line finance-positive`;
      row.innerHTML = `
        <span>${escapeHtml(line.label)}</span>
        <span>${formatMoney(line.amount)}</span>
      `;
      linesEl.appendChild(row);
    }
    if (totalEl instanceof HTMLElement) {
      totalEl.textContent = formatMoney(summary.totalPayout);
    }
  }
}
