import type { CarSnapshot, SessionKind, WeekendSessionType } from "../ws/protocol";
import {
  isTimingSession,
  sessionShortLabel,
  sessionStandingsTitle,
  sessionTimingTitle,
} from "../utils/weekendSessions";
import { formatCarNumber } from "../entryNumbers";
import {
  effectiveLeaderboardGapScope,
  orderLeaderboardBoard,
  type GapScope,
} from "../utils/leaderboardBoard";
import { formatGapCompact, formatLapTime } from "../utils/formatTime";
import { formatTyreTemp, formatTyreWear, tyreTempBand } from "../utils/formatTyre";
import { tyreCompoundIconHtml } from "../utils/tyreCompound";
import { formatFuelAmount, usesBatteryFuelDisplay } from "../utils/fuelDisplay";
import { resolveRetireReason } from "../utils/retireReason";
import {
  hasCarDamage,
  resolveTimingStatusTags,
  renderTimingStatusTagsHtml,
} from "../utils/carStatus";

type GapMode = "leader" | "ahead";

interface CompactLbRow {
  root: HTMLDivElement;
  pos: HTMLSpanElement;
  num: HTMLSpanElement;
  team: HTMLSpanElement;
  detail: HTMLSpanElement;
  badge: HTMLSpanElement;
  status: HTMLSpanElement;
  lap: HTMLSpanElement;
  gap: HTMLSpanElement;
  extras: HTMLSpanElement;
}

export class CompactLeaderboard {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private gapMode: GapMode = "leader";
  private gapScope: GapScope = "class";
  private showEnergy = true;
  private showFuel = true;
  private showTyre = true;
  private playerEntryId = "entry-1";
  private managedEntryIds = new Set<string>();
  private selectedEntryId = "";
  private lapLength = 13000;
  private timingMode = false;
  private sessionType?: WeekendSessionType;
  private sessionKind?: SessionKind;
  private snapshots: CarSnapshot[] = [];
  private rowByEntryId = new Map<string, CompactLbRow>();
  private lastBoardOrder: string[] = [];
  private badgeEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("aside");
    this.root.className = "compact-leaderboard panel-wec hidden";
    this.root.innerHTML = `
      <header class="compact-lb-header">
        <span class="compact-lb-title">Standings</span>
        <span class="mm-badge mm-badge-live">LIVE</span>
      </header>
      <div class="compact-lb-toggles">
        <div class="compact-lb-toggle-row">
          <span class="compact-lb-label">Gap to</span>
          <div class="compact-lb-btn-group" data-group="gap-mode">
            <button type="button" class="compact-lb-btn active" data-value="leader">Leader</button>
            <button type="button" class="compact-lb-btn" data-value="ahead">Ahead</button>
          </div>
        </div>
        <div class="compact-lb-toggle-row">
          <span class="compact-lb-label">Scope</span>
          <div class="compact-lb-btn-group" data-group="gap-scope">
            <button type="button" class="compact-lb-btn" data-value="overall">Race</button>
            <button type="button" class="compact-lb-btn active" data-value="class">Class</button>
          </div>
        </div>
        <div class="compact-lb-toggle-row compact-lb-cols">
          <label><input type="checkbox" data-col="fuel" checked /> Fuel</label>
          <label><input type="checkbox" data-col="energy" checked /> Energy</label>
          <label><input type="checkbox" data-col="tyre" checked /> Tyres</label>
        </div>
      </div>
      <div class="compact-lb-list"></div>
    `;
    container.appendChild(this.root);
    this.listEl = this.root.querySelector(".compact-lb-list")!;
    this.badgeEl = this.root.querySelector(".compact-lb-header .mm-badge")!;

    this.root.querySelectorAll(".compact-lb-btn-group").forEach((group) => {
      group.addEventListener("click", (ev) => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(".compact-lb-btn");
        if (!btn?.dataset.value) return;
        group.querySelectorAll(".compact-lb-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const name = (group as HTMLElement).dataset.group;
        if (name === "gap-mode") this.gapMode = btn.dataset.value as GapMode;
        if (name === "gap-scope") this.gapScope = btn.dataset.value as GapScope;
        this.render();
      });
    });

    this.root.querySelectorAll("[data-col]").forEach((input) => {
      input.addEventListener("change", () => {
        const col = (input as HTMLInputElement).dataset.col;
        const checked = (input as HTMLInputElement).checked;
        if (col === "fuel") this.showFuel = checked;
        if (col === "energy") this.showEnergy = checked;
        if (col === "tyre") this.showTyre = checked;
        this.render();
      });
    });
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setManagedEntryIds(entryIds: string[]): void {
    this.managedEntryIds = new Set(entryIds);
    this.render();
  }

  setSelectedEntry(entryId: string): void {
    this.selectedEntryId = entryId;
    this.render();
  }

  setLapLength(meters: number): void {
    if (meters > 0) this.lapLength = meters;
  }

  setTimingMode(enabled: boolean): void {
    this.timingMode = enabled;
    this.applySessionHeader();
    this.render();
  }

