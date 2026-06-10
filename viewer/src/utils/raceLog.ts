import type { SimEvent, SimEventType } from "../ws/protocol";

export type RaceLogCategory =
  | "race_control"
  | "penalty"
  | "incident"
  | "pit"
  | "traffic"
  | "weather"
  | "session";

const PENALTY_TYPES = new Set<SimEventType>([
  "PenaltyIssued",
  "PenaltyWarning",
  "DriveThroughServed",
  "StopGoServed",
  "MeatballFlag",
  "BlackFlag",
  "Disqualified",
  "BlueFlag",
]);

const INCIDENT_TYPES = new Set<SimEventType>([
  "Collision",
  "Blocked",
  "Retirement",
  "RacingIncident",
  "Stranded",
  "RecoveryDispatched",
  "TrackClear",
  "SurfaceHazard",
  "SurfaceCleared",
]);

const RACE_CONTROL_TYPES = new Set<SimEventType>([
  "FcyDeploy",
  "FcyEnd",
  "SafetyCarDeploy",
  "SafetyCarInThisLap",
  "GreenFlag",
  "WhiteFlag",
  "RedFlagDeploy",
  "RedFlagExtended",
  "RedFlagEnd",
  "SlowZone",
]);

const PIT_TYPES = new Set<SimEventType>(["PitEnter", "PitExit"]);
const TRAFFIC_TYPES = new Set<SimEventType>(["Overtake"]);
const SESSION_TYPES = new Set<SimEventType>(["RaceComplete"]);

const HIDDEN_TYPES = new Set<SimEventType>(["SectorCross", "LapComplete", "CommandAck"]);

const NATIVE_EVENT_TYPE_MAP: Record<string, SimEventType> = {
  sector_cross: "SectorCross",
  lap_complete: "LapComplete",
  pit_enter: "PitEnter",
  pit_exit: "PitExit",
  retirement: "Retirement",
  race_complete: "RaceComplete",
  overtake: "Overtake",
  collision: "Collision",
  blocked: "Blocked",
  command_ack: "CommandAck",
  stranded: "Stranded",
  recovery_dispatched: "RecoveryDispatched",
  track_clear: "TrackClear",
  surface_hazard: "SurfaceHazard",
  surface_cleared: "SurfaceCleared",
  blue_flag: "BlueFlag",
  penalty_issued: "PenaltyIssued",
  penalty_warning: "PenaltyWarning",
  racing_incident: "RacingIncident",
  drive_through_served: "DriveThroughServed",
  stop_go_served: "StopGoServed",
  meatball_flag: "MeatballFlag",
  black_flag: "BlackFlag",
  disqualified: "Disqualified",
  slow_zone: "SlowZone",
  fcy_deploy: "FcyDeploy",
  fcy_end: "FcyEnd",
  safety_car_deploy: "SafetyCarDeploy",
  safety_car_in_this_lap: "SafetyCarInThisLap",
  green_flag: "GreenFlag",
  white_flag: "WhiteFlag",
  red_flag_deploy: "RedFlagDeploy",
  red_flag_extended: "RedFlagExtended",
  red_flag_end: "RedFlagEnd",
};

export function normalizeSimEventType(type: SimEventType | string): SimEventType {
  if (typeof type !== "string") return type;
  return NATIVE_EVENT_TYPE_MAP[type] ?? (type as SimEventType);
}

export function normalizeSimEvent(event: SimEvent): SimEvent {
  const type = normalizeSimEventType(event.type);
  if (type === event.type) return event;
  return { ...event, type };
}

export interface RaceLogStats {
  total: number;
  penalties: number;
  incidents: number;
  flags: number;
  retirements: number;
}

export interface ParsedPenalty {
  team: string;
  reason: string;
  sanction: string;
}

export interface RaceLogMeta {
  trackName?: string;
  roundNumber?: number;
  weekendSessionType?: string;
  raceFormat?: string;
  teamName?: string;
  raceTimeSec?: number;
  savedAt?: string;
}

export interface RaceLogEntryMaps {
  teamNameByEntry: Map<string, string>;
  carNumberByEntry: Map<string, string>;
}

export function isRaceLogEvent(event: SimEvent): boolean {
  const type = normalizeSimEventType(event.type);
  if (HIDDEN_TYPES.has(type)) return false;
  if (isWeatherEvent(event)) return true;
  return categorizeEvent({ ...event, type }) != null;
}

