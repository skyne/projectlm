import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import type {
  ClientAssignmentPayload,
  ClientMessageType,
  ClientRole,
  JoinSessionPayload,
  RosterClientPayload,
  RosterUpdatePayload,
  SessionInitPayload,
  SessionMode,
} from "./ws_protocol";

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 24;
const RECONNECT_GRACE_MS = 10 * 60 * 1000;

const HOST_PERMISSIONS: ClientMessageType[] = [
  "set_time_scale",
  "pause",
  "resume",
  "restart_race",
  "end_session",
  "reload_definitions",
  "submit_command",
  "hire_staff",
  "rd_invest",
  "complete_round",
  "start_round",
  "start_private_test",
  "continue_weekend_session",
  "create_team",
  "save_team_creation_draft",
  "save_car_build",
  "buy_car",
  "set_active_car",
  "set_player_entry",
  "remove_car",
  "save_driver_roster",
  "refresh_driver_market",
  "sign_driver_contract",
  "refresh_staff_market",
  "sign_staff_contract",
  "start_negotiation",
  "submit_negotiation_offer",
  "accept_negotiation",
  "withdraw_negotiation",
  "save_team_colors",
  "sign_sponsor",
  "drop_sponsor",
  "new_game",
  "set_weekend_tire_compound",
  "ask_engineer",
  "get_engineer_status",
  "ask_garage_engineer",
  "repair_car_condition",
  "start_next_season",
  "restart_season",
  "finalize_season",
  "get_track_preview",
];

const PLAYER_PERMISSIONS: ClientMessageType[] = [
  "set_time_scale",
  "pause",
  "resume",
  "restart_race",
  "submit_command",
  "continue_weekend_session",
  "ask_engineer",
  "get_engineer_status",
  "get_track_preview",
];

const SPECTATOR_PERMISSIONS: ClientMessageType[] = [
  "get_engineer_status",
  "get_track_preview",
];

export interface ClientSession {
  clientId: string;
  ws: WebSocket;
  displayName: string;
  playerId?: string;
  role: ClientRole;
  joinedAt: number;
  entryIds: string[];
  permissions: Set<ClientMessageType>;
}

interface DisconnectedSession {
  session: Omit<ClientSession, "ws">;
  disconnectedAt: number;
}

function permissionsForRole(role: ClientRole): Set<ClientMessageType> {
  const list =
    role === "host"
      ? HOST_PERMISSIONS
      : role === "player"
        ? PLAYER_PERMISSIONS
        : SPECTATOR_PERMISSIONS;
  return new Set(list);
}

function sanitizeDisplayName(raw: string): string | null {
  const trimmed = raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) {
    return null;
  }
  return trimmed;
}

function uniqueDisplayName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

export class ClientSessionManager {
  private readonly byWs = new WeakMap<WebSocket, ClientSession>();
  private readonly byId = new Map<string, ClientSession>();
  private readonly disconnected = new Map<string, DisconnectedSession>();
  private readonly autoJoinTimers = new WeakMap<
    WebSocket,
    ReturnType<typeof setTimeout>
  >();

  cancelAutoJoin(ws: WebSocket): void {
    const timer = this.autoJoinTimers.get(ws);
    if (timer) {
      clearTimeout(timer);
      this.autoJoinTimers.delete(ws);
    }
  }

  scheduleAutoJoin(
    ws: WebSocket,
    sessionInit: SessionInitPayload,
    onJoined: (assignment: ClientAssignmentPayload) => void,
    delayMs = 150,
  ): void {
    this.cancelAutoJoin(ws);
    const timer = setTimeout(() => {
      if (this.byWs.has(ws)) return;
      const assignment = this.autoJoin(ws, "Player", "host", sessionInit);
      if (assignment) onJoined(assignment);
    }, delayMs);
    this.autoJoinTimers.set(ws, timer);
  }

  attach(_ws: WebSocket): void {
    /* auto-join scheduled from index after bootstrap */
  }

  detach(ws: WebSocket): ClientSession | null {
    this.cancelAutoJoin(ws);

    const session = this.byWs.get(ws);
    if (!session) return null;

    this.byWs.delete(ws);
    this.byId.delete(session.clientId);
    const { ws: _ws, ...rest } = session;
    this.disconnected.set(session.clientId, {
      session: rest,
      disconnectedAt: Date.now(),
    });
    return session;
  }

  get(ws: WebSocket): ClientSession | null {
    return this.byWs.get(ws) ?? null;
  }

  isJoined(ws: WebSocket): boolean {
    return this.byWs.has(ws);
  }

