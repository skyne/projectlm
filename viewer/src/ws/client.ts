import {
  clientMessage,
  PROTOCOL_VERSION,
  type EventsPayload,
  type RaceCompletePayload,
  type ServerMessage,
  type SessionInitPayload,
  type TickPayload,
  type TrackGeometryPayload,
} from "./protocol";

export type ConnectionState = "connecting" | "open" | "closed";

export interface ViewerHandlers {
  onStateChange?: (state: ConnectionState) => void;
  onSessionInit?: (payload: SessionInitPayload) => void;
  onTrackGeometry?: (payload: TrackGeometryPayload) => void;
  onTick?: (payload: TickPayload) => void;
  onEvents?: (payload: EventsPayload) => void;
  onRaceComplete?: (payload: RaceCompletePayload) => void;
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
          case "tick":
            this.handlers.onTick?.(msg.payload as TickPayload);
            break;
          case "events":
            this.handlers.onEvents?.(msg.payload as EventsPayload);
            break;
          case "race_complete":
            this.handlers.onRaceComplete?.(msg.payload as RaceCompletePayload);
            break;
          case "error":
            this.handlers.onError?.((msg.payload as { message: string }).message);
            break;
        }
      } catch {
        this.handlers.onError?.("Failed to parse server message");
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

  reloadDefinitions(): void {
    this.send(clientMessage("reload_definitions", {}));
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
