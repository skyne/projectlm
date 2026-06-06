"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientSessionManager = void 0;
const crypto_1 = require("crypto");
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 24;
const RECONNECT_GRACE_MS = 10 * 60 * 1000;
const HOST_PERMISSIONS = [
    "set_time_scale",
    "pause",
    "resume",
    "restart_race",
    "reload_definitions",
    "submit_command",
    "hire_staff",
    "rd_invest",
    "complete_round",
    "start_round",
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
    "save_team_colors",
    "sign_sponsor",
    "drop_sponsor",
    "new_game",
    "set_weekend_tire_compound",
    "ask_engineer",
    "get_engineer_status",
    "ask_garage_engineer",
    "get_track_preview",
];
const PLAYER_PERMISSIONS = [
    "set_time_scale",
    "pause",
    "resume",
    "restart_race",
    "submit_command",
    "ask_engineer",
    "get_engineer_status",
    "get_track_preview",
];
const SPECTATOR_PERMISSIONS = [
    "get_engineer_status",
    "get_track_preview",
];
function permissionsForRole(role) {
    const list = role === "host"
        ? HOST_PERMISSIONS
        : role === "player"
            ? PLAYER_PERMISSIONS
            : SPECTATOR_PERMISSIONS;
    return new Set(list);
}
function sanitizeDisplayName(raw) {
    const trimmed = raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
    if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) {
        return null;
    }
    return trimmed;
}
function uniqueDisplayName(base, used) {
    if (!used.has(base))
        return base;
    let n = 2;
    while (used.has(`${base} (${n})`))
        n++;
    return `${base} (${n})`;
}
class ClientSessionManager {
    constructor() {
        this.byWs = new WeakMap();
        this.byId = new Map();
        this.disconnected = new Map();
        this.autoJoinTimers = new WeakMap();
    }
    cancelAutoJoin(ws) {
        const timer = this.autoJoinTimers.get(ws);
        if (timer) {
            clearTimeout(timer);
            this.autoJoinTimers.delete(ws);
        }
    }
    scheduleAutoJoin(ws, sessionInit, onJoined, delayMs = 150) {
        this.cancelAutoJoin(ws);
        const timer = setTimeout(() => {
            if (this.byWs.has(ws))
                return;
            const assignment = this.autoJoin(ws, "Player", "host", sessionInit);
            if (assignment)
                onJoined(assignment);
        }, delayMs);
        this.autoJoinTimers.set(ws, timer);
    }
    attach(_ws) {
        /* auto-join scheduled from index after bootstrap */
    }
    detach(ws) {
        this.cancelAutoJoin(ws);
        const session = this.byWs.get(ws);
        if (!session)
            return null;
        this.byWs.delete(ws);
        this.byId.delete(session.clientId);
        const { ws: _ws, ...rest } = session;
        this.disconnected.set(session.clientId, {
            session: rest,
            disconnectedAt: Date.now(),
        });
        return session;
    }
    get(ws) {
        return this.byWs.get(ws) ?? null;
    }
    isJoined(ws) {
        return this.byWs.has(ws);
    }
    hasHost() {
        for (const session of this.byId.values()) {
            if (session.role === "host")
                return true;
        }
        return false;
    }
    sessionMode() {
        let pitCrew = 0;
        for (const session of this.byId.values()) {
            if (session.role === "host" || session.role === "player")
                pitCrew++;
        }
        return pitCrew >= 2 ? "coop" : "solo";
    }
    canSubmitForEntry(ws, entryId) {
        const session = this.byWs.get(ws);
        if (!session)
            return false;
        return session.entryIds.includes(entryId);
    }
    can(ws, type) {
        const session = this.byWs.get(ws);
        if (!session)
            return false;
        return session.permissions.has(type);
    }
    entryIdsFromSessionInit(init) {
        if (init.managedEntryIds?.length)
            return init.managedEntryIds;
        if (init.playerEntryId)
            return [init.playerEntryId];
        return [];
    }
    join(ws, payload, sessionInit) {
        this.cancelAutoJoin(ws);
        if (this.byWs.has(ws)) {
            return { error: "Already joined" };
        }
        const displayNameRaw = payload.displayName ?? "Player";
        const displayName = sanitizeDisplayName(displayNameRaw);
        if (!displayName) {
            return { error: "Display name must be 2–24 characters" };
        }
        const usedNames = new Set([...this.byId.values()].map((s) => s.displayName));
        const finalName = uniqueDisplayName(displayName, usedNames);
        let role = payload.requestedRole ?? "player";
        if (role === "host" && this.hasHost()) {
            role = "player";
        }
        if (!this.hasHost() && role !== "spectator") {
            role = "host";
        }
        let clientId = (0, crypto_1.randomUUID)();
        let entryIds = this.entryIdsFromSessionInit(sessionInit);
        if (payload.reconnectClientId) {
            const stale = this.disconnected.get(payload.reconnectClientId);
            if (stale &&
                Date.now() - stale.disconnectedAt <= RECONNECT_GRACE_MS &&
                (!payload.playerId || stale.session.playerId === payload.playerId)) {
                clientId = payload.reconnectClientId;
                role = stale.session.role;
                entryIds =
                    stale.session.entryIds.length > 0
                        ? stale.session.entryIds
                        : entryIds;
                this.disconnected.delete(payload.reconnectClientId);
            }
        }
        else if (payload.playerId) {
            for (const [id, stale] of this.disconnected) {
                if (stale.session.playerId === payload.playerId &&
                    Date.now() - stale.disconnectedAt <= RECONNECT_GRACE_MS) {
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
        const session = {
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
    autoJoin(ws, displayName, role, sessionInit) {
        if (this.byWs.has(ws))
            return null;
        const result = this.join(ws, { displayName, requestedRole: role }, sessionInit);
        if ("error" in result)
            return null;
        return result;
    }
    syncEntryIds(sessionInit) {
        const entryIds = this.entryIdsFromSessionInit(sessionInit);
        for (const session of this.byId.values()) {
            if (session.role === "host" || session.role === "player") {
                session.entryIds = entryIds;
            }
        }
    }
    roster() {
        const clients = [...this.byId.values()].map((s) => ({
            clientId: s.clientId,
            displayName: s.displayName,
            role: s.role,
            entryIds: s.entryIds,
        }));
        return { clients, sessionMode: this.sessionMode() };
    }
    allSessions() {
        return [...this.byId.values()];
    }
}
exports.ClientSessionManager = ClientSessionManager;