  hasHost(): boolean {
    for (const session of this.byId.values()) {
      if (session.role === "host") return true;
    }
    return false;
  }

  sessionMode(): SessionMode {
    let pitCrew = 0;
    for (const session of this.byId.values()) {
      if (session.role === "host" || session.role === "player") pitCrew++;
    }
    return pitCrew >= 2 ? "coop" : "solo";
  }

  canSubmitForEntry(ws: WebSocket, entryId: string): boolean {
    const session = this.byWs.get(ws);
    if (!session) return false;
    return session.entryIds.includes(entryId);
  }

  can(ws: WebSocket, type: ClientMessageType): boolean {
    const session = this.byWs.get(ws);
    if (!session) return false;
    return session.permissions.has(type);
  }

  entryIdsFromSessionInit(init: SessionInitPayload): string[] {
    if (init.managedEntryIds?.length) return init.managedEntryIds;
    if (init.playerEntryId) return [init.playerEntryId];
    return [];
  }

  join(
    ws: WebSocket,
    payload: JoinSessionPayload,
    sessionInit: SessionInitPayload,
  ): ClientAssignmentPayload | { error: string } {
    this.cancelAutoJoin(ws);

    if (this.byWs.has(ws)) {
      return { error: "Already joined" };
    }

    const displayNameRaw = payload.displayName ?? "Player";
    const displayName = sanitizeDisplayName(displayNameRaw);
    if (!displayName) {
      return { error: "Display name must be 2–24 characters" };
    }

    const usedNames = new Set(
      [...this.byId.values()].map((s) => s.displayName),
    );
    const finalName = uniqueDisplayName(displayName, usedNames);

    let role: ClientRole = payload.requestedRole ?? "player";
    if (role === "host" && this.hasHost()) {
      role = "player";
    }
    if (!this.hasHost() && role !== "spectator") {
      role = "host";
    }

    let clientId = randomUUID() as string;
    let entryIds = this.entryIdsFromSessionInit(sessionInit);

    if (payload.reconnectClientId) {
      const stale = this.disconnected.get(payload.reconnectClientId);
      if (
        stale &&
        Date.now() - stale.disconnectedAt <= RECONNECT_GRACE_MS &&
        (!payload.playerId || stale.session.playerId === payload.playerId)
      ) {
        clientId = payload.reconnectClientId;
        role = stale.session.role;
        entryIds =
          stale.session.entryIds.length > 0
            ? stale.session.entryIds
            : entryIds;
        this.disconnected.delete(payload.reconnectClientId);
      }
    } else if (payload.playerId) {
      for (const [id, stale] of this.disconnected) {
        if (
          stale.session.playerId === payload.playerId &&
          Date.now() - stale.disconnectedAt <= RECONNECT_GRACE_MS
        ) {
          clientId = id;
          role = stale.session.role;
          entryIds =
            stale.session.entryIds.length > 0
              ? stale.session.entryIds
              : entryIds;
          this.disconnected.delete(id);
          break;
        }
      }
    }

    const session: ClientSession = {
      clientId,
      ws,
      displayName: finalName,
      playerId: payload.playerId,
      role,
      joinedAt: Date.now(),
      entryIds,
      permissions: permissionsForRole(role),
    };

    this.byWs.set(ws, session);
    this.byId.set(clientId, session);

    return {
      clientId: session.clientId,
      displayName: session.displayName,
      playerId: session.playerId,
      role: session.role,
      entryIds: session.entryIds,
      permissions: [...session.permissions],
      sessionMode: this.sessionMode(),
    };
  }

  autoJoin(
    ws: WebSocket,
    displayName: string,
    role: ClientRole,
    sessionInit: SessionInitPayload,
  ): ClientAssignmentPayload | null {
    if (this.byWs.has(ws)) return null;
    const result = this.join(
      ws,
      { displayName, requestedRole: role },
      sessionInit,
    );
    if ("error" in result) return null;
    return result;
  }

  syncEntryIds(sessionInit: SessionInitPayload): void {
    const entryIds = this.entryIdsFromSessionInit(sessionInit);
    for (const session of this.byId.values()) {
      if (session.role === "host" || session.role === "player") {
        session.entryIds = entryIds;
      }
    }
  }

  roster(): RosterUpdatePayload {
    const clients: RosterClientPayload[] = [...this.byId.values()].map(
      (s) => ({
        clientId: s.clientId,
        displayName: s.displayName,
        role: s.role,
        entryIds: s.entryIds,
      }),
    );
    return { clients, sessionMode: this.sessionMode() };
  }

  allSessions(): ClientSession[] {
    return [...this.byId.values()];
  }
}
