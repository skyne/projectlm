import { formatCarNumber } from "./entryNumbers";
import { TrackMapPanel } from "./components/TrackMapPanel";
import { RaceSidebar } from "./components/RaceSidebar";
import { SvgTrack } from "./components/SvgTrack";
import { CompactLeaderboard } from "./components/CompactLeaderboard";
import { EventLog } from "./components/EventLog";
import { RaceLogPanel } from "./components/RaceLogPanel";
import { normalizeSimEvent } from "./utils/raceLog";
import { HeaderTimeControls } from "./components/HeaderTimeControls";
import { HeaderRaceRemaining } from "./components/HeaderRaceRemaining";
import { GlobalSettingsMenu } from "./components/GlobalSettingsMenu";
import { Timetable } from "./components/Timetable";
import { HeaderNav, type MainView } from "./components/HeaderNav";
import { TeamHQ } from "./components/TeamHQ";
import { RaceHub } from "./components/RaceHub";
import { SeasonCalendar } from "./components/SeasonCalendar";
import { PostRaceOverlay } from "./components/PostRaceOverlay";
import { SessionLogDevPanel, isDevToolsEnabled } from "./components/SessionLogDevPanel";
import { RaceDirectorDevPanel } from "./components/RaceDirectorDevPanel";
import { SeasonEndOverlay } from "./components/SeasonEndOverlay";
import { PreSessionBriefing } from "./components/PreSessionBriefing";
import { PrivateTestSetup } from "./components/PrivateTestSetup";
import { InterTeamDealModal } from "./components/InterTeamDealModal";
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
import { EngineerHintModal } from "./components/EngineerHintModal";
import { DriverCenter } from "./components/DriverCenter";
import { NegotiationPanel } from "./components/NegotiationPanel";
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
import { orderSnapshotsForMap } from "./utils/mapSnapshots";
import { resolveRetireReason } from "./utils/retireReason";
import { resolveTeamLivery } from "./utils/teamLivery";
import { setTrackLapLengthMeters } from "./utils/pitCommands";
import { formatSectorFlagBanner } from "./utils/sectorFlags";
import type {
  CarSnapshot,
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
import { isSeasonFinished } from "./utils/seasonState";

const RACE_MAIN_VIEW_KEY = "projectlm-race-main-view";

const statusEl = document.getElementById("status")!;
const seasonPanel = document.getElementById("race-hub-container")!;
const calendarPanel = document.getElementById("calendar-container")!;
const mapPanel = document.getElementById("map-panel")!;
const timetableContainer = document.getElementById("timetable-container")!;
const telemetryContainer = document.getElementById("telemetry-container")!;
const raceLogContainer = document.getElementById("race-log-container")!;
const teamContainer = document.getElementById("team-container")!;
const garageContainer = document.getElementById("garage-container")!;
const driversContainer = document.getElementById("drivers-container")!;
const sidebar = document.querySelector(".sidebar")!;
const compactLbColumn = document.getElementById("compact-leaderboard-container")!;

const headerNav = new HeaderNav(document.getElementById("header-nav")!);
let mapFollowEntryId: string | null = null;

function clearMapFollow(): void {
  mapFollowEntryId = null;
  trackMapPanel.setMapFollow(null);
}

function syncMapFollowUi(): void {
  if (!mapFollowEntryId) {
    trackMapPanel.setMapFollow(null);
    return;
  }
  const snap = latestSnapshots.find((s) => s.entryId === mapFollowEntryId);
  if (!snap) {
    clearMapFollow();
    return;
  }
  trackMapPanel.setMapFollow(`#${formatCarNumber(snap) || "?"}`);
}

const trackMapPanel = new TrackMapPanel(mapPanel);
const track = new SvgTrack(trackMapPanel.trackContainer, { zoomable: true, broadcast: true });
trackMapPanel.bindTrack(track);
trackMapPanel.setOnResetView(clearMapFollow);
trackMapPanel.setOnLeaveFollow(clearMapFollow);
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
  {
    onEntryClick(entryId) {
      mapFollowEntryId = entryId;
      syncMapFollowUi();
      track.focusOnEntries([entryId]);
      if (managedEntryIds.includes(entryId)) {
        selectCommandEntry(entryId);
      }
    },
  },
);
const eventLog = new EventLog(document.getElementById("event-log-container")!);
const raceLogPanel = new RaceLogPanel(raceLogContainer);
let raceLogEvents: SimEvent[] = [];
let lastSessionLogId: string | null = null;
const teamNameByEntry = new Map<string, string>();
const carNumberByEntry = new Map<string, string>();

function raceLogEntryMaps() {
  return { teamNameByEntry, carNumberByEntry };
}

function syncEntryMaps(
  entries: Array<{ entryId: string; teamName: string; carNumber: string }>,
): void {
  teamNameByEntry.clear();
  carNumberByEntry.clear();
  for (const e of entries) {
    teamNameByEntry.set(e.entryId, e.teamName);
    if (e.carNumber) carNumberByEntry.set(e.entryId, e.carNumber);
  }
  eventLog.setEntryMaps(raceLogEntryMaps());
}

function raceLogMeta() {
  return {
    trackName: latestSession?.trackName,
    roundNumber: latestMeta?.currentRound,
    weekendSessionType: latestSession?.weekendSessionType,
    raceFormat: latestMeta?.calendar.find((e) => e.round === latestMeta?.currentRound)?.format,
    teamName: latestMeta?.teamName,
    raceTimeSec: latestRaceTime,
  };
}

function syncRaceLogPanel(): void {
  if (lastSessionLogId && raceLogEvents.length === 0) {
    void raceLogPanel.loadFromSessionLogId(lastSessionLogId);
    return;
  }
  raceLogPanel.setContext({
    events: raceLogEvents,
    meta: raceLogMeta(),
    entryMaps: raceLogEntryMaps(),
    managedEntryIds,
  });
}

function appendRaceLogEvents(events: SimEvent[]): void {
  if (!events.length) return;
  const normalized = events.map(normalizeSimEvent);
  raceLogEvents.push(...normalized);
  eventLog.append(normalized);
  headerNav.setRaceLogAvailable(raceLogEvents.length > 0 || lastSessionLogId != null);
  if (headerNav.getActive() === "racelog") syncRaceLogPanel();
}

