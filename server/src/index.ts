import { WebSocketServer, WebSocket } from "ws";
import { SimHost } from "./sim_host";
import { MetaStateManager } from "./meta_state";
import { buildRaceForSession } from "./game/race_builder";
import {
  parseClientMessage,
  serverMessage,
  type CarSessionSetupPayload,
  type EventsPayload,
  type MetaStatePayload,
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

function toMetaPayload(meta: MetaStateManager): MetaStatePayload | null {
  const state = meta.getState();
  if (!state) return null;
  return {
    teamName: state.teamName,
    currentRound: state.currentRound,
    weekendSession: state.weekendSession,
    weekendTireCompound: state.weekendTireCompound,
    playerCarId: state.playerCarId,
    activeCarId: state.activeCarId,
    calendar: state.calendar,
    fleet: state.fleet.map((car) => ({
      id: car.id,
      carNumber: car.carNumber,
      classId: car.classId,
      setup: car.setup!,
    })),
    staff: state.staff,
    budget: state.budget ?? 0,
    rdPoints: state.rdPoints ?? 0,
    lastRacePayout: state.lastRacePayout ?? 0,
    unlockedParts: state.unlockedParts,
  };
}

function extractQualiResults(
  snapshots: ReturnType<SimHost["getSnapshots"]>,
): Array<{ entryId: string; bestLapTime: number }> {
  return snapshots
    .filter((s) => s.bestLapTime > 0)
    .map((s) => ({ entryId: s.entryId, bestLapTime: s.bestLapTime }))
    .sort((a, b) => a.bestLapTime - b.bestLapTime);
}

function main(): void {
  const host = new SimHost({ raceConfigPath: "configs/race_config_web.txt" });
  const meta = new MetaStateManager(host.repoRoot);
  const hasGame = meta.load();
  if (hasGame) {
    const state = meta.getState();
    if (state?.playerEntryId) host.setPlayerEntryId(state.playerEntryId);
  }

  const wss = new WebSocketServer({ port: PORT });
  const clients = new Set<WebSocket>();
  let trackSent = false;

  console.log(
    `[server] WebSocket listening on ws://localhost:${PORT}` +
      (hasGame ? " (career mode)" : " (demo mode)"),
  );

  const sendMeta = (ws?: WebSocket) => {
    const payload = toMetaPayload(meta);
    if (!payload) return;
    const msg = serverMessage("meta_state", payload);
    if (ws) ws.send(JSON.stringify(msg));
    else broadcast(clients, msg);
  };

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[server] Client connected (${clients.size} total)`);

    if (hasGame) sendMeta(ws);
    else {
      const sessionInit: SessionInitPayload = host.getSessionInit();
      ws.send(JSON.stringify(serverMessage("session_init", sessionInit)));
    }

    if (!trackSent) {
      const geometry: TrackGeometryPayload = host.getTrackGeometry();
      broadcast(clients, serverMessage("track_geometry", geometry));
      trackSent = true;
    } else {
      ws.send(
        JSON.stringify(
          serverMessage("track_geometry", host.getTrackGeometry()),
        ),
      );
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

      if (msg.type === "get_meta") {
        sendMeta(ws);
        return;
      }

      if (msg.type === "save_car_setup" && hasGame) {
        const body = msg.payload as {
          carId?: string;
          setup?: CarSessionSetupPayload;
        };
        if (body.carId && body.setup) {
          meta.setCarSetup(body.carId, body.setup);
          sendMeta();
        }
        return;
      }

      if (msg.type === "set_active_car" && hasGame) {
        const carId = (msg.payload as { carId?: string }).carId;
        if (carId) {
          meta.setActiveCar(carId);
          sendMeta();
        }
        return;
      }

      if (msg.type === "start_session" && hasGame) {
        const state = meta.getState();
        const event = meta.currentEvent();
        if (!state || !event) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "No calendar event for round" }),
            ),
          );
          return;
        }

        const carSetups = Object.fromEntries(
          state.fleet.map((c) => [c.id, c.setup!]),
        );
        const built = buildRaceForSession(
          host.repoRoot,
          event,
          state.weekendSession,
          state.fleet,
          state.teamName,
          state.playerEntryId,
          state.weekendTireCompound,
          carSetups,
          state.weekendSession === "race" ? state.qualiResults : [],
        );

        const ok = host.startRound(built.raceConfigPath, {
          sessionType: built.sessionType,
          eventName: built.eventName,
          targetDurationMinutes: built.targetDurationMinutes,
          startPaused: true,
        });

        if (!ok) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Failed to start session" }),
            ),
          );
          return;
        }

        trackSent = true;
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
        return;
      }

      if (msg.type === "advance_weekend" && hasGame) {
        const state = meta.getState();
        if (state?.weekendSession === "qualifying") {
          meta.recordQualiResults(extractQualiResults(host.getSnapshots()));
        }
        const next = meta.advanceWeekendSession();
        if (!next) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Weekend already at race" }),
            ),
          );
        } else {
          sendMeta();
        }
        return;
      }

      if (msg.type === "complete_round" && hasGame) {
        meta.completeRound();
        sendMeta();
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
          broadcast(
            clients,
            serverMessage("tick", {
              raceTime: host.getRaceTime(),
              snapshots: host.getSnapshots(),
            }),
          );
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
          broadcast(
            clients,
            serverMessage("tick", {
              raceTime: host.getRaceTime(),
              snapshots: host.getSnapshots(),
            }),
          );
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  if (!hasGame) {
    host.start(
      (raceTime, snapshots, raceControl) => {
        broadcast(
          clients,
          serverMessage("tick", { raceTime, snapshots, raceControl }),
        );
      },
      (events) => {
        broadcast(clients, serverMessage("events", { events }));
      },
      (raceTime, results) => {
        broadcast(
          clients,
          serverMessage("race_complete", { raceTime, results }),
        );
      },
    );
  } else {
    host.pause();
    host.start(
      (raceTime, snapshots, raceControl) => {
        broadcast(
          clients,
          serverMessage("tick", { raceTime, snapshots, raceControl }),
        );
      },
      (events) => {
        broadcast(clients, serverMessage("events", { events }));
      },
      (raceTime, results) => {
        const state = meta.getState();
        if (state?.weekendSession === "qualifying") {
          meta.recordQualiResults(extractQualiResults(host.getSnapshots()));
        }

        broadcast(
          clients,
          serverMessage("race_complete", { raceTime, results }),
        );

        if (state?.weekendSession === "race") {
          const snapshots = host.getSnapshots();
          meta.recordRaceOutcome(
            state.playerEntryId,
            snapshots.map((s) => ({
              entryId: s.entryId,
              position: s.racePosition,
              retired: s.retired,
            })),
          );
          meta.completeRound();
          sendMeta();
        } else {
          const next = meta.advanceWeekendSession();
          if (next) sendMeta();
        }
      },
    );
  }

  process.on("SIGINT", () => {
    host.stop();
    wss.close();
    process.exit(0);
  });
}

main();
