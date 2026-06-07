import { TrackMapPanel } from "./components/TrackMapPanel";
import { RaceSidebar } from "./components/RaceSidebar";
import { SvgTrack } from "./components/SvgTrack";
import { CompactLeaderboard } from "./components/CompactLeaderboard";
import { EventLog } from "./components/EventLog";
import { PlaybackControls } from "./components/PlaybackControls";
import { Timetable } from "./components/Timetable";
import { HeaderNav, type MainView } from "./components/HeaderNav";
import { CarPreview } from "./components/CarPreview";
import { TeamHQ } from "./components/TeamHQ";
import { RaceHub } from "./components/RaceHub";
import { SeasonCalendar } from "./components/SeasonCalendar";
import { PostRaceOverlay } from "./components/PostRaceOverlay";
import { PreSessionBriefing } from "./components/PreSessionBriefing";
import { TeamCreationWizard } from "./components/TeamCreationWizard";
import { CarGarage } from "./components/CarGarage";
import { RaceControls } from "./components/RaceControls";
import { EngineerPanel } from "./components/EngineerPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { PitStopModal } from "./components/PitStopModal";
import { PitWall } from "./components/PitWall";
import { SessionRoster } from "./components/SessionRoster";
import { JoinSessionModal } from "./components/JoinSessionModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { DriverCenter } from "./components/DriverCenter";
import { WeatherRadar } from "./components/WeatherRadar";
import { WeatherForecastPanel } from "./components/WeatherForecastPanel";
import { AudioControls } from "./components/AudioControls";
import { GameAudio } from "./audio/GameAudio";
import {
  ViewerClient,
  hasSavedDisplayName,
  loadJoinPreferences,
  type JoinSessionOptions,
} from "./ws/client";
import type { ClientRole, RosterUpdatePayload } from "./ws/protocol";
import { enrichSnapshots, setEntryNumbersFromSession } from "./entryNumbers";
import { resolveRetireReason } from "./utils/retireReason";
import { setTrackLapLengthMeters } from "./utils/pitCommands";
import { carBuildToVisual } from "./graphics/visualCatalog";
import type { CarSnapshot, GameCatalogPayload, MetaStatePayload, RaceControlPayload, SessionInitPayload, SimEvent, WeekendSessionType } from "./ws/protocol";
import { isTimingSession, resolveNextSession } from "./utils/weekendSessions";

const RACE_MAIN_VIEW_KEY = "projectlm-race-main-view";

const statusEl = document.getElementById("status")!;
const seasonPanel = document.getElementById("race-hub-container")!;
const calendarPanel = document.getElementById("calendar-container")!;
const mapPanel = document.getElementById("map-panel")!;
const timetableContainer = document.getElementById("timetable-container")!;
const telemetryContainer = document.getElementById("telemetry-container")!;
const teamContainer = document.getElementById("team-container")!;
const garageContainer = document.getElementById("garage-container")!;
const driversContainer = document.getElementById("drivers-container")!;
const sidebar = document.querySelector(".sidebar")!;
const compactLbColumn = document.getElementById("compact-leaderboard-container")!;

const headerNav = new HeaderNav(document.getElementById("header-nav")!);
const trackMapPanel = new TrackMapPanel(mapPanel);
const track = new SvgTrack(trackMapPanel.trackContainer, { zoomable: true });
trackMapPanel.bindTrack(track);
const carPreview = new CarPreview(document.getElementById("car-preview-container")!);
const timetable = new Timetable(timetableContainer);
const telemetryPanel = new TelemetryPanel(telemetryContainer, {
  onDriverMode: (entryId, mode) => client.submitCommand(entryId, `driver_mode=${mode}`),
  onHybridStrategy: (entryId, strategy) =>
    client.submitCommand(entryId, `hybrid_strategy=${strategy}`),
  onFitTeamMap: () => telemetryTrack.focusOnEntries(managedEntryIds),
  onResetMap: () => telemetryTrack.resetView(),
});
const telemetryTrack = new SvgTrack(telemetryPanel.mapContainer, { zoomable: true });
telemetryTrack.setLayerVisibility({ sectors: false, labels: false, pit: true });
const compactLeaderboard = new CompactLeaderboard(
  document.getElementById("compact-leaderboard-container")!,
);
const eventLog = new EventLog(document.getElementById("event-log-container")!);
const weatherRadar = new WeatherRadar(document.getElementById("weather-radar-container")!);
const weatherForecast = new WeatherForecastPanel(
  document.getElementById("weather-forecast-container")!,
);
const sessionRoster = new SessionRoster(
  document.getElementById("session-roster-container")!,
);
const joinModal = new JoinSessionModal(
  document.getElementById("join-session-overlay")!,
);
const confirmModal = new ConfirmModal(
  document.getElementById("confirm-modal-overlay")!,
);

