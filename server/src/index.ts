import { WebSocketServer, WebSocket } from "ws";
import { SimHost } from "./sim_host";
import {
  parseClientMessage,
  serverMessage,
  type EventsPayload,
  type RaceCompletePayload,
  type SessionInitPayload,
  type TickPayload,
  type TrackGeometryPayload,
} from "./ws_protocol";

const PORT = Number(process.env.PORT ?? 8765);

function broadcast(clients: Set<WebSocket>, data: unknown): void {
  const text = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  }
}

function main(): void {
  const host = new SimHost();
  const wss = new WebSocketServer({ port: PORT });
  const clients = new Set<WebSocket>();
  let trackSent = false;

  console.log(`[server] WebSocket listening on ws://localhost:${PORT}`);

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[server] Client connected (${clients.size} total)`);

    const sessionInit: SessionInitPayload = host.getSessionInit();
    ws.send(JSON.stringify(serverMessage("session_init", sessionInit)));

    if (!trackSent) {
      const geometry: TrackGeometryPayload = host.getTrackGeometry();
      broadcast(clients, serverMessage("track_geometry", geometry));
      trackSent = true;
    } else {
      const geometry: TrackGeometryPayload = host.getTrackGeometry();
      ws.send(JSON.stringify(serverMessage("track_geometry", geometry)));
    }

    ws.on("message", (data) => {
      const raw = data.toString();
      const msg = parseClientMessage(raw);
      if (!msg) {
        ws.send(
          JSON.stringify(
            serverMessage("error", { message: "Invalid client message" }),
          ),
        );
        return;
      }

      if (msg.type === "set_time_scale") {
        const scale = Number((msg.payload as { timeScale?: number }).timeScale ?? 1);
        host.setTimeScale(scale);
      } else if (msg.type === "pause") {
        host.pause();
      } else if (msg.type === "resume") {
        host.resume();
      } else if (msg.type === "restart_race") {
        if (!host.restartRace()) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Failed to restart race" }),
            ),
          );
        } else {
          const payload: TickPayload = {
            raceTime: host.getRaceTime(),
            snapshots: host.getSnapshots(),
          };
          broadcast(clients, serverMessage("tick", payload));
          console.log("[server] Race restarted");
        }
      } else if (msg.type === "reload_definitions") {
        if (!host.reloadDefinitions()) {
          ws.send(
            JSON.stringify(
              serverMessage("error", {
                message: "Failed to reload track and car definitions",
              }),
            ),
          );
        } else {
          broadcast(clients, serverMessage("session_init", host.getSessionInit()));
          broadcast(
            clients,
            serverMessage("track_geometry", host.getTrackGeometry()),
          );
          const payload: TickPayload = {
            raceTime: host.getRaceTime(),
            snapshots: host.getSnapshots(),
          };
          broadcast(clients, serverMessage("tick", payload));
          console.log("[server] Reloaded definitions");
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[server] Client disconnected (${clients.size} total)`);
    });
  });

  host.start(
    (raceTime, snapshots) => {
      const payload: TickPayload = { raceTime, snapshots };
      broadcast(clients, serverMessage("tick", payload));
    },
    (events) => {
      const payload: EventsPayload = { events };
      broadcast(clients, serverMessage("events", payload));
    },
    (raceTime, results) => {
      const payload: RaceCompletePayload = { raceTime, results };
      broadcast(clients, serverMessage("race_complete", payload));
      console.log("[server] Race complete");
    },
  );

  process.on("SIGINT", () => {
    host.stop();
    wss.close();
    process.exit(0);
  });
}

main();
