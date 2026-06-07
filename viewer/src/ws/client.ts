import {
  clientMessage,
  PROTOCOL_VERSION,
  type BuyCarPayload,
  type CarBuildPayload,
  type ClientAssignmentPayload,
  type ClientMessageType,
  type ClientRole,
  type CreateTeamPayload,
  type TeamCreationDraftPayload,
  type DriverProfilePayload,
  type SaveTeamColorsPayload,
  type GarageAdvicePayload,
  type EngineerAdvicePayload,
  type EngineerStatusPayload,
  type EventsPayload,
  type GameCatalogPayload,
  type MetaStatePayload,
  type RaceCompletePayload,
  type RosterUpdatePayload,
  type ServerMessage,
  type SessionInitPayload,
  type TickPayload,
  type TrackGeometryPayload,
  type TrackPreviewPayload,
} from "./protocol";

export type ConnectionState = "connecting" | "open" | "closed";

const PLAYER_ID_KEY = "projectlm-player-id";
const DISPLAY_NAME_KEY = "projectlm-display-name";
const PREFERRED_ROLE_KEY = "projectlm-preferred-role";
const CLIENT_ID_KEY = "projectlm-client-id";

export interface JoinSessionOptions {
  displayName: string;
  requestedRole?: ClientRole;
}

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

function getDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
}

function getPreferredRole(): ClientRole {
  const role = localStorage.getItem(PREFERRED_ROLE_KEY);
  if (role === "host" || role === "player" || role === "spectator") return role;
  return "player";
}

export function hasSavedDisplayName(): boolean {
  const name = getDisplayName().trim();
  return name.length >= 2 && name.length <= 24;
}

export function saveJoinPreferences(opts: JoinSessionOptions): void {
  localStorage.setItem(DISPLAY_NAME_KEY, opts.displayName.trim());
  if (opts.requestedRole) {
    localStorage.setItem(PREFERRED_ROLE_KEY, opts.requestedRole);
  }
}

export function loadJoinPreferences(): JoinSessionOptions {
  return {
    displayName: getDisplayName(),
    requestedRole: getPreferredRole(),
  };
}

