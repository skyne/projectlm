import type { SimEvent } from "../ws/protocol";
import { mmPanelHeader } from "../utils/mmUi";
import {
  computeRaceLogStats,
  filterRaceLogEvents,
  findPenaltyTrace,
  formatRaceLogHtml,
  formatRaceTime,
  type RaceLogCategory,
  type RaceLogEntryMaps,
  type RaceLogMeta,
} from "../utils/raceLog";
import { devSessionLogApiBase, type SessionLogFile } from "./SessionLogDevPanel";

const ALL_CATEGORIES = new Set<RaceLogCategory>([
  "race_control",
  "penalty",
  "incident",
  "pit",
  "traffic",
  "weather",
  "session",
]);

export class RaceLogPanel {
  readonly root: HTMLElement;
  private listEl: HTMLUListElement;
  private statsEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private traceEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private teamSelect: HTMLSelectElement;
  private events: SimEvent[] = [];
  private entryMaps: RaceLogEntryMaps = {
    teamNameByEntry: new Map(),
    carNumberByEntry: new Map(),
  };
  private managedEntryIds = new Set<string>();
  private meta: RaceLogMeta = {};
  private categories = new Set(ALL_CATEGORIES);
  private myTeamOnly = false;
  private newestFirst = true;
  private selectedIndex: number | null = null;
  private visible = false;
  private apiBase = devSessionLogApiBase();

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel race-log-panel panel-wec hidden";
    this.root.innerHTML = `
      ${mmPanelHeader("Race Log", { subtitle: "Penalties, flags & incidents", badge: "LIVE" })}
      <p class="race-log-subtitle"></p>
      <div class="race-log-stats"></div>
      <div class="race-log-toolbar">
        <input type="search" class="race-log-search" placeholder="Search teams, reasons…" />
        <select class="race-log-team-filter" aria-label="Filter by team">
          <option value="">All teams</option>
        </select>
        <div class="race-log-cat-filters">
          <label><input type="checkbox" data-cat="race_control" checked /> Flags</label>
          <label><input type="checkbox" data-cat="penalty" checked /> Penalties</label>
          <label><input type="checkbox" data-cat="incident" checked /> Incidents</label>
          <label><input type="checkbox" data-cat="pit" checked /> Pits</label>
          <label><input type="checkbox" data-cat="traffic" /> Traffic</label>
          <label><input type="checkbox" data-cat="weather" checked /> Weather</label>
          <label><input type="checkbox" data-cat="session" checked /> Session</label>
        </div>
        <label class="race-log-my-team"><input type="checkbox" class="race-log-my-team-cb" /> My team only</label>
        <button type="button" class="race-log-sort secondary-btn">Newest first</button>
      </div>
      <div class="race-log-body">
        <ul class="race-log-list"></ul>
        <aside class="race-log-trace hidden">
          <h3>Penalty trace</h3>
          <p class="race-log-trace-hint">Related warnings, contacts, and sanctions for the selected entry.</p>
          <ul class="race-log-trace-list"></ul>
        </aside>
      </div>
    `;
    container.appendChild(this.root);

    this.subtitleEl = this.root.querySelector(".race-log-subtitle")!;
    this.statsEl = this.root.querySelector(".race-log-stats")!;
    this.listEl = this.root.querySelector(".race-log-list")!;
    this.traceEl = this.root.querySelector(".race-log-trace")!;
    this.searchInput = this.root.querySelector(".race-log-search")!;
    this.teamSelect = this.root.querySelector(".race-log-team-filter")!;

