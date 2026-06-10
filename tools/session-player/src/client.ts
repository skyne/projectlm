import WebSocket from "ws";
import {
  clientMessage,
  PROTOCOL_VERSION,
  type CarSnapshot,
  type ClientAssignmentPayload,
  type ClientRole,
  type EngineerHintPayload,
  type EventsPayload,
  type GameCatalogPayload,
  type MetaStatePayload,
  type RaceCompletePayload,
  type RaceControlPayload,
  type RosterUpdatePayload,
  type ServerMessage,
  type SessionInitPayload,
  type SimEvent,
  type TickPayload,
} from "./protocol.js";

export interface SessionState {
  sessionInit: SessionInitPayload | null;
  clientAssignment: ClientAssignmentPayload | null;
  roster: RosterUpdatePayload | null;
  metaState: MetaStatePayload | null;
  gameCatalog: GameCatalogPayload | null;
  latestTick: TickPayload | null;
  events: SimEvent[];
  raceComplete: RaceCompletePayload | null;
  errors: string[];
}

export interface ConnectOptions {
  url: string;
  timeoutMs?: number;
  displayName?: string;
  playerId?: string;
  requestedRole?: ClientRole;
  reconnectClientId?: string;
}

export type TickListener = (tick: TickPayload) => void;
export type RaceCompleteListener = (payload: RaceCompletePayload) => void;
export type EventsListener = (events: SimEvent[]) => void;
export type EngineerHintListener = (hint: EngineerHintPayload) => void;

export class SessionPlayer {
  private ws: WebSocket | null = null;
  private tickListeners: TickListener[] = [];
  private raceCompleteListeners: RaceCompleteListener[] = [];
  private eventListeners: EventsListener[] = [];
  private engineerHintListeners: EngineerHintListener[] = [];
  readonly state: SessionState = {
    sessionInit: null,
    clientAssignment: null,
    roster: null,
    metaState: null,
    gameCatalog: null,
    latestTick: null,
    events: [],
    raceComplete: null,
    errors: [],
  };

