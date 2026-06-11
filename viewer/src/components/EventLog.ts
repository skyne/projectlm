import type { RaceControlPayload, SimEvent } from "../ws/protocol";
import { deriveRedFlagReason } from "../utils/redFlagReason";
import {
  formatRaceTimeCompact,
  formatSidebarLogHtml,
  matchesSidebarLogFilter,
  matchesSidebarRetainFilter,
  normalizeSimEvent,
  type RaceLogEntryMaps,
  type SidebarLogFilters,
} from "../utils/raceLog";

/** Max sidebar-eligible events retained (not raw race-log noise). */
const MAX_RETAINED = 120;

const SETTINGS_ICON = `<svg class="standings-wec-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m9.4 4a7.4 7.4 0 0 1-.1 1l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-1.7 1l-.4 2.6H9.2l-.4-2.6a7.6 7.6 0 0 1-1.7-1l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1-.1-1 7.4 7.4 0 0 1 .1-1l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 1.7-1l.4-2.6h5.6l.4 2.6a7.6 7.6 0 0 1 1.7 1l2.4-1 2 3.4-2 1.6q.1.5.1 1"/>
</svg>`;

export type EventLogFilterState = SidebarLogFilters;

export class EventLog {
  readonly root: HTMLElement;
  private list: HTMLUListElement;
  private statusEl: HTMLElement;
  private settingsBtn: HTMLButtonElement;
  private settingsMenu: HTMLElement;
  private settingsDocListener: ((ev: MouseEvent) => void) | null = null;
  private playerEntryId = "entry-1";
  private managedEntryIds = new Set<string>(["entry-1"]);
  private entryMaps: RaceLogEntryMaps = {
    teamNameByEntry: new Map(),
    carNumberByEntry: new Map(),
  };
  private allEvents: SimEvent[] = [];
  private filters: SidebarLogFilters = {
    track: true,
    myTeam: true,
    allIncidents: false,
    traffic: false,
  };

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel event-log panel-wec sidebar-log-feed";
    this.root.innerHTML = `
      <header class="sidebar-log-header">
        <div class="sidebar-log-header-text">
          <span class="sidebar-log-kicker">Race Control</span>
          <h2 class="sidebar-log-title">Track Feed</h2>
        </div>
        <div class="sidebar-log-header-actions">
          <span class="mm-badge mm-badge-live-gradient sidebar-log-live">LIVE</span>
          <button
            type="button"
            class="standings-wec-settings-btn sidebar-log-settings-btn"
            aria-label="Track feed filters"
            aria-expanded="false"
            aria-haspopup="true"
            title="Feed filters"
          >
            ${SETTINGS_ICON}
          </button>
          <div class="standings-wec-settings-menu sidebar-log-settings-menu hidden" role="menu">
            <p class="standings-wec-settings-heading">Show</p>
            <div class="standings-wec-settings-toggles sidebar-log-settings-toggles">
              <label class="standings-wec-settings-check">
                <input type="checkbox" data-filter="track" checked /> Track &amp; flags
              </label>
              <label class="standings-wec-settings-check">
                <input type="checkbox" data-filter="myTeam" checked /> My cars
              </label>
              <label class="standings-wec-settings-check">
                <input type="checkbox" data-filter="allIncidents" /> All incidents
              </label>
              <label class="standings-wec-settings-check">
                <input type="checkbox" data-filter="traffic" /> Overtakes
              </label>
            </div>
          </div>
        </div>
      </header>
      <p class="sidebar-log-status hidden" role="status" aria-live="polite"></p>
      <ul class="sidebar-log-list" aria-live="polite"></ul>
    `;
    this.list = this.root.querySelector(".sidebar-log-list")!;
    this.statusEl = this.root.querySelector(".sidebar-log-status")!;
    this.settingsBtn = this.root.querySelector(".sidebar-log-settings-btn")!;
    this.settingsMenu = this.root.querySelector(".sidebar-log-settings-menu")!;
    container.appendChild(this.root);

