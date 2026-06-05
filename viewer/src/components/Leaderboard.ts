import type { CarSnapshot } from "../ws/protocol";
import { formatGap } from "../utils/formatTime";

export class Leaderboard {
  readonly root: HTMLElement;
  private tbody: HTMLTableSectionElement;
  private trackName = "";

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel leaderboard";
    this.root.innerHTML = `
      <h2>Leaderboard</h2>
      <p class="track-name"></p>
      <table>
        <thead>
          <tr>
            <th>P</th>
            <th>#</th>
            <th>Team</th>
            <th>Class</th>
            <th>Lap</th>
            <th>Gap</th>
            <th>Speed</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    this.tbody = this.root.querySelector("tbody")!;
    container.appendChild(this.root);
  }

  setTrackName(name: string): void {
    this.trackName = name;
    const el = this.root.querySelector(".track-name");
    if (el) el.textContent = name;
  }

  update(snapshots: CarSnapshot[]): void {
    this.tbody.replaceChildren();
    const sorted = [...snapshots].sort((a, b) => a.racePosition - b.racePosition);

    for (const snap of sorted) {
      const row = document.createElement("tr");
      if (snap.retired) row.className = "retired";
      row.innerHTML = `
        <td>${snap.racePosition}</td>
        <td class="car-num">${snap.carNumber > 0 ? snap.carNumber : "—"}</td>
        <td>${escapeHtml(snap.teamName)}</td>
        <td><span class="class-badge class-${snap.classId}">${escapeHtml(snap.classId)}</span></td>
        <td>${snap.lap}</td>
        <td class="gap-cell">${snap.racePosition === 1 ? "—" : formatGap(snap.gapToLeader ?? 0)}</td>
        <td>${Math.round(snap.speed * 3.6)} km/h</td>
      `;
      this.tbody.appendChild(row);
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
