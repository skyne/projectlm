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
import type {
  CarSnapshot,
  FleetCarPayload,
  GameCatalogPayload,
  MetaStatePayload,
  RaceControlPayload,
  SessionInitPayload,
  SimEvent,
  TickPayload,
  WeekendSessionType,
} from "./ws/protocol";
import {
  isTimingSession,
  resolveNextSession,
  sessionLabel,
  sessionShortLabel,
} from "./utils/weekendSessions";
import { resolveTrackTheme } from "./utils/trackThemes";

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
let pendingRaceStart = false;
let latestSession: SessionInitPayload | null = null;
let latestMeta: MetaStatePayload | null = null;
let gameCatalog: GameCatalogPayload | null = null;
let liverySavePending = false;
const retiredSeen = new Set<string>();

/** Sync slider when another client (e.g. PitBot) changes sim speed — no server broadcast today. */
let lastTickWallMs = 0;
let lastTickRaceTime = 0;
let lastLocalScaleChangeMs = 0;

function resetTimeScaleInference(): void {
  lastTickWallMs = 0;
  lastTickRaceTime = 0;
}

function inferTimeScaleFromTick(raceTime: number): void {
  const simStep = latestSession?.simTimestep ?? 0.1;
  const now = performance.now();

  if (lastTickWallMs > 0) {
    const deltaRace = raceTime - lastTickRaceTime;
    const deltaWall = now - lastTickWallMs;

    if (
      deltaRace > 0.001 &&
      deltaWall >= 40 &&
      deltaWall <= 600 &&
      now - lastLocalScaleChangeMs > 800
    ) {
      const estimated = Math.round((deltaRace / simStep) * 2) / 2;
      if (estimated >= 0 && estimated <= 100) {
        const current = playback.getTimeScale();
        if (Math.abs(estimated - current) >= 0.5) {
          playback.setTimeScale(estimated);
        }
      }
    }
  }

  lastTickWallMs = now;
  lastTickRaceTime = raceTime;
}

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
  onSaveBuild: (build, carId) => {
    client.saveCarBuild(build, carId);
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
    },
    onCancel: () => preSessionBriefing.hide(),
  },
);

const raceHub = new RaceHub(seasonPanel, {
  onStartRace: () => startNextWeekendSession(),
  onOpenGarage: () => {
    carGarage.clearEditingCar();
    setMainView("garage");
  },
});

const seasonCalendar = new SeasonCalendar(calendarPanel, {
  onSelectTrack: (trackId) => client.getTrackPreview(trackId),
  onStartRace: () => startNextWeekendSession(),
});

