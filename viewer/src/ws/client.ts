import {
  clientMessage,
  PROTOCOL_VERSION,
  type BuyCarPayload,
  type CarBuildPayload,
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
  type ServerMessage,
  type SessionInitPayload,
  type TickPayload,
  type TrackGeometryPayload,
  type TrackPreviewPayload,
} from "./protocol";

export type ConnectionState = "connecting" | "open" | "closed";

export interface ViewerHandlers {
  onStateChange?: (state: ConnectionState) => void;
  onSessionInit?: (payload: SessionInitPayload) => void;
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
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export class ViewerClient {
  private ws: WebSocket | null = null;
  private handlers: ViewerHandlers;
  private reconnectTimer: number | null = null;

  constructor(handlers: ViewerHandlers) {
    this.handlers = handlers;
  }

  connect(): void {
    this.setState("connecting");
    this.ws = new WebSocket(wsUrl());

    this.ws.onopen = () => {
      this.setState("open");
    };

    this.ws.onclose = () => {
      this.setState("closed");
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
          case "error":
            this.handlers.onError?.((msg.payload as { message: string }).message);
            break;
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[ws] message handler failed:", detail, ev.data);
        this.handlers.onError?.(`Failed to parse server message: ${detail}`);
      }
    };
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

  startRound(): void {
    this.send(clientMessage("start_round", {}));
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

  saveCarBuild(build: CarBuildPayload): void {
    this.send(clientMessage("save_car_build", build));
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

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setState(state: ConnectionState): void {
    this.handlers.onStateChange?.(state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }
}