function restoreRaceLogEvents(events: SimEvent[]): void {
  raceLogEvents = events.map(normalizeSimEvent);
  headerNav.setRaceLogAvailable(raceLogEvents.length > 0 || lastSessionLogId != null);
  if (headerNav.getActive() === "racelog") syncRaceLogPanel();
}

function seedRetirementTracking(events: SimEvent[], snapshots: CarSnapshot[]): void {
  for (const event of events) {
    if (event.type === "Retirement" && event.entryId) retiredSeen.add(event.entryId);
  }
  for (const snap of snapshots) {
    if (snap.retired) retiredSeen.add(snap.entryId);
  }
}

function isSessionRestore(payload: SessionInitPayload): boolean {
  return (
    payload.raceActive === true &&
    payload.raceComplete !== true &&
    (payload.raceTime ?? 0) > 0.5
  );
}

function clearRaceLogStore(): void {
  raceLogEvents = [];
  lastSessionLogId = null;
  headerNav.setRaceLogAvailable(false);
}

function clearRaceLogUi(): void {
  eventLog.clear();
  clearRaceLogStore();
}

function openRaceLogScreen(): void {
  postRace.hide();
  headerNav.setRaceLogAvailable(raceLogEvents.length > 0 || lastSessionLogId != null);
  syncRaceLogPanel();
  setMainView("racelog");
}
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

const engineerHintModal = new EngineerHintModal(
  document.getElementById("engineer-hint-overlay")!,
  {
    onBox: (hint) => {
      client.dismissEngineerHint(hint.hintId);
      const snap =
        latestSnapshots.find((s) => s.entryId === hint.entryId) ??
        raceControls.getPlayerSnapshot();
      if (hint.suggestedCommand?.toLowerCase().startsWith("pit|")) {
        pitModal.applySuggestedCommand(hint.suggestedCommand);
      }
      pitModal.open(snap);
      raceControls.setStatus("Engineer radio — review pit plan and confirm");
      if (hint.autoPaused) {
        client.setTimeScale(hint.timeScale);
        syncTimeScale(hint.timeScale);
        syncPlaybackPaused(false);
      }
    },
    onDismiss: (hint) => {
      client.dismissEngineerHint(hint.hintId);
      if (hint.autoPaused) {
        client.setTimeScale(hint.timeScale);
        syncTimeScale(hint.timeScale);
        syncPlaybackPaused(false);
      }
    },
  },
);

const gameAudio = new GameAudio();
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

function applyClientRole(role: ClientRole): void {
  const canControl = role === "host" || role === "player";
  globalSettings.setControlsEnabled(canControl);
  headerTimeControls.setControlsEnabled(canControl);
  raceControls.setInteractionEnabled(canControl);
  raceDirectorDev.setCanControl(role === "host");
  pitWall.setInteractionEnabled(canControl);
  engineerPanel.setInteractionEnabled(canControl);
  raceHub.setInteractionEnabled(role === "host");
  seasonCalendar.setInteractionEnabled(role === "host");
  seasonEnd.setInteractionEnabled(role === "host");
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
let latestSectorNames: string[] = [];
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
        const current = headerTimeControls.getTimeScale();
        if (Math.abs(estimated - current) >= 0.5) {
          syncTimeScale(estimated);
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
  onRaceBriefing: (entryId, briefingId) =>
    client.updateCarBriefing({ entryId, briefingId }),
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
  onPenaltyServe: (entryId, command) => {
    client.submitCommand(entryId, command);
    raceControls.setStatus(`Penalty queued — ${command.replace("pit|", "")}`);
  },
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
  canFoundTeam: () => client.canSend("create_team"),
});

const carGarage = new CarGarage(garageContainer, {
  onSaveBuild: (build, carId) => {
    client.saveCarBuild(build, carId);
    carGarage.setStatus("Saving build…");
  },
  onAskGarageEngineer: (payload) => client.askGarageEngineer(payload),
});

const preSessionBriefing = new PreSessionBriefing(
  document.getElementById("pre-session-overlay")!,
  {
    onConfirm: (prep) => {
      preSessionBriefing.hide();
      postRace.hide();
      pendingRaceStart = true;
      client.startRound(prep);
      syncAudioContext();
    },
    onCancel: () => {
      preSessionBriefing.hide();
      syncAudioContext();
    },
  },
);

const privateTestSetup = new PrivateTestSetup(
  document.getElementById("private-test-overlay")!,
  {
    onConfirm: (prep) => {
      privateTestSetup.hide();
      postRace.hide();
      pendingRaceStart = true;
      client.startPrivateTest(prep);
      syncAudioContext();
    },
    onCancel: () => {
      privateTestSetup.hide();
      syncAudioContext();
    },
  },
);

const interTeamDealModal = new InterTeamDealModal(
  document.getElementById("inter-team-deal-overlay")!,
  {
    onPrivateTest: () => openPrivateTestSetup(),
    onStartJointTesting: (teamNames) => startInterTeamDeals("joint_testing", teamNames),
    onStartTechSharing: (teamName) => startInterTeamDeals("tech_share", [teamName]),
  },
);

function dismissPostRace(): void {
  postRace.hide();
  endRaceSession();
  client.endSession();
}

let seasonFinalizePending = false;

function tryShowSeasonEnd(): void {
  if (!latestMeta || !isSeasonFinished(latestMeta)) return;
  if (latestMeta.seasonSummary) {
    seasonEnd.show(latestMeta);
    return;
  }
  if (!seasonFinalizePending) {
    seasonFinalizePending = true;
    client.finalizeSeason();
  }
}

function returnToChampionshipHub(): void {
  dismissPostRace();
  setMainView("season");
  tryShowSeasonEnd();
}

function showSeasonEndOverlay(): void {
  dismissPostRace();
  setMainView("season");
  tryShowSeasonEnd();
}

const seasonEnd = new SeasonEndOverlay(document.body, {
  onStartNextSeason: () => {
    seasonEnd.hide();
    client.startNextSeason();
  },
  onClose: () => {
    seasonEnd.hide();
  },
});

const raceHub = new RaceHub(seasonPanel, {
  onStartRace: () => startNextWeekendSession(),
  onPrivateTest: () => openPrivateTestSetup(),
  onOpenGarage: () => {
    carGarage.clearEditingCar();
    setMainView("garage");
  },
  onViewSeasonResults: () => showSeasonEndOverlay(),
  onStartNextSeason: () => {
    client.startNextSeason();
  },
  onRestartSeason: () => {
    void requestRestartSeason();
  },
});