const gameAudio = new GameAudio();
new AudioControls(document.getElementById("audio-controls-container")!, gameAudio);
gameAudio.setMusicTrack("menu");

function syncAudioContext(paused = false): void {
  if (raceStarted) {
    gameAudio.setMusicTrack("race");
    gameAudio.setRaceAmbience(true);
    gameAudio.setRacePaused(paused);
    return;
  }
  if (preSessionBriefing.isVisible()) {
    gameAudio.setMusicTrack("briefing");
    gameAudio.setRaceAmbience(false);
    return;
  }
  gameAudio.setMusicTrack("menu");
  gameAudio.setRaceAmbience(false);
}

function updateRacePassByAmbience(raceTime: number): void {
  if (!raceStarted) return;
  const carsOnTrack = latestSnapshots.filter(
    (s) => !s.inPit && !s.inGarage && !s.retired,
  ).length;
  gameAudio.updateRacePassBy({
    raceTime,
    paused: racePlaybackPaused,
    active: raceStarted,
    carsOnTrack,
  });
}

function beginJoin(opts: JoinSessionOptions): void {
  joinModal.hide();
  client.connect(opts);
}

joinModal.onSubmit((opts) => beginJoin(opts));

const changeIdentityBtn = document.getElementById("change-identity-btn")!;
changeIdentityBtn.addEventListener("click", () => {
  client.disconnect();
  joinModal.show(loadJoinPreferences());
  statusEl.textContent = "Choose a display name";
  statusEl.className = "status status-connecting";
  changeIdentityBtn.classList.add("hidden");
});

function applyClientRole(role: ClientRole): void {
  const canControl = role === "host" || role === "player";
  playback.setControlsEnabled(canControl);
  raceControls.setInteractionEnabled(canControl);
  pitWall.setInteractionEnabled(canControl);
  engineerPanel.setInteractionEnabled(canControl);
  raceHub.setInteractionEnabled(role === "host");
  seasonCalendar.setInteractionEnabled(role === "host");
}

let playerEntryId = "entry-1";
let commandEntryId = "entry-1";
let managedEntryIds: string[] = [];
let latestSnapshots: CarSnapshot[] = [];
let raceStarted = false;
let racePlaybackPaused = true;
let latestRaceTime = 0;
let pendingRaceStart = false;
let latestSession: SessionInitPayload | null = null;
let latestMeta: MetaStatePayload | null = null;
let gameCatalog: GameCatalogPayload | null = null;
let liverySavePending = false;
const retiredSeen = new Set<string>();

const pitModal = new PitStopModal(document.getElementById("pit-stop-modal")!, {
  onConfirm: (entryId, command) => {
    client.submitCommand(entryId, command);
    raceControls.setStatus("Pit queued — enter at start/finish");
  },
  onCancelPit: (entryId) => {
    client.submitCommand(entryId, "cancel_pit");
    raceControls.setStatus("Pit cancelled");
  },
});

const pitWall = new PitWall(document.getElementById("pitwall-container")!, {
  onSubmitPit: (entryId, command) => {
    client.submitCommand(entryId, command);
    raceControls.setStatus("Pit queued — enter at start/finish");
  },
  onDriverMode: (entryId, mode) => client.submitCommand(entryId, `driver_mode=${mode}`),
  onHybridStrategy: (entryId, strategy) =>
    client.submitCommand(entryId, `hybrid_strategy=${strategy}`),
  onSetupChange: (entryId, wingDelta) =>
    client.submitCommand(entryId, `wing_delta=${wingDelta}`),
  onEntryChange: (entryId) => selectCommandEntry(entryId),
});

