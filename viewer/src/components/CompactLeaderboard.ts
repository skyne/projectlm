import type { CarSnapshot, SessionKind, WeekendSessionType } from "../ws/protocol";
import {
  isTimingSession,
  sessionShortLabel,
  sessionStandingsTitle,
  sessionTimingTitle,
} from "../utils/weekendSessions";
import { formatCarNumber } from "../entryNumbers";
import { classTagShortLabel } from "../utils/classLabels";
import {
  dedupeSnapshotsByEntryId,
  effectiveLeaderboardGapScope,
  orderLeaderboardBoard,
  type GapScope,
} from "../utils/leaderboardBoard";
import { formatGapCompact, formatLapTime } from "../utils/formatTime";
import { formatTyreTemp, formatTyreWear, tyreTempBand } from "../utils/formatTyre";
import { tyreCompoundIconHtml } from "../utils/tyreCompound";
import { formatFuelAmount, usesBatteryFuelDisplay } from "../utils/fuelDisplay";
import {
  hasCarDamage,
  resolveStandingsTags,
  renderTimingStatusTagsHtml,
  type StandingsTagOptions,
} from "../utils/carStatus";
import { experimentalEntryBadgeHtml, isExperimentalEntry } from "../utils/fleetUi";

type GapMode = "ahead" | "class-leader";

export interface CompactLeaderboardHandlers {
  onEntryClick: (entryId: string) => void;
}

interface TagToggles {
  class: boolean;
  dmg: boolean;
  limp: boolean;
  tyre: boolean;
}

interface CompactLbRow {
  root: HTMLDivElement;
  pos: HTMLSpanElement;
  num: HTMLSpanElement;
  team: HTMLSpanElement;
  driver: HTMLSpanElement;
  tags: HTMLSpanElement;
  gap: HTMLSpanElement;
  extras: HTMLSpanElement;
}

function resolveActiveClassId(
  snapshots: CarSnapshot[],
  playerEntryId: string,
  managedEntryIds: Set<string>,
): string {
  for (const entryId of [playerEntryId, ...managedEntryIds]) {
    const classId = snapshots.find((s) => s.entryId === entryId)?.classId;
    if (classId) return classId;
  }
  return dedupeSnapshotsByEntryId(snapshots)[0]?.classId ?? "Class";
}

function abbrevDriver(name: string | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].toUpperCase();
  return `${parts[0][0]}. ${parts[parts.length - 1].toUpperCase()}`;
}

function classLeaderFor(car: CarSnapshot, snapshots: CarSnapshot[]): CarSnapshot | null {
  const pool = dedupeSnapshotsByEntryId(snapshots).filter(
    (s) => s.classId === car.classId && !s.retired,
  );
  if (pool.length === 0) return null;
  pool.sort(
    (a, b) =>
      (a.classPosition ?? a.racePosition) - (b.classPosition ?? b.racePosition),
  );
  return pool[0];
}

export class CompactLeaderboard {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private scopeClassBtn!: HTMLButtonElement;
  private settingsMenu!: HTMLElement;
  private settingsBtn!: HTMLButtonElement;
  private gapMode: GapMode = "class-leader";
  private gapScope: GapScope = "class";
  private tagToggles: TagToggles = { class: true, dmg: true, limp: true, tyre: true };
  private showEnergy = false;
  private showFuel = false;
  private showTyreDetail = false;
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
  private titleEl!: HTMLElement;
  private badgeEl!: HTMLElement;
  private colsEl!: HTMLElement;
  private settingsDocListener: ((ev: MouseEvent) => void) | null = null;
  private handlers: CompactLeaderboardHandlers | null;