const seasonCalendar = new SeasonCalendar(calendarPanel, {
  onSelectTrack: (trackId) => client.getTrackPreview(trackId),
  onStartRace: () => startNextWeekendSession(),
});

const sessionLogDev = new SessionLogDevPanel(
  document.getElementById("session-log-dev-root")!,
);

const raceDirectorDev = new RaceDirectorDevPanel(
  document.getElementById("race-director-dev-root")!,
  {
    onDebug: (payload) => client.debugRaceControl(payload),
    onPenalty: (entryId, command) => client.submitCommand(entryId, command),
  },
);

const postRace = new PostRaceOverlay(document.getElementById("post-race-overlay")!, {
  onContinue: () => returnToChampionshipHub(),
  onContinueWeekend: (nextSession) => {
    dismissPostRace();
    startWeekendSession(nextSession);
  },
  onContinueJointTest: () => {
    dismissPostRace();
    client.continuePrivateTest();
  },
  onViewSeasonResults: () => showSeasonEndOverlay(),
  onRestart: () => {
    void requestRestartSession(true);
  },
  onOpenRaceLog: () => openRaceLogScreen(),
  onOpenSessionLog: (sessionLogId) => sessionLogDev.show(sessionLogId),
});

const negotiationPanel = new NegotiationPanel(document.body, {
  onSubmitOffer: (negotiationId, terms) => {
    client.submitNegotiationOffer(negotiationId, terms);
    driverCenter.setStatus("Submitting offer…");
  },
  onAcceptCounter: (negotiationId) => {
    const session = latestMeta?.negotiations?.find((n) => n.id === negotiationId);
    if (session?.kind === "inter_team_agreement" && session.lastCounterOffer) {
      client.submitNegotiationOffer(negotiationId, session.lastCounterOffer);
      driverCenter.setStatus("Accepting rival terms…");
      return;
    }
    client.acceptNegotiation(negotiationId);
    driverCenter.setStatus("Accepting counter-offer…");
  },
  onWithdraw: (negotiationId) => {
    client.withdrawNegotiation(negotiationId);
    driverCenter.setStatus("Negotiation ended");
  },
  onClose: () => {
    driverCenter.setStatus("");
    if (latestMeta) advanceInterTeamDealQueue(latestMeta);
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
    driverCenter.setStatus("Quick signing…");
  },
  onNegotiate: (listing) => {
    const kind =
      listing.source === "wec_active" && listing.contractedTeam
        ? "driver_buyout"
        : "driver_employment";
    client.startNegotiation(kind, listing.id);
    driverCenter.setStatus(`Opening talks with ${listing.driver.name}…`);
    pendingNegotiation = {
      kind: "driver",
      subjectRef: listing.id,
      listing,
    };
  },
});

type PendingNegotiation =
  | {
      kind: "driver";
      subjectRef: string;
      listing: import("./ws/protocol").DriverMarketListingPayload;
    }
  | {
      kind: "sponsor" | "inter_team" | "regulatory";
      subjectRef: string;
      title: string;
    };

let pendingNegotiation: PendingNegotiation | null = null;
let interTeamDealQueue: PendingNegotiation[] = [];

function interTeamDealTitle(
  subtype: "joint_testing" | "tech_share",
  teamName: string,
): string {
  const label =
    subtype === "joint_testing" ? "Joint testing" : "Technology sharing";
  return `${label} — ${teamName}`;
}

function encodeInterTeamSubjectRef(
  subtype: "joint_testing" | "tech_share",
  teamNames: string[],
): string {
  const teams =
    subtype === "joint_testing" && teamNames.length > 1
      ? [...teamNames].sort((a, b) => a.localeCompare(b))
      : teamNames;
  return `${subtype}:${teams.join("|")}`;
}

function parseInterTeamPartnerKeys(subjectRef: string): Set<string> | null {
  const sep = subjectRef.indexOf(":");
  if (sep <= 0) return null;
  const raw = subjectRef.slice(sep + 1).trim();
  if (!raw) return null;
  return new Set(
    raw
      .split("|")
      .map((team) => team.trim().toLowerCase())
      .filter(Boolean),
  );
}

function negotiationPartnerKeys(
  session: import("./ws/protocol").NegotiationSessionPayload,
): Set<string> {
  const teams =
    session.anchorTerms.partnerTeams ??
    (session.anchorTerms.partnerTeam ? [session.anchorTerms.partnerTeam] : []);
  if (teams.length) {
    return new Set(teams.map((team) => team.trim().toLowerCase()));
  }
  return new Set(
    session.parties
      .filter((party) => party.role === "counterparty")
      .map((party) => party.displayName.trim().toLowerCase()),
  );
}

function partnerSetsMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

function findNegotiationSession(
  meta: import("./ws/protocol").MetaStatePayload,
  pending: PendingNegotiation | null,
  openRef: string | null,
): import("./ws/protocol").NegotiationSessionPayload | undefined {
  const negotiations = meta.negotiations ?? [];

  if (pending?.subjectRef) {
    const exact = negotiations.find((n) => n.subjectRef === pending.subjectRef);
    if (exact) return exact;

    if (pending.kind === "inter_team") {
      const pendingTeams = parseInterTeamPartnerKeys(pending.subjectRef);
      if (pendingTeams) {
        const byPartners = negotiations.find(
          (n) =>
            n.kind === "inter_team_agreement" &&
            partnerSetsMatch(negotiationPartnerKeys(n), pendingTeams),
        );
        if (byPartners) return byPartners;
      }
    }
  }

  if (openRef) {
    const openMatch = negotiations.find((n) => n.subjectRef === openRef);
    if (openMatch) return openMatch;
  }

  if (!pending) {
    return negotiations.find(
      (n) =>
        n.status === "open" ||
        n.status === "countered" ||
        n.status === "pending_response",
    );
  }

  return undefined;
}