const raceControls = new RaceControls(document.getElementById("race-controls-container")!, {
  onDriverMode: (entryId, mode) => client.submitCommand(entryId, `driver_mode=${mode}`),
  onStartingCompound: (entryId, compound) =>
    client.submitCommand(entryId, `starting_compound=${compound}`),
  onPitNow: (entryId) => {
    const snap =
      latestSnapshots.find((s) => s.entryId === entryId) ??
      raceControls.getPlayerSnapshot();
    pitModal.open(snap);
  },
  onCancelPit: (entryId) => client.submitCommand(entryId, "cancel_pit"),
  onReleaseToTrack: (entryId) => client.submitCommand(entryId, "release"),
  onSetupChange: (entryId, command) => {
    client.submitCommand(entryId, command);
    raceControls.setStatus(`Setup: ${command}`);
  },
  onEntryChange: (entryId) => selectCommandEntry(entryId),
});

const engineerPanel = new EngineerPanel(document.getElementById("engineer-container")!, {
  onAsk: (entryId, question) => client.askEngineer(entryId, question),
  onApplyCommand: (entryId, command) => {
    const lower = command.toLowerCase();
    if (lower.startsWith("pit|")) {
      pitModal.applySuggestedCommand(command);
      pitModal.open(raceControls.getPlayerSnapshot());
      raceControls.setStatus("Engineer pit plan loaded — review and confirm");
      return;
    }
    client.submitCommand(entryId, command);
    raceControls.setStatus(`Engineer command sent: ${command}`);
  },
  onRefreshStatus: () => client.getEngineerStatus(),
});

const teamWizard = new TeamCreationWizard(document.getElementById("team-wizard-overlay")!, {
  onComplete: (payload) => client.createTeam(payload),
  onSaveDraft: (draft) => client.saveTeamCreationDraft(draft),
});

const carGarage = new CarGarage(garageContainer, {
  onSaveBuild: (build) => {
    client.saveCarBuild(build);
    carGarage.setStatus("Saving build…");
  },
  onVisualBuildChange: (build) => carPreview.setBuild(build),
  onAskGarageEngineer: (payload) => client.askGarageEngineer(payload),
});

const preSessionBriefing = new PreSessionBriefing(
  document.getElementById("pre-session-overlay")!,
  {
    onConfirm: (prep) => {
      preSessionBriefing.hide();
      postRace.hide();
      pendingRaceStart = true;
      client.startRound({ ...prep, sessionType: "race" });
      syncAudioContext();
    },
    onCancel: () => {
      preSessionBriefing.hide();
      syncAudioContext();
    },
  },
);

const raceHub = new RaceHub(seasonPanel, {
  onStartRace: () => startNextWeekendSession(),
  onOpenGarage: () => setMainView("garage"),
});

const seasonCalendar = new SeasonCalendar(calendarPanel, {
  onSelectTrack: (trackId) => client.getTrackPreview(trackId),
  onStartRace: () => startNextWeekendSession(),
});

const postRace = new PostRaceOverlay(document.getElementById("post-race-overlay")!, {
  onContinue: () => {
    endRaceSession();
    setMainView("season");
  },
  onContinueWeekend: (nextSession) => {
    endRaceSession();
    startWeekendSession(nextSession);
  },
  onRestart: () => {
    void requestRestartSession(true);
  },
});

const driverCenter = new DriverCenter(driversContainer, {
  onSaveRoster: (roster, assignments) => {
    client.saveDriverRoster(roster, assignments);
    driverCenter.setStatus("Saving roster…");
  },
  onRefreshMarket: () => {
    client.refreshDriverMarket();
    driverCenter.setStatus("Refreshing driver market…");
  },
  onSignContract: (listingId) => {
    client.signDriverContract(listingId);
    driverCenter.setStatus("Offering contract…");
  },
});