  async connect(options: ConnectOptions): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 5000;
    const displayName = options.displayName ?? "Session Player";
    let sessionReady = false;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws?.terminate();
        reject(new Error(`Timed out connecting to ${options.url}`));
      }, timeoutMs);

      const maybeResolve = () => {
        if (!sessionReady || !this.state.clientAssignment) return;
        clearTimeout(timer);
        resolve();
      };

      this.ws = new WebSocket(options.url);

      this.ws.on("open", () => {
        this.ws?.send(
          JSON.stringify(
            clientMessage("join_session", {
              displayName,
              playerId: options.playerId,
              requestedRole: options.requestedRole ?? "host",
              reconnectClientId: options.reconnectClientId,
            }),
          ),
        );
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as ServerMessage;
          if (msg.protocol !== PROTOCOL_VERSION) return;
          this.handleMessage(msg);
          if (msg.type === "session_init" && this.state.sessionInit) {
            sessionReady = true;
            maybeResolve();
          }
          if (msg.type === "client_assignment" && this.state.clientAssignment) {
            maybeResolve();
          }
        } catch {
          this.state.errors.push("Failed to parse server message");
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("hang up") || msg.includes("ECONNREFUSED")) {
          reject(
            new Error(
              `${msg} (${options.url}). Is the ProjectLM server running? Default port is 9785 — try --url ws://localhost:9785 or start ./dev-viewer.sh`,
            ),
          );
          return;
        }
        reject(err);
      });

      this.ws.on("close", () => {
        if (!sessionReady) {
          clearTimeout(timer);
          reject(
            new Error(
              `Connection closed before session_init (${options.url}). Is the server running on port 9785?`,
            ),
          );
        }
      });
    });
  }

  close(): void {
    this.tickListeners = [];
    this.raceCompleteListeners = [];
    this.eventListeners = [];
    this.ws?.close();
    this.ws = null;
  }

  /** React to each server `tick` message (sim step), not on a poll interval. */
  onTick(listener: TickListener): () => void {
    this.tickListeners.push(listener);
    return () => {
      this.tickListeners = this.tickListeners.filter((l) => l !== listener);
    };
  }

  onRaceComplete(listener: RaceCompleteListener): () => void {
    this.raceCompleteListeners.push(listener);
    return () => {
      this.raceCompleteListeners = this.raceCompleteListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  /** React to each server `events` batch (penalties, flags, incidents). */
  onEvents(listener: EventsListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  onEngineerHint(listener: EngineerHintListener): () => void {
    this.engineerHintListeners.push(listener);
    return () => {
      this.engineerHintListeners = this.engineerHintListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  private emitTick(tick: TickPayload): void {
    for (const listener of this.tickListeners) {
      listener(tick);
    }
  }

  private emitRaceComplete(payload: RaceCompletePayload): void {
    for (const listener of this.raceCompleteListeners) {
      listener(payload);
    }
  }

  private emitEvents(events: SimEvent[]): void {
    for (const listener of this.eventListeners) {
      listener(events);
    }
  }

  private emitEngineerHint(hint: EngineerHintPayload): void {
    for (const listener of this.engineerHintListeners) {
      listener(hint);
    }
  }

  send(type: Parameters<typeof clientMessage>[0], payload: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.ws.send(JSON.stringify(clientMessage(type, payload)));
  }

  clientId(): string | null {
    return this.state.clientAssignment?.clientId ?? null;
  }

  playerEntryId(): string | null {
    return (
      this.state.sessionInit?.playerEntryId ??
      this.state.metaState?.playerEntryId ??
      null
    );
  }

  isPaused(): boolean {
    return Boolean(this.state.sessionInit?.paused);
  }

  hasActiveRace(): boolean {
    return Boolean(this.state.sessionInit?.raceActive);
  }

  async waitForTick(timeoutMs = 3000): Promise<TickPayload | null> {
    if (this.state.latestTick) return this.state.latestTick;
    if (!this.hasActiveRace() || this.isPaused()) return null;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error("Timed out waiting for tick"));
      }, timeoutMs);
      const unsub = this.onTick((tick) => {
        clearTimeout(timer);
        unsub();
        resolve(tick);
      });
    });
  }

  async waitForRaceComplete(timeoutMs: number): Promise<RaceCompletePayload> {
    if (this.state.raceComplete) return this.state.raceComplete;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error("Timed out waiting for race_complete"));
      }, timeoutMs);
      const unsub = this.onRaceComplete((payload) => {
        clearTimeout(timer);
        unsub();
        resolve(payload);
      });
    });
  }

  async waitForTicks(count: number, timeoutMs = 8000): Promise<TickPayload[]> {
    const ticks: TickPayload[] = [];
    const start = Date.now();
    while (ticks.length < count && Date.now() - start < timeoutMs) {
      const tick = this.state.latestTick;
      if (tick && (ticks.length === 0 || ticks[ticks.length - 1]!.raceTime !== tick.raceTime)) {
        ticks.push(tick);
      }
      await this.sleep(50);
    }
    if (ticks.length < count) {
      throw new Error(`Timed out waiting for ${count} tick(s)`);
    }
    return ticks;
  }

  async waitForCatalog(timeoutMs = 3000): Promise<GameCatalogPayload> {
    if (this.state.gameCatalog) return this.state.gameCatalog;
    return this.waitFor(
      () => this.state.gameCatalog,
      timeoutMs,
      "Timed out waiting for game_catalog",
    );
  }

  async waitForSetupComplete(timeoutMs = 5000): Promise<MetaStatePayload> {
    return this.waitFor(
      () => (this.state.metaState?.setupComplete ? this.state.metaState : null),
      timeoutMs,
      "Timed out waiting for setupComplete",
    );
  }

  async waitForMetaUpdate(timeoutMs = 5000): Promise<MetaStatePayload> {
    const before = JSON.stringify(this.state.metaState);
    return this.waitFor(
      () => {
        const next = this.state.metaState;
        if (!next) return null;
        if (JSON.stringify(next) !== before) return next;
        return null;
      },
      timeoutMs,
      "Timed out waiting for meta_state update",
    );
  }

  async waitForSessionUpdate(timeoutMs = 5000): Promise<SessionInitPayload> {
    const current = JSON.stringify(this.state.sessionInit);
    return this.waitFor(
      () => {
        const next = this.state.sessionInit;
        if (!next) return null;
        if (JSON.stringify(next) !== current) return next;
        return null;
      },
      timeoutMs,
      "Timed out waiting for session update",
    );
  }

  async waitForRoundStart(
    teamName: string,
    timeoutMs = 8000,
    sessionBefore?: string,
  ): Promise<SessionInitPayload> {
    const baseline =
      sessionBefore ?? JSON.stringify(this.state.sessionInit);
    const alreadyStarted = this.sessionHasTeam(this.state.sessionInit, teamName);
    if (alreadyStarted && this.state.sessionInit) {
      return this.state.sessionInit;
    }

    return this.waitFor(
      () => {
        const session = this.state.sessionInit;
        if (!session) return null;
        if (!this.sessionHasTeam(session, teamName)) return null;
        if (JSON.stringify(session) === baseline && !alreadyStarted) return null;
        return session;
      },
      timeoutMs,
      `Timed out waiting for round start (${teamName} not on grid)`,
    );
  }

  sessionHasTeam(
    session: SessionInitPayload | null,
    teamName: string,
  ): boolean {
    if (!session) return false;
    const needle = teamName.toLowerCase();
    return session.entries.some((e) => e.teamName.toLowerCase().includes(needle));
  }

  async collectEvents(durationMs: number): Promise<SimEvent[]> {
    const startCount = this.state.events.length;
    await this.sleep(durationMs);
    return this.state.events.slice(startCount);
  }

  async watchTicks(durationMs: number): Promise<TickPayload[]> {
    const ticks: TickPayload[] = [];
    const seen = new Set<number>();
    const handler = () => {
      const tick = this.state.latestTick;
      if (!tick || seen.has(tick.raceTime)) return;
      seen.add(tick.raceTime);
      ticks.push(tick);
    };

    const interval = setInterval(handler, 100);
    handler();
    await this.sleep(durationMs);
    clearInterval(interval);
    return ticks;
  }

  resolveEntry(query: {
    entryId?: string;
    carNumber?: number;
    teamName?: string;
    usePlayerDefault?: boolean;
  }): { entryId: string; teamName: string; carNumber: string | number; classId: string } {
    const entries = this.state.sessionInit?.entries ?? [];
    if (entries.length === 0 && query.usePlayerDefault !== false) {
      const playerEntryId = this.playerEntryId();
      if (playerEntryId) {
        return {
          entryId: playerEntryId,
          teamName: this.state.metaState?.teamName ?? "Player",
          carNumber: 0,
          classId: "unknown",
        };
      }
    }

    if (entries.length === 0) {
      throw new Error("No active race entries — run start-round first");
    }

    if (query.entryId) {
      const match = entries.find((e) => e.entryId === query.entryId);
      if (!match) throw new Error(`Unknown entryId: ${query.entryId}`);
      return match;
    }

    if (query.carNumber !== undefined) {
      const match = entries.find((e) => Number(e.carNumber) === query.carNumber);
      if (!match) throw new Error(`Unknown car number: ${query.carNumber}`);
      return match;
    }

    if (query.teamName) {
      const needle = query.teamName.toLowerCase();
      const match = entries.find((e) => e.teamName.toLowerCase().includes(needle));
      if (!match) throw new Error(`Unknown team: ${query.teamName}`);
      return match;
    }

    const playerEntryId = this.playerEntryId();
    if (playerEntryId) {
      const match = entries.find((e) => e.entryId === playerEntryId);
      if (match) return match;
    }

    throw new Error("Provide --entry, --car, or --team to select a car");
  }

  findCar(query: {
    entryId?: string;
    carNumber?: number;
    teamName?: string;
    usePlayerDefault?: boolean;
  }): CarSnapshot | null {
    const tick = this.state.latestTick;
    if (!tick) return null;
    const entry = this.resolveEntry(query);
    return tick.snapshots.find((s) => s.entryId === entry.entryId) ?? null;
  }

  leaderboard(): Array<{
    position: number;
    carNumber: string | number;
    teamName: string;
    classId: string;
    lap: number;
    speed: number;
    fuel: number;
    gapToLeader: number;
    inPit: boolean;
    retired: boolean;
  }> {
    const tick = this.state.latestTick;
    if (!tick) return [];
    return [...tick.snapshots]
      .sort((a, b) => a.racePosition - b.racePosition)
      .map((s) => ({
        position: s.racePosition,
        carNumber: s.carNumber,
        teamName: s.teamName,
        classId: s.classId,
        lap: s.lap,
        speed: s.speed,
        fuel: s.fuel,
        gapToLeader: s.gapToLeader,
        inPit: s.inPit,
        retired: s.retired,
      }));
  }

  raceControl(): RaceControlPayload | null {
    return this.state.latestTick?.raceControl ?? null;
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "session_init":
        this.state.sessionInit = msg.payload as SessionInitPayload;
        if (!this.state.sessionInit?.raceActive) {
          this.state.raceComplete = null;
        }
        break;
      case "meta_state":
        this.state.metaState = msg.payload as MetaStatePayload;
        break;
      case "client_assignment":
        this.state.clientAssignment = msg.payload as ClientAssignmentPayload;
        break;
      case "roster_update":
        this.state.roster = msg.payload as RosterUpdatePayload;
        break;
      case "game_catalog":
        this.state.gameCatalog = msg.payload as GameCatalogPayload;
        break;
      case "tick": {
        const tick = msg.payload as TickPayload;
        this.state.latestTick = tick;
        this.emitTick(tick);
        break;
      }
      case "events": {
        const payload = msg.payload as EventsPayload;
        if (payload.catchUp) {
          this.state.events = [...payload.events];
        } else if (payload.events.length > 0) {
          this.state.events.push(...payload.events);
        }
        if (payload.events.length > 0) {
          this.emitEvents(payload.events);
        }
        break;
      }
      case "race_complete": {
        const payload = msg.payload as RaceCompletePayload;
        this.state.raceComplete = payload;
        this.emitRaceComplete(payload);
        break;
      }
      case "engineer_hint": {
        const payload = msg.payload as EngineerHintPayload;
        this.emitEngineerHint(payload);
        break;
      }
      case "error":
        this.state.errors.push((msg.payload as { message: string }).message);
        break;
    }
  }

  async waitFor<T>(
    getter: () => T | null,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = getter();
      if (value) return value;
      await this.sleep(50);
    }
    throw new Error(message);
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