  setSessionType(sessionType?: WeekendSessionType): void {
    this.sessionType = sessionType;
    this.timingMode = isTimingSession(sessionType);
    this.applySessionHeader();
    this.render();
  }

  setSessionKind(sessionKind?: SessionKind): void {
    this.sessionKind = sessionKind;
    if (sessionKind === "private_test") {
      this.gapScope = "overall";
      this.syncGapScopeButtons();
    }
    this.syncScopeToggleVisibility();
    this.render();
  }

  private applySessionHeader(): void {
    const title = this.root.querySelector(".compact-lb-title");
    if (title) {
      title.textContent = this.timingMode
        ? sessionTimingTitle(this.sessionType)
        : sessionStandingsTitle(this.sessionType);
    }
    this.badgeEl.textContent = sessionShortLabel(this.sessionType);
    const toggles = this.root.querySelector(".compact-lb-toggles");
    toggles?.classList.toggle("hidden", this.timingMode);
  }

  update(snapshots: CarSnapshot[]): void {
    this.snapshots = snapshots;
    if (this.root.classList.contains("hidden")) return;
    this.render();
  }

  private computeTimeGap(follow: CarSnapshot, lead: CarSnapshot): number {
    const lapDiff = lead.lap - follow.lap;
    const distanceGap = lead.distance - follow.distance + lapDiff * this.lapLength;
    if (distanceGap <= 0) return 0;
    const refSpeed = Math.max(lead.speed, follow.speed, 1);
    return distanceGap / refSpeed;
  }

  private orderedBoard(): CarSnapshot[] {
    return orderLeaderboardBoard(this.snapshots, {
      timingMode: this.timingMode,
      gapScope: effectiveLeaderboardGapScope(this.gapScope, this.sessionKind),
      playerEntryId: this.selectedEntryId || this.playerEntryId,
      managedEntryIds: [...this.managedEntryIds],
    });
  }

  private syncGapScopeButtons(): void {
    const group = this.root.querySelector<HTMLElement>(
      '.compact-lb-btn-group[data-group="gap-scope"]',
    );
    if (!group) return;
    group.querySelectorAll(".compact-lb-btn").forEach((btn) => {
      const el = btn as HTMLButtonElement;
      el.classList.toggle("active", el.dataset.value === this.gapScope);
    });
  }

  private syncScopeToggleVisibility(): void {
    const scopeRow = this.root.querySelector<HTMLElement>(
      '.compact-lb-toggle-row:has([data-group="gap-scope"])',
    );
    scopeRow?.classList.toggle("hidden", this.sessionKind === "private_test");
  }

  private gapForCar(car: CarSnapshot, board: CarSnapshot[]): string {
    const idx = board.findIndex((s) => s.entryId === car.entryId);
    if (idx <= 0) return "—";

    if (this.gapMode === "ahead") {
      const ahead = board[idx - 1];
      return formatGapCompact(
        this.computeTimeGap(car, ahead),
        Math.max(0, ahead.lap - car.lap),
      );
    }

    const leader = board[0];
    if (car.entryId === leader.entryId) return "—";
    if (this.timingMode && car.gapToLeader > 0) {
      return `+${car.gapToLeader.toFixed(3)}`;
    }
    const lapDiff = Math.max(0, leader.lap - car.lap);
    if (this.gapScope === "overall" && car.gapToLeader > 0) {
      return formatGapCompact(car.gapToLeader, lapDiff);
    }
    return formatGapCompact(this.computeTimeGap(car, leader), lapDiff);
  }

  private render(): void {
    const board = this.orderedBoard();
    if (board.length === 0) {
      this.rowByEntryId.clear();
      this.lastBoardOrder = [];
      this.listEl.replaceChildren();
      this.listEl.innerHTML = `<p class="compact-lb-empty">Waiting for timing…</p>`;
      return;
    }

    const order = board.map((s) => s.entryId);
    const orderChanged =
      order.length !== this.lastBoardOrder.length ||
      order.some((id, i) => id !== this.lastBoardOrder[i]);

    const seen = new Set<string>();
    for (let i = 0; i < board.length; i++) {
      const snap = board[i];
      seen.add(snap.entryId);
      const row = this.ensureRow(snap.entryId);
      this.paintRow(row, snap, board, i);
      if (orderChanged) this.listEl.appendChild(row.root);
    }

    if (orderChanged) this.lastBoardOrder = order;

    for (const [entryId, row] of this.rowByEntryId) {
      if (seen.has(entryId)) continue;
      row.root.remove();
      this.rowByEntryId.delete(entryId);
    }
  }

  private ensureRow(entryId: string): CompactLbRow {
    let row = this.rowByEntryId.get(entryId);
    if (row) return row;

    const root = document.createElement("div");
    root.className = "compact-lb-row";
    root.dataset.entryId = entryId;

    const pos = document.createElement("span");
    pos.className = "compact-lb-pos";

    const num = document.createElement("span");
    num.className = "compact-lb-num";

    const team = document.createElement("span");
    team.className = "compact-lb-team";

    const detail = document.createElement("span");
    detail.className = "compact-lb-detail";

    const badge = document.createElement("span");
    badge.className = "compact-lb-class-badge class-badge";

    const status = document.createElement("span");
    status.className = "compact-lb-status";

    const lap = document.createElement("span");
    lap.className = "compact-lb-lap";

    const gap = document.createElement("span");
    gap.className = "compact-lb-gap";

    detail.append(badge, status, lap, gap);

    const extras = document.createElement("span");
    extras.className = "compact-lb-extras";

    root.append(pos, num, team, detail, extras);
    row = { root, pos, num, team, detail, badge, status, lap, gap, extras };
    this.rowByEntryId.set(entryId, row);
    return row;
  }