const teamHQ = new TeamHQ(teamContainer, {
  onHireStaff: (role, name, skill) => client.hireStaff(role, name, skill),
  onRdInvest: (partId, points) => client.rdInvest(partId, points),
  onSignSponsor: (offerId) => client.signSponsor(offerId),
  onDropSponsor: (offerId) => client.dropSponsor(offerId),
  onOpenGarage: () => setMainView("garage"),
  onBuyCar: (payload) => client.buyCar(payload),
  onSetActiveCar: (carId) => client.setActiveCar(carId),
  onSetPlayerEntry: (carId) => client.setPlayerEntry(carId),
  onRemoveCar: (carId) => client.removeCar(carId),
  onSaveTeamColors: (colors) => {
    liverySavePending = true;
    client.saveTeamColors(colors);
    teamHQ.setLiveryStatus("Saving livery…");
  },
  onNewGame: () => {
    if (
      !window.confirm(
        "Start a new game?\n\nYour current save will be permanently deleted and you'll set up a new team from scratch.",
      )
    ) {
      return;
    }
    endRaceSession();
    postRace.hide();
    playback.resetSession();
    syncPlaybackPaused(true);
    eventLog.clear();
    track.clearCars();
    telemetryTrack.clearCars();
    timetable.reset();
    telemetryPanel.reset();
    client.setTimeScale(1);
    client.newGame();
    setMainView("season");
  },
});

function normalizeSnapshots(snapshots: CarSnapshot[]): CarSnapshot[] {
  return enrichSnapshots(snapshots).map((snap) => ({
    ...snap,
    retired: snap.retired === true,
    retireReason: snap.retireReason ?? "",
    currentLapTime: snap.currentLapTime ?? 0,
    currentSectorTime: snap.currentSectorTime ?? 0,
    lastLapTime: snap.lastLapTime ?? 0,
    bestLapTime: snap.bestLapTime ?? 0,
    gapToLeader: snap.gapToLeader ?? 0,
    currentLapSectorTimes: snap.currentLapSectorTimes ?? [],
    lapHistory: snap.lapHistory ?? [],
  }));
}

function clearRetirementTracking(): void {
  retiredSeen.clear();
}

function detectRetirements(snapshots: CarSnapshot[], raceTime: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (const snap of snapshots) {
    if (!snap.retired || retiredSeen.has(snap.entryId)) continue;
    retiredSeen.add(snap.entryId);
    const reason = resolveRetireReason(snap);
    events.push({
      type: "Retirement",
      entryId: snap.entryId,
      lap: snap.lap,
      timestamp: raceTime,
      message: `${snap.teamName} retired: ${reason}`,
    });
  }
  return events;
}

function syncTelemetryTrackEntries(): void {
  telemetryTrack.setHighlightedEntries(managedEntryIds);
  telemetryTrack.setPlayerEntry(commandEntryId);
}

function managedEntryOptions(): Array<{
  entryId: string;
  teamName: string;
  carNumber: string;
  classId: string;
}> {
  const entries = latestSession?.entries ?? [];
  return managedEntryIds
    .map((id) => entries.find((e) => e.entryId === id))
    .filter((e): e is NonNullable<typeof e> => e != null);
}

function selectCommandEntry(entryId: string): void {
  if (!managedEntryIds.includes(entryId)) return;
  commandEntryId = entryId;
  raceControls.setSelectedEntry(entryId);
  pitWall.setSelectedEntry(entryId);
  engineerPanel.setPlayerEntry(entryId);
  pitModal.setPlayerEntry(entryId);
  track.setPlayerEntry(entryId);
  telemetryTrack.setPlayerEntry(entryId);
  telemetryPanel.setPlayerEntry(entryId);
  compactLeaderboard.setPlayerEntry(entryId);
  eventLog.setPlayerEntry(entryId);
  const snap = latestSnapshots.find((s) => s.entryId === entryId) ?? null;
  raceControls.updateSnapshot(snap);
  updateLapCounter(snap);
  updateRacePassByAmbience(latestRaceTime);
}

function syncManagedEntryPickers(): void {
  const options = managedEntryOptions();
  raceControls.setManagedEntries(options, commandEntryId);
  pitWall.setEntries(options, commandEntryId);
  pitWall.setSelectedEntry(commandEntryId);
  telemetryPanel.setEntries(options);
  syncTelemetryTrackEntries();
}

function syncTimingSessionUi(sessionType?: WeekendSessionType): void {
  const timing = isTimingSession(sessionType);
  compactLeaderboard.setTimingMode(timing);
  timetable.setTimingMode(timing);
  raceControls.setOpenSessionMode(timing);
}

