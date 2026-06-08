"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const http_1 = require("http");
const client_sessions_1 = require("./client_sessions");
const economy_1 = require("./game/economy");
const experimental_entry_1 = require("./game/experimental_entry");
const weekend_sessions_1 = require("./game/weekend_sessions");
const engineer_service_1 = require("./llm/engineer_service");
const garage_engineer_service_1 = require("./llm/garage_engineer_service");
const sim_host_1 = require("./sim_host");
const ws_protocol_1 = require("./ws_protocol");
const session_log_1 = require("./session_log");
const PORT = Number(process.env.PORT ?? 8765);
function broadcast(clients, data) {
    const text = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(text);
        }
    }
}
function sendJoinRequired(ws) {
    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", {
        message: "Send join_session before other commands",
        code: "join_required",
    })));
}
function sendForbidden(ws) {
    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", {
        message: "Not permitted for your role",
        code: "forbidden",
    })));
}
function startDevSessionLogApi(repoRoot, port) {
    (0, http_1.createServer)((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method !== "GET") {
            res.writeHead(405, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "method not allowed" }));
            return;
        }
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname === "/dev/session-logs") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ logs: (0, session_log_1.listSessionLogs)(repoRoot) }));
            return;
        }
        const match = url.pathname.match(/^\/dev\/session-logs\/([^/]+)$/);
        if (match) {
            const log = (0, session_log_1.readSessionLog)(repoRoot, decodeURIComponent(match[1]));
            if (!log) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "log not found" }));
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(log));
            return;
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
    }).listen(port, () => {
        console.log(`[server] Dev session log API http://127.0.0.1:${port}/dev/session-logs`);
    });
}
function main() {
    const host = new sim_host_1.SimHost();
    const engineer = new engineer_service_1.EngineerService();
    const garageEngineer = new garage_engineer_service_1.GarageEngineerService();
    const sessions = new client_sessions_1.ClientSessionManager();
    const wss = new ws_1.WebSocketServer({ port: PORT });
    const clients = new Set();
    let trackSent = false;
    console.log(`[server] WebSocket listening on ws://localhost:${PORT}`);
    function broadcastRoster() {
        broadcast(clients, (0, ws_protocol_1.serverMessage)("roster_update", sessions.roster()));
    }
    function deliverAssignment(ws, assignment) {
        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("client_assignment", assignment)));
        broadcastRoster();
    }
    function sendBootstrap(ws) {
        const sessionInit = host.getSessionInit();
        const meta = host.getMetaState();
        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("session_init", sessionInit)));
        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("meta_state", meta)));
        let sessionActive = sessionInit.raceActive;
        if (meta.seasonComplete && sessionInit.raceActive) {
            host.endSession();
            ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit())));
            sessionActive = false;
        }
        else if (sessionInit.raceActive && sessionInit.raceComplete) {
            const lastComplete = host.getLastRaceComplete();
            if (lastComplete) {
                ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("race_complete", lastComplete)));
            }
        }
        if (sessionActive) {
            const catchUp = {
                raceTime: host.getRaceTime(),
                snapshots: host.getSnapshots(),
                raceControl: host.getRaceControl(),
            };
            ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("tick", catchUp)));
        }
        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("game_catalog", host.getGameCatalog())));
        void engineer.getStatus().then((status) => {
            ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("engineer_status", status)));
        });
        if (!trackSent) {
            const geometry = host.getTrackGeometry();
            broadcast(clients, (0, ws_protocol_1.serverMessage)("track_geometry", geometry));
            trackSent = true;
        }
        else {
            const geometry = host.getTrackGeometry();
            ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("track_geometry", geometry)));
        }
        return sessionInit;
    }
    function afterSessionChange() {
        sessions.syncEntryIds(host.getSessionInit());
        broadcastRoster();
    }
    wss.on("connection", (ws) => {
        clients.add(ws);
        sessions.attach(ws);
        console.log(`[server] Client connected (${clients.size} total)`);
        const sessionInit = sendBootstrap(ws);
        sessions.scheduleAutoJoin(ws, sessionInit, (assignment) => {
            deliverAssignment(ws, assignment);
        });
        ws.on("message", async (data) => {
            const raw = data.toString();
            const msg = (0, ws_protocol_1.parseClientMessage)(raw);
            if (!msg) {
                ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", {
                    message: "Invalid client message",
                    code: "invalid_message",
                })));
                return;
            }
            if (msg.type === "join_session") {
                const payload = msg.payload;
                const result = sessions.join(ws, payload, host.getSessionInit());
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                    return;
                }
                deliverAssignment(ws, result);
                console.log(`[server] ${result.displayName} joined as ${result.role} (${result.clientId})`);
                return;
            }
            if (!sessions.isJoined(ws)) {
                sendJoinRequired(ws);
                return;
            }
            if (!sessions.can(ws, msg.type)) {
                sendForbidden(ws);
                return;
            }
            if (msg.type === "set_time_scale") {
                const scale = Number(msg.payload.timeScale ?? 1);
                host.setTimeScale(scale);
            }
            else if (msg.type === "pause") {
                host.pause();
            }
            else if (msg.type === "resume") {
                host.resume();
            }
            else if (msg.type === "restart_race") {
                if (!host.restartRace()) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Failed to restart race" })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", host.getMetaState()));
                    const payload = {
                        raceTime: host.getRaceTime(),
                        snapshots: host.getSnapshots(),
                        raceControl: host.getRaceControl(),
                    };
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
                    afterSessionChange();
                    console.log("[server] Race restarted");
                }
            }
            else if (msg.type === "end_session") {
                if (!host.endSession()) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Failed to end session" })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
                    afterSessionChange();
                    console.log("[server] Session ended");
                }
            }
            else if (msg.type === "reload_definitions") {
                if (!host.reloadDefinitions()) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", {
                        message: "Failed to reload track and car definitions",
                    })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", host.getMetaState()));
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("track_geometry", host.getTrackGeometry()));
                    const payload = {
                        raceTime: host.getRaceTime(),
                        snapshots: host.getSnapshots(),
                        raceControl: host.getRaceControl(),
                    };
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
                    afterSessionChange();
                    console.log("[server] Reloaded definitions");
                }
            }
            else if (msg.type === "submit_command") {
                const payload = msg.payload;
                const clientSession = sessions.get(ws);
                if (clientSession &&
                    !sessions.canSubmitForEntry(ws, payload.entryId)) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", {
                        message: "Not authorized for this car",
                        code: "forbidden",
                    })));
                    return;
                }
                const commandError = host.submitCommand(payload.entryId, payload.command, clientSession
                    ? {
                        displayName: clientSession.displayName,
                        clientId: clientSession.clientId,
                    }
                    : undefined);
                if (commandError) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: commandError })));
                }
            }
            else if (msg.type === "hire_staff") {
                const payload = msg.payload;
                const meta = host.hireStaff(payload.role, payload.name, payload.skill);
                broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
            }
            else if (msg.type === "rd_invest") {
                const payload = msg.payload;
                const meta = host.investRd(payload.partId, payload.points);
                broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
            }
            else if (msg.type === "complete_round") {
                const payload = msg.payload;
                const position = Number(payload.position ?? 0);
                const classId = String(payload.classId ?? "");
                const meta = host.completeRound(position, classId);
                broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
            }
            else if (msg.type === "sign_sponsor") {
                const payload = msg.payload;
                const result = host.signSponsor(payload.offerId ?? "");
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                }
            }
            else if (msg.type === "drop_sponsor") {
                const payload = msg.payload;
                const result = host.dropSponsor(payload.offerId ?? "");
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                }
            }
            else if (msg.type === "start_round" ||
                msg.type === "continue_weekend_session") {
                const prep = (msg.payload ?? {});
                if (!host.getMetaState().setupComplete) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Complete team setup first" })));
                }
                else {
                    const fleetErr = host.validateFleetForRace();
                    if (fleetErr) {
                        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: fleetErr })));
                    }
                    else {
                        const startErr = host.startRound(prep);
                        if (startErr) {
                            ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: startErr })));
                        }
                        else {
                            broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
                            broadcast(clients, (0, ws_protocol_1.serverMessage)("track_geometry", host.getTrackGeometry()));
                            const payload = {
                                raceTime: host.getRaceTime(),
                                snapshots: host.getSnapshots(),
                                raceControl: host.getRaceControl(),
                            };
                            broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
                            afterSessionChange();
                            const label = msg.type === "continue_weekend_session"
                                ? `Weekend session (${host.getWeekendSessionType()})`
                                : "Round";
                            console.log(`[server] ${label} started`);
                        }
                    }
                }
            }
            else if (msg.type === "create_team") {
                const payload = msg.payload;
                const meta = host.createTeam(payload);
                if (!meta) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Invalid team setup" })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
                    console.log("[server] Team created:", meta.teamName);
                }
            }
            else if (msg.type === "save_team_creation_draft") {
                const draft = msg.payload;
                const result = host.saveTeamCreationDraft(draft);
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("meta_state", result)));
                }
            }
            else if (msg.type === "repair_car_condition") {
                const payload = msg.payload;
                const result = host.repairCarCondition(payload.carId, {
                    parts: payload.parts,
                    rebuild: payload.rebuild,
                    reveal: payload.reveal,
                });
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                }
            }
            else if (msg.type === "save_car_build") {
                const raw = msg.payload;
                const carId = raw && typeof raw === "object" && "build" in raw && raw.build
                    ? raw.carId
                    : undefined;
                const build = raw && typeof raw === "object" && "build" in raw && raw.build
                    ? raw.build
                    : raw;
                const result = host.saveCarBuild(build, carId);
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    console.log("[server] Car build saved");
                }
            }
            else if (msg.type === "save_driver_roster") {
                const payload = msg.payload;
                const result = host.saveDriverRoster(payload.roster ?? [], payload.assignments);
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    console.log("[server] Driver roster saved");
                }
            }
            else if (msg.type === "refresh_driver_market") {
                const result = host.refreshDriverMarket();
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    console.log("[server] Driver market refreshed");
                }
            }
            else if (msg.type === "sign_driver_contract") {
                const listingId = msg.payload.listingId ?? "";
                const result = host.signDriverContract(listingId);
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    console.log("[server] Driver contract signed");
                }
            }
            else if (msg.type === "save_team_colors") {
                const payload = msg.payload;
                const meta = host.saveTeamColors(payload);
                if (!meta) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Invalid team colors" })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
                    console.log("[server] Team livery saved");
                }
            }
            else if (msg.type === "buy_car") {
                const payload = msg.payload;
                const result = host.buyCar(payload);
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    console.log("[server] Car purchased");
                }
            }
            else if (msg.type === "set_active_car") {
                const carId = msg.payload.carId ?? "";
                const meta = host.setActiveCar(carId);
                if (!meta) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Unknown car" })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
                }
            }
            else if (msg.type === "set_player_entry") {
                const carId = msg.payload.carId ?? "";
                const meta = host.setPlayerEntry(carId);
                if (!meta) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Unknown car" })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
                }
            }
            else if (msg.type === "remove_car") {
                const carId = msg.payload.carId ?? "";
                const result = host.removeCar(carId);
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                }
            }
            else if (msg.type === "ask_garage_engineer") {
                const payload = msg.payload;
                const meta = host.getMetaState();
                const advice = await garageEngineer.advise({
                    repoRoot: host.repoRoot,
                    classId: String(payload.classId ?? meta.playerClassId ?? "Hypercar"),
                    build: payload.build,
                    unlockedParts: meta.unlockedParts ?? [],
                    compiled: payload.compiled,
                    trackHint: payload.trackHint,
                    question: payload.question,
                });
                ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("garage_advice", advice)));
            }
            else if (msg.type === "get_engineer_status") {
                const status = await engineer.getStatus();
                ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("engineer_status", status)));
            }
            else if (msg.type === "ask_engineer") {
                const payload = msg.payload;
                const entryId = String(payload.entryId ?? "").trim();
                const snap = host
                    .getSnapshots()
                    .find((row) => row.entryId === entryId);
                if (!snap) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Unknown entry for engineer" })));
                }
                else {
                    const meta = host.getMetaState();
                    const engineerSkill = meta.staff?.find((s) => s.role === "engineer")?.skill ?? 75;
                    const round = meta.calendar.find((e) => e.round === meta.currentRound);
                    const trackPreset = round
                        ? meta.trackSetupPresets?.[round.trackId]
                        : undefined;
                    const advice = await engineer.advise({
                        snap,
                        raceTimeSec: host.getRaceTime(),
                        trackName: host.getSessionInit().trackName,
                        trackPresetNotes: trackPreset?.notes,
                        question: payload.question,
                        engineerSkill,
                    });
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("engineer_advice", advice)));
                }
            }
            else if (msg.type === "get_track_preview") {
                const trackId = String(msg.payload.trackId ?? "").trim();
                const geometry = host.getTrackPreview(trackId);
                if (!geometry) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", {
                        message: `Unknown track: ${trackId}`,
                    })));
                }
                else {
                    const payload = { trackId, geometry };
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("track_preview", payload)));
                }
            }
            else if (msg.type === "finalize_season") {
                const result = host.finalizeSeasonIfReady();
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                }
            }
            else if (msg.type === "start_next_season") {
                const result = host.startNextSeason();
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    console.log("[server] New season started");
                }
            }
            else if (msg.type === "restart_season") {
                const result = host.restartSeason();
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
                    afterSessionChange();
                    console.log("[server] Season restarted");
                }
            }
            else if (msg.type === "new_game") {
                const meta = host.newGame();
                broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
                broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
                afterSessionChange();
                console.log("[server] New game started");
            }
            else if (msg.type === "set_weekend_tire_compound") {
                const compound = String(msg.payload.compound ?? "Medium");
                const result = host.setWeekendTireCompound(compound);
                if ("error" in result) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                }
                else {
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                }
            }
            else if (msg.type === "save_track_setup") {
                const body = msg.payload;
                const trackId = String(body.trackId ?? "").trim();
                const preset = body.preset;
                if (!trackId || !preset) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "trackId and preset required" })));
                }
                else {
                    const result = host.saveTrackSetupPreset(trackId, {
                        ...preset,
                        trackId,
                    });
                    if ("error" in result) {
                        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: result.error })));
                    }
                    else {
                        broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", result));
                    }
                }
            }
        });
        ws.on("close", () => {
            const session = sessions.detach(ws);
            clients.delete(ws);
            if (session) {
                broadcastRoster();
                console.log(`[server] ${session.displayName} disconnected (${clients.size} total)`);
            }
            else {
                console.log(`[server] Client disconnected (${clients.size} total)`);
            }
        });
    });
    host.start((raceTime, snapshots) => {
        const payload = {
            raceTime,
            snapshots,
            raceControl: host.getRaceControl(),
        };
        broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
    }, (events) => {
        const payload = { events };
        broadcast(clients, (0, ws_protocol_1.serverMessage)("events", payload));
    }, (raceTime, results, weekendSessionType, sessionLogId) => {
        const meta = host.getMetaState();
        const session = host.getSessionInit();
        const managedIds = session.managedEntryIds?.length
            ? session.managedEntryIds
            : [session.playerEntryId ?? meta.playerEntryId];
        const managedResults = results.filter((r) => managedIds.includes(r.entryId));
        const classifiedManaged = managedResults.filter((r) => !r.retired);
        const playerResult = classifiedManaged.length > 0
            ? classifiedManaged.reduce((best, r) => r.position < best.position ? r : best)
            : managedResults.length > 0
                ? managedResults.reduce((best, r) => r.position < best.position ? r : best)
                : undefined;
        const event = meta.calendar.find((e) => e.round === meta.currentRound);
        const scoring = event?.eventType !== "test" && event?.format !== "test";
        const isRaceSession = weekendSessionType === "race";
        const fleetById = new Map((meta.fleet ?? []).map((c) => [c.id, c]));
        const entryFleetMap = host.getFleetEntryMap();
        const resolveEntryMode = (entryId) => {
            const fleetCarId = entryFleetMap.get(entryId);
            const car = fleetCarId ? fleetById.get(fleetCarId) : undefined;
            return car ? (0, experimental_entry_1.fleetEntryMode)(car) : undefined;
        };
        const playerCarId = meta.playerCarId ?? meta.activeCarId ?? meta.fleet?.[0]?.id;
        const primaryResult = results.find((r) => entryFleetMap.get(r.entryId) === playerCarId) ??
            playerResult;
        const finances = isRaceSession && primaryResult && event
            ? (0, economy_1.computeRaceFinances)(primaryResult.position, primaryResult.classId, event.format, meta.sponsors ?? [], meta.staff, {
                scoring,
                entryMode: resolveEntryMode(primaryResult.entryId),
                racePosition: primaryResult.position,
            })
            : undefined;
        let updatedMeta = meta;
        if (isRaceSession && primaryResult && event && !event.completed) {
            updatedMeta = host.completeRound(primaryResult.position, primaryResult.classId, results.map((r) => ({
                entryId: r.entryId,
                teamName: r.teamName,
                carNumber: r.carNumber,
                classId: r.classId,
                position: r.position,
                driverName: r.driverName,
                entryMode: resolveEntryMode(r.entryId),
            })));
        }
        else if (!isRaceSession) {
            updatedMeta = host.completeWeekendSession(weekendSessionType, results);
        }
        const completedSessions = updatedMeta.weekendProgress?.round === updatedMeta.currentRound
            ? updatedMeta.weekendProgress.completedSessions
            : isRaceSession
                ? []
                : [weekendSessionType];
        const nextSession = isRaceSession
            ? null
            : (0, weekend_sessions_1.nextWeekendSession)(completedSessions);
        const finalResults = isRaceSession ? results : (0, weekend_sessions_1.sortTimingResults)(results);
        const payload = {
            raceTime,
            results: finalResults,
            championshipPoints: finances?.championshipPoints ?? 0,
            finances: isRaceSession ? finances : undefined,
            weekendSessionType,
            nextWeekendSession: nextSession,
            sessionLogId,
        };
        host.setLastRaceComplete(payload);
        if (updatedMeta !== meta) {
            broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", updatedMeta));
        }
        broadcast(clients, (0, ws_protocol_1.serverMessage)("race_complete", payload));
        if (updatedMeta.seasonComplete) {
            host.endSession();
            broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
        }
        console.log(`[server] ${weekendSessionType} session complete`);
    });
    if (process.env.DEV_TOOLS !== "0") {
        startDevSessionLogApi(host.repoRoot, Number(process.env.DEV_HTTP_PORT ?? PORT + 1));
    }
    process.on("SIGINT", () => {
        host.stop();
        wss.close();
        process.exit(0);
    });
}
main();
