import * as fs from "fs";
import * as path from "path";
import type { RaceCompletePayload, SimEvent, WeekendSessionType } from "./ws_protocol";

export interface SessionLogIndexEntry {
  id: string;
  savedAt: string;
  trackName: string;
  roundNumber: number;
  weekendSessionType: WeekendSessionType | string;
  raceFormat: string;
  teamName: string;
  raceTimeSec: number;
  eventCount: number;
  incidentCount: number;
}

export interface SessionLogFile {
  meta: SessionLogIndexEntry;
  events: SimEvent[];
  results?: RaceCompletePayload["results"];
}

const INCIDENT_TYPES = new Set([
  "Collision",
  "Retirement",
  "Blocked",
  "RacingIncident",
  "Stranded",
  "PenaltyIssued",
  "PenaltyWarning",
  "Disqualified",
]);

function logDir(repoRoot: string): string {
  return path.join(repoRoot, "server", "data", "session_logs");
}

function indexPath(repoRoot: string): string {
  return path.join(logDir(repoRoot), "index.json");
}

function readIndex(repoRoot: string): SessionLogIndexEntry[] {
  const file = indexPath(repoRoot);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SessionLogIndexEntry[];
  } catch {
    return [];
  }
}

function writeIndex(repoRoot: string, entries: SessionLogIndexEntry[]): void {
  fs.mkdirSync(logDir(repoRoot), { recursive: true });
  const trimmed = entries.slice(0, 200);
  fs.writeFileSync(indexPath(repoRoot), JSON.stringify(trimmed, null, 2) + "\n");
}

export class SessionLogWriter {
  private activeId: string | null = null;
  private events: SimEvent[] = [];
  private meta: Omit<
    SessionLogIndexEntry,
    "id" | "savedAt" | "eventCount" | "incidentCount" | "raceTimeSec"
  > & { raceTimeSec?: number } = {
    trackName: "",
    roundNumber: 0,
    weekendSessionType: "race",
    raceFormat: "",
    teamName: "",
  };

  constructor(private readonly repoRoot: string) {}

  startSession(meta: {
    trackName: string;
    roundNumber: number;
    weekendSessionType: WeekendSessionType | string;
    raceFormat: string;
    teamName: string;
  }): string {
    this.activeId = `${Date.now()}_${meta.roundNumber}_${meta.weekendSessionType}`;
    this.events = [];
    this.meta = { ...meta, raceTimeSec: 0 };
    return this.activeId;
  }

  recordEvents(events: SimEvent[]): void {
    if (!this.activeId || events.length === 0) return;
    this.events.push(...events);
  }

  finishSession(
    raceTimeSec: number,
    results?: RaceCompletePayload["results"],
  ): SessionLogIndexEntry | null {
    if (!this.activeId) return null;
    const id = this.activeId;
    const savedAt = new Date().toISOString();
    const incidentCount = this.events.filter((e) =>
      INCIDENT_TYPES.has(e.type),
    ).length;
    const entry: SessionLogIndexEntry = {
      id,
      savedAt,
      trackName: this.meta.trackName,
      roundNumber: this.meta.roundNumber,
      weekendSessionType: this.meta.weekendSessionType,
      raceFormat: this.meta.raceFormat,
      teamName: this.meta.teamName,
      raceTimeSec,
      eventCount: this.events.length,
      incidentCount,
    };
    const payload: SessionLogFile = {
      meta: entry,
      events: this.events,
      results,
    };
    fs.mkdirSync(logDir(this.repoRoot), { recursive: true });
    fs.writeFileSync(
      path.join(logDir(this.repoRoot), `${id}.json`),
      JSON.stringify(payload, null, 2) + "\n",
    );
    writeIndex(this.repoRoot, [entry, ...readIndex(this.repoRoot)]);
    this.activeId = null;
    this.events = [];
    return entry;
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  /** In-memory events for the live session (replay on viewer reconnect). */
  getActiveEvents(): SimEvent[] {
    return [...this.events];
  }
}

export function listSessionLogs(repoRoot: string): SessionLogIndexEntry[] {
  return readIndex(repoRoot);
}

export function readSessionLog(
  repoRoot: string,
  id: string,
): SessionLogFile | null {
  if (!/^[\w.-]+$/.test(id)) return null;
  const file = path.join(logDir(repoRoot), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SessionLogFile;
  } catch {
    return null;
  }
}