function applySessionInit(payload: SessionInitPayload): void {
  clearRetirementTracking();
  latestSession = payload;
  syncTimingSessionUi(payload.weekendSessionType);
  setEntryNumbersFromSession(payload);
  playerEntryId = payload.playerEntryId ?? "entry-1";
  commandEntryId = playerEntryId;
  managedEntryIds =
    payload.managedEntryIds?.length
      ? payload.managedEntryIds
      : [playerEntryId];
  syncManagedEntryPickers();
  selectCommandEntry(commandEntryId);
  eventLog.setEntryNames(payload.entries ?? []);
  raceHub.setSessionInfo(payload);
  trackMapPanel.setWeatherContext(payload.weatherContext);
  playback.setTargetDuration(payload.targetDurationSeconds ?? null);
}

function syncCarPreview(meta: MetaStatePayload): void {
  const activeCar =
    meta.fleet?.find((c) => c.id === meta.activeCarId) ?? meta.fleet?.[0];
  const build = activeCar?.build ?? meta.carBuild;
  if (!build) return;
  carPreview.setBuild(carBuildToVisual(build));
}

function applyMetaState(meta: MetaStatePayload): void {
  const wasIncomplete = latestMeta != null && !latestMeta.setupComplete;
  latestMeta = meta;
  syncCarPreview(meta);
  const engineerSkill =
    meta.staff?.find((s) => s.role === "engineer")?.skill ?? 75;
  pitModal.setEngineerSkill(engineerSkill);
  teamHQ.update(meta);
  raceHub.update(meta);
  seasonCalendar.update(meta);
  carGarage.update(meta);
  driverCenter.update(meta);

  if (!meta.setupComplete) {
    if (gameCatalog) teamWizard.setCatalog(gameCatalog);
    if (!teamWizard.isVisible()) teamWizard.open(meta.teamCreationDraft);
  } else {
    teamWizard.hide();
    if (wasIncomplete && !raceStarted) setMainView("garage");
  }
}

function isRaceView(view: MainView): boolean {
  return view === "map" || view === "timing" || view === "telemetry";
}

function setMainView(view: MainView): void {
  if (latestMeta && !latestMeta.setupComplete && view !== "season") return;
  if (carGarage.isBuildGuideActive() && view !== "garage") return;
  if (
    raceStarted &&
    (view === "garage" ||
      view === "team" ||
      view === "season" ||
      view === "calendar" ||
      view === "drivers")
  ) {
    return;
  }
  if (!raceStarted && isRaceView(view)) return;

  seasonPanel.classList.toggle("hidden", view !== "season");
  calendarPanel.classList.toggle("hidden", view !== "calendar");
  mapPanel.classList.toggle("hidden", view !== "map");
  timetableContainer.classList.toggle("hidden", view !== "timing");
  telemetryContainer.classList.toggle("hidden", view !== "telemetry");
  teamContainer.classList.toggle("hidden", view !== "team");
  garageContainer.classList.toggle("hidden", view !== "garage");
  driversContainer.classList.toggle("hidden", view !== "drivers");
  timetable.setVisible(view === "timing");
  telemetryPanel.setVisible(view === "telemetry");
  headerNav.setActive(view);

  if (raceStarted && isRaceView(view)) {
    sessionStorage.setItem(RACE_MAIN_VIEW_KEY, view);
  }

  document.getElementById("live-badge")?.classList.toggle("hidden", !raceStarted || !isRaceView(view));

  const showRaceSidebar = raceStarted && isRaceView(view);
  const showGaragePreview = view === "garage";
  const showSidebar = showRaceSidebar || showGaragePreview;
  sidebar.classList.toggle("hidden", !showSidebar);
  sidebar.classList.toggle("garage-preview-only", showGaragePreview && !showRaceSidebar);
  compactLbColumn.classList.toggle("hidden", !showRaceSidebar || view === "telemetry");
  compactLeaderboard.setVisible(showRaceSidebar && view !== "telemetry");
  raceControls.setRaceActive(showRaceSidebar);
  engineerPanel.setRaceActive(showRaceSidebar);
  syncAudioContext();
}

