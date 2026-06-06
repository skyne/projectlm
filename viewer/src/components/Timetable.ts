import type { CarSnapshot, TrackGeometryPayload } from "../ws/protocol";
import { formatCarNumber } from "../entryNumbers";
import { formatLapTime } from "../utils/formatTime";
import { mmPanelHeader } from "../utils/mmUi";
import { resolveRetireReason } from "../utils/retireReason";

export type TimetableLapMode = "live" | number;

export class Timetable {
  readonly root: HTMLElement;
  private tableWrap: HTMLElement;
  private lapSelect: HTMLSelectElement;
  private sectorCount = 0;
  private selectedLap: TimetableLapMode = "live";
  private lapOptionCount = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel timetable panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Live Timing", { subtitle: "Sector times · lap history", badge: "LIVE" })}
      <div class="timetable-toolbar">
        <label class="lap-select-label">
          <span>Lap</span>
          <select class="lap-select"></select>
        </label>
      </div>
      <div class="timetable-wrap"></div>
    `;
    this.lapSelect = this.root.querySelector(".lap-select")!;
    this.tableWrap = this.root.querySelector(".timetable-wrap")!;
    this.lapSelect.addEventListener("change", () => {
      const value = this.lapSelect.value;
      this.selectedLap = value === "live" ? "live" : parseInt(value, 10);
      this.renderTable(this.lastSnapshots);
    });
    container.appendChild(this.root);
  }

  private lastSnapshots: CarSnapshot[] = [];

  setGeometry(geometry: TrackGeometryPayload): void {
    this.sectorCount = geometry.sectors.length;
    this.renderTable(this.lastSnapshots);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  update(snapshots: CarSnapshot[]): void {
    this.lastSnapshots = snapshots;
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
    const sorted = [...snapshots].sort((a, b) => a.racePosition - b.racePosition);
    const sectorHeaders = Array.from({ length: this.sectorCount }, (_, i) => {
      return `<th>S${i + 1}</th>`;
    }).join("");

    const rows = sorted
      .map((snap) => {
        const sectorCells = this.sectorCells(snap);
        const rowClass = snap.retired ? "retired" : "";
        const statusCell = snap.retired
          ? `<td><span class="status-tag status-retired" title="${escapeHtml(resolveRetireReason(snap))}">OUT</span></td>`
          : `<td></td>`;
        return `
          <tr class="${rowClass}">
            <td>${snap.racePosition}</td>
            <td class="car-num">${formatCarNumber(snap)}</td>
            <td>${escapeHtml(snap.teamName)}</td>
            <td><span class="class-badge class-${snap.classId}">${escapeHtml(snap.classId)}</span></td>
            ${statusCell}
            ${sectorCells}
            <td class="timing-cell">${formatLapTime(snap.lastLapTime ?? 0)}</td>
            <td class="timing-cell">${formatLapTime(snap.bestLapTime ?? 0)}</td>
          </tr>
        `;
      })
      .join("");

    this.tableWrap.innerHTML = `
      <table class="timetable-table">
        <thead>
          <tr>
            <th>P</th>
            <th>#</th>
            <th>Team</th>
            <th>Class</th>
            <th>St</th>
            ${sectorHeaders}
            <th>Last</th>
            <th>Best</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private sectorCells(snap: CarSnapshot): string {
    const cells: string[] = [];
    const history = snap.lapHistory ?? [];
    const currentSectors = snap.currentLapSectorTimes ?? [];
    for (let i = 0; i < this.sectorCount; i++) {
      let value = "—";
      let className = "timing-cell";

      if (this.selectedLap === "live") {
        if (i < currentSectors.length) {
          value = formatLapTime(currentSectors[i]);
        } else if (i === currentSectors.length) {
          value = formatLapTime(snap.currentSectorTime ?? 0);
          className += " live-sector";
        }
      } else {
        const lap = history.find((entry) => entry.lapNumber === this.selectedLap);
        if (lap && i < lap.sectorTimes.length) {
          value = formatLapTime(lap.sectorTimes[i]);
        }
      }

      cells.push(`<td class="${className}">${value}</td>`);
    }

    return cells.join("");
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
