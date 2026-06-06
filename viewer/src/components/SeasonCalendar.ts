import type { CalendarEventPayload, MetaStatePayload, TrackGeometryPayload } from "../ws/protocol";
import { SvgTrack } from "./SvgTrack";
import {
  calendarRoundLabel,
  formatDurationLabel,
  trackDisplayName,
  trackIconSvg,
} from "../utils/trackIcons";
import { escapeHtml, mmPanelHeader } from "../utils/mmUi";

export interface SeasonCalendarHandlers {
  onSelectTrack: (trackId: string) => void;
  onStartRace?: () => void;
}

function formatLapLength(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(3)} km`;
  return `${Math.round(meters)} m`;
}

export class SeasonCalendar {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private detailEl: HTMLElement;
  private mapContainer: HTMLElement;
  private previewTrack: SvgTrack;
  private handlers: SeasonCalendarHandlers;
  private meta: MetaStatePayload | null = null;
  private selectedRound: number | null = null;
  private previewByTrack = new Map<string, TrackGeometryPayload>();
  private pendingTrackId: string | null = null;
  private hostControlsEnabled = true;

  constructor(container: HTMLElement, handlers: SeasonCalendarHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel season-calendar panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Season Calendar", {
        subtitle: "Browse the WEC schedule and circuit maps",
        badge: "2026",
      })}
      <div class="season-calendar-layout">
        <aside class="season-calendar-sidebar">
          <div class="season-calendar-sidebar-head">
            <h3 class="mm-section-title">All events</h3>
            <p class="season-calendar-hint">Select a round to preview the circuit layout.</p>
          </div>
          <ul class="season-calendar-list"></ul>
        </aside>
        <div class="season-calendar-main">
          <div class="season-calendar-detail"></div>
          <div class="season-calendar-map-wrap">
            <div class="season-calendar-map" id="season-calendar-map"></div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(this.root);
    this.listEl = this.root.querySelector(".season-calendar-list")!;
    this.detailEl = this.root.querySelector(".season-calendar-detail")!;
    this.mapContainer = this.root.querySelector(".season-calendar-map")!;
    this.previewTrack = new SvgTrack(this.mapContainer);
  }

  update(meta: MetaStatePayload): void {
    this.meta = meta;
    if (this.selectedRound === null) {
      this.selectedRound = meta.currentRound;
    }
    this.renderList();
    this.renderDetail();
    const event = this.getSelectedEvent();
    if (event) this.ensurePreview(event.trackId);
  }

  setInteractionEnabled(enabled: boolean): void {
    this.hostControlsEnabled = enabled;
    const startBtn = this.detailEl.querySelector<HTMLButtonElement>(".season-cal-start-btn");
    if (startBtn) startBtn.disabled = !enabled;
  }

  setTrackPreview(trackId: string, geometry: TrackGeometryPayload): void {
    this.previewByTrack.set(trackId, geometry);
    if (this.pendingTrackId === trackId) {
      this.pendingTrackId = null;
      this.previewTrack.setGeometry(geometry);
    }
    const selected = this.getSelectedEvent();
    if (selected?.trackId === trackId) {
      this.renderDetail(geometry);
    }
  }

  private getSelectedEvent(): CalendarEventPayload | null {
    if (!this.meta) return null;
    const round = this.selectedRound ?? this.meta.currentRound;
    return this.meta.calendar.find((e) => e.round === round) ?? null;
  }

  private ensurePreview(trackId: string): void {
    const cached = this.previewByTrack.get(trackId);
    if (cached) {
      this.previewTrack.setGeometry(cached);
      return;
    }
    if (this.pendingTrackId === trackId) return;
    this.pendingTrackId = trackId;
    this.handlers.onSelectTrack(trackId);
  }

  private renderList(): void {
    if (!this.meta) {
      this.listEl.replaceChildren();
      return;
    }

    this.listEl.replaceChildren();
    const sorted = [...this.meta.calendar].sort((a, b) => a.round - b.round);

    for (const event of sorted) {
      const li = document.createElement("li");
      li.className = "season-calendar-item";
      if (event.completed) li.classList.add("completed");
      if (event.round === this.meta.currentRound) li.classList.add("current");
      if (event.round === this.selectedRound) li.classList.add("selected");

      const label = event.eventName ?? trackDisplayName(event.trackId);
      const fmt = formatDurationLabel(event.format, event.eventType);
      const status = event.completed
        ? `Done · ${event.championshipPoints} pts`
        : event.round === this.meta.currentRound
          ? "Next on calendar"
          : "Upcoming";

      li.innerHTML = `
        <span class="season-cal-round">${calendarRoundLabel(event.round, event.eventType)}</span>
        <span class="season-cal-icon">${trackIconSvg(event.trackId)}</span>
        <span class="season-cal-body">
          <span class="season-cal-name">${escapeHtml(label)}</span>
          <span class="season-cal-format">${escapeHtml(fmt)}</span>
          <span class="season-cal-status">${escapeHtml(status)}</span>
        </span>
      `;

      li.addEventListener("click", () => {
        this.selectedRound = event.round;
        this.renderList();
        this.renderDetail();
        this.ensurePreview(event.trackId);
      });

      this.listEl.appendChild(li);
    }
  }

  private renderDetail(geometry?: TrackGeometryPayload): void {
    const event = this.getSelectedEvent();
    if (!event || !this.meta) {
      this.detailEl.innerHTML = `<p class="season-calendar-empty">No calendar data yet.</p>`;
      return;
    }

    const cached = geometry ?? this.previewByTrack.get(event.trackId);
    const label = event.eventName ?? trackDisplayName(event.trackId);
    const fmt = formatDurationLabel(event.format, event.eventType);
    const isNext = event.round === this.meta.currentRound && !event.completed;
    const lapText = cached ? formatLapLength(cached.lapLength) : "Loading…";
    const sectorCount = cached?.sectors.length ?? 0;

    const statusLine = event.completed
      ? `Completed — ${event.championshipPoints} championship points`
      : isNext
        ? "Your next scheduled session"
        : event.round < this.meta.currentRound
          ? "Past event"
          : "Upcoming round";

    this.detailEl.innerHTML = `
      <div class="season-cal-detail-head">
        <div>
          <span class="season-cal-detail-round">${calendarRoundLabel(event.round, event.eventType)}</span>
          <h3 class="season-cal-detail-title">${escapeHtml(label)}</h3>
          <p class="season-cal-detail-sub">${escapeHtml(statusLine)}</p>
        </div>
        ${
          isNext
            ? `<button type="button" class="primary-btn season-cal-start-btn">Start session</button>`
            : ""
        }
      </div>
      <dl class="season-cal-stats">
        <div><dt>Format</dt><dd>${escapeHtml(fmt)}</dd></div>
        <div><dt>Circuit</dt><dd>${escapeHtml(trackDisplayName(event.trackId))}</dd></div>
        <div><dt>Lap length</dt><dd>${escapeHtml(lapText)}</dd></div>
        <div><dt>Sectors</dt><dd>${sectorCount || "—"}</dd></div>
      </dl>
    `;

    const startBtn = this.detailEl.querySelector(".season-cal-start-btn");
    startBtn?.addEventListener("click", () => this.handlers.onStartRace?.());
    if (startBtn && !this.hostControlsEnabled) {
      (startBtn as HTMLButtonElement).disabled = true;
    }
  }
}