    this.settingsBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.toggleSettingsMenu();
    });

    this.root.querySelectorAll("[data-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = (input as HTMLInputElement).dataset.filter as keyof SidebarLogFilters;
        this.filters[key] = (input as HTMLInputElement).checked;
        this.render();
      });
    });
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setManagedEntryIds(entryIds: string[]): void {
    this.managedEntryIds = new Set(entryIds.length ? entryIds : [this.playerEntryId]);
    this.render();
  }

  setEntryNames(entries: Array<{ entryId: string; teamName: string }>): void {
    this.entryMaps.teamNameByEntry.clear();
    for (const e of entries) this.entryMaps.teamNameByEntry.set(e.entryId, e.teamName);
  }

  setEntryMaps(maps: RaceLogEntryMaps): void {
    this.entryMaps = maps;
    this.render();
  }

  /**
   * Merge eligible events from the full race log (e.g. after reconnect).
   * Does not drop existing sidebar rows.
   */
  backfill(events: SimEvent[]): void {
    if (!events.length) return;
    const seen = new Set(this.allEvents.map((e) => this.eventKey(e)));
    let added = false;
    for (const event of events.map(normalizeSimEvent)) {
      if (!matchesSidebarRetainFilter(event, this.managedEntryIds)) continue;
      const key = this.eventKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      this.allEvents.push(event);
      added = true;
    }
    if (!added) return;
    this.allEvents.sort((a, b) => a.timestamp - b.timestamp);
    this.trimBuffer();
    this.render();
  }

  append(events: SimEvent[]): void {
    if (!events.length) return;
    const seen = new Set(this.allEvents.map((e) => this.eventKey(e)));
    let added = false;
    for (const event of events.map(normalizeSimEvent)) {
      if (!matchesSidebarRetainFilter(event, this.managedEntryIds)) continue;
      const key = this.eventKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      this.allEvents.push(event);
      added = true;
    }
    if (!added) return;
    this.trimBuffer();
    this.render();
  }

  /** Replace sidebar log from server catch-up (page refresh / reconnect). */
  restore(events: SimEvent[]): void {
    this.allEvents = events.slice(-MAX_RETAINED);
    this.render();
  }

  clear(): void {
    this.allEvents = [];
    this.list.replaceChildren();
    this.updateRaceControl(undefined);
  }

  updateRaceControl(rc: RaceControlPayload | undefined): void {
    const reason = deriveRedFlagReason(rc);
    if (!reason) {
      this.statusEl.classList.add("hidden");
      this.statusEl.textContent = "";
      return;
    }
    const remaining = rc?.redFlagSecondsRemaining;
    const timer =
      remaining != null && remaining > 0 ? ` · ${Math.ceil(remaining)}s` : "";
    this.statusEl.textContent = `RED FLAG — ${reason}${timer}`;
    this.statusEl.classList.remove("hidden");
  }

  private toggleSettingsMenu(): void {
    const willOpen = this.settingsMenu.classList.contains("hidden");
    if (!willOpen) {
      this.closeSettingsMenu();
      return;
    }
    this.settingsMenu.classList.remove("hidden");
    this.settingsBtn.setAttribute("aria-expanded", "true");
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
    if (this.settingsDocListener) {
      document.removeEventListener("click", this.settingsDocListener);
      this.settingsDocListener = null;
    }
  }

  private eventKey(event: SimEvent): string {
    return `${event.timestamp}|${event.type}|${event.entryId ?? ""}|${event.otherEntryId ?? ""}`;
  }

  private trimBuffer(): void {
    while (this.allEvents.length > MAX_RETAINED) {
      this.allEvents.shift();
    }
  }

  private render(): void {
    this.list.replaceChildren();
    let shown = 0;
    for (let i = this.allEvents.length - 1; i >= 0; i--) {
      const event = this.allEvents[i]!;
      if (!matchesSidebarLogFilter(event, this.filters, this.managedEntryIds)) continue;
      this.list.appendChild(this.buildRow(event));
      shown++;
    }
    if (shown === 0) {
      const empty = document.createElement("li");
      empty.className = "sidebar-log-empty";
      empty.textContent = "No flags or car events yet";
      this.list.appendChild(empty);
    }
  }

  private buildRow(event: SimEvent): HTMLLIElement {
    const li = document.createElement("li");
    const type = event.type.replace(/[^a-z0-9_-]/gi, "");
    li.className = `sidebar-log-row sidebar-log-row-${type}`;
    const time = formatRaceTimeCompact(event.timestamp);
    li.innerHTML = `<span class="sidebar-log-time">${time}</span><span class="sidebar-log-body">${formatSidebarLogHtml(event, this.entryMaps)}</span>`;
    return li;
  }
}