export function isWeatherEvent(event: SimEvent): boolean {
  return event.message?.startsWith("Weather:") ?? false;
}

export function categorizeEvent(event: SimEvent): RaceLogCategory | null {
  const type = normalizeSimEventType(event.type);
  if (HIDDEN_TYPES.has(type)) return null;
  if (isWeatherEvent(event)) return "weather";
  if (PENALTY_TYPES.has(type)) return "penalty";
  if (INCIDENT_TYPES.has(type)) return "incident";
  if (RACE_CONTROL_TYPES.has(type)) return "race_control";
  if (PIT_TYPES.has(type)) return "pit";
  if (TRAFFIC_TYPES.has(type)) return "traffic";
  if (SESSION_TYPES.has(type)) return "session";
  return null;
}

export function computeRaceLogStats(events: SimEvent[]): RaceLogStats {
  let penalties = 0;
  let incidents = 0;
  let flags = 0;
  let retirements = 0;
  let total = 0;
  for (const event of events) {
    if (!isRaceLogEvent(event)) continue;
    total++;
    const cat = categorizeEvent(event);
    if (cat === "penalty") penalties++;
    if (cat === "incident") incidents++;
    if (cat === "race_control") flags++;
    if (event.type === "Retirement" || event.type === "Disqualified") retirements++;
  }
  return { total, penalties, incidents, flags, retirements };
}