function startInterTeamDeals(
  subtype: "joint_testing" | "tech_share",
  teamNames: string[],
): void {
  const uniqueTeams = [...new Set(teamNames.map((t) => t.trim()).filter(Boolean))];
  if (!uniqueTeams.length) return;

  if (!client.canSend("start_negotiation")) {
    const message =
      "Only the session host can start partnership negotiations — rejoin as Host from the identity menu.";
    teamHQ.setPartnershipStatus(message, true);
    driverCenter.setStatus(message);
    return;
  }

  interTeamDealQueue = [];

  const subjectRef =
    subtype === "joint_testing" && uniqueTeams.length > 1
      ? encodeInterTeamSubjectRef(subtype, uniqueTeams)
      : encodeInterTeamSubjectRef(subtype, [uniqueTeams[0]!]);
  const title =
    subtype === "joint_testing" && uniqueTeams.length > 1
      ? `Joint testing — ${uniqueTeams.join(", ")}`
      : interTeamDealTitle(subtype, uniqueTeams[0]!);

  pendingNegotiation = {
    kind: "inter_team",
    subjectRef,
    title,
  };
  teamHQ.setPartnershipStatus("Opening negotiations…");
  client.startNegotiation("inter_team_agreement", subjectRef);
  driverCenter.setStatus(
    uniqueTeams.length > 1
      ? `Opening joint testing talks with ${uniqueTeams.length} teams…`
      : `Opening talks with ${uniqueTeams[0]}…`,
  );
}

function advanceInterTeamDealQueue(meta: import("./ws/protocol").MetaStatePayload): void {
  if (!interTeamDealQueue.length) return;

  const currentRef = pendingNegotiation?.subjectRef;
  const currentSession = currentRef
    ? meta.negotiations?.find((n) => n.subjectRef === currentRef)
    : null;
  if (!currentSession) return;

  const currentDone =
    currentSession.status === "pending_response" ||
    currentSession.status === "accepted" ||
    currentSession.status === "rejected" ||
    currentSession.status === "withdrawn";

  if (!currentDone) return;

  while (interTeamDealQueue.length > 0) {
    const next = interTeamDealQueue.shift()!;
    if (next.kind !== "inter_team") continue;
    const session = meta.negotiations?.find((n) => n.subjectRef === next.subjectRef);
    if (session && (session.status === "open" || session.status === "countered")) {
      pendingNegotiation = next;
      if (!negotiationPanel.isOpen()) {
        negotiationPanel.show(session, { title: next.title });
      } else {
        negotiationPanel.updateSession(session);
      }
      return;
    }
  }
}