function syncPlaybackPaused(paused: boolean): void {
  racePlaybackPaused = paused;
  playback.setPaused(paused);
  if (paused) client.pause();
  else client.resume();
  if (raceStarted) {
    syncAudioContext(paused);
    if (!paused) updateRacePassByAmbience(latestRaceTime);
  }
}

function applySessionPlayback(payload: SessionInitPayload): void {
  playback.resetSession();
  client.setTimeScale(1);
  syncPlaybackPaused(payload.paused ?? true);
}

function restoreRaceMainView(): MainView {
  const stored = sessionStorage.getItem(RACE_MAIN_VIEW_KEY);
  if (stored === "map" || stored === "timing" || stored === "telemetry") {
    return stored;
  }
  return "map";
}

interface BeginRaceReconnectOptions {
  timeScale?: number;
  raceTime?: number;
}

function beginRaceSession(startPaused = true, reconnect?: BeginRaceReconnectOptions): void {
  clearRetirementTracking();
  raceStarted = true;
  headerNav.setRaceActive(true);

  if (reconnect) {
    const scale = reconnect.timeScale ?? 1;
    playback.setTimeScale(scale);
    if (reconnect.raceTime != null) playback.setRaceTime(reconnect.raceTime);
    playback.setPaused(startPaused || scale === 0);
  } else {
    playback.resetSession();
    playback.setPaused(startPaused);
  }

  raceControls.setRaceActive(true);
  engineerPanel.setRaceActive(true);
  document.getElementById("race-lap-counter")?.classList.remove("hidden");
  gameAudio.resetRaceSession();
  racePlaybackPaused = startPaused;
  syncAudioContext(startPaused);
  updateRacePassByAmbience(latestRaceTime);
}

function endRaceSession(): void {
  raceStarted = false;
  headerNav.setRaceActive(false);
  syncTimingSessionUi(undefined);
  raceControls.setRaceActive(false);
  engineerPanel.setRaceActive(false);
  pitModal.hide();
  document.getElementById("race-lap-counter")?.classList.add("hidden");
  gameAudio.onSessionEnd();
}

function openPreSessionBriefing(): void {
  if (!latestMeta?.setupComplete || !latestMeta.fleet?.length) return;
  preSessionBriefing.open(latestMeta, gameCatalog);
  syncAudioContext();
}

function startWeekendSession(sessionType: WeekendSessionType): void {
  if (!latestMeta?.setupComplete) return;
  if (sessionType === "race") {
    openPreSessionBriefing();
    return;
  }
  postRace.hide();
  pendingRaceStart = true;
  client.startRound({ sessionType });
}

function startNextWeekendSession(): void {
  if (!latestMeta?.setupComplete) return;
  const current = latestMeta.calendar.find((e) => e.round === latestMeta!.currentRound);
  const isTest = current?.eventType === "test" || current?.format === "test";
  const next = resolveNextSession(latestMeta);
  if (!isTest && next === "race") {
    openPreSessionBriefing();
    return;
  }
  startWeekendSession(next ?? "race");
}

function restartRaceSession(): void {
  clearRetirementTracking();
  beginRaceSession(false);
  eventLog.clear();
  track.clearCars();
  telemetryTrack.clearCars();
  timetable.reset();
  telemetryPanel.reset();
  client.setTimeScale(1);
  client.restartRace();
  setMainView("map");
}

async function requestRestartSession(fromPostRace = false): Promise<void> {
  const confirmed = await confirmModal.show({
    title: "Restart session?",
    message:
      "Race progress will reset to the start. Any results from a finished race will be undone.",
    confirmLabel: "Restart",
    destructive: true,
  });
  if (!confirmed) return;
  if (fromPostRace) postRace.hide();
  restartRaceSession();
}

function endSessionAndReturn(): void {
  postRace.hide();
  clearRetirementTracking();
  endRaceSession();
  playback.resetSession();
  syncPlaybackPaused(true);
  eventLog.clear();
  track.clearCars();
  telemetryTrack.clearCars();
  timetable.reset();
  telemetryPanel.reset();
  client.setTimeScale(1);
  client.endSession();
  setMainView("season");
}

function updateWeather(rc: RaceControlPayload | undefined, raceTime: number): void {
  weatherRadar.update(rc, raceTime);
  weatherForecast.update(rc);
}