    this.searchInput.addEventListener("input", () => this.render());
    this.teamSelect.addEventListener("change", () => this.render());
    this.root.querySelector(".race-log-my-team-cb")!.addEventListener("change", (e) => {
      this.myTeamOnly = (e.target as HTMLInputElement).checked;
      this.render();
    });
    this.root.querySelector(".race-log-sort")!.addEventListener("click", () => {
      this.newestFirst = !this.newestFirst;
      const btn = this.root.querySelector(".race-log-sort")!;
      btn.textContent = this.newestFirst ? "Newest first" : "Oldest first";
      this.render();
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-cat]").forEach((input) => {
      input.addEventListener("change", () => {
        const cat = input.dataset.cat as RaceLogCategory;
        if (input.checked) this.categories.add(cat);
        else this.categories.delete(cat);
        this.render();
      });
    });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle("hidden", !visible);
    if (visible) this.render();
  }

  isVisible(): boolean {
    return this.visible;
  }

  setContext(opts: {
    events: SimEvent[];
    meta?: RaceLogMeta;
    entryMaps?: RaceLogEntryMaps;
    managedEntryIds?: string[];
  }): void {
    this.events = opts.events;
    this.meta = opts.meta ?? {};
    this.entryMaps = opts.entryMaps ?? {
      teamNameByEntry: new Map(),
      carNumberByEntry: new Map(),
    };
    this.managedEntryIds = new Set(opts.managedEntryIds ?? []);
    this.selectedIndex = null;
    this.populateTeamFilter();
    this.updateHeader();
    if (this.visible) this.render();
  }

  async loadFromSessionLogId(sessionLogId: string): Promise<void> {
    this.listEl.innerHTML = `<li class="race-log-loading">Loading race log…</li>`;
    try {
      const res = await fetch(
        `${this.apiBase}/dev/session-logs/${encodeURIComponent(sessionLogId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const log = (await res.json()) as SessionLogFile;
      const teamMap = new Map<string, string>();
      const numMap = new Map<string, string>();
      for (const r of log.results ?? []) {
        teamMap.set(r.entryId, r.teamName);
        if (r.carNumber) numMap.set(r.entryId, r.carNumber);
      }
      for (const e of log.events) {
        if (e.entryId && !teamMap.has(e.entryId)) {
          const parsed = e.message?.match(/^((?:#\S+\s+)?.+?):/);
          if (parsed) teamMap.set(e.entryId, parsed[1]!.trim());
        }
      }
      this.setContext({
        events: log.events,
        meta: {
          trackName: log.meta.trackName,
          roundNumber: log.meta.roundNumber,
          weekendSessionType: log.meta.weekendSessionType,
          raceFormat: log.meta.raceFormat,
          teamName: log.meta.teamName,
          raceTimeSec: log.meta.raceTimeSec,
          savedAt: log.meta.savedAt,
        },
        entryMaps: { teamNameByEntry: teamMap, carNumberByEntry: numMap },
      });
    } catch (err) {
      this.listEl.innerHTML = `<li class="race-log-error">Could not load saved log (${String(err)}).</li>`;
    }
  }

  private updateHeader(): void {
    const parts: string[] = [];
    if (this.meta.trackName) parts.push(this.meta.trackName);
    if (this.meta.roundNumber != null) parts.push(`Round ${this.meta.roundNumber}`);
    if (this.meta.weekendSessionType) parts.push(String(this.meta.weekendSessionType));
    let text = parts.join(" · ") || "Live session";
    if (this.meta.raceFormat) text += ` — ${this.meta.raceFormat}`;
    this.subtitleEl.textContent = text;
  }

  private populateTeamFilter(): void {
    const teams = new Map<string, string>();
    for (const [id, name] of this.entryMaps.teamNameByEntry) teams.set(id, name);
    for (const e of this.events) {
      if (e.entryId && !teams.has(e.entryId)) {
        const m = e.message?.match(/^([^:]+):/);
        if (m) teams.set(e.entryId, m[1]!.trim());
      }
    }
    const prev = this.teamSelect.value;
    this.teamSelect.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All teams";
    this.teamSelect.appendChild(all);
    const sorted = [...teams.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    for (const [id, name] of sorted) {
      const opt = document.createElement("option");
      opt.value = id;
      const num = this.entryMaps.carNumberByEntry.get(id);
      opt.textContent = num ? `#${num.replace(/^#/, "")} ${name}` : name;
      this.teamSelect.appendChild(opt);
    }
    if (prev && teams.has(prev)) this.teamSelect.value = prev;
  }

  private render(): void {
    const stats = computeRaceLogStats(this.events);
    this.statsEl.innerHTML = `
      <span class="race-log-stat">${stats.total} events</span>
      <span class="race-log-stat race-log-stat-penalty">${stats.penalties} penalties</span>
      <span class="race-log-stat race-log-stat-incident">${stats.incidents} incidents</span>
      <span class="race-log-stat race-log-stat-flag">${stats.flags} flag changes</span>
      ${stats.retirements ? `<span class="race-log-stat race-log-stat-dnf">${stats.retirements} DNFs</span>` : ""}
    `;

    const filtered = filterRaceLogEvents(this.events, {
      categories: this.categories,
      entryId: this.teamSelect.value || undefined,
      search: this.searchInput.value,
      managedEntryIds: this.managedEntryIds,
      myTeamOnly: this.myTeamOnly,
      entryMaps: this.entryMaps,
    });
    const ordered = this.newestFirst ? [...filtered].reverse() : filtered;

    this.listEl.replaceChildren();
    if (ordered.length === 0) {
      const li = document.createElement("li");
      li.className = "race-log-empty";
      li.textContent = "No events match the current filters.";
      this.listEl.appendChild(li);
      this.traceEl.classList.add("hidden");
      return;
    }

    for (let i = 0; i < ordered.length; i++) {
      const event = ordered[i]!;
      const sourceIndex = this.events.indexOf(event);
      const li = document.createElement("li");
      li.className = `race-log-row race-log-row-${event.type}${sourceIndex === this.selectedIndex ? " selected" : ""}`;
      const lap =
        event.lap != null && event.lap > 0
          ? `<span class="race-log-lap">L${event.lap}</span>`
          : "";
      li.innerHTML = `
        <span class="race-log-time">${formatRaceTime(event.timestamp)}</span>
        ${lap}
        <span class="race-log-msg">${formatRaceLogHtml(event, this.entryMaps)}</span>
      `;
      if (event.type === "PenaltyIssued" || event.type === "PenaltyWarning") {
        li.classList.add("race-log-row-traceable");
        li.title = "Click to trace penalty context";
      }
      li.addEventListener("click", () => {
        this.selectedIndex = sourceIndex;
        this.renderTrace(event);
        this.render();
      });
      this.listEl.appendChild(li);
    }
  }

  private renderTrace(event: SimEvent): void {
    const traceList = this.root.querySelector(".race-log-trace-list")!;
    if (event.type !== "PenaltyIssued" && event.type !== "PenaltyWarning") {
      this.traceEl.classList.add("hidden");
      return;
    }
    const trace = findPenaltyTrace(this.events, event);
    if (trace.length <= 1) {
      this.traceEl.classList.add("hidden");
      return;
    }
    this.traceEl.classList.remove("hidden");
    traceList.replaceChildren();
    for (const t of trace) {
      const li = document.createElement("li");
      li.className = `race-log-trace-item race-log-row-${t.type}`;
      li.innerHTML = `
        <span class="race-log-time">${formatRaceTime(t.timestamp)}</span>
        <span class="race-log-msg">${formatRaceLogHtml(t, this.entryMaps)}</span>
      `;
      traceList.appendChild(li);
    }
  }
}
