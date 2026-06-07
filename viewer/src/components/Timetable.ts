import type { CarSnapshot, TrackGeometryPayload, WeekendSessionType } from "../ws/protocol";
import {
  isTimingSession,
  sessionLabel,
  sessionShortLabel,
  sessionTimingTitle,
  sortByTiming,
} from "../utils/weekendSessions";
import { formatCarNumber } from "../entryNumbers";
import { formatDuration, formatLapTime } from "../utils/formatTime";
import { mmPanelHeader } from "../utils/mmUi";
import { resolveRetireReason } from "../utils/retireReason";
import {
  personalSectorBests,
  sessionBestLap,
  sessionSectorBests,
  timingCompareClass,
} from "../utils/timingColors";

export type TimetableLapMode = "live" | number;
export type TimetableViewMode = "sectors" | "stats";

type StatColumn = {
  header: string;
  title: string;
  className: string;
  render: (snap: CarSnapshot) => string;
};

const STAT_COLUMNS: StatColumn[] = [
  {
    header: "Pits",
    title: "Pit stops",
    className: "stat-cell stat-count",
    render: (snap) => String(snap.pitCount ?? 0),
  },
  {
    header: "Pit",
    title: "Total time in pits",
    className: "stat-cell",
    render: (snap) => formatDuration(snap.totalPitSeconds ?? 0),
  },
  {
    header: "Stint",
    title: "Current driver stint",
    className: "stat-cell",
    render: (snap) => formatDuration(snap.driverStintSeconds ?? 0),
  },
  {
    header: "Rem",
    title: "Stint time remaining",
    className: "stat-cell",
    render: (snap) => {
      const max = snap.maxDriverStintSeconds ?? 0;
      const stint = snap.driverStintSeconds ?? 0;
      if (max <= 0) return "—";
      return formatDuration(Math.max(0, max - stint));
    },
  },
  {
    header: "Drv",
    title: "Driver",
    className: "stat-cell stat-driver",
    render: (snap) => escapeHtml(abbrevDriverName(snap.driverName)),
  },
];