function updateFromTick(
  snapshots: CarSnapshot[],
  raceTime: number,
  raceControl?: RaceControlPayload,
): void {
  latestRaceTime = raceTime;
  const normalized = normalizeSnapshots(snapshots);
  latestSnapshots = normalized;
  track.updateCars(normalized);
  compactLeaderboard.update(normalized);
  timetable.update(normalized);
  telemetryPanel.update(normalized);
  trackMapPanel.updateLiveStats(normalized, raceControl);
  playback.setRaceTime(raceTime);
  raceControls.setPreGreenFlag(raceTime < 0.5);
  updateWeather(raceControl, raceTime);
  pitWall.updateSnapshots(normalized);
  const teamSnapshots = normalized.filter((s) => managedEntryIds.includes(s.entryId));
  raceControls.updateManagedSnapshots(teamSnapshots);
  telemetryTrack.updateCars(teamSnapshots);
  const selectedSnap =
    normalized.find((s) => s.entryId === commandEntryId) ?? null;
  raceControls.updateSnapshot(selectedSnap);
  updateLapCounter(selectedSnap);
  eventLog.append(detectRetirements(normalized, raceTime));
  gameAudio.maybePlayGreenFlag(raceTime, racePlaybackPaused);
  updateRacePassByAmbience(raceTime);
}

function updateLapCounter(playerSnap: CarSnapshot | null): void {
  const el = document.getElementById("race-lap-counter");
  if (!el || !raceStarted) return;

  if (!playerSnap) {
    el.textContent = "Lap —";
    return;
  }

  if (playerSnap.retired) {
    const reason = resolveRetireReason(playerSnap);
    el.textContent = reason === "Retired from race" ? "OUT" : `OUT · ${reason}`;
    el.classList.add("race-lap-counter-retired");
    return;
  }
  el.classList.remove("race-lap-counter-retired");

  if (isTimingSession(latestSession?.weekendSessionType) && playerSnap.inGarage) {
    el.textContent = "In garage";
    return;
  }

  const targetLaps = latestSession?.targetLaps ?? 0;
  const targetDuration = latestSession?.targetDurationSeconds ?? 0;
  if (targetDuration > 0 || targetLaps <= 0) {
    el.textContent = `Lap ${playerSnap.lap}`;
  } else {
    el.textContent = `Lap ${playerSnap.lap} / ${targetLaps}`;
  }
}

headerNav.setHandler((view) => setMainView(view));

