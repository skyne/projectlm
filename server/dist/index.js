"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const economy_1 = require("./game/economy");
const sim_host_1 = require("./sim_host");
const ws_protocol_1 = require("./ws_protocol");
const PORT = Number(process.env.PORT ?? 8765);
function broadcast(clients, data) {
    const text = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(text);
        }
    }
}
function main() {
    const host = new sim_host_1.SimHost();
    const wss = new ws_1.WebSocketServer({ port: PORT });
    const clients = new Set();
    let trackSent = false;
    console.log(`[server] WebSocket listening on ws://localhost:${PORT}`);
    wss.on("connection", (ws) => {
        clients.add(ws);
        console.log(`[server] Client connected (${clients.size} total)`);
        const sessionInit = host.getSessionInit();
        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("session_init", sessionInit)));
        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("meta_state", host.getMetaState())));
        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("game_catalog", host.getGameCatalog())));
        if (!trackSent) {
            const geometry = host.getTrackGeometry();
            broadcast(clients, (0, ws_protocol_1.serverMessage)("track_geometry", geometry));
            trackSent = true;
        }
        else {
            const geometry = host.getTrackGeometry();
            ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("track_geometry", geometry)));
        }
        ws.on("message", (data) => {
            const raw = data.toString();
            const msg = (0, ws_protocol_1.parseClientMessage)(raw);
            if (!msg) {
                ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Invalid client message" })));
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
                    };
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
                    console.log("[server] Race restarted");
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
                    };
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
                    console.log("[server] Reloaded definitions");
                }
            }
            else if (msg.type === "submit_command") {
                const payload = msg.payload;
                const commandError = host.submitCommand(payload.entryId, payload.command);
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
            else if (msg.type === "start_round") {
                if (!host.getMetaState().setupComplete) {
                    ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: "Complete team setup first" })));
                }
                else {
                    const fleetErr = host.validateFleetForRace();
                    if (fleetErr) {
                        ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: fleetErr })));
                    }
                    else {
                        const startErr = host.startRound();
                        if (startErr) {
                            ws.send(JSON.stringify((0, ws_protocol_1.serverMessage)("error", { message: startErr })));
                        }
                        else {
                            broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
                            broadcast(clients, (0, ws_protocol_1.serverMessage)("track_geometry", host.getTrackGeometry()));
                            const payload = {
                                raceTime: host.getRaceTime(),
                                snapshots: host.getSnapshots(),
                            };
                            broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
                            console.log("[server] Round started");
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
            else if (msg.type === "save_car_build") {
                const payload = msg.payload;
                const result = host.saveCarBuild(payload);
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
            else if (msg.type === "new_game") {
                const meta = host.newGame();
                broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", meta));
                broadcast(clients, (0, ws_protocol_1.serverMessage)("session_init", host.getSessionInit()));
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
        });
        ws.on("close", () => {
            clients.delete(ws);
            console.log(`[server] Client disconnected (${clients.size} total)`);
        });
    });
    host.start((raceTime, snapshots) => {
        const payload = { raceTime, snapshots };
        broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
    }, (events) => {
        const payload = { events };
        broadcast(clients, (0, ws_protocol_1.serverMessage)("events", payload));
    }, (raceTime, results) => {
        const meta = host.getMetaState();
        const player = meta.playerEntryId;
        const playerResult = results.find((r) => r.entryId === player);
        const event = meta.calendar.find((e) => e.round === meta.currentRound);
        const scoring = event?.eventType !== "test" && event?.format !== "test";
        const finances = playerResult && event
            ? (0, economy_1.computeRaceFinances)(playerResult.position, playerResult.classId, event.format, meta.sponsors ?? [], meta.staff, { scoring })
            : undefined;
        let updatedMeta = meta;
        if (playerResult && event && !event.completed) {
            updatedMeta = host.completeRound(playerResult.position, playerResult.classId);
        }
        const payload = {
            raceTime,
            results,
            championshipPoints: finances?.championshipPoints ?? 0,
            finances,
        };
        broadcast(clients, (0, ws_protocol_1.serverMessage)("race_complete", payload));
        if (updatedMeta !== meta) {
            broadcast(clients, (0, ws_protocol_1.serverMessage)("meta_state", updatedMeta));
        }
        console.log("[server] Race complete");
    });
    process.on("SIGINT", () => {
        host.stop();
        wss.close();
        process.exit(0);
    });
}
main();