  private paintRow(
    row: CompactLbRow,
    snap: CarSnapshot,
    board: CarSnapshot[],
    index: number,
  ): void {
    row.root.classList.toggle("is-player", this.managedEntryIds.has(snap.entryId));
    row.root.classList.toggle("is-selected", snap.entryId === this.selectedEntryId);
    row.root.classList.toggle("is-retired", snap.retired);
    row.root.classList.toggle("in-garage", snap.inGarage === true);
    row.root.classList.toggle("in-pit", !snap.inGarage && snap.inPit);
    row.root.classList.toggle(
      "is-stranded",
      snap.trackStatus === "stranded" || snap.trackStatus === "recovering",
    );
    row.root.classList.toggle(
      "is-damaged",
      this.managedEntryIds.has(snap.entryId) && hasCarDamage(snap),
    );

    const pos = this.timingMode
      ? index + 1
      : this.gapScope === "class"
        ? (snap.classPosition ?? snap.racePosition)
        : snap.racePosition;
    const num = formatCarNumber(snap);
    const gap = this.gapForCar(snap, board);

    row.pos.textContent = String(pos);
    row.num.textContent = num || "—";
    row.team.textContent = snap.teamName;
    row.team.title = snap.teamName;

    row.badge.className = `compact-lb-class-badge class-badge class-${snap.classId}`;
    row.badge.textContent = snap.classId.slice(0, 3);
    let expBadge = row.root.querySelector<HTMLElement>(".entry-badge.entry-exp");
    if (snap.entryMode === "experimental") {
      if (!expBadge) {
        expBadge = document.createElement("span");
        expBadge.className = "entry-badge entry-exp";
        row.detail.insertBefore(expBadge, row.badge);
      }
      expBadge.textContent = "EXP";
      expBadge.hidden = false;
    } else if (expBadge) {
      expBadge.hidden = true;
    }

    if (snap.retired) {
      row.status.className = "compact-lb-status status-retired";
      row.status.textContent = "OUT";
      row.status.title = resolveRetireReason(snap);
      row.status.hidden = false;
    } else {
      const tags = resolveTimingStatusTags(snap, {
        showDamage: this.managedEntryIds.has(snap.entryId),
      });
      const statusHtml = renderTimingStatusTagsHtml(tags, "compact-lb-status");
      if (statusHtml) {
        row.status.className = "compact-lb-status-wrap";
        row.status.innerHTML = statusHtml;
        row.status.hidden = false;
      } else {
        row.status.className = "compact-lb-status-wrap";
        row.status.innerHTML = "";
        row.status.hidden = true;
      }
    }

    row.lap.textContent = this.timingMode ? formatBestLap(snap.bestLapTime) : `L${snap.lap}`;
    row.gap.textContent = gap;

    const extras: string[] = [];
    if (this.showFuel) {
      const fuelTitle = usesBatteryFuelDisplay(snap) ? "Battery" : "Fuel";
      extras.push(
        `<span class="compact-lb-meta" title="${fuelTitle}">${formatFuelAmount(snap)}</span>`,
      );
    }
    if (this.showEnergy && !usesBatteryFuelDisplay(snap)) {
      const energy =
        snap.hybridDeployMJ != null &&
        snap.hybridDeployMJ >= 0 &&
        (snap.hybridBudgetMJ ?? 0) > 0
          ? `${Math.round((snap.hybridDeployMJ / snap.hybridBudgetMJ!) * 100)}%`
          : snap.hybridDeployMJ != null && snap.hybridDeployMJ >= 0
            ? `${snap.hybridDeployMJ.toFixed(0)} MJ`
            : "—";
      extras.push(`<span class="compact-lb-meta" title="Hybrid deploy">${energy}</span>`);
    }
    if (this.showTyre) {
      const tempBand = tyreTempBand(snap.tireTempC);
      extras.push(
        `<span class="compact-lb-meta tyre-meta tyre-${tempBand}" title="Tyre compound / temp / wear">${tyreCompoundIconHtml(snap.tireCompound, { size: 16 })}${formatTyreTemp(snap.tireTempC)} · ${formatTyreWear(snap.tireWear)}</span>`,
      );
    }

    const extrasHtml = extras.length ? extras.join("") : "";
    if (row.extras.innerHTML !== extrasHtml) {
      row.extras.innerHTML = extrasHtml;
    }
    row.extras.hidden = extras.length === 0;
  }
}

function formatBestLap(seconds: number | undefined): string {
  if (seconds == null || seconds <= 0) return "—";
  return formatLapTime(seconds);
}