const client = new ViewerClient({
  onStateChange: (state) => {
    statusEl.textContent =
      state === "open" ? "Connected" : state === "connecting" ? "Connecting…" : "Disconnected";
    statusEl.className = `status status-${state}`;
  },
  onClientAssignment: (payload) => {
    applyClientRole(payload.role);
    statusEl.textContent = `${payload.displayName} · ${payload.role}`;
    statusEl.className = "status status-open";
    changeIdentityBtn.classList.remove("hidden");
  },
  onRosterUpdate: (payload: RosterUpdatePayload) => {
    sessionRoster.update(payload);
    const names = payload.clients.map((c) => c.displayName).join(", ");
    if (names) statusEl.title = `Connected: ${names}`;
  },
  onSessionInit: (payload) => {
    applySessionInit(payload);
    if (pendingRaceStart) {
      pendingRaceStart = false;
      beginRaceSession(true);
      eventLog.clear();
      track.clearCars();
      telemetryTrack.clearCars();
      timetable.reset();
      telemetryPanel.reset();
      syncPlaybackPaused(payload.paused ?? true);
      raceControls.setPreGreenFlag(true);
      setMainView("map");
    } else if (payload.raceActive && !payload.raceComplete) {
      beginRaceSession(payload.paused ?? true, {
        timeScale: payload.timeScale,
        raceTime: payload.raceTime,
      });
      setMainView(restoreRaceMainView());
    } else {
      endRaceSession();
      eventLog.clear();
      applySessionPlayback(payload);
      if (!teamWizard.isVisible()) setMainView("season");
    }
  },
  onTrackGeometry: (geometry) => {
    trackMapPanel.setGeometry(geometry, latestSession?.weatherContext?.trackId);
    telemetryTrack.setGeometry(geometry);
    if (managedEntryIds.length) telemetryTrack.focusOnEntries(managedEntryIds);
    timetable.setGeometry(geometry);
    compactLeaderboard.setLapLength(geometry.lapLength);
    setTrackLapLengthMeters(geometry.lapLength);
  },
  onTrackPreview: (payload) => {
    seasonCalendar.setTrackPreview(payload.trackId, payload.geometry);
  },
  onTick: (payload) => {
    if (!raceStarted) return;
    updateFromTick(payload.snapshots, payload.raceTime, payload.raceControl);
  },
  onEvents: (payload) => {
    if (!raceStarted) return;
    for (const event of payload.events) {
      if (event.type === "Retirement" && event.entryId) retiredSeen.add(event.entryId);
      if (event.type === "Overtake") gameAudio.onOvertake(event.timestamp);
      gameAudio.handleSimEvent(event.type, event.entryId, managedEntryIds);
    }
    eventLog.append(payload.events);
  },
  onMetaState: (payload) => {
    const hadBuildGuide = latestMeta?.carBuildGuidePending;
    applyMetaState(payload);
    if (payload.carBuild && payload.setupComplete) {
      if (hadBuildGuide && !payload.carBuildGuidePending) {
        carGarage.setStatus("Platform saved — head to Championship Hub when ready.", false);
      } else if (!hadBuildGuide) {
        carGarage.setStatus("Build synced with server.", false);
      }
    }
    if (liverySavePending && payload.teamColors) {
      teamHQ.setLiveryStatus("Livery saved.");
      liverySavePending = false;
    }
  },
  onGameCatalog: (catalog) => {
    gameCatalog = catalog;
    carGarage.setCatalog(catalog);
    teamWizard.setCatalog(catalog);
    driverCenter.setCatalog(catalog);
    teamHQ.setCatalog(catalog);
    if (latestMeta && !latestMeta.setupComplete && !teamWizard.isVisible()) {
      teamWizard.open(latestMeta.teamCreationDraft);
    }
  },
  onEngineerAdvice: (payload) => engineerPanel.showAdvice(payload),
  onEngineerStatus: (payload) =>
    engineerPanel.setEngineerStatus(payload.online, payload.model),
  onGarageAdvice: (payload) => carGarage.showGarageAdvice(payload),
  onRaceComplete: (payload) => {
    gameAudio.onRaceComplete();
    endRaceSession();
    playback.setRaceTime(payload.raceTime);
    playback.markRaceComplete();
    eventLog.append([
      {
        type: "RaceComplete",
        timestamp: payload.raceTime,
        message: "Race complete — check final standings",
      },
    ]);
    postRace.show(
      payload,
      playerEntryId,
      latestMeta,
      latestSession?.weekendSessionType,
    );
  },
  onJoinRejected: (message) => {
    joinModal.show(loadJoinPreferences());
    joinModal.setError(message);
    statusEl.textContent = "Join failed";
    statusEl.className = "status status-error";
  },
  onError: (message) => {
    statusEl.textContent = message;
    statusEl.className = "status status-error";
    if (pendingRaceStart) {
      pendingRaceStart = false;
      setMainView("season");
    }
    carGarage.setStatus(message, true);
    if (liverySavePending) {
      teamHQ.setLiveryStatus(message, true);
      liverySavePending = false;
    }
  },
});

const playback = new PlaybackControls(document.getElementById("playback-container")!, {
  onTimeScale: (scale) => client.setTimeScale(scale),
  onPause: () => client.pause(),
  onResume: () => client.resume(),
  onRestartRace: () => {
    void requestRestartSession();
  },
  onEndSession: () => endSessionAndReturn(),
  onReloadDefinitions: () => {
    endRaceSession();
    playback.resetSession();
    syncPlaybackPaused(true);
    eventLog.clear();
    track.clearCars();
    telemetryTrack.clearCars();
    timetable.reset();
    telemetryPanel.reset();
    compactLeaderboard.update([]);
    client.reloadDefinitions();
    setMainView("season");
  },
});

new RaceSidebar(sidebar as HTMLElement);

setMainView("season");

if (hasSavedDisplayName()) {
  beginJoin(loadJoinPreferences());
} else {
  statusEl.textContent = "Choose a display name";
  statusEl.className = "status status-connecting";
  joinModal.show({ requestedRole: "host" });
}