const teamHQ = new TeamHQ(teamContainer, {
  onRefreshStaffMarket: () => {
    client.refreshStaffMarket();
    teamHQ.setCrewStatus("Refreshing staff market…");
  },
  onSignStaffContract: (listingId, carId) => {
    client.signStaffContract(listingId, carId);
    teamHQ.setCrewStatus("Offering contract…");
  },
  onRdInvest: (partId, points) => client.rdInvest(partId, points),
  onSignSponsor: (offerId) => client.signSponsor(offerId),
  onNegotiateSponsor: (offerId) => {
    client.startNegotiation("sponsor_partnership", offerId);
    const offer = gameCatalog?.sponsorOffers?.find((o) => o.id === offerId);
    pendingNegotiation = {
      kind: "sponsor",
      subjectRef: offerId,
      title: offer?.name ?? "Sponsor",
    };
  },
  onDropSponsor: (offerId) => client.dropSponsor(offerId),
  onOrganizeTesting: () => {
    if (!latestMeta?.setupComplete) return;
    interTeamDealModal.openTesting(latestMeta);
  },
  onDealTechSharing: () => {
    if (!latestMeta?.setupComplete) return;
    interTeamDealModal.openTechSharing(latestMeta);
  },
  onScheduleJointTest: (agreementId) => {
    setMainView("season");
    openPrivateTestSetup(agreementId);
  },
  onResumeNegotiation: (session) => {
    const partners =
      session.anchorTerms.partnerTeams ??
      (session.anchorTerms.partnerTeam ? [session.anchorTerms.partnerTeam] : []);
    let title = "Negotiation";
    if (session.kind === "inter_team_agreement") {
      const label =
        session.anchorTerms.agreementSubtype === "tech_share"
          ? "Technology sharing"
          : "Joint testing";
      title =
        partners.length > 1
          ? `${label} — ${partners.join(", ")}`
          : `${label} — ${partners[0] ?? session.parties.find((p) => p.role === "counterparty")?.displayName ?? "Rival"}`;
      pendingNegotiation = {
        kind: "inter_team",
        subjectRef: session.subjectRef,
        title,
      };
    } else if (session.kind === "regulatory_petition") {
      const proposal = gameCatalog?.ruleChangeProposals?.find(
        (p) => p.id === session.subjectRef,
      );
      title = proposal?.label ?? "Regulatory petition";
      pendingNegotiation = {
        kind: "regulatory",
        subjectRef: session.subjectRef,
        title,
      };
    } else if (session.kind === "sponsor_partnership") {
      const offer = gameCatalog?.sponsorOffers?.find((o) => o.id === session.subjectRef);
      title = offer?.name ?? "Sponsor partnership";
      pendingNegotiation = {
        kind: "sponsor",
        subjectRef: session.subjectRef,
        title,
      };
    }
    teamHQ.setPartnershipStatus("");
    negotiationPanel.show(session, { title });
  },
  onWithdrawNegotiation: (negotiationId) => {
    client.withdrawNegotiation(negotiationId);
    teamHQ.setPartnershipStatus("Negotiation ended.");
    if (pendingNegotiation) {
      const session = latestMeta?.negotiations?.find((n) => n.id === negotiationId);
      if (session?.subjectRef === pendingNegotiation.subjectRef) {
        pendingNegotiation = null;
      }
    }
    negotiationPanel.hide();
  },
  onStartRegulatoryPetition: (proposalId) => {
    client.startNegotiation("regulatory_petition", proposalId);
    const proposal = gameCatalog?.ruleChangeProposals?.find((p) => p.id === proposalId);
    pendingNegotiation = {
      kind: "regulatory",
      subjectRef: proposalId,
      title: proposal?.label ?? "Regulatory petition",
    };
  },
  onOpenGarage: () => {
    carGarage.clearEditingCar();
    setMainView("garage");
  },
  onConfigureCar: (carId) => {
    client.setActiveCar(carId);
    if (latestMeta?.fleet?.some((c) => c.id === carId)) {
      latestMeta = { ...latestMeta, activeCarId: carId };
      carGarage.openForCar(carId);
    }
    setMainView("garage");
  },
  onBuyCar: (payload) => client.buyCar(payload),
  onSetActiveCar: (carId) => client.setActiveCar(carId),
  onSetPlayerEntry: (carId) => client.setPlayerEntry(carId),
  onRemoveCar: (carId) => client.removeCar(carId),
  onRepairCarCondition: (carId, options) => client.repairCarCondition(carId, options),
  onSaveTeamLivery: (livery) => {
    liverySavePending = true;
    client.saveTeamColors(livery);
    teamHQ.setLiveryStatus("Saving livery…");
  },
  onNewGame: () => {
    if (!client.canSend("new_game")) {
      window.alert(
        "Only the session host can start a new game.\n\nOpen Identity in the header and reconnect as Host.",
      );
      return;
    }
    if (
      !window.confirm(
        "Start a new game?\n\nYour current save will be permanently deleted and you'll set up a new team from scratch.",
      )
    ) {
      return;
    }
    endRaceSession();
    postRace.hide();
    globalSettings.resetSession();
    headerTimeControls.resetSession();
    headerRaceRemaining.resetSession();
    syncPlaybackPaused(true);
    syncTimeScale(1);
    clearRaceLogUi();
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
  track.setHighlightedEntries(managedEntryIds);
  track.setPlayerEntry(commandEntryId);
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
  updateRacePassByAmbience(latestRaceTime);
  syncTelemetryTrackEntries();
}

function syncManagedEntryPickers(): void {
  const options = managedEntryOptions();
  raceControls.setManagedEntries(options, commandEntryId);
  pitWall.setEntries(options, commandEntryId);
  pitWall.setSelectedEntry(commandEntryId);
  compactLeaderboard.setManagedEntryIds(managedEntryIds);
  timetable.setManagedEntryIds(managedEntryIds);
  eventLog.setManagedEntryIds(managedEntryIds);
  eventLog.backfill(raceLogEvents);
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
const raceControlBanner = document.getElementById("race-control-banner");

function syncMockModeBanner(simBackend?: SessionInitPayload["simBackend"]): void {
  const isMock = simBackend === "mock";
  document.body.classList.toggle("mock-sim-active", isMock);
  mockModeBanner?.classList.toggle("hidden", !isMock);
}

function updateRaceControlBanner(rc: RaceControlPayload | undefined): void {
  if (!raceControlBanner) return;
  const phase = (rc?.flagPhase ?? "green").toLowerCase();
  const showRed = phase === "red_flag" || rc?.redFlagActive === true;
  const showFcy = !showRed && (phase === "fcy" || rc?.fcyActive);
  const showSc = !showRed && (phase === "sc" || phase === "sc_in_lap" || rc?.scActive);
  const showWhite = !showRed && rc?.whiteFlagActive === true;

  raceControlBanner.classList.remove(
    "race-control-banner--fcy",
    "race-control-banner--sc",
    "race-control-banner--white",
    "race-control-banner--red",
    "race-control-banner--sector-yellow",
    "race-control-banner--double-yellow",
  );

  let label = "";
  if (showRed) {
    const remaining = rc?.redFlagSecondsRemaining;
    label =
      remaining != null && remaining > 0
        ? `Red Flag — ${Math.ceil(remaining)}s`
        : "Red Flag";
    raceControlBanner.classList.add("race-control-banner--red");
  } else if (showFcy) {
    label = "Full Course Yellow";
    raceControlBanner.classList.add("race-control-banner--fcy");
  } else if (showSc) {
    label =
      phase === "sc_in_lap" ? "Safety Car — In This Lap" : "Safety Car";
    raceControlBanner.classList.add("race-control-banner--sc");
  } else if (showWhite) {
    label = "White Flag — Final Lap";
    raceControlBanner.classList.add("race-control-banner--white");
  } else {
    const localFlags = rc ? formatSectorFlagBanner(rc.sectorFlags ?? [], latestSectorNames) : null;
    if (localFlags) {
      label = localFlags.label;
      raceControlBanner.classList.add(
        localFlags.severity === "double-yellow"
          ? "race-control-banner--double-yellow"
          : "race-control-banner--sector-yellow",
      );
    }
  }

  const active = label.length > 0;
  raceControlBanner.textContent = label;
  raceControlBanner.classList.toggle("hidden", !active);
  document.body.classList.toggle("race-control-banner-active", active);
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
  syncEntryMaps(payload.entries ?? []);
  eventLog.setEntryNames(payload.entries ?? []);
  eventLog.setManagedEntryIds(managedEntryIds);
  eventLog.backfill(raceLogEvents);
  raceHub.setSessionInfo(payload);
  trackMapPanel.setWeatherContext(payload.weatherContext);
  compactLeaderboard.setSessionKind(payload.sessionKind);
  syncTrackSurfaceTheme();
  headerRaceRemaining.setTargetDuration(payload.targetDurationSeconds ?? null);
  pitWall.setRaceSessionActive(payload.weekendSessionType === "race");
  pitWall.setEntryBriefing(commandEntryId, payload.carBriefingsByEntryId);
}

function applyMetaState(meta: MetaStatePayload): void {
  const wasIncomplete = latestMeta != null && !latestMeta.setupComplete;
  latestMeta = meta;
  if (postRace.isVisible()) {
    postRace.refreshChampionship(meta);
    postRace.refreshContinueButton(meta);
  }
  if (seasonEnd.isVisible() && isSeasonFinished(meta) && meta.seasonSummary) {
    seasonEnd.show(meta);
  } else if (seasonEnd.isVisible() && !isSeasonFinished(meta)) {
    seasonEnd.hide();
  }
  if (isSeasonFinished(meta)) {
    if (!meta.seasonSummary && !meta.seasonComplete && !seasonFinalizePending) {
      seasonFinalizePending = true;
      client.finalizeSeason();
    } else if (meta.seasonSummary) {
      seasonFinalizePending = false;
    }
  } else {
    seasonFinalizePending = false;
  }
  const engineerSkill =
    meta.staff?.find((s) => s.role === "engineer")?.skill ?? 75;
  pitModal.setEngineerSkill(engineerSkill);
  const livery = resolveTeamLivery(meta);
  track.setTeamLivery(livery);
  telemetryTrack.setTeamLivery(livery);
  teamHQ.update(meta);
  raceHub.update(meta);
  seasonCalendar.update(meta);
  carGarage.update(meta);
  driverCenter.update(meta);

  syncGarageBuildLockNav();

  const openRef = negotiationPanel.activeSubjectRef();
  const activeSession = findNegotiationSession(
    meta,
    pendingNegotiation,
    openRef,
  );
  if (activeSession && pendingNegotiation) {
    teamHQ.setPartnershipStatus("");
    const ctx =
      pendingNegotiation.kind === "driver"
        ? { listing: pendingNegotiation.listing }
        : { title: pendingNegotiation.title };
    if (!negotiationPanel.isOpen()) {
      negotiationPanel.show(activeSession, ctx);
    } else {
      negotiationPanel.updateSession(activeSession);
    }
    if (
      activeSession.status === "accepted" ||
      activeSession.status === "rejected" ||
      activeSession.status === "withdrawn"
    ) {
      if (activeSession.status === "accepted") {
        driverCenter.setStatus("Deal agreed");
        teamHQ.setPartnershipStatus("Deal agreed");
      } else if (
        pendingNegotiation.kind === "inter_team" &&
        activeSession.status === "rejected"
      ) {
        teamHQ.setPartnershipStatus("Proposal declined", true);
      }
      if (pendingNegotiation.kind === "inter_team") {
        advanceInterTeamDealQueue(meta);
      }
      pendingNegotiation = null;
    } else if (
      pendingNegotiation.kind === "inter_team" &&
      activeSession.status === "pending_response"
    ) {
      advanceInterTeamDealQueue(meta);
    }
  } else if (activeSession && openRef) {
    negotiationPanel.updateSession(activeSession);
  } else if (pendingNegotiation?.kind === "inter_team") {
    advanceInterTeamDealQueue(meta);
  }

  if (!meta.setupComplete) {
    if (gameCatalog) teamWizard.setCatalog(gameCatalog);
    teamWizard.open(meta.teamCreationDraft ?? null);
    if (!raceStarted) setMainView("season");
  } else {
    teamWizard.hide();
    if (!raceStarted && (wasIncomplete || meta.carBuildGuidePending)) {
      setMainView("garage");
    }
  }
}

function isRaceView(view: MainView): boolean {
  return view === "map" || view === "timing" || view === "telemetry" || view === "racelog";
}

function isWideRaceView(view: MainView): boolean {
  return view === "telemetry" || view === "racelog";
}

function isGarageBuildLocked(): boolean {
  return Boolean(
    latestMeta?.setupComplete && latestMeta.carBuildGuidePending && !raceStarted,
  );
}

function syncGarageBuildLockNav(): void {
  headerNav.setGarageBuildLocked(isGarageBuildLocked());
}

function resolveOffseasonMainView(wasLive: boolean): MainView {
  if (wasLive || isRaceView(headerNav.getActive())) return "season";
  if (isGarageBuildLocked()) return "garage";
  return headerNav.getActive();
}

function setMainView(view: MainView): boolean {
  if (latestMeta && !latestMeta.setupComplete && view !== "season") return false;
  if (isGarageBuildLocked()) view = "garage";
  if (
    raceStarted &&
    (view === "garage" ||
      view === "team" ||
      view === "season" ||
      view === "calendar" ||
      view === "drivers")
  ) {
    return false;
  }
  if (!raceStarted && view !== "racelog" && isRaceView(view)) return false;
  if (
    !raceStarted &&
    view === "racelog" &&
    raceLogEvents.length === 0 &&
    !lastSessionLogId
  ) {
    return false;
  }

  seasonPanel.classList.toggle("hidden", view !== "season");
  calendarPanel.classList.toggle("hidden", view !== "calendar");
  mapPanel.classList.toggle("hidden", view !== "map");
  timetableContainer.classList.toggle("hidden", view !== "timing");
  telemetryContainer.classList.toggle("hidden", view !== "telemetry");
  raceLogContainer.classList.toggle("hidden", view !== "racelog");
  teamContainer.classList.toggle("hidden", view !== "team");
  garageContainer.classList.toggle("hidden", view !== "garage");
  driversContainer.classList.toggle("hidden", view !== "drivers");
  timetable.setVisible(view === "timing");
  telemetryPanel.setVisible(view === "telemetry");
  if (view === "racelog") syncRaceLogPanel();
  raceLogPanel.setVisible(view === "racelog");
  headerNav.setActive(view);
  syncGarageBuildLockNav();
  document.body.classList.toggle("view-map", view === "map");

  if (raceStarted && isRaceView(view)) {
    sessionStorage.setItem(RACE_MAIN_VIEW_KEY, view);
  }

  document.getElementById("live-badge")?.classList.toggle("hidden", !raceStarted || view !== "map");

  const showRaceSidebar = raceStarted && isRaceView(view) && !isWideRaceView(view);
  const showGaragePreview = view === "garage";
  const showSidebar = showRaceSidebar || showGaragePreview;
  sidebar.classList.toggle("hidden", !showSidebar);
  sidebar.classList.toggle("garage-preview-only", showGaragePreview && !showRaceSidebar);
  compactLbColumn.classList.toggle("hidden", !showRaceSidebar || isWideRaceView(view));
  compactLeaderboard.setVisible(showRaceSidebar && !isWideRaceView(view));
  raceControls.setRaceActive(showRaceSidebar);
  engineerPanel.setRaceActive(showRaceSidebar);
  syncAudioContext();
  return true;
}

function syncTimeScale(scale: number): void {
  headerTimeControls.setTimeScale(scale);
}

function syncPlaybackPaused(paused: boolean): void {
  racePlaybackPaused = paused;
  headerTimeControls.setPaused(paused);
  if (paused) client.pause();
  else client.resume();
  if (raceStarted) {
    syncAudioContext(paused);
    if (!paused) updateRacePassByAmbience(latestRaceTime);
  }
}

function applySessionPlayback(payload: SessionInitPayload): void {
  globalSettings.resetSession();
  headerTimeControls.resetSession();
  headerRaceRemaining.resetSession();
  syncTimeScale(1);
  client.setTimeScale(1);
  syncPlaybackPaused(payload.paused ?? true);
}

function restoreRaceMainView(): MainView {
  const stored = sessionStorage.getItem(RACE_MAIN_VIEW_KEY);
  if (
    stored === "map" ||
    stored === "timing" ||
    stored === "telemetry" ||
    stored === "racelog"
  ) {
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
  headerTimeControls.setSessionActive(true);
  globalSettings.setSessionActionsVisible(true);
  globalSettings.resetSession();

  if (reconnect) {
    const scale = reconnect.timeScale ?? 1;
    syncTimeScale(scale);
    if (reconnect.raceTime != null) headerRaceRemaining.setRaceTime(reconnect.raceTime);
    headerTimeControls.setPaused(startPaused || scale === 0);
  } else {
    globalSettings.resetSession();
    headerTimeControls.resetSession();
    headerRaceRemaining.resetSession();
    headerTimeControls.setPaused(startPaused);
  }

  raceControls.setRaceActive(true);
  engineerPanel.setRaceActive(true);
  document.getElementById("race-lap-counter")?.classList.remove("hidden");
  gameAudio.resetRaceSession();
  racePlaybackPaused = startPaused;
  syncAudioContext(startPaused);
  updateRacePassByAmbience(latestRaceTime);
  updateSessionChrome(latestSession?.weekendSessionType);
}

function endRaceSession(): void {
  cancelTickFrame();
  raceStarted = false;
  document.body.classList.remove("race-live");
  headerNav.setRaceActive(false);
  headerTimeControls.setSessionActive(false);
  globalSettings.setSessionActionsVisible(false);
  syncSessionTypeUi(undefined);
  raceControls.setRaceActive(false);
  engineerPanel.setRaceActive(false);
  pitModal.hide();
  document.getElementById("race-lap-counter")?.classList.add("hidden");
  updateRaceControlBanner(undefined);
  gameAudio.onSessionEnd();
  latestSession = null;
  raceHub.setSessionInfo(null);
  compactLeaderboard.setSessionKind(undefined);
}

function openPreSessionBriefing(sessionType: WeekendSessionType): void {
  if (!latestMeta?.setupComplete || !latestMeta.fleet?.length) return;
  preSessionBriefing.open(latestMeta, gameCatalog, sessionType);
  syncAudioContext();
}

function openPrivateTestSetup(agreementId?: string): void {
  if (!latestMeta?.setupComplete || !latestMeta.fleet?.length) return;
  privateTestSetup.open(latestMeta, gameCatalog, { agreementId });
  syncAudioContext();
}

function startWeekendSession(sessionType: WeekendSessionType): void {
  if (!latestMeta?.setupComplete) return;
  postRace.hide();
  openPreSessionBriefing(sessionType);
}

function startNextWeekendSession(): void {
  if (!latestMeta?.setupComplete) return;
  if (isSeasonFinished(latestMeta)) {
    showSeasonEndOverlay();
    return;
  }
  const current = latestMeta.calendar.find((e) => e.round === latestMeta!.currentRound);
  const isTest = current?.eventType === "test" || current?.format === "test";
  const next = resolveNextSession(latestMeta);
  if (!isTest && next) {
    startWeekendSession(next);
    return;
  }
  startWeekendSession(next ?? "race");
}

function restartRaceSession(): void {
  clearRetirementTracking();
  beginRaceSession(false);
  clearRaceLogUi();
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

async function requestRestartSeason(): Promise<void> {
  if (confirmModal.isVisible()) return;
  const hasSnapshot = Boolean(latestMeta?.seasonStartSnapshot);
  const confirmed = await confirmModal.show({
    title: "Restart season?",
    message: hasSnapshot
      ? `Rewind Season ${latestMeta?.seasonYear ?? ""} to the start? All race results, standings, and season progress will be lost.`
      : `Reset completed weekends for Season ${latestMeta?.seasonYear ?? ""}? Without a saved season snapshot, budget, roster, and upgrades stay as they are now.`,
    confirmLabel: "Restart Season",
    destructive: true,
  });
  if (!confirmed) return;
  seasonEnd.hide();
  postRace.hide();
  clearRetirementTracking();
  endRaceSession();
  globalSettings.resetSession();
  headerTimeControls.resetSession();
  headerRaceRemaining.resetSession();
  syncPlaybackPaused(true);
  syncTimeScale(1);
  clearRaceLogUi();
  track.clearCars();
  telemetryTrack.clearCars();
  timetable.reset();
  telemetryPanel.reset();
  client.setTimeScale(1);
  client.restartSeason();
  setMainView("season");
}

function endSessionAndReturn(): void {
  postRace.hide();
  clearRetirementTracking();
  endRaceSession();
  globalSettings.resetSession();
  headerTimeControls.resetSession();
  headerRaceRemaining.resetSession();
  syncPlaybackPaused(true);
  syncTimeScale(1);
  clearRaceLogUi();
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
  latestRaceTime = raceTime;
  const normalized = normalizeSnapshots(snapshots);
  latestSnapshots = normalized;
  track.updateCars(orderSnapshotsForMap(normalized));
  if (mapFollowEntryId) {
    if (normalized.some((s) => s.entryId === mapFollowEntryId)) {
      track.focusOnEntries([mapFollowEntryId]);
      syncMapFollowUi();
    } else {
      clearMapFollow();
    }
  }
  compactLeaderboard.update(normalized);
  timetable.update(normalized);
  telemetryPanel.update(normalized);
  trackMapPanel.updateLiveStats(normalized, raceControl);
  track.setTrackConditions(raceControl);
  telemetryTrack.setTrackConditions(raceControl);
  headerRaceRemaining.setRaceTime(raceTime);
  raceControls.setPreGreenFlag(raceTime < 0.5);
  updateWeather(raceControl, raceTime);
  updateRaceControlBanner(raceControl);
  raceDirectorDev.updateRaceControl(raceControl);
  raceDirectorDev.updateEntries(normalized);
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
  const retirements = detectRetirements(normalized, raceTime);
  appendRaceLogEvents(retirements);
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
    globalSettings.setIdentityVisible(true);
    teamWizard.refreshNavState();
  },
  onRosterUpdate: (payload: RosterUpdatePayload) => {
    sessionRoster.update(payload);
    const names = payload.clients.map((c) => c.displayName).join(", ");
    if (names) statusEl.title = `Connected: ${names}`;
  },
  onSessionInit: (payload) => {
    const wasLive = raceStarted;
    applySessionInit(payload);
    const sessionLive = payload.raceActive && !payload.raceComplete;
    if (sessionLive) {
      // Follow server-driven session starts (host button or pit-bot continue).
      postRace.hide();
      preSessionBriefing.hide();
      privateTestSetup.hide();
      pendingRaceStart = false;
      const reconnect = isSessionRestore(payload)
        ? { timeScale: payload.timeScale, raceTime: payload.raceTime }
        : undefined;
      beginRaceSession(payload.paused ?? true, reconnect);
      if (!reconnect) {
        clearRaceLogUi();
        track.clearCars();
        telemetryTrack.clearCars();
        timetable.reset();
        telemetryPanel.reset();
      }
      syncPlaybackPaused(payload.paused ?? true);
      if (payload.timeScale != null) syncTimeScale(payload.timeScale);
      raceControls.setPreGreenFlag((payload.raceTime ?? 0) < 0.5);
      setMainView(reconnect ? restoreRaceMainView() : "map");
    } else {
      endRaceSession();
      clearRaceLogUi();
      applySessionPlayback(payload);
      if (!teamWizard.isVisible()) {
        if (wasLive) {
          setMainView("season");
        } else if (latestMeta) {
          setMainView(resolveOffseasonMainView(false));
        }
      }
    }
  },
  onTrackGeometry: (geometry) => {
    latestSectorNames = geometry.sectors.map((sector) => sector.name);
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
    raceDirectorDev.setSectorCount(geometry.sectors.length);
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
    if (payload.catchUp) {
      seedRetirementTracking(payload.events, latestSnapshots);
      restoreRaceLogEvents(payload.events);
      eventLog.restore(payload.events);
      return;
    }
    for (const event of payload.events) {
      if (event.type === "Retirement" && event.entryId) retiredSeen.add(event.entryId);
      if (event.type === "Overtake") gameAudio.onOvertake(event.timestamp);
      gameAudio.handleSimEvent(event.type, event.entryId, managedEntryIds);
    }
    appendRaceLogEvents(payload.events);
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
    if (liverySavePending && (payload.teamLivery || payload.teamColors)) {
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
    if (latestMeta && !latestMeta.setupComplete) {
      teamWizard.open(latestMeta.teamCreationDraft ?? null);
    }
  },
  onEngineerAdvice: (payload) => engineerPanel.showAdvice(payload),
  onEngineerHint: (payload) => {
    if (payload.autoPaused) {
      syncPlaybackPaused(true);
    }
    engineerHintModal.show(payload);
    raceControls.setStatus(`Radio — Car #${payload.carNumber}: ${payload.text}`);
  },
  onEngineerStatus: (payload) =>
    engineerPanel.setEngineerStatus(payload.online, payload.model),
  onGarageAdvice: (payload) => carGarage.showGarageAdvice(payload),
  onRaceComplete: (payload) => {
    gameAudio.onRaceComplete();
    endRaceSession();
    headerRaceRemaining.setRaceTime(payload.raceTime);
    globalSettings.markRaceComplete();
    headerTimeControls.markRaceComplete();
    const completeEvent: SimEvent = {
      type: "RaceComplete",
      timestamp: payload.raceTime,
      message: "Race complete — check final standings",
    };
    appendRaceLogEvents([completeEvent]);
    lastSessionLogId = payload.sessionLogId ?? null;
    headerNav.setRaceLogAvailable(raceLogEvents.length > 0 || lastSessionLogId != null);
    if (latestMeta && isSeasonFinished(latestMeta)) {
      client.endSession();
      setMainView("season");
      tryShowSeasonEnd();
      return;
    }
    postRace.show(
      payload,
      playerEntryId,
      latestMeta,
      latestSession?.weekendSessionType,
      managedEntryIds,
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
    if (teamWizard.isVisible()) {
      teamWizard.setError(message);
    }
    carGarage.setStatus(message, true);
    if (liverySavePending) {
      teamHQ.setLiveryStatus(message, true);
      liverySavePending = false;
    }
    if (pendingNegotiation?.kind === "inter_team") {
      teamHQ.setPartnershipStatus(message, true);
      pendingNegotiation = null;
    }
  },
});

const headerTimeControls = new HeaderTimeControls(
  document.getElementById("header-time-controls")!,
  {
    onTimeScale: (scale) => {
      lastLocalScaleChangeMs = performance.now();
      client.setTimeScale(scale);
    },
    onTogglePause: (paused) => syncPlaybackPaused(paused),
  },
);

const headerRaceRemaining = new HeaderRaceRemaining(
  document.getElementById("header-race-remaining-container")!,
);

const globalSettings = new GlobalSettingsMenu(
  document.getElementById("global-settings-container")!,
  {
    onRestartRace: () => {
      void requestRestartSession();
    },
    onEndSession: () => endSessionAndReturn(),
    onChangeIdentity: () => {
      client.disconnect();
      joinModal.show(loadJoinPreferences());
      statusEl.textContent = "Choose a display name";
      statusEl.className = "status status-connecting";
      globalSettings.setIdentityVisible(false);
    },
  },
);
globalSettings.setSessionActionsVisible(false);
new AudioControls(globalSettings.audioMount, gameAudio);

function reloadDefinitions(): void {
  endRaceSession();
  globalSettings.resetSession();
  headerTimeControls.resetSession();
  headerRaceRemaining.resetSession();
  syncPlaybackPaused(true);
  syncTimeScale(1);
  clearRaceLogUi();
  track.clearCars();
  telemetryTrack.clearCars();
  timetable.reset();
  telemetryPanel.reset();
  compactLeaderboard.update([]);
  client.setTimeScale(1);
  client.reloadDefinitions();
  setMainView("season");
}
if (isDevToolsEnabled()) {
  raceDirectorDev.setReloadHandler(reloadDefinitions);
}

new RaceSidebar(sidebar as HTMLElement);

setMainView("season");

if (hasSavedDisplayName()) {
  beginJoin(loadJoinPreferences());
} else {
  statusEl.textContent = "Choose a display name";
  statusEl.className = "status status-connecting";
  joinModal.show({ requestedRole: "host" });
}

if (isDevToolsEnabled()) {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      sessionLogDev.toggle();
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      raceDirectorDev.toggle();
    }
  });
}