export interface ViewerHandlers {
  onStateChange?: (state: ConnectionState) => void;
  onSessionInit?: (payload: SessionInitPayload) => void;
  onClientAssignment?: (payload: ClientAssignmentPayload) => void;
  onRosterUpdate?: (payload: RosterUpdatePayload) => void;
  onTrackGeometry?: (payload: TrackGeometryPayload) => void;
  onTrackPreview?: (payload: TrackPreviewPayload) => void;
  onTick?: (payload: TickPayload) => void;
  onEvents?: (payload: EventsPayload) => void;
  onRaceComplete?: (payload: RaceCompletePayload) => void;
  onMetaState?: (payload: MetaStatePayload) => void;
  onGameCatalog?: (payload: GameCatalogPayload) => void;
  onEngineerAdvice?: (payload: EngineerAdvicePayload) => void;
  onEngineerStatus?: (payload: EngineerStatusPayload) => void;
  onGarageAdvice?: (payload: GarageAdvicePayload) => void;
  onError?: (message: string) => void;
  onJoinRejected?: (message: string) => void;
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export class ViewerClient {
  private ws: WebSocket | null = null;
  private handlers: ViewerHandlers;
  private reconnectTimer: number | null = null;
  private permissions = new Set<string>();
  private role: ClientRole | null = null;
  private pendingJoin: JoinSessionOptions | null = null;
  private joined = false;

  constructor(handlers: ViewerHandlers) {
    this.handlers = handlers;
  }

  get clientRole(): ClientRole | null {
    return this.role;
  }

  isSpectator(): boolean {
    return this.role === "spectator";
  }

  canSend(type: ClientMessageType): boolean {
    if (this.permissions.size === 0) return true;
    return this.permissions.has(type);
  }

  connect(join?: JoinSessionOptions): void {
    if (join) {
      saveJoinPreferences(join);
      this.pendingJoin = join;
    } else if (!this.pendingJoin && hasSavedDisplayName()) {
      this.pendingJoin = loadJoinPreferences();
    }

    if (!this.pendingJoin) return;

    this.setState("connecting");
    this.ws = new WebSocket(wsUrl());

    this.ws.onopen = () => {
      this.setState("open");
      this.sendJoinSession(this.pendingJoin!);
    };

    this.ws.onclose = () => {
      this.setState("closed");
      this.permissions.clear();
      this.role = null;
      this.joined = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.handlers.onError?.("WebSocket error");
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.protocol !== PROTOCOL_VERSION) return;

        switch (msg.type) {
          case "session_init":
            this.handlers.onSessionInit?.(msg.payload as SessionInitPayload);
            break;
          case "client_assignment": {
            const payload = msg.payload as ClientAssignmentPayload;
            this.role = payload.role;
            this.joined = true;
            this.permissions = new Set(payload.permissions);
            localStorage.setItem(CLIENT_ID_KEY, payload.clientId);
            this.handlers.onClientAssignment?.(payload);
            break;
          }
          case "roster_update":
            this.handlers.onRosterUpdate?.(msg.payload as RosterUpdatePayload);
            break;
          case "track_geometry":
            this.handlers.onTrackGeometry?.(msg.payload as TrackGeometryPayload);
            break;
          case "track_preview":
            this.handlers.onTrackPreview?.(msg.payload as TrackPreviewPayload);
            break;
          case "tick":
            this.handlers.onTick?.(msg.payload as TickPayload);
            break;
          case "events":
            this.handlers.onEvents?.(msg.payload as EventsPayload);
            break;
          case "race_complete":
            this.handlers.onRaceComplete?.(msg.payload as RaceCompletePayload);
            break;
          case "meta_state":
            this.handlers.onMetaState?.(msg.payload as MetaStatePayload);
            break;
          case "game_catalog":
            this.handlers.onGameCatalog?.(msg.payload as GameCatalogPayload);
            break;
          case "engineer_advice":
            this.handlers.onEngineerAdvice?.(msg.payload as EngineerAdvicePayload);
            break;
          case "engineer_status":
            this.handlers.onEngineerStatus?.(msg.payload as EngineerStatusPayload);
            break;
          case "garage_advice":
            this.handlers.onGarageAdvice?.(msg.payload as GarageAdvicePayload);
            break;
          case "error": {
            const err = msg.payload as { message: string; code?: string };
            if (err.code === "join_required" || err.message.includes("join")) {
              this.handlers.onJoinRejected?.(err.message);
            } else {
              this.handlers.onError?.(err.message);
            }
            break;
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[ws] message handler failed:", detail, ev.data);
        this.handlers.onError?.(`Failed to parse server message: ${detail}`);
      }
    };
  }

  reconnectAs(join: JoinSessionOptions): void {
    this.disconnect();
    saveJoinPreferences(join);
    this.pendingJoin = join;
    this.connect(join);
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.joined = false;
    this.role = null;
    this.permissions.clear();
  }

  private sendJoinSession(opts: JoinSessionOptions): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify(
        clientMessage("join_session", {
          displayName: opts.displayName,
          playerId: getOrCreatePlayerId(),
          requestedRole: opts.requestedRole ?? "player",
          reconnectClientId: localStorage.getItem(CLIENT_ID_KEY) ?? undefined,
        }),
      ),
    );
  }

  setTimeScale(timeScale: number): void {
    this.send(clientMessage("set_time_scale", { timeScale }));
  }

  pause(): void {
    this.send(clientMessage("pause", {}));
  }

  resume(): void {
    this.send(clientMessage("resume", {}));
  }

  restartRace(): void {
    this.send(clientMessage("restart_race", {}));
  }

  endSession(): void {
    this.send(clientMessage("end_session", {}));
  }

  startRound(prep?: import("./protocol").StartRoundPayload): void {
    this.send(clientMessage("start_round", prep ?? {}));
  }

  reloadDefinitions(): void {
    this.send(clientMessage("reload_definitions", {}));
  }

  submitCommand(entryId: string, command: string): void {
    this.send(clientMessage("submit_command", { entryId, command }));
  }

  hireStaff(role: string, name: string, skill: number): void {
    this.send(clientMessage("hire_staff", { role, name, skill }));
  }

  rdInvest(partId: string, points: number): void {
    this.send(clientMessage("rd_invest", { partId, points }));
  }

  completeRound(position: number, classId: string): void {
    this.send(clientMessage("complete_round", { position, classId }));
  }

  signSponsor(offerId: string): void {
    this.send(clientMessage("sign_sponsor", { offerId }));
  }

  dropSponsor(offerId: string): void {
    this.send(clientMessage("drop_sponsor", { offerId }));
  }

  createTeam(payload: CreateTeamPayload): void {
    this.send(clientMessage("create_team", payload));
  }

  saveTeamCreationDraft(draft: TeamCreationDraftPayload): void {
    this.send(clientMessage("save_team_creation_draft", draft));
  }

  saveCarBuild(build: CarBuildPayload, carId?: string): void {
    this.send(
      clientMessage("save_car_build", carId ? { build, carId } : build),
    );
  }

  buyCar(payload: BuyCarPayload): void {
    this.send(clientMessage("buy_car", payload));
  }

  setActiveCar(carId: string): void {
    this.send(clientMessage("set_active_car", { carId }));
  }

  setPlayerEntry(carId: string): void {
    this.send(clientMessage("set_player_entry", { carId }));
  }

  removeCar(carId: string): void {
    this.send(clientMessage("remove_car", { carId }));
  }

  saveDriverRoster(
    roster: DriverProfilePayload[],
    assignments?: Record<string, number[]>,
  ): void {
    this.send(clientMessage("save_driver_roster", { roster, assignments }));
  }

  refreshDriverMarket(): void {
    this.send(clientMessage("refresh_driver_market", {}));
  }

  signDriverContract(listingId: string): void {
    this.send(clientMessage("sign_driver_contract", { listingId }));
  }

  saveTeamColors(colors: SaveTeamColorsPayload): void {
    this.send(clientMessage("save_team_colors", colors));
  }

  newGame(): void {
    this.send(clientMessage("new_game", {}));
  }

  setWeekendTireCompound(compound: string): void {
    this.send(clientMessage("set_weekend_tire_compound", { compound }));
  }

  saveTrackSetup(trackId: string, preset: import("./protocol").TrackSetupPresetPayload): void {
    this.send(clientMessage("save_track_setup", { trackId, preset }));
  }

  getTrackPreview(trackId: string): void {
    this.send(clientMessage("get_track_preview", { trackId }));
  }

  askEngineer(entryId: string, question?: string): void {
    this.send(clientMessage("ask_engineer", { entryId, question }));
  }

  getEngineerStatus(): void {
    this.send(clientMessage("get_engineer_status", {}));
  }

  askGarageEngineer(payload: {
    classId: string;
    build: CarBuildPayload;
    compiled?: Record<string, number>;
    trackHint?: string;
    question?: string;
  }): void {
    this.send(clientMessage("ask_garage_engineer", payload));
  }

  private send(msg: ReturnType<typeof clientMessage>): void {
    if (
      msg.type !== "join_session" &&
      this.permissions.size > 0 &&
      !this.permissions.has(msg.type)
    ) {
      console.warn(`[ws] blocked ${msg.type} — insufficient permissions`);
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setState(state: ConnectionState): void {
    this.handlers.onStateChange?.(state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || !this.pendingJoin) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }
}

export {
  getDisplayName,
  getOrCreatePlayerId,
  getPreferredRole,
  DISPLAY_NAME_KEY,
  PREFERRED_ROLE_KEY,
};
