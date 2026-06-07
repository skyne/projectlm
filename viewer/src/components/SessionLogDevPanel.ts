import type { SimEvent } from "../ws/protocol";

const DEV_TOOLS_KEY = "projectlm-dev-tools";
const DEV_API_PORT_OFFSET = 1;

export function isDevToolsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("dev")) return true;
  return localStorage.getItem(DEV_TOOLS_KEY) === "1";
}

export function devSessionLogApiBase(wsPort = 8765): string {
  const devPort = Number(
    import.meta.env.VITE_DEV_HTTP_PORT ?? wsPort + DEV_API_PORT_OFFSET,
  );
  return `http://${window.location.hostname}:${devPort}`;
}

export interface SessionLogIndexEntry {
  id: string;
  savedAt: string;
  trackName: string;
  roundNumber: number;
  weekendSessionType: string;
  raceFormat: string;
  teamName: string;
  raceTimeSec: number;
  eventCount: number;
  incidentCount: number;
}

export interface SessionLogFile {
  meta: SessionLogIndexEntry;
  events: SimEvent[];
  results?: Array<{
    entryId: string;
    teamName: string;
    carNumber: string;
    classId: string;
    position: number;
    retired?: boolean;
    retireReason?: string;
  }>;
}

export class SessionLogDevPanel {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private detailEl: HTMLElement;
  private apiBase = devSessionLogApiBase();

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "session-log-dev-overlay";
    this.root.className = "session-log-dev hidden";
    this.root.innerHTML = `
      <div class="session-log-dev-card" role="dialog" aria-labelledby="session-log-dev-title">
        <header class="session-log-dev-header">
          <div>
            <span class="mm-badge-wec">Developer</span>
            <h2 id="session-log-dev-title">Session logs</h2>
            <p class="session-log-dev-sub">Saved after every session · API <code class="session-log-dev-api"></code></p>
          </div>
          <button type="button" class="session-log-dev-close" aria-label="Close">×</button>
        </header>
        <div class="session-log-dev-body">
          <aside class="session-log-dev-list-wrap">
            <button type="button" class="session-log-dev-refresh">Refresh list</button>
            <ul class="session-log-dev-list"></ul>
          </aside>
          <section class="session-log-dev-detail"></section>
        </div>
      </div>
    `;
    container.appendChild(this.root);
    this.listEl = this.root.querySelector(".session-log-dev-list")!;
    this.detailEl = this.root.querySelector(".session-log-dev-detail")!;
    const apiEl = this.root.querySelector(".session-log-dev-api")!;
    apiEl.textContent = `${this.apiBase}/dev/session-logs`;

    this.root.querySelector(".session-log-dev-close")!.addEventListener("click", () =>
      this.hide(),
    );
    this.root.querySelector(".session-log-dev-refresh")!.addEventListener("click", () =>
      void this.refreshList(),
    );
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.hide();
    });
  }

  show(openLogId?: string): void {
    if (!isDevToolsEnabled()) return;
    this.root.classList.remove("hidden");
    void this.refreshList(openLogId);
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  toggle(): void {
    if (this.root.classList.contains("hidden")) this.show();
    else this.hide();
  }

  async refreshList(selectId?: string): Promise<void> {
    this.listEl.innerHTML = `<li class="session-log-dev-loading">Loading…</li>`;
    try {
      const res = await fetch(`${this.apiBase}/dev/session-logs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { logs: SessionLogIndexEntry[] };
      this.renderList(data.logs ?? []);
      if (selectId) {
        await this.loadLog(selectId);
      } else if (data.logs?.[0]) {
        await this.loadLog(data.logs[0].id);
      }
    } catch (err) {
      this.listEl.innerHTML = `<li class="session-log-dev-error">Could not load logs — is the dev API running? (${String(err)})</li>`;
      this.detailEl.innerHTML = "";
    }
  }

  private renderList(logs: SessionLogIndexEntry[]): void {
    if (logs.length === 0) {
      this.listEl.innerHTML = `<li class="session-log-dev-empty">No saved session logs yet.</li>`;
      return;
    }
    this.listEl.innerHTML = logs
      .map(
        (log) => `
      <li>
        <button type="button" class="session-log-dev-item" data-id="${log.id}">
          <span class="session-log-dev-item-title">R${log.roundNumber} ${log.weekendSessionType} · ${log.trackName}</span>
          <span class="session-log-dev-item-meta">${new Date(log.savedAt).toLocaleString()} · ${log.incidentCount} incidents · ${log.eventCount} events</span>
        </button>
      </li>`,
      )
      .join("");
    for (const btn of this.listEl.querySelectorAll<HTMLButtonElement>(".session-log-dev-item")) {
      btn.addEventListener("click", () => void this.loadLog(btn.dataset.id!));
    }
  }

  private async loadLog(id: string): Promise<void> {
    for (const btn of this.listEl.querySelectorAll(".session-log-dev-item")) {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.id === id);
    }
    this.detailEl.innerHTML = `<p class="session-log-dev-loading">Loading log…</p>`;
    try {
      const res = await fetch(`${this.apiBase}/dev/session-logs/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const log = (await res.json()) as SessionLogFile;
      this.renderDetail(log);
    } catch (err) {
      this.detailEl.innerHTML = `<p class="session-log-dev-error">${String(err)}</p>`;
    }
  }

  private renderDetail(log: SessionLogFile): void {
    const incidents = log.events.filter((e) =>
      ["Collision", "Retirement", "Blocked"].includes(e.type),
    );
    const resultsHtml = (log.results ?? [])
      .slice(0, 30)
      .map(
        (r) =>
          `<tr><td>P${r.position}</td><td>#${r.carNumber}</td><td>${r.teamName}</td><td>${r.classId}</td><td>${r.retired ? (r.retireReason ?? "DNF") : "OK"}</td></tr>`,
      )
      .join("");
    const eventsHtml = incidents
      .slice(0, 200)
      .map(
        (e) =>
          `<li><span class="session-log-ev-type">${e.type}</span> <span class="session-log-ev-time">${formatRaceTime(e.timestamp)}</span> ${escapeHtml(e.message ?? "")}</li>`,
      )
      .join("");
    this.detailEl.innerHTML = `
      <h3>${log.meta.trackName} — round ${log.meta.roundNumber} ${log.meta.weekendSessionType}</h3>
      <p class="session-log-dev-meta">${log.meta.teamName} · ${log.meta.raceFormat} · saved ${new Date(log.meta.savedAt).toLocaleString()}</p>
      <h4>Incidents (${incidents.length})</h4>
      <ul class="session-log-dev-events">${eventsHtml || "<li>No incidents recorded</li>"}</ul>
      <h4>Classification (top 30)</h4>
      <table class="session-log-dev-table">
        <thead><tr><th>Pos</th><th>#</th><th>Team</th><th>Class</th><th>Status</th></tr></thead>
        <tbody>${resultsHtml || "<tr><td colspan=\"5\">No results</td></tr>"}</tbody>
      </table>
      <p class="session-log-dev-id">Log id: <code>${log.meta.id}</code></p>
    `;
  }
}

function formatRaceTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