export class Timetable {
  readonly root: HTMLElement;
  private tableWrap: HTMLElement;
  private lapSelect: HTMLSelectElement;
  private lapSelectLabel: HTMLElement;
  private sectorCount = 0;
  private selectedLap: TimetableLapMode = "live";
  private lapOptionCount = 0;
  private viewMode: TimetableViewMode = "sectors";
  private timingMode = false;
  private sessionType?: WeekendSessionType;
  private managedEntryIds = new Set<string>();
  private selectedEntryId = "";
  private titleEl!: HTMLElement;
  private subtitleEl!: HTMLElement;
  private badgeEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel timetable panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Live Timing", { subtitle: "Sector times · lap history", badge: "LIVE" })}
      <div class="timetable-toolbar">
        <div class="timetable-view-toggle" role="group" aria-label="Column view">
          <button type="button" class="timetable-view-btn active" data-view="sectors">Sectors</button>
          <button type="button" class="timetable-view-btn" data-view="stats">Stats</button>
        </div>
        <label class="lap-select-label">
          <span>Lap</span>
          <select class="lap-select"></select>
        </label>
      </div>
      <div class="timetable-wrap"></div>
    `;
    this.lapSelect = this.root.querySelector(".lap-select")!;
    this.lapSelectLabel = this.root.querySelector(".lap-select-label")!;
    this.tableWrap = this.root.querySelector(".timetable-wrap")!;
    this.lapSelect.addEventListener("change", () => {
      const value = this.lapSelect.value;
      this.selectedLap = value === "live" ? "live" : parseInt(value, 10);
      this.renderTable(this.lastSnapshots);
    });
    this.root.querySelectorAll(".timetable-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = (btn as HTMLElement).dataset.view as TimetableViewMode | undefined;
        if (!view || view === this.viewMode) return;
        this.viewMode = view;
        this.root.querySelectorAll(".timetable-view-btn").forEach((b) => {
          b.classList.toggle("active", (b as HTMLElement).dataset.view === view);
        });
        this.updateToolbar();
        this.renderTable(this.lastSnapshots);
      });
    });
    container.appendChild(this.root);
    this.titleEl = this.root.querySelector(".mm-panel-title")!;
    this.subtitleEl = this.root.querySelector(".mm-panel-subtitle")!;
    this.badgeEl = this.root.querySelector(".mm-badge")!;
  }

  private lastSnapshots: CarSnapshot[] = [];

  setGeometry(geometry: TrackGeometryPayload): void {
    this.sectorCount = geometry.sectors.length;
    this.renderTable(this.lastSnapshots);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  setTimingMode(enabled: boolean): void {
    this.timingMode = enabled;
    this.renderTable(this.lastSnapshots);
  }

  setManagedEntryIds(entryIds: string[]): void {
    this.managedEntryIds = new Set(entryIds);
    this.renderTable(this.lastSnapshots);
  }

  setSelectedEntry(entryId: string): void {
    this.selectedEntryId = entryId;
    this.renderTable(this.lastSnapshots);
  }

  setSessionType(sessionType?: WeekendSessionType): void {
    this.sessionType = sessionType;
    this.timingMode = isTimingSession(sessionType);
    this.titleEl.textContent = sessionTimingTitle(sessionType);
    this.updateSubtitle();
    this.badgeEl.textContent = sessionShortLabel(sessionType);
    this.renderTable(this.lastSnapshots);
  }

  update(snapshots: CarSnapshot[]): void {
    this.lastSnapshots = snapshots;
    if (this.root.classList.contains("hidden")) return;
    this.updateLapOptions(snapshots);
    this.renderTable(snapshots);
  }

  reset(): void {
    this.selectedLap = "live";
    this.lapOptionCount = 0;
    this.lapSelect.value = "live";
    this.lastSnapshots = [];
    this.renderTable([]);
  }

  private updateSubtitle(): void {
    if (this.viewMode === "stats") {
      this.subtitleEl.textContent = `${sessionLabel(this.sessionType)} · pits · stints · drivers`;
      return;
    }
    this.subtitleEl.textContent = isTimingSession(this.sessionType)
      ? `${sessionLabel(this.sessionType)} · sector times · best laps`
      : `${sessionLabel(this.sessionType)} · sector times · lap history`;
  }

  private updateToolbar(): void {
    const statsMode = this.viewMode === "stats";
    this.lapSelectLabel.classList.toggle("hidden", statsMode);
    this.updateSubtitle();
  }

  private updateLapOptions(snapshots: CarSnapshot[]): void {
    const maxCompleted = snapshots.reduce((max, snap) => {
      const completed = snap.lapHistory?.length ?? 0;
      return Math.max(max, completed);
    }, 0);

    if (document.activeElement === this.lapSelect) return;
    if (maxCompleted === this.lapOptionCount) return;

    this.lapOptionCount = maxCompleted;
    const prev = this.lapSelect.value;
    this.lapSelect.replaceChildren();

    const live = document.createElement("option");
    live.value = "live";
    live.textContent = "Live";
    this.lapSelect.appendChild(live);

    for (let lap = 1; lap <= maxCompleted; lap++) {
      const opt = document.createElement("option");
      opt.value = String(lap);
      opt.textContent = `Lap ${lap}`;
      this.lapSelect.appendChild(opt);
    }

    if (this.selectedLap === "live") {
      this.lapSelect.value = "live";
    } else if (this.selectedLap <= maxCompleted) {
      this.lapSelect.value = String(this.selectedLap);
    } else {
      this.selectedLap = "live";
      this.lapSelect.value = "live";
    }

    if (prev !== this.lapSelect.value && prev !== "") {
      // keep user selection when still valid
    }
  }

  private renderTable(snapshots: CarSnapshot[]): void {
    const sorted = this.timingMode
      ? sortByTiming(snapshots)
      : [...snapshots].sort((a, b) => a.racePosition - b.racePosition);
    const dataColCount = Math.max(1, this.sectorCount);
    const dataCols =
      this.viewMode === "stats"
        ? this.statColumnMarkup(dataColCount)
        : this.sectorColumnMarkup(dataColCount);
    const dataHeaders =
      this.viewMode === "stats"
        ? this.statHeaders(dataColCount)
        : this.sectorHeaders(dataColCount);
    const sessionSectors = sessionSectorBests(snapshots, this.sectorCount);
    const sessionLapBest = sessionBestLap(snapshots);

    const rows = sorted
      .map((snap, index) => {
        const personalSectors = personalSectorBests(snap, this.sectorCount);
        const dataCells =
          this.viewMode === "stats"
            ? this.statCells(snap, dataColCount)
            : this.sectorCells(snap, personalSectors, sessionSectors);
        const rowClasses = [
          snap.retired ? "retired" : "",
          this.managedEntryIds.has(snap.entryId) ? "is-player" : "",
          snap.entryId === this.selectedEntryId ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const statusCell = snap.retired
          ? `<td><span class="status-tag status-retired" title="${escapeHtml(resolveRetireReason(snap))}">OUT</span></td>`
          : snap.inGarage
            ? `<td><span class="status-tag">GAR</span></td>`
            : snap.inPit
              ? `<td><span class="status-tag status-pit" title="In pits">PIT</span></td>`
              : `<td></td>`;
        const lastLap = snap.lastLapTime ?? 0;
        const bestLap = snap.bestLapTime ?? 0;
        const lastClass = timingCompareClass(lastLap, bestLap, sessionLapBest);
        const bestClass = timingCompareClass(bestLap, bestLap, sessionLapBest);
        return `
          <tr class="${rowClasses}">
            <td>${this.timingMode ? index + 1 : snap.racePosition}</td>
            <td class="car-num">${formatCarNumber(snap)}</td>
            <td class="team-cell" title="${escapeHtml(snap.teamName)}">${escapeHtml(snap.teamName)}</td>
            <td><span class="class-badge class-${snap.classId}">${escapeHtml(snap.classId)}</span></td>
            ${statusCell}
            ${dataCells}
            <td class="timing-cell ${lastClass}">${formatLapTime(lastLap)}</td>
            <td class="timing-cell ${bestClass}">${formatLapTime(bestLap)}</td>
          </tr>
        `;
      })
      .join("");

    this.tableWrap.innerHTML = `
      <table class="timetable-table${this.viewMode === "stats" ? " timetable-table--stats" : ""}">
        <colgroup>
          <col class="col-pos" />
          <col class="col-num" />
          <col class="col-team" />
          <col class="col-class" />
          <col class="col-status" />
          ${dataCols}
          <col class="col-lap" />
          <col class="col-lap" />
        </colgroup>
        <thead>
          <tr>
            <th>P</th>
            <th>#</th>
            <th>Team</th>
            <th>Class</th>
            <th>St</th>
            ${dataHeaders}
            <th>Last</th>
            <th>Best</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private sectorColumnMarkup(count: number): string {
    return Array.from({ length: count }, () => `<col class="col-sector" />`).join("");
  }

