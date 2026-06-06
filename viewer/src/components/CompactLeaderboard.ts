import type { CarSnapshot } from "../ws/protocol";
import { formatCarNumber } from "../entryNumbers";
import { formatGap } from "../utils/formatTime";
import { formatTyreTemp, formatTyreWear, tyreTempBand } from "../utils/formatTyre";
import { escapeHtml } from "../utils/mmUi";
import { resolveRetireReason } from "../utils/retireReason";

type GapMode = "leader" | "ahead";
type GapScope = "overall" | "class";

export class CompactLeaderboard {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private gapMode: GapMode = "leader";
  private gapScope: GapScope = "class";
  private showEnergy = true;
  private showFuel = true;
  private showTyre = true;
  private playerEntryId = "entry-1";
  private lapLength = 13000;
  private snapshots: CarSnapshot[] = [];

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

  setLapLength(meters: number): void {
    if (meters > 0) this.lapLength = meters;
  }

  update(snapshots: CarSnapshot[]): void {
    this.snapshots = snapshots;
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
    if (this.gapScope === "class") {
      const player = this.snapshots.find((s) => s.entryId === this.playerEntryId);
      const classId = player?.classId;
      const pool = classId
        ? this.snapshots.filter((s) => s.classId === classId)
        : [...this.snapshots];
      return pool.sort((a, b) => (a.classPosition ?? a.racePosition) - (b.classPosition ?? b.racePosition));
    }
    return [...this.snapshots].sort((a, b) => a.racePosition - b.racePosition);
  }

  private gapForCar(car: CarSnapshot, board: CarSnapshot[]): string {
    const idx = board.findIndex((s) => s.entryId === car.entryId);
    if (idx <= 0) return "—";

    if (this.gapMode === "ahead") {
      return formatGap(this.computeTimeGap(car, board[idx - 1]));
    }

    const leader = board[0];
    if (car.entryId === leader.entryId) return "—";
    if (this.gapScope === "overall" && car.gapToLeader > 0) {
      return formatGap(car.gapToLeader);
    }
    return formatGap(this.computeTimeGap(car, leader));
  }

  private render(): void {
    this.listEl.replaceChildren();
    const board = this.orderedBoard();
    if (board.length === 0) {
      this.listEl.innerHTML = `<p class="compact-lb-empty">Waiting for timing…</p>`;
      return;
    }

    for (const snap of board) {
      const row = document.createElement("div");
      row.className = "compact-lb-row";
      if (snap.entryId === this.playerEntryId) row.classList.add("is-player");
      if (snap.retired) row.classList.add("is-retired");
      if (snap.inPit) row.classList.add("in-pit");

      const pos = this.gapScope === "class" ? (snap.classPosition ?? snap.racePosition) : snap.racePosition;
      const num = formatCarNumber(snap);
      const gap = this.gapForCar(snap, board);
      const energy =
        snap.hybridDeployMJ != null && snap.hybridDeployMJ >= 0
          ? `${snap.hybridDeployMJ.toFixed(0)} MJ`
          : "—";

      const extras: string[] = [];
      if (this.showFuel) extras.push(`<span class="compact-lb-meta" title="Fuel">${snap.fuel.toFixed(0)}L</span>`);
      if (this.showEnergy) extras.push(`<span class="compact-lb-meta" title="Hybrid deploy">${energy}</span>`);
      if (this.showTyre) {
        const tempBand = tyreTempBand(snap.tireTempC);
        extras.push(
          `<span class="compact-lb-meta tyre-meta tyre-${tempBand}" title="Tyre temp / wear">${formatTyreTemp(snap.tireTempC)} · ${formatTyreWear(snap.tireWear)}</span>`,
        );
      }

      const statusCol = snap.retired
        ? `<span class="compact-lb-status-col"><span class="compact-lb-status status-retired" title="${escapeHtml(resolveRetireReason(snap))}">OUT</span></span>`
        : snap.inPit
          ? `<span class="compact-lb-status-col"><span class="compact-lb-status">PIT</span></span>`
          : `<span class="compact-lb-status-col"></span>`;

      row.innerHTML = `
        <span class="compact-lb-pos">${pos}</span>
        <span class="compact-lb-num">${num || "—"}</span>
        <span class="compact-lb-team">
          <span class="class-badge class-${escapeHtml(snap.classId)}">${escapeHtml(snap.classId.slice(0, 3))}</span>
          ${escapeHtml(snap.teamName)}
        </span>
        ${statusCol}
        <span class="compact-lb-lap">L${snap.lap}</span>
        <span class="compact-lb-gap">${gap}</span>
        ${extras.length ? `<span class="compact-lb-extras">${extras.join("")}</span>` : ""}
      `;
      this.listEl.appendChild(row);
    }
  }
}
