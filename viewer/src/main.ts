import { SvgTrack } from "./components/SvgTrack";
import { Leaderboard } from "./components/Leaderboard";
import { EventLog } from "./components/EventLog";
import { PlaybackControls } from "./components/PlaybackControls";
import { Timetable } from "./components/Timetable";
import { HeaderNav } from "./components/HeaderNav";
import { WeekendSetup } from "./components/WeekendSetup";
import { RaceWeekendHub } from "./components/RaceWeekendHub";
import { TeamHq } from "./components/TeamHq";
import { ViewerClient } from "./ws/client";
import { enrichSnapshots, setEntryNumbersFromSession } from "./entryNumbers";
import type { CarSnapshot, MetaStatePayload } from "./ws/protocol";

const statusEl = document.getElementById("status")!;
const hqPanel = document.getElementById("hq-panel")!;
const mapPanel = document.getElementById("map-panel")!;
const timetableContainer = document.getElementById("timetable-container")!;
const hubPanel = document.getElementById("hub-panel")!;
const setupPanel = document.getElementById("setup-panel")!;

const headerNav = new HeaderNav(document.getElementById("header-nav")!);
const track = new SvgTrack(document.getElementById("track-container")!);
const timetable = new Timetable(timetableContainer);
const leaderboard = new Leaderboard(document.getElementById("leaderboard-container")!);
const eventLog = new EventLog(document.getElementById("event-log-container")!);

let meta: MetaStatePayload | null = null;
let inWeekendSession = false;
let setupSaveTimer: number | null = null;

function normalizeSnapshots(snapshots: CarSnapshot[]): CarSnapshot[] {
  return enrichSnapshots(snapshots).map((snap) => ({
    ...snap,
    currentLapTime: snap.currentLapTime ?? 0,
    currentSectorTime: snap.currentSectorTime ?? 0,
    lastLapTime: snap.lastLapTime ?? 0,
    bestLapTime: snap.bestLapTime ?? 0,
    gapToLeader: snap.gapToLeader ?? 0,
    currentLapSectorTimes: snap.currentLapSectorTimes ?? [],
    lapHistory: snap.lapHistory ?? [],
  }));
}

function syncSetupPanelVisibility(view: "hq" | "weekend" | "map" | "timetable"): void {
  const showSetup = inWeekendSession && view === "map";
  setupPanel.classList.toggle("hidden", !showSetup);
}

function setMainView(view: "hq" | "weekend" | "map" | "timetable"): void {
  hqPanel.classList.toggle("hidden", view !== "hq");
  hubPanel.classList.toggle("hidden", view !== "weekend");
  mapPanel.classList.toggle("hidden", view !== "map");
  timetableContainer.classList.toggle("hidden", view !== "timetable");
  timetable.setVisible(view === "timetable");
  syncSetupPanelVisibility(view);
  headerNav.setActive(view);
}

function sessionTitle(payload: {
  eventName?: string;
  sessionType?: string;
  targetDurationMinutes?: number;
  targetLaps?: number;
  trackName?: string;
}): string {
  const session = payload.sessionType ?? "demo";
  const label =
    session === "practice"
      ? "FP"
      : session === "qualifying"
        ? "Quali"
        : session === "race"
          ? "Race"
          : "Demo";
  const duration =
    payload.targetDurationMinutes && payload.targetDurationMinutes > 0
      ? `${payload.targetDurationMinutes} min`
      : `${payload.targetLaps ?? 0} lap(s)`;
  const event = payload.eventName ? ` — ${payload.eventName}` : "";
  return `${payload.trackName ?? "Track"} · ${label} (${duration})${event}`;
}

function syncSetupFromMeta(): void {
  if (!meta) return;
  const car = meta.fleet.find((c) => c.id === meta!.activeCarId) ?? meta.fleet[0];
  if (car) weekendSetup.setSetup(car.setup);
}

const weekendSetup = new WeekendSetup(setupPanel, {
  onSetupChange: (setup) => {
    if (!meta) return;
    const carId = meta.activeCarId;
    if (setupSaveTimer !== null) window.clearTimeout(setupSaveTimer);
    setupSaveTimer = window.setTimeout(() => {
      client.saveCarSetup(carId, setup);
      setupSaveTimer = null;
    }, 250);
  },
});

const teamHq = new TeamHq(hqPanel, {
  onGoToWeekend: () => setMainView("weekend"),
});

const weekendHub = new RaceWeekendHub(hubPanel, {
  onStartSession: () => {
    setMainView("map");
    inWeekendSession = true;
    client.startSession();
  },
  onSelectCar: (carId) => {
    client.setActiveCar(carId);
  },
  onAdvanceWeekend: () => {
    client.advanceWeekend();
    setMainView("weekend");
    inWeekendSession = false;
  },
  onBackToHq: () => setMainView("hq"),
});

headerNav.setHandler((view) => {
  if (view === "map" && meta && !inWeekendSession) setMainView("weekend");
  else setMainView(view);
});

const client = new ViewerClient({
  onStateChange: (state) => {
    statusEl.textContent =
      state === "open" ? "Connected" : state === "connecting" ? "Connecting…" : "Disconnected";
    statusEl.className = `status status-${state}`;
  },
  onMetaState: (payload) => {
    meta = payload;
    teamHq.setMeta(payload);
    weekendHub.setMeta(payload);
    syncSetupFromMeta();
    if (!inWeekendSession) setMainView("hq");
  },
  onSessionInit: (payload) => {
    setEntryNumbersFromSession(payload);
    leaderboard.setTrackName(sessionTitle(payload));
    eventLog.clear();
    playback.resetRaceActive();
    client.setTimeScale(1);
    if (meta) client.resume();
    else setMainView("map");
  },
  onTrackGeometry: (geometry) => {
    track.setGeometry(geometry);
    timetable.setGeometry(geometry);
  },
  onTick: (payload) => {
    const snapshots = normalizeSnapshots(payload.snapshots);
    track.updateCars(snapshots);
    leaderboard.update(snapshots);
    timetable.update(snapshots);
    playback.setRaceTime(payload.raceTime);
    playback.setWeather(payload.raceControl);
  },
  onEvents: (payload) => {
    eventLog.append(payload.events);
  },
  onRaceComplete: (payload) => {
    playback.setRaceTime(payload.raceTime);
    playback.markRaceComplete();
    eventLog.append([
      {
        type: "RaceComplete",
        timestamp: payload.raceTime,
        message: "Session complete",
      },
    ]);
    if (meta) {
      weekendHub.markSessionComplete();
      setMainView("weekend");
      inWeekendSession = false;
    }
  },
  onError: (message) => {
    statusEl.textContent = message;
    statusEl.className = "status status-error";
  },
});

const playback = new PlaybackControls(document.getElementById("playback-container")!, {
  onTimeScale: (scale) => client.setTimeScale(scale),
  onPause: () => client.pause(),
  onResume: () => client.resume(),
  onRestartRace: () => {
    playback.resetRaceActive();
    eventLog.clear();
    track.clearCars();
    timetable.reset();
    client.setTimeScale(1);
    client.restartRace();
  },
  onReloadDefinitions: () => {
    playback.resetRaceActive();
    eventLog.clear();
    track.clearCars();
    timetable.reset();
    leaderboard.update([]);
    client.setTimeScale(1);
    client.reloadDefinitions();
  },
});

setMainView("map");
client.connect();
