import type { SimEvent, SimEventType } from "../ws/protocol";
import { mmPanelHeader } from "../utils/mmUi";

const MAX_EVENTS = 120;

const DIRECTOR_TYPES = new Set<SimEventType>([
  "RaceComplete",
  "PitEnter",
  "PitExit",
  "CommandAck",
  "Stranded",
  "RecoveryDispatched",
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
]);

const INCIDENT_TYPES = new Set<SimEventType>([
  "Retirement",
  "Collision",
  "Blocked",
  "PenaltyWarning",
  "RacingIncident",
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
  private teamNameByEntry = new Map<string, string>();
  private filters: EventLogFilterState = {
    myTeam: true,
    director: true,
    incidents: true,
    track: true,
  };

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel event-log panel-wec";
    this.root.innerHTML = `
      ${mmPanelHeader("Sim Log", { subtitle: "Pits, incidents & race control", badge: "LIVE" })}
      <div class="event-log-filters">
        <label><input type="checkbox" data-filter="myTeam" checked /> My car</label>
        <label><input type="checkbox" data-filter="director" checked /> Race control</label>
        <label><input type="checkbox" data-filter="incidents" checked /> Incidents</label>
        <label><input type="checkbox" data-filter="track" checked /> Track / traffic</label>
      </div>
      <ul class="event-list"></ul>
    `;
    this.list = this.root.querySelector(".event-list")!;
    container.appendChild(this.root);

    this.root.querySelectorAll("[data-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = (input as HTMLInputElement).dataset.filter as keyof EventLogFilterState;
        this.filters[key] = (input as HTMLInputElement).checked;
      });
    });
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setEntryNames(entries: Array<{ entryId: string; teamName: string }>): void {
    this.teamNameByEntry.clear();
    for (const e of entries) this.teamNameByEntry.set(e.entryId, e.teamName);
  }

  append(events: SimEvent[]): void {
    for (const event of events) {
      if (!this.shouldShow(event)) continue;
      const li = document.createElement("li");
      li.className = `event event-${event.type}`;
      const time = formatRaceTime(event.timestamp);
      li.innerHTML = `<span class="time">${time}</span> ${this.formatEventContent(event)}`;
      this.list.prepend(li);
    }

    while (this.list.children.length > MAX_EVENTS) {
      this.list.lastElementChild?.remove();
    }
  }

  clear(): void {
    this.list.replaceChildren();
  }

  private shouldShow(event: SimEvent): boolean {
    if (event.type === "SectorCross" || event.type === "LapComplete") return false;

    const isMine = event.entryId === this.playerEntryId;
    const isDirector = DIRECTOR_TYPES.has(event.type);
    const isIncident = INCIDENT_TYPES.has(event.type);
    const isTrack = TRACK_TYPES.has(event.type);

    if (isMine && this.filters.myTeam) return true;
    if (isDirector && this.filters.director) return true;
    if (isIncident && this.filters.incidents) return true;
    if (isTrack && this.filters.track) return true;
    return false;
  }

  private formatEventContent(event: SimEvent): string {
    let msg = event.message ?? "";
    if (msg.includes("undefined")) {
      msg = msg.replace(/\s+undefined/g, "");
    }

    if (event.type === "Retirement") {
      const match = msg.match(/^(.+?) retired: (.+)$/i);
      if (match) {
        return `${escapeHtml(match[1])} <span class="event-incident-label">RETIRED</span> <span class="event-incident-reason">${escapeHtml(match[2])}</span>`;
      }
    }

    if (event.type === "Collision" || event.type === "Blocked") {
      return `<span class="event-incident-label">${event.type === "Collision" ? "COLLISION" : "BLOCKED"}</span> ${escapeHtml(msg || event.type)}`;
    }

    return escapeHtml(msg || event.type);
  }
}

function formatRaceTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
