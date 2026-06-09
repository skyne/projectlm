import type { SimEvent, SimEventType } from "../ws/protocol";
import { mmPanelHeader } from "../utils/mmUi";
import {
  formatRaceLogHtml,
  formatRaceTime,
  isRaceLogEvent,
  isWeatherEvent,
  type RaceLogEntryMaps,
} from "../utils/raceLog";

const MAX_EVENTS = 120;

/** Penalties, flags, FCY/SC, surface hazards, session milestones. */
const RACE_CONTROL_TYPES = new Set<SimEventType>([
  "RaceComplete",
  "TrackClear",
  "SurfaceHazard",
  "SurfaceCleared",
  "BlueFlag",
  "PenaltyIssued",
  "DriveThroughServed",
  "StopGoServed",
  "MeatballFlag",
  "BlackFlag",
  "Disqualified",
  "SlowZone",
  "FcyDeploy",
  "FcyEnd",
  "SafetyCarDeploy",
  "SafetyCarInThisLap",
  "GreenFlag",
  "WhiteFlag",
  "RedFlagDeploy",
  "RedFlagExtended",
  "RedFlagEnd",
]);

const MY_TEAM_INCIDENT_TYPES = new Set<SimEventType>([
  "Retirement",
  "Collision",
  "Blocked",
  "PenaltyWarning",
  "RacingIncident",
  "Stranded",
  "RecoveryDispatched",
]);

const ALL_INCIDENT_TYPES = new Set<SimEventType>([
  "Retirement",
  "Collision",
  "Blocked",
  "PenaltyWarning",
  "RacingIncident",
  "Stranded",
]);

const TRACK_TYPES = new Set<SimEventType>(["Overtake"]);

export interface EventLogFilterState {
  myTeam: boolean;
  director: boolean;
  incidents: boolean;
  track: boolean;
}

export class EventLog {
  readonly root: HTMLElement;
  private list: HTMLUListElement;
  private playerEntryId = "entry-1";
  private managedEntryIds = new Set<string>(["entry-1"]);
  private entryMaps: RaceLogEntryMaps = {
    teamNameByEntry: new Map(),
    carNumberByEntry: new Map(),
  };
  private allEvents: SimEvent[] = [];
  private filters: EventLogFilterState = {
    myTeam: true,
    director: true,
    incidents: false,
    track: false,
  };

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel event-log panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Race Log", { subtitle: "Penalties, incidents & track status", badge: "LIVE" })}
      <div class="event-log-filters">
        <label><input type="checkbox" data-filter="myTeam" checked /> My team</label>
        <label><input type="checkbox" data-filter="director" checked /> Race control</label>
        <label><input type="checkbox" data-filter="incidents" /> All incidents</label>
        <label><input type="checkbox" data-filter="track" /> Traffic</label>
      </div>
      <ul class="event-list"></ul>
    `;
    this.list = this.root.querySelector(".event-list")!;
    container.appendChild(this.root);

    this.root.querySelectorAll("[data-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = (input as HTMLInputElement).dataset.filter as keyof EventLogFilterState;
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
  }

  setEntryNames(entries: Array<{ entryId: string; teamName: string }>): void {
    this.entryMaps.teamNameByEntry.clear();
    for (const e of entries) this.entryMaps.teamNameByEntry.set(e.entryId, e.teamName);
  }

  setEntryMaps(maps: RaceLogEntryMaps): void {
    this.entryMaps = maps;
  }

  append(events: SimEvent[]): void {
    if (!events.length) return;
    this.allEvents.push(...events);
    while (this.allEvents.length > MAX_EVENTS) {
      this.allEvents.shift();
    }
    this.render();
  }

  clear(): void {
    this.allEvents = [];
    this.list.replaceChildren();
  }

  private render(): void {
    this.list.replaceChildren();
    for (let i = this.allEvents.length - 1; i >= 0; i--) {
      const event = this.allEvents[i]!;
      if (!this.shouldShow(event)) continue;
      this.list.appendChild(this.buildRow(event));
    }
  }

  private buildRow(event: SimEvent): HTMLLIElement {
    const li = document.createElement("li");
    li.className = `event event-${event.type}${isWeatherEvent(event) ? " event-weather" : ""}`;
    const time = formatRaceTime(event.timestamp);
    li.innerHTML = `<span class="time">${time}</span> ${formatRaceLogHtml(event, this.entryMaps)}`;
    return li;
  }

  private isManagedEntry(entryId: string | undefined): boolean {
    return entryId != null && this.managedEntryIds.has(entryId);
  }

  private shouldShow(event: SimEvent): boolean {
    if (!isRaceLogEvent(event)) return false;

    if (isWeatherEvent(event) && this.filters.director) return true;

    const isManagedIncident =
      MY_TEAM_INCIDENT_TYPES.has(event.type) && this.isManagedEntry(event.entryId);
    const isRaceControl = RACE_CONTROL_TYPES.has(event.type);
    const isAnyIncident = ALL_INCIDENT_TYPES.has(event.type);
    const isTrack = TRACK_TYPES.has(event.type);

    if (isManagedIncident && this.filters.myTeam) return true;
    if (isRaceControl && this.filters.director) return true;
    if (isAnyIncident && this.filters.incidents) return true;
    if (isTrack && this.filters.track) return true;
    return false;
  }
}