  private statColumnMarkup(count: number): string {
    return Array.from({ length: count }, () => `<col class="col-stat" />`).join("");
  }

  private sectorHeaders(count: number): string {
    return Array.from({ length: count }, (_, i) => `<th>S${i + 1}</th>`).join("");
  }

  private statHeaders(count: number): string {
    return STAT_COLUMNS.slice(0, count)
      .map((col) => `<th title="${escapeHtml(col.title)}">${col.header}</th>`)
      .join("");
  }

  private statCells(snap: CarSnapshot, count: number): string {
    return STAT_COLUMNS.slice(0, count)
      .map((col) => {
        const extra =
          col.header === "Rem" && (snap.maxDriverStintSeconds ?? 0) > 0
            ? stintRemainingClass(
                snap.driverStintSeconds ?? 0,
                snap.maxDriverStintSeconds ?? 0,
              )
            : col.header === "Pit" && snap.inPit
              ? " live-stat"
              : "";
        return `<td class="${col.className}${extra}" title="${escapeHtml(col.title)}">${col.render(snap)}</td>`;
      })
      .join("");
  }

  private sectorCells(
    snap: CarSnapshot,
    personalSectors: number[],
    sessionSectors: number[],
  ): string {
    const cells: string[] = [];
    const history = snap.lapHistory ?? [];
    const currentSectors = snap.currentLapSectorTimes ?? [];
    for (let i = 0; i < this.sectorCount; i++) {
      let value = "—";
      let className = "timing-cell";
      let time = 0;
      let inProgress = false;

      if (this.selectedLap === "live") {
        if (i < currentSectors.length) {
          time = currentSectors[i];
          value = formatLapTime(time);
        } else if (i === currentSectors.length) {
          time = snap.currentSectorTime ?? 0;
          value = formatLapTime(time);
          className += " live-sector";
          inProgress = true;
        }
      } else {
        const lap = history.find((entry) => entry.lapNumber === this.selectedLap);
        if (lap && i < lap.sectorTimes.length) {
          time = lap.sectorTimes[i];
          value = formatLapTime(time);
        }
      }

      if (!inProgress) {
        const colorClass = timingCompareClass(
          time,
          personalSectors[i] ?? 0,
          sessionSectors[i] ?? 0,
        );
        if (colorClass) className += ` ${colorClass}`;
      }

      cells.push(`<td class="${className}">${value}</td>`);
    }

    return cells.join("");
  }
}

function abbrevDriverName(name?: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name.length > 10 ? `${name.slice(0, 9)}…` : name;
  const last = parts[parts.length - 1];
  return last.length > 12 ? `${last.slice(0, 11)}…` : last;
}

function stintRemainingClass(stintSec: number, maxSec: number): string {
  const remaining = maxSec - stintSec;
  if (remaining <= 900) return " stat-warn";
  if (remaining <= 1800) return " stat-caution";
  return "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
