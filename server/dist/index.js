"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
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
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("track_geometry", host.getTrackGeometry()));
                    const payload = {
                        raceTime: host.getRaceTime(),
                        snapshots: host.getSnapshots(),
                    };
                    broadcast(clients, (0, ws_protocol_1.serverMessage)("tick", payload));
                    console.log("[server] Reloaded definitions");
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
        const payload = { raceTime, results };
        broadcast(clients, (0, ws_protocol_1.serverMessage)("race_complete", payload));
        console.log("[server] Race complete");
    });
    process.on("SIGINT", () => {
        host.stop();
        wss.close();
        process.exit(0);
    });
}
main();