const postRace = new PostRaceOverlay(document.getElementById("post-race-overlay")!, {
  onContinue: () => {
    endRaceSession();
    teamHQ.showTab("season");
    setMainView("team");
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
  onOpenGarage: () => {
    carGarage.clearEditingCar();
    setMainView("garage");
  },
  onConfigureCar: (carId) => {
    client.setActiveCar(carId);
    if (latestMeta?.fleet?.some((c) => c.id === carId)) {
      latestMeta = { ...latestMeta, activeCarId: carId };
      carGarage.openForCar(carId);
      syncCarPreview();
    }
    setMainView("garage");
  },
  onBuyCar: (payload) => client.buyCar(payload),
  onSetActiveCar: (carId) => client.setActiveCar(carId),
  onSetPlayerEntry: (carId) => client.setPlayerEntry(carId),
  onRemoveCar: (carId) => client.removeCar(carId),
  onRepairCarCondition: (carId, rebuild) => client.repairCarCondition(carId, { rebuild }),
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
  compactLeaderboard.setSelectedEntry(entryId);
  timetable.setSelectedEntry(entryId);
  eventLog.setPlayerEntry(entryId);
  const snap = latestSnapshots.find((s) => s.entryId === entryId) ?? null;
  raceControls.updateSnapshot(snap);
  updateLapCounter(snap);
  syncCarPreview(entryId);
}

function syncManagedEntryPickers(): void {
  const options = managedEntryOptions();
  raceControls.setManagedEntries(options, commandEntryId);
  pitWall.setEntries(options, commandEntryId);
  pitWall.setSelectedEntry(commandEntryId);
  compactLeaderboard.setManagedEntryIds(managedEntryIds);
  timetable.setManagedEntryIds(managedEntryIds);
  compactLeaderboard.setSelectedEntry(commandEntryId);
  timetable.setSelectedEntry(commandEntryId);
  telemetryPanel.setEntries(options);
  syncTelemetryTrackEntries();
}

function syncSessionTypeUi(sessionType?: WeekendSessionType): void {
  const timing = isTimingSession(sessionType);
  compactLeaderboard.setSessionType(sessionType);
  timetable.setSessionType(sessionType);
  telemetryPanel.setSessionType(sessionType);
  trackMapPanel.setSessionType(sessionType);
  raceControls.setOpenSessionMode(timing);
  updateSessionChrome(sessionType);
}

function updateSessionChrome(sessionType?: WeekendSessionType): void {
  const sessionBadge = document.getElementById("session-type-badge");
  if (sessionBadge) {
    if (raceStarted && sessionType) {
      sessionBadge.textContent = sessionLabel(sessionType);
      sessionBadge.classList.remove("hidden");
    } else {
      sessionBadge.classList.add("hidden");
    }
  }

  const liveBadge = document.getElementById("live-badge");
  if (liveBadge && raceStarted && sessionType) {
    liveBadge.textContent = `${sessionShortLabel(sessionType)} · LIVE`;
  }
}

function syncTrackSurfaceTheme(): void {
  const ctx = latestSession?.weatherContext;
  const theme = resolveTrackTheme(ctx?.trackId, ctx?.biome);
  telemetryTrack.setTheme(theme);
  telemetryTrack.setTrackId(ctx?.trackId);
  track.setTrackId(ctx?.trackId);
}

const mockModeBanner = document.getElementById("mock-mode-banner");

function syncMockModeBanner(simBackend?: SessionInitPayload["simBackend"]): void {
  const isMock = simBackend === "mock";
  document.body.classList.toggle("mock-sim-active", isMock);
  mockModeBanner?.classList.toggle("hidden", !isMock);
}

function applySessionInit(payload: SessionInitPayload): void {
  clearRetirementTracking();
  latestSession = payload;
  syncMockModeBanner(payload.simBackend);
  syncSessionTypeUi(payload.weekendSessionType);
  setEntryNumbersFromSession(payload);
  playerEntryId = payload.playerEntryId ?? "entry-1";
  commandEntryId = playerEntryId;
  managedEntryIds =
    payload.managedEntryIds?.length
      ? payload.managedEntryIds
      : [playerEntryId];
  syncManagedEntryPickers();
  selectCommandEntry(commandEntryId);
  syncCarPreview(commandEntryId);
  eventLog.setEntryNames(payload.entries ?? []);
  raceHub.setSessionInfo(payload);
  trackMapPanel.setWeatherContext(payload.weatherContext);
  syncTrackSurfaceTheme();
  playback.setTargetDuration(payload.targetDurationSeconds ?? null);
}

function fleetCarForEntry(entryId: string): FleetCarPayload | null {
  if (!latestMeta?.fleet?.length || !latestSession?.entries) return null;
  const entry = latestSession.entries.find((e) => e.entryId === entryId);
  if (!entry) return null;
  if (entry.fleetCarId) {
    return latestMeta.fleet.find((c) => c.id === entry.fleetCarId) ?? null;
  }
  return (
    latestMeta.fleet.find(
      (c) => c.carNumber === entry.carNumber && c.classId === entry.classId,
    ) ?? null
  );
}

function syncCarPreview(entryId?: string): void {
  const meta = latestMeta;
  if (!meta) return;

  let build = entryId && raceStarted ? fleetCarForEntry(entryId)?.build : undefined;
  if (!build) {
    const activeCar =
      meta.fleet?.find((c) => c.id === meta.activeCarId) ?? meta.fleet?.[0];
    build = activeCar?.build ?? meta.carBuild ?? undefined;
  }
  if (!build) return;
  carPreview.setBuild(carBuildToVisual(build));
}

function applyMetaState(meta: MetaStatePayload): void {
  const wasIncomplete = latestMeta != null && !latestMeta.setupComplete;
  latestMeta = meta;
  syncCarPreview(raceStarted ? commandEntryId : undefined);
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
}

function syncPlaybackPaused(paused: boolean): void {
  playback.setPaused(paused);
  if (paused) client.pause();
  else client.resume();
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
  resetTimeScaleInference();
  lastSidebarUiMs = 0;
  lastWeatherUiMs = 0;
  raceStarted = true;
  document.body.classList.add("race-live");
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
  updateSessionChrome(latestSession?.weekendSessionType);
}

function endRaceSession(): void {
  cancelTickFrame();
  raceStarted = false;
  document.body.classList.remove("race-live");
  headerNav.setRaceActive(false);
  syncSessionTypeUi(undefined);
  raceControls.setRaceActive(false);
  engineerPanel.setRaceActive(false);
  pitModal.hide();
  document.getElementById("race-lap-counter")?.classList.add("hidden");
}

function openPreSessionBriefing(): void {
  if (!latestMeta?.setupComplete || !latestMeta.fleet?.length) return;
  preSessionBriefing.open(latestMeta, gameCatalog);
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
  if (confirmModal.isVisible()) return;
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
  const now = performance.now();
  if (now - lastWeatherUiMs < WEATHER_UI_MS) return;
  lastWeatherUiMs = now;
  weatherRadar.update(rc, raceTime);
  weatherForecast.update(rc);
}

let pendingTick: TickPayload | null = null;
let tickRafId = 0;
let lastSidebarUiMs = 0;
let lastWeatherUiMs = 0;
const SIDEBAR_UI_MS = 150;
const WEATHER_UI_MS = 300;

function cancelTickFrame(): void {
  if (tickRafId !== 0) {
    cancelAnimationFrame(tickRafId);
    tickRafId = 0;
  }
  pendingTick = null;
}

function flushTickFrame(): void {
  tickRafId = 0;
  const payload = pendingTick;
  pendingTick = null;
  if (!payload || !raceStarted) return;
  inferTimeScaleFromTick(payload.raceTime);
  updateFromTick(payload.snapshots, payload.raceTime, payload.raceControl);
}

function scheduleTickUpdate(payload: TickPayload): void {
  pendingTick = payload;
  if (tickRafId !== 0) return;
  tickRafId = requestAnimationFrame(flushTickFrame);
}

function updateFromTick(
  snapshots: CarSnapshot[],
  raceTime: number,
  raceControl?: RaceControlPayload,
): void {
  const normalized = normalizeSnapshots(snapshots);
  latestSnapshots = normalized;
  track.updateCars(normalized);
  compactLeaderboard.update(normalized);
  timetable.update(normalized);
  telemetryPanel.update(normalized);
  trackMapPanel.updateLiveStats(normalized, raceControl);
  track.setTrackConditions(raceControl);
  telemetryTrack.setTrackConditions(raceControl);
  playback.setRaceTime(raceTime);
  raceControls.setPreGreenFlag(raceTime < 0.5);
  updateWeather(raceControl, raceTime);
  const teamSnapshots = normalized.filter((s) => managedEntryIds.includes(s.entryId));
  telemetryTrack.updateCars(teamSnapshots);
  const selectedSnap =
    normalized.find((s) => s.entryId === commandEntryId) ?? null;
  updateLapCounter(selectedSnap);
  const now = performance.now();
  if (now - lastSidebarUiMs >= SIDEBAR_UI_MS) {
    lastSidebarUiMs = now;
    pitWall.updateSnapshots(normalized);
    raceControls.updateManagedSnapshots(teamSnapshots);
    raceControls.updateSnapshot(selectedSnap);
  }
  eventLog.append(detectRetirements(normalized, raceTime));
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
    const sessionLive = payload.raceActive && !payload.raceComplete;
    if (sessionLive) {
      // Follow server-driven session starts (host button or pit-bot continue).
      postRace.hide();
      preSessionBriefing.hide();
      pendingRaceStart = false;
      const reconnect =
        raceStarted && (payload.raceTime ?? 0) > 0.5
          ? { timeScale: payload.timeScale, raceTime: payload.raceTime }
          : undefined;
      beginRaceSession(payload.paused ?? true, reconnect);
      if (!reconnect) {
        eventLog.clear();
        track.clearCars();
        telemetryTrack.clearCars();
        timetable.reset();
        telemetryPanel.reset();
      }
      syncPlaybackPaused(payload.paused ?? true);
      if (payload.timeScale != null) playback.setTimeScale(payload.timeScale);
      raceControls.setPreGreenFlag((payload.raceTime ?? 0) < 0.5);
      setMainView(reconnect ? restoreRaceMainView() : "map");
    } else {
      endRaceSession();
      eventLog.clear();
      applySessionPlayback(payload);
      if (!teamWizard.isVisible()) setMainView("season");
    }
  },
  onTrackGeometry: (geometry) => {
    trackMapPanel.setGeometry(geometry, latestSession?.weatherContext?.trackId);
    syncTrackSurfaceTheme();
    const trackId = latestSession?.weatherContext?.trackId;
    telemetryTrack.setTrackId(trackId);
    track.setTrackId(trackId);
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
    scheduleTickUpdate(payload);
  },
  onEvents: (payload) => {
    if (!raceStarted) return;
    for (const event of payload.events) {
      if (event.type === "Retirement" && event.entryId) retiredSeen.add(event.entryId);
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
    const live = latestSession?.raceActive && !latestSession.raceComplete;
    if (pendingRaceStart && !live) {
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
  onTimeScale: (scale) => {
    lastLocalScaleChangeMs = performance.now();
    client.setTimeScale(scale);
  },
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