  constructor(container: HTMLElement, handlers?: CompactLeaderboardHandlers) {
    this.handlers = handlers ?? null;
    this.root = document.createElement("aside");
    this.root.className = "compact-leaderboard standings-wec panel-wec panel-dense hidden";
    this.root.innerHTML = `
      <header class="standings-wec-header">
        <div class="standings-wec-header-text">
          <span class="standings-wec-kicker">Live Race</span>
          <h2 class="standings-wec-title">Standings</h2>
        </div>
        <div class="standings-wec-header-actions">
          <span class="mm-badge mm-badge-live-gradient standings-wec-live">LIVE</span>
          <button
            type="button"
            class="standings-wec-settings-btn"
            aria-label="Standings display settings"
            aria-expanded="false"
            aria-haspopup="true"
            title="Display settings"
          >
            <svg class="standings-wec-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m9.4 4a7.4 7.4 0 0 1-.1 1l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-1.7 1l-.4 2.6H9.2l-.4-2.6a7.6 7.6 0 0 1-1.7-1l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1-.1-1 7.4 7.4 0 0 1 .1-1l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 1.7-1l.4-2.6h5.6l.4 2.6a7.6 7.6 0 0 1 1.7 1l2.4-1 2 3.4-2 1.6q.1.5.1 1"/>
            </svg>
          </button>
        </div>
      </header>

      <div class="standings-wec-scope" role="tablist" aria-label="Standings scope">
        <button type="button" class="standings-wec-scope-btn active" data-scope="class" role="tab" aria-selected="true">
          Class
        </button>
        <button type="button" class="standings-wec-scope-btn" data-scope="overall" role="tab" aria-selected="false">
          Overall
        </button>
      </div>

      <div class="standings-wec-cols" aria-hidden="true">
        <span>P</span>
        <span>#</span>
        <span>Team</span>
        <span class="standings-wec-cols-gap">Gap</span>
      </div>

      <div class="standings-wec-list compact-lb-list"></div>

      <div class="standings-wec-settings-menu hidden" role="menu">
        <p class="standings-wec-settings-heading">Gap reference</p>
        <div class="standings-wec-btn-group" data-group="gap-mode" role="group">
          <button type="button" class="standings-wec-btn active" data-value="class-leader" role="menuitemradio">Class leader</button>
          <button type="button" class="standings-wec-btn" data-value="ahead" role="menuitemradio">Previous car</button>
        </div>
        <p class="standings-wec-settings-heading">Tags</p>
        <div class="standings-wec-settings-toggles">
          <label class="standings-wec-settings-check"><input type="checkbox" data-tag="class" checked /> Class</label>
          <label class="standings-wec-settings-check"><input type="checkbox" data-tag="dmg" checked /> Damage</label>
          <label class="standings-wec-settings-check"><input type="checkbox" data-tag="limp" checked /> Limp</label>
          <label class="standings-wec-settings-check"><input type="checkbox" data-tag="tyre" checked /> Used tyre</label>
        </div>
        <p class="standings-wec-settings-heading">Extra data</p>
        <div class="standings-wec-settings-toggles">
          <label class="standings-wec-settings-check"><input type="checkbox" data-col="fuel" /> Fuel</label>
          <label class="standings-wec-settings-check"><input type="checkbox" data-col="energy" /> Energy</label>
          <label class="standings-wec-settings-check"><input type="checkbox" data-col="tyre-detail" /> Tyre detail</label>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.listEl = this.root.querySelector(".standings-wec-list")!;
    this.titleEl = this.root.querySelector(".standings-wec-title")!;
    this.badgeEl = this.root.querySelector(".standings-wec-live")!;
    this.colsEl = this.root.querySelector(".standings-wec-cols")!;
    this.scopeClassBtn = this.root.querySelector('[data-scope="class"]')!;
    this.settingsBtn = this.root.querySelector(".standings-wec-settings-btn")!;
    this.settingsMenu = this.root.querySelector(".standings-wec-settings-menu")!;

    this.syncGapModeButtons();

    this.settingsBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.toggleSettingsMenu();
    });

    this.root.querySelectorAll(".standings-wec-scope-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const scope = (btn as HTMLButtonElement).dataset.scope as GapScope | undefined;
        if (!scope || scope === this.gapScope) return;
        this.gapScope = scope;
        this.syncScopeTabs();
        this.render();
      });
    });

    this.root.querySelectorAll(".standings-wec-btn-group").forEach((group) => {
      group.addEventListener("click", (ev) => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(".standings-wec-btn");
        if (!btn?.dataset.value) return;
        group.querySelectorAll(".standings-wec-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const name = (group as HTMLElement).dataset.group;
        if (name === "gap-mode") this.gapMode = btn.dataset.value as GapMode;
        this.render();
      });
    });

    this.root.querySelectorAll("[data-tag]").forEach((input) => {
      input.addEventListener("change", () => {
        const tag = (input as HTMLInputElement).dataset.tag as keyof TagToggles | undefined;
        if (!tag) return;
        this.tagToggles[tag] = (input as HTMLInputElement).checked;
        this.render();
      });
    });

    this.root.querySelectorAll("[data-col]").forEach((input) => {
      input.addEventListener("change", () => {
        const col = (input as HTMLInputElement).dataset.col;
        const checked = (input as HTMLInputElement).checked;
        if (col === "fuel") this.showFuel = checked;
        if (col === "energy") this.showEnergy = checked;
        if (col === "tyre-detail") this.showTyreDetail = checked;
        this.render();
      });
    });

    this.listEl.addEventListener("click", (ev) => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>(".standings-wec-row");
      if (!row?.dataset.entryId) return;
      this.handlers?.onEntryClick(row.dataset.entryId);
    });

    this.listEl.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const row = (ev.target as HTMLElement).closest<HTMLElement>(".standings-wec-row");
      if (!row?.dataset.entryId) return;
      ev.preventDefault();
      this.handlers?.onEntryClick(row.dataset.entryId);
    });
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
    if (!visible) this.closeSettingsMenu();
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setManagedEntryIds(entryIds: string[]): void {
    this.managedEntryIds = new Set(entryIds);
    this.syncScopeClassLabel();
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
      this.syncScopeTabs();
    }
    this.syncScopeToggleVisibility();
    this.render();
  }

  private positionSettingsMenu(): void {
    const panel = this.root.getBoundingClientRect();
    const btn = this.settingsBtn.getBoundingClientRect();
    this.settingsMenu.style.top = `${btn.bottom - panel.top + 6}px`;
    this.settingsMenu.style.right = `${panel.right - btn.right}px`;
  }

  private toggleSettingsMenu(): void {
    const willOpen = this.settingsMenu.classList.contains("hidden");
    if (!willOpen) {
      this.closeSettingsMenu();
      return;
    }
    this.positionSettingsMenu();
    this.settingsMenu.classList.remove("hidden");
    this.settingsBtn.setAttribute("aria-expanded", "true");
    this.root.classList.add("is-settings-open");
    this.settingsDocListener = (ev: MouseEvent) => {
      if (
        !this.settingsMenu.contains(ev.target as Node) &&
        !this.settingsBtn.contains(ev.target as Node)
      ) {
        this.closeSettingsMenu();
      }
    };
    document.addEventListener("click", this.settingsDocListener);
  }

  private closeSettingsMenu(): void {
    this.settingsMenu.classList.add("hidden");
    this.settingsBtn.setAttribute("aria-expanded", "false");
    this.root.classList.remove("is-settings-open");
    if (this.settingsDocListener) {
      document.removeEventListener("click", this.settingsDocListener);
      this.settingsDocListener = null;
    }
  }

  private syncGapModeButtons(): void {
    this.root.querySelectorAll('[data-group="gap-mode"] .standings-wec-btn').forEach((btn) => {
      const el = btn as HTMLButtonElement;
      el.classList.toggle("active", el.dataset.value === this.gapMode);
    });
  }

  private applySessionHeader(): void {
    const kicker = this.root.querySelector(".standings-wec-kicker");
    if (kicker) {
      kicker.textContent = this.timingMode ? "Live Timing" : "Live Race";
    }
    this.titleEl.textContent = this.timingMode
      ? sessionTimingTitle(this.sessionType)
      : sessionStandingsTitle(this.sessionType);
    this.badgeEl.textContent = sessionShortLabel(this.sessionType);
    const gapCol = this.colsEl.querySelector(".standings-wec-cols-gap");
    if (gapCol) {
      gapCol.textContent = this.timingMode ? "Best" : "Gap";
    }
    this.root.querySelector(".standings-wec-scope")?.classList.toggle("hidden", this.timingMode);
  }

  update(snapshots: CarSnapshot[]): void {
    this.snapshots = snapshots;
    this.syncScopeClassLabel();
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

  private syncScopeTabs(): void {
    this.root.querySelectorAll(".standings-wec-scope-btn").forEach((btn) => {
      const el = btn as HTMLButtonElement;
      const active = el.dataset.scope === this.gapScope;
      el.classList.toggle("active", active);
      el.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  private syncScopeClassLabel(): void {
    const classId = resolveActiveClassId(
      this.snapshots,
      this.selectedEntryId || this.playerEntryId,
      this.managedEntryIds,
    );
    this.scopeClassBtn.textContent = classTagShortLabel(classId);
  }

  private syncScopeToggleVisibility(): void {
    const scopeRow = this.root.querySelector(".standings-wec-scope");
    scopeRow?.classList.toggle("hidden", this.sessionKind === "private_test");
  }

  private isClassLeader(car: CarSnapshot): boolean {
    const leader = classLeaderFor(car, this.snapshots);
    return leader?.entryId === car.entryId;
  }

  private gapForCar(car: CarSnapshot, board: CarSnapshot[], index: number): string {
    if (!this.timingMode && this.isClassLeader(car)) {
      return `LAP ${car.lap}`;
    }

    if (this.timingMode) {
      return formatBestLap(car.bestLapTime);
    }

    if (this.gapMode === "ahead") {
      const idx = board.findIndex((s) => s.entryId === car.entryId);
      if (idx <= 0) return "—";
      const ahead = board[idx - 1];
      return formatGapCompact(
        this.computeTimeGap(car, ahead),
        Math.max(0, ahead.lap - car.lap),
      );
    }

    const classLeader = classLeaderFor(car, this.snapshots);
    if (!classLeader || classLeader.entryId === car.entryId) return "—";

    if (car.gapToLeader > 0 && car.gapToLeader < 60 && this.gapScope === "class") {
      return `+${car.gapToLeader.toFixed(3)}`;
    }

    const lapDiff = Math.max(0, classLeader.lap - car.lap);
    return formatGapCompact(this.computeTimeGap(car, classLeader), lapDiff);
  }

  private tagOptions(): StandingsTagOptions {
    return {
      showClass: this.tagToggles.class,
      showDamage: this.tagToggles.dmg,
      showLimp: this.tagToggles.limp,
      showTyre: this.tagToggles.tyre,
    };
  }

  private render(): void {
    const board = this.orderedBoard();
    if (board.length === 0) {
      this.rowByEntryId.clear();
      this.lastBoardOrder = [];
      this.listEl.replaceChildren();
      this.listEl.innerHTML = `<p class="standings-wec-empty">Waiting for timing…</p>`;
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
    root.className = "standings-wec-row compact-lb-row";
    root.dataset.entryId = entryId;
    root.setAttribute("role", "button");
    root.tabIndex = 0;

    const pos = document.createElement("span");
    pos.className = "standings-wec-pos compact-lb-pos";

    const num = document.createElement("span");
    num.className = "standings-wec-num compact-lb-num";

    const main = document.createElement("div");
    main.className = "standings-wec-main";

    const team = document.createElement("span");
    team.className = "standings-wec-team compact-lb-team";

    const driver = document.createElement("span");
    driver.className = "standings-wec-driver";

    const tags = document.createElement("span");
    tags.className = "standings-wec-tags compact-lb-status-wrap";

    main.append(team, driver, tags);

    const gap = document.createElement("span");
    gap.className = "standings-wec-gap compact-lb-gap";

    const extras = document.createElement("div");
    extras.className = "standings-wec-extras compact-lb-extras";

    root.append(pos, num, main, gap, extras);
    row = { root, pos, num, team, driver, tags, gap, extras };
    this.rowByEntryId.set(entryId, row);
    return row;
  }

  private paintRow(
    row: CompactLbRow,
    snap: CarSnapshot,
    board: CarSnapshot[],
    index: number,
  ): void {
    const isClassLeader = this.isClassLeader(snap);

    const isOwned = this.managedEntryIds.has(snap.entryId);
    const isCommand = snap.entryId === this.selectedEntryId;
    row.root.classList.toggle("is-owned", isOwned);
    row.root.classList.toggle("is-player", isOwned);
    row.root.classList.toggle("is-selected", isCommand);
    row.root.classList.toggle("is-command", isCommand && isOwned);
    row.root.classList.toggle("is-leader", isClassLeader && !this.timingMode);
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
    row.root.dataset.classId = snap.classId;

    const pos = this.timingMode
      ? index + 1
      : this.gapScope === "class"
        ? (snap.classPosition ?? snap.racePosition)
        : snap.racePosition;
    const num = formatCarNumber(snap);
    const gap = this.gapForCar(snap, board, index);

    row.pos.textContent = String(pos);
    row.num.textContent = num || "—";
    row.team.textContent = snap.teamName.toUpperCase();
    row.team.title = snap.teamName;
    row.root.setAttribute(
      "aria-label",
      `${snap.teamName} #${num || "?"}${isOwned ? (isCommand ? ", selected for commands" : ", your team") : ""}`,
    );
    row.root.title = isOwned
      ? isCommand
        ? "Selected — pit commands target this car. Click to follow on map."
        : "Your team — click to select and follow on map"
      : "Click to follow on map";

    if (snap.driverName) {
      row.driver.textContent = abbrevDriver(snap.driverName);
      row.driver.title = snap.driverName;
      row.driver.hidden = false;
    } else {
      row.driver.textContent = "";
      row.driver.hidden = true;
    }

    const statusTags = resolveStandingsTags(snap, this.tagOptions());
    let tagsHtml = renderTimingStatusTagsHtml(statusTags, "standings-wec-tag");
    if (isExperimentalEntry(snap.entryMode)) {
      tagsHtml = `${experimentalEntryBadgeHtml()}${tagsHtml}`;
    }
    if (row.tags.innerHTML !== tagsHtml) {
      row.tags.innerHTML = tagsHtml;
    }
    row.tags.hidden = tagsHtml.length === 0;

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
    if (this.showTyreDetail) {
      const tempBand = tyreTempBand(snap.tireTempC);
      extras.push(
        `<span class="compact-lb-meta tyre-meta tyre-${tempBand}" title="Tyre compound / temp / wear">${tyreCompoundIconHtml(snap.tireCompound, { size: 14 })}${formatTyreTemp(snap.tireTempC)} · ${formatTyreWear(snap.tireWear)}</span>`,
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
