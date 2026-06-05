import { SvgTrack } from "./components/SvgTrack";
import { Leaderboard } from "./components/Leaderboard";
import { EventLog } from "./components/EventLog";
import { PlaybackControls } from "./components/PlaybackControls";
import { Timetable } from "./components/Timetable";
import { HeaderNav } from "./components/HeaderNav";
import { ViewerClient } from "./ws/client";
import { enrichSnapshots, setEntryNumbersFromSession } from "./entryNumbers";
import type { CarSnapshot } from "./ws/protocol";

const statusEl = document.getElementById("status")!;
const mapPanel = document.getElementById("map-panel")!;
const timetableContainer = document.getElementById("timetable-container")!;

const headerNav = new HeaderNav(document.getElementById("header-nav")!);
const track = new SvgTrack(document.getElementById("track-container")!);
const timetable = new Timetable(timetableContainer);
const leaderboard = new Leaderboard(document.getElementById("leaderboard-container")!);
const eventLog = new EventLog(document.getElementById("event-log-container")!);

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

function setMainView(view: "map" | "timetable"): void {
  mapPanel.classList.toggle("hidden", view !== "map");
  timetableContainer.classList.toggle("hidden", view !== "timetable");
  timetable.setVisible(view === "timetable");
  headerNav.setActive(view);
}

headerNav.setHandler((view) => setMainView(view));

const client = new ViewerClient({
  onStateChange: (state) => {
    statusEl.textContent =
      state === "open" ? "Connected" : state === "connecting" ? "Connecting…" : "Disconnected";
    statusEl.className = `status status-${state}`;
  },
  onSessionInit: (payload) => {
    setEntryNumbersFromSession(payload);
    leaderboard.setTrackName(`${payload.trackName} — ${payload.targetLaps} lap(s)`);
    eventLog.clear();
    playback.resetRaceActive();
    client.setTimeScale(1);
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
        message: "Race complete — check final standings",
      },
    ]);
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

client.connect();