export function parsePenaltyMessage(message: string): ParsedPenalty | null {
  const match = message.match(/^((?:#\S+\s+)?.+?):\s*(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { team: match[1]!.trim(), reason: match[2]!, sanction: match[3]! };
  }
  const warnMatch = message.match(/^((?:#\S+\s+)?.+?):\s*(.+)$/);
  if (warnMatch) {
    return { team: warnMatch[1]!.trim(), reason: warnMatch[2]!, sanction: "" };
  }
  return null;
}

export function formatRaceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Compact clock for sidebar feed (drops seconds when race is over an hour). */
export function formatRaceTimeCompact(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatCarNumber(
  entryId: string | undefined,
  maps: RaceLogEntryMaps,
): string {
  if (!entryId) return "";
  const raw = maps.carNumberByEntry.get(entryId)?.trim();
  if (!raw) return "";
  return `#${raw.replace(/^#/, "")}`;
}

export interface SidebarLogFilters {
  track: boolean;
  myTeam: boolean;
  allIncidents: boolean;
  traffic: boolean;
}

/** Union of all sidebar filter categories — used to decide what to keep in the compact feed buffer. */
export function matchesSidebarRetainFilter(
  event: SimEvent,
  managedEntryIds: Set<string>,
): boolean {
  return matchesSidebarLogFilter(
    event,
    { track: true, myTeam: true, allIncidents: true, traffic: true },
    managedEntryIds,
  );
}

export function matchesSidebarLogFilter(
  event: SimEvent,
  filters: SidebarLogFilters,
  managedEntryIds: Set<string>,
): boolean {
  if (!isRaceLogEvent(event)) return false;
  const type = normalizeSimEventType(event.type);
  const cat = categorizeEvent({ ...event, type });

  if (isWeatherEvent(event)) return filters.track;

  const isTrackWide =
    cat === "race_control" ||
    cat === "session" ||
    type === "TrackClear" ||
    type === "SurfaceHazard" ||
    type === "SurfaceCleared";

  if (isTrackWide && filters.track) return true;

  const involvesManaged =
    (event.entryId != null && managedEntryIds.has(event.entryId)) ||
    (event.otherEntryId != null && managedEntryIds.has(event.otherEntryId));

  if (involvesManaged && filters.myTeam) {
    if (cat === "penalty" || cat === "pit") return true;
    if (
      type === "Retirement" ||
      type === "Collision" ||
      type === "Blocked" ||
      type === "Stranded" ||
      type === "RecoveryDispatched" ||
      type === "RacingIncident" ||
      type === "PenaltyWarning"
    ) {
      return true;
    }
  }

  if (filters.allIncidents && (cat === "incident" || cat === "penalty")) return true;
  if (filters.traffic && cat === "traffic") return true;
  return false;
}

export function eventTypeShortLabel(type: SimEventType): string {
  const labels: Partial<Record<SimEventType, string>> = {
    PenaltyIssued: "PEN",
    PenaltyWarning: "WARN",
    DriveThroughServed: "DT",
    StopGoServed: "SG",
    MeatballFlag: "MEAT",
    BlackFlag: "BLACK",
    Disqualified: "DSQ",
    BlueFlag: "BLUE",
    Collision: "HIT",
    Blocked: "BLK",
    Retirement: "OUT",
    RacingIncident: "INC",
    Stranded: "STOP",
    RecoveryDispatched: "REC",
    TrackClear: "CLEAR",
    SurfaceHazard: "HZ",
    SurfaceCleared: "CLR",
    FcyDeploy: "FCY",
    FcyEnd: "FCY END",
    SafetyCarDeploy: "SC",
    SafetyCarInThisLap: "SC IN",
    GreenFlag: "GREEN",
    WhiteFlag: "WHITE",
    RedFlagDeploy: "RED",
    RedFlagExtended: "RED+",
    RedFlagEnd: "GREEN",
    SlowZone: "SZ",
    PitEnter: "IN",
    PitExit: "OUT",
    Overtake: "PASS",
    RaceComplete: "FIN",
  };
  return labels[type] ?? eventTypeLabel(type).split(/\s+/).slice(0, 2).join(" ");
}

function shortenSanction(sanction: string): string {
  const lower = sanction.toLowerCase();
  if (lower.includes("drive")) return "DT";
  if (lower.includes("stop")) return "SG";
  if (lower.includes("time")) return "TIME";
  if (lower.includes("reprimand")) return "REP";
  return sanction.split(/\s+/)[0]?.toUpperCase() ?? sanction;
}

function compactWeatherDetail(message: string): string {
  return message.replace(/^Weather:\s*/i, "").trim();
}

function compactControlHint(event: SimEvent): string {
  const msg = (event.message ?? "").replace(/\s+undefined/g, "").trim();
  if (!msg) return "";
  const type = normalizeSimEventType(event.type);
  const upper = msg.toUpperCase();
  if (upper === eventTypeShortLabel(type) || upper === eventTypeLabel(type)) return "";
  if (type === "SlowZone" && /sector|turn|t\d/i.test(msg)) {
    return msg.replace(/slow\s*zone\s*[-–:]?\s*/i, "").trim();
  }
  return msg.length > 48 ? `${msg.slice(0, 45)}…` : msg;
}

function truncateDetail(text: string, max = 42): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function sidebarTagClass(type: SimEventType): string {
  const cat = categorizeEvent({ type, timestamp: 0, message: "" });
  if (cat === "race_control" || cat === "session") return "ctrl";
  if (cat === "penalty") return "pen";
  if (cat === "incident") return "inc";
  if (cat === "pit") return "pit";
  if (cat === "traffic") return "traf";
  if (cat === "weather") return "wx";
  return "misc";
}

/** Dense one-line HTML for the right-sidebar race feed. */
export function formatSidebarLogHtml(event: SimEvent, maps: RaceLogEntryMaps): string {
  const type = normalizeSimEventType(event.type);
  const car = formatCarNumber(event.entryId, maps);
  const other = formatCarNumber(event.otherEntryId, maps);
  const tag = eventTypeShortLabel(type);
  const tagHtml = `<span class="sidebar-log-tag sidebar-log-tag-${sidebarTagClass(type)}">${escapeHtml(tag)}</span>`;

  if (isWeatherEvent(event)) {
    const detail = compactWeatherDetail(event.message ?? "");
    return `${tagHtml}<span class="sidebar-log-msg">${escapeHtml(truncateDetail(detail))}</span>`;
  }

  if (
    RACE_CONTROL_TYPES.has(type) ||
    type === "RaceComplete" ||
    type === "TrackClear"
  ) {
    const hint = compactControlHint(event);
    return hint
      ? `${tagHtml}<span class="sidebar-log-msg">${escapeHtml(hint)}</span>`
      : tagHtml;
  }

  if (type === "SurfaceHazard" || type === "SurfaceCleared") {
    const msg = (event.message ?? "").replace(/\s+undefined/g, "").trim();
    const detail = msg.replace(/^(surface\s*(hazard|cleared))\s*[-–:]?\s*/i, "").trim();
    const carPart = car ? `<span class="sidebar-log-car">${escapeHtml(car)}</span>` : "";
    const body = detail && !detail.toLowerCase().includes(car.replace("#", ""))
      ? `<span class="sidebar-log-msg">${escapeHtml(truncateDetail(detail))}</span>`
      : "";
    return `${tagHtml}${carPart}${body}`;
  }

  if (type === "PenaltyIssued" || type === "PenaltyWarning") {
    const parsed = parsePenaltyMessage(event.message ?? "");
    const reason = parsed?.reason ?? (event.message ?? "");
    const sanction = parsed?.sanction ? shortenSanction(parsed.sanction) : "";
    const sfx = sanction
      ? ` <span class="sidebar-log-sfx">(${escapeHtml(sanction)})</span>`
      : "";
    const carPart = car ? `<span class="sidebar-log-car">${escapeHtml(car)}</span>` : "";
    return `${tagHtml}${carPart}<span class="sidebar-log-msg">${escapeHtml(truncateDetail(reason))}</span>${sfx}`;
  }

  if (type === "Retirement") {
    const match = (event.message ?? "").match(/retired:\s*(.+)$/i);
    const reason = match?.[1]?.trim() ?? (event.message ?? "");
    const carPart = car ? `<span class="sidebar-log-car">${escapeHtml(car)}</span>` : "";
    return `${tagHtml}${carPart}<span class="sidebar-log-msg">${escapeHtml(truncateDetail(reason))}</span>`;
  }

  if (type === "Collision" || type === "Blocked") {
    const pair =
      car && other ? `${car}×${other}` : car || other || "hit";
    return `${tagHtml}<span class="sidebar-log-car">${escapeHtml(pair)}</span>`;
  }

  if (type === "Overtake") {
    const pair = car && other ? `${car}>${other}` : car || other;
    return `${tagHtml}<span class="sidebar-log-car">${escapeHtml(pair)}</span>`;
  }

  if (type === "PitEnter" || type === "PitExit") {
    const carPart = car ? `<span class="sidebar-log-car">${escapeHtml(car)}</span>` : "";
    return `${tagHtml}${carPart}`;
  }

  if (type === "RacingIncident") {
    const detail = (event.message ?? "")
      .replace(/^Racing incident — no penalty:\s*/i, "no pen · ")
      .trim();
    const carPart = car ? `<span class="sidebar-log-car">${escapeHtml(car)}</span>` : "";
    return `${tagHtml}${carPart}<span class="sidebar-log-msg">${escapeHtml(truncateDetail(detail))}</span>`;
  }

  if (
    type === "DriveThroughServed" ||
    type === "StopGoServed" ||
    type === "MeatballFlag" ||
    type === "BlackFlag" ||
    type === "Disqualified" ||
    type === "BlueFlag" ||
    type === "Stranded" ||
    type === "RecoveryDispatched"
  ) {
    const carPart = car ? `<span class="sidebar-log-car">${escapeHtml(car)}</span>` : "";
    const msg = (event.message ?? "").replace(/\s+undefined/g, "").trim();
    const body = msg ? `<span class="sidebar-log-msg">${escapeHtml(truncateDetail(msg))}</span>` : "";
    return `${tagHtml}${carPart}${body}`;
  }

  const msg = (event.message ?? "").replace(/\s+undefined/g, "").trim();
  const carPart = car ? `<span class="sidebar-log-car">${escapeHtml(car)}</span>` : "";
  return `${tagHtml}${carPart}${msg ? `<span class="sidebar-log-msg">${escapeHtml(truncateDetail(msg))}</span>` : ""}`;
}

export function formatEntryLabel(
  entryId: string | undefined,
  maps: RaceLogEntryMaps,
  fallbackTeam?: string,
): string {
  if (entryId) {
    const team = maps.teamNameByEntry.get(entryId);
    const num = maps.carNumberByEntry.get(entryId)?.trim();
    if (team && num) return `#${num.replace(/^#/, "")} ${team}`;
    if (team) return team;
  }
  return fallbackTeam?.trim() ?? "";
}

export function eventTypeLabel(type: SimEventType): string {
  const labels: Partial<Record<SimEventType, string>> = {
    PenaltyIssued: "PENALTY",
    PenaltyWarning: "WARNING",
    DriveThroughServed: "DRIVE-THROUGH",
    StopGoServed: "STOP-GO",
    MeatballFlag: "MEATBALL",
    BlackFlag: "BLACK FLAG",
    Disqualified: "DSQ",
    BlueFlag: "BLUE FLAG",
    Collision: "COLLISION",
    Blocked: "BLOCKED",
    Retirement: "RETIRED",
    RacingIncident: "RACING INCIDENT",
    Stranded: "STRANDED",
    RecoveryDispatched: "RECOVERY",
    TrackClear: "TRACK CLEAR",
    SurfaceHazard: "SURFACE HAZARD",
    SurfaceCleared: "SURFACE CLEARED",
    FcyDeploy: "FCY",
    FcyEnd: "FCY END",
    SafetyCarDeploy: "SAFETY CAR",
    SafetyCarInThisLap: "SC IN THIS LAP",
    GreenFlag: "GREEN",
    WhiteFlag: "WHITE FLAG",
    RedFlagDeploy: "RED FLAG",
    RedFlagExtended: "RED FLAG EXT",
    RedFlagEnd: "RED FLAG END",
    SlowZone: "SLOW ZONE",
    PitEnter: "PIT IN",
    PitExit: "PIT OUT",
    Overtake: "OVERTAKE",
    RaceComplete: "SESSION END",
  };
  return labels[type] ?? type.replace(/([A-Z])/g, " $1").trim().toUpperCase();
}

function formatCollisionDetail(event: SimEvent, maps: RaceLogEntryMaps): string {
  const msg = (event.message ?? "").replace(/\s+undefined/g, "");
  const type = normalizeSimEventType(event.type);
  if (type !== "Collision" && type !== "Blocked") return msg;

  const carA = formatEntryLabel(event.entryId, maps);
  const carB = formatEntryLabel(event.otherEntryId, maps);
  if (carA && carB && !msg.includes(carB)) {
    return `${carA} collided with ${carB}`;
  }
  if (msg) return msg;
  if (carA && carB) return `${carA} collided with ${carB}`;
  return carA ? `${carA} collision` : "Collision";
}

function formatOvertakeDetail(
  event: SimEvent,
  maps: RaceLogEntryMaps,
  entryLabel: string,
): string {
  const msg = (event.message ?? "").replace(/\s+undefined/g, "").trim();
  const defenderNum = formatCarNumber(event.otherEntryId, maps);
  const driverMatch = msg.match(/^(.+?)\s+overtaking\s+(.+)$/i);
  const driver = driverMatch?.[1]?.trim() ?? "";
  const target = defenderNum || driverMatch?.[2]?.trim() || "";
  if (entryLabel && driver && target) {
    return `${entryLabel} — ${driver} overtaking ${target}`;
  }
  if (driver && target) return `${driver} overtaking ${target}`;
  return msg;
}

export function formatRaceLogHtml(
  event: SimEvent,
  maps: RaceLogEntryMaps,
): string {
  const type = normalizeSimEventType(event.type);
  const parsedTeam = parsePenaltyMessage(event.message ?? "")?.team;
  const entryLabel = formatEntryLabel(event.entryId, maps, parsedTeam);

  if (isWeatherEvent(event)) {
    const detail = (event.message ?? "").replace(/^Weather:\s*/i, "");
    return `<span class="race-log-cat race-log-cat-weather">WEATHER</span> ${escapeHtml(detail)}`;
  }

  const label = eventTypeLabel(type);
  const cat = categorizeEvent({ ...event, type });
  const catClass = cat ? `race-log-cat-${cat}` : "";

  if (type === "PenaltyIssued") {
    const parsed = parsePenaltyMessage(event.message ?? "");
    if (parsed) {
      const who = entryLabel || parsed.team;
      return `<span class="race-log-cat ${catClass}">${label}</span> <strong>${escapeHtml(who)}</strong> — <span class="race-log-reason">${escapeHtml(parsed.reason)}</span> <span class="race-log-sanction">(${escapeHtml(parsed.sanction)})</span>`;
    }
  }

  if (type === "PenaltyWarning") {
    const parsed = parsePenaltyMessage(event.message ?? "");
    if (parsed) {
      const who = entryLabel || parsed.team;
      return `<span class="race-log-cat ${catClass}">${label}</span> <strong>${escapeHtml(who)}</strong> — <span class="race-log-reason">${escapeHtml(parsed.reason)}</span>`;
    }
  }

  if (type === "Collision" || type === "Blocked") {
    const detail = formatCollisionDetail(event, maps);
    return `<span class="race-log-cat ${catClass}">${label}</span> ${escapeHtml(detail)}`;
  }

  if (type === "Overtake") {
    const detail = formatOvertakeDetail(event, maps, entryLabel);
    const driverMatch = detail.match(/^((?:#\S+\s+)?.+?) — (.+)$/);
    if (driverMatch) {
      return `<span class="race-log-cat ${catClass}">${label}</span> <strong>${escapeHtml(driverMatch[1]!)}</strong> — ${escapeHtml(driverMatch[2]!)}`;
    }
    return `<span class="race-log-cat ${catClass}">${label}</span> ${escapeHtml(detail)}`;
  }

  if (type === "Retirement") {
    const match = (event.message ?? "").match(/^((?:#\S+\s+)?.+?) retired: (.+)$/i);
    if (match) {
      const who = entryLabel || match[1]!.trim();
      return `<span class="race-log-cat ${catClass}">${label}</span> <strong>${escapeHtml(who)}</strong> — <span class="race-log-reason">${escapeHtml(match[2]!)}</span>`;
    }
  }

  if (type === "RacingIncident") {
    const detail = (event.message ?? "").replace(/^Racing incident — no penalty:\s*/i, "");
    return `<span class="race-log-cat ${catClass}">${label}</span> ${escapeHtml(detail || event.message || "")}`;
  }

  let msg = (event.message ?? "").replace(/\s+undefined/g, "");
  if (!msg) msg = label;

  if (type === "SurfaceHazard" || type === "SurfaceCleared") {
    const who = entryLabel;
    if (who && !msg.includes(who)) {
      return `<span class="race-log-cat ${catClass}">${label}</span> <strong>${escapeHtml(who)}</strong> — ${escapeHtml(msg)}`;
    }
  }

  const teamInMsg =
    entryLabel && (msg.includes(entryLabel) || (parsedTeam && msg.includes(parsedTeam)));
  const teamPrefix = entryLabel && !teamInMsg ? `<strong>${escapeHtml(entryLabel)}</strong> — ` : "";
  return `<span class="race-log-cat ${catClass}">${label}</span> ${teamPrefix}${escapeHtml(msg)}`;
}

/** Events leading to a penalty (warnings, collisions, blue flags) within a time window. */
export function findPenaltyTrace(
  events: SimEvent[],
  penaltyEvent: SimEvent,
  windowSec = 90,
): SimEvent[] {
  if (!penaltyEvent.entryId) return [];
  const entryId = penaltyEvent.entryId;
  const t0 = penaltyEvent.timestamp;
  const traceTypes = new Set<SimEventType>([
    "PenaltyWarning",
    "Collision",
    "Blocked",
    "BlueFlag",
    "RacingIncident",
    "PenaltyIssued",
    "DriveThroughServed",
    "StopGoServed",
    "MeatballFlag",
    "BlackFlag",
    "Disqualified",
  ]);
  return events.filter((e) => {
    const type = normalizeSimEventType(e.type);
    const involvesEntry =
      e.entryId === entryId || e.otherEntryId === entryId;
    return (
      involvesEntry &&
      traceTypes.has(type) &&
      e.timestamp >= t0 - windowSec &&
      e.timestamp <= t0 + windowSec * 2
    );
  });
}

export function filterRaceLogEvents(
  events: SimEvent[],
  opts: {
    categories: Set<RaceLogCategory>;
    entryId?: string;
    search?: string;
    managedEntryIds?: Set<string>;
    myTeamOnly?: boolean;
    entryMaps?: RaceLogEntryMaps;
  },
): SimEvent[] {
  const search = opts.search?.trim().toLowerCase() ?? "";
  return events.filter((event) => {
    if (!isRaceLogEvent(event)) return false;
    const cat = categorizeEvent(event);
    if (!cat || !opts.categories.has(cat)) return false;
    if (opts.myTeamOnly && opts.managedEntryIds?.size) {
      if (event.entryId && !opts.managedEntryIds.has(event.entryId)) {
        if (cat !== "race_control" && cat !== "weather" && cat !== "session") return false;
      }
    }
    if (opts.entryId && event.entryId !== opts.entryId) {
      if (cat !== "race_control" && cat !== "weather" && cat !== "session") return false;
    }
    if (search) {
      const num = event.entryId
        ? opts.entryMaps?.carNumberByEntry.get(event.entryId) ?? ""
        : "";
      const team = event.entryId
        ? opts.entryMaps?.teamNameByEntry.get(event.entryId) ?? ""
        : "";
      const hay =
        `${event.type} ${event.message ?? ""} ${event.entryId ?? ""} ${num} ${team}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
