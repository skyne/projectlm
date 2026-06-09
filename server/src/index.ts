import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { ClientSessionManager } from "./client_sessions";
import { computeRaceFinances } from "./game/economy";
import { fleetEntryMode } from "./game/experimental_entry";
import {
  nextWeekendSession,
  sortTimingResults,
  type WeekendSessionType,
} from "./game/weekend_sessions";
import { EngineerService } from "./llm/engineer_service";
import { GarageEngineerService } from "./llm/garage_engineer_service";
import { SimHost } from "./sim_host";
import {
  parseClientMessage,
  serverMessage,
  type AskEngineerPayload,
  type AskGarageEngineerPayload,
  type BuyCarPayload,
  type CarBuildPayload,
  type ClientAssignmentPayload,
  type CreateTeamPayload,
  type TeamCreationDraftPayload,
  type EventsPayload,
  type CompleteRoundPayload,
  type DropSponsorPayload,
  type HireStaffPayload,
  type JoinSessionPayload,
  type RaceCompletePayload,
  type RdInvestPayload,
  type SignSponsorPayload,
  type SaveTeamColorsPayload,
  type SaveTrackSetupPayload,
  type SessionInitPayload,
  type StartRoundPayload,
  type GetTrackPreviewPayload,
  type DebugRaceControlPayload,
  type SubmitCommandPayload,
  type TickPayload,
  type TrackGeometryPayload,
  type TrackPreviewPayload,
} from "./ws_protocol";
import { listSessionLogs, readSessionLog } from "./session_log";

/** Default 9785 — 8765 is commonly used by other local tools (e.g. clipboard sync). */
const PORT = Number(
  process.env.PROJECTLM_WS_PORT ?? process.env.PORT ?? 9785,
);

function broadcast(clients: Set<WebSocket>, data: unknown): void {
  const text = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  }
}

function sendJoinRequired(ws: WebSocket): void {
  ws.send(
    JSON.stringify(
      serverMessage("error", {
        message: "Send join_session before other commands",
        code: "join_required",
      }),
    ),
  );
}

function sendForbidden(ws: WebSocket): void {
  ws.send(
    JSON.stringify(
      serverMessage("error", {
        message: "Not permitted for your role",
        code: "forbidden",
      }),
    ),
  );
}

function startDevSessionLogApi(repoRoot: string, port: number): void {
  createServer((req, res) => {
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
      res.end(JSON.stringify({ logs: listSessionLogs(repoRoot) }));
      return;
    }
    const match = url.pathname.match(/^\/dev\/session-logs\/([^/]+)$/);
    if (match) {
      const log = readSessionLog(repoRoot, decodeURIComponent(match[1]));
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
    console.log(
      `[server] Dev session log API http://127.0.0.1:${port}/dev/session-logs`,
    );
  });
}

function main(): void {
  const host = new SimHost();
  const engineer = new EngineerService();
  const garageEngineer = new GarageEngineerService();
  const sessions = new ClientSessionManager();
  const wss = new WebSocketServer({ port: PORT });
  wss.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[server] Port ${PORT} is already in use. Stop the other process, or run: PORT=<free-port> npm run dev`,
      );
    }
    process.exit(1);
  });
  const clients = new Set<WebSocket>();
  let trackSent = false;

  console.log(`[server] WebSocket listening on ws://localhost:${PORT}`);

  function broadcastRoster(): void {
    broadcast(clients, serverMessage("roster_update", sessions.roster()));
  }

  function deliverAssignment(
    ws: WebSocket,
    assignment: ClientAssignmentPayload,
  ): void {
    ws.send(JSON.stringify(serverMessage("client_assignment", assignment)));
    broadcastRoster();
  }

  function sendBootstrap(ws: WebSocket): SessionInitPayload {
    const sessionInit: SessionInitPayload = host.getSessionInit();
    const meta = host.getMetaState();
    ws.send(JSON.stringify(serverMessage("session_init", sessionInit)));
    ws.send(JSON.stringify(serverMessage("meta_state", meta)));
    let sessionActive = sessionInit.raceActive;
    if (meta.seasonComplete && sessionInit.raceActive) {
      host.endSession();
      ws.send(JSON.stringify(serverMessage("session_init", host.getSessionInit())));
      sessionActive = false;
    } else if (sessionInit.raceActive && sessionInit.raceComplete) {
      const lastComplete = host.getLastRaceComplete();
      if (lastComplete) {
        ws.send(JSON.stringify(serverMessage("race_complete", lastComplete)));
      }
    }
    if (sessionActive) {
      const catchUp: TickPayload = {
        raceTime: host.getRaceTime(),
        snapshots: host.getSnapshots(),
        raceControl: host.getRaceControl(),
      };
      ws.send(JSON.stringify(serverMessage("tick", catchUp)));
    }
    ws.send(JSON.stringify(serverMessage("game_catalog", host.getGameCatalog())));
    void engineer.getStatus().then((status) => {
      ws.send(JSON.stringify(serverMessage("engineer_status", status)));
    });

    if (!trackSent) {
      const geometry: TrackGeometryPayload = host.getTrackGeometry();
      broadcast(clients, serverMessage("track_geometry", geometry));
      trackSent = true;
    } else {
      const geometry: TrackGeometryPayload = host.getTrackGeometry();
      ws.send(JSON.stringify(serverMessage("track_geometry", geometry)));
    }

    return sessionInit;
  }

  function afterSessionChange(): void {
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
      const msg = parseClientMessage(raw);
      if (!msg) {
        ws.send(
          JSON.stringify(
            serverMessage("error", {
              message: "Invalid client message",
              code: "invalid_message",
            }),
          ),
        );
        return;
      }

      if (msg.type === "join_session") {
        const payload = msg.payload as JoinSessionPayload;
        const result = sessions.join(ws, payload, host.getSessionInit());
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
          return;
        }
        deliverAssignment(ws, result);
        console.log(
          `[server] ${result.displayName} joined as ${result.role} (${result.clientId})`,
        );
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
          broadcast(clients, serverMessage("meta_state", host.getMetaState()));
          const payload: TickPayload = {
            raceTime: host.getRaceTime(),
            snapshots: host.getSnapshots(),
            raceControl: host.getRaceControl(),
          };
          broadcast(clients, serverMessage("tick", payload));
          afterSessionChange();
          console.log("[server] Race restarted");
        }
      } else if (msg.type === "end_session") {
        if (!host.endSession()) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Failed to end session" }),
            ),
          );
        } else {
          broadcast(clients, serverMessage("session_init", host.getSessionInit()));
          afterSessionChange();
          console.log("[server] Session ended");
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
          broadcast(clients, serverMessage("meta_state", host.getMetaState()));
          broadcast(
            clients,
            serverMessage("track_geometry", host.getTrackGeometry()),
          );
          const payload: TickPayload = {
            raceTime: host.getRaceTime(),
            snapshots: host.getSnapshots(),
            raceControl: host.getRaceControl(),
          };
          broadcast(clients, serverMessage("tick", payload));
          afterSessionChange();
          console.log("[server] Reloaded definitions");
        }
      } else if (msg.type === "submit_command") {
        const payload = msg.payload as SubmitCommandPayload;
        const clientSession = sessions.get(ws);
        if (
          clientSession &&
          !sessions.canSubmitForEntry(ws, payload.entryId)
        ) {
          ws.send(
            JSON.stringify(
              serverMessage("error", {
                message: "Not authorized for this car",
                code: "forbidden",
              }),
            ),
          );
          return;
        }
        const commandError = host.submitCommand(
          payload.entryId,
          payload.command,
          clientSession
            ? {
                displayName: clientSession.displayName,
                clientId: clientSession.clientId,
              }
            : undefined,
        );
        if (commandError) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: commandError })),
          );
        }
      } else if (msg.type === "update_car_briefing") {
        const payload = msg.payload as import("./ws_protocol").UpdateCarBriefingPayload;
        const clientSession = sessions.get(ws);
        if (
          clientSession &&
          !sessions.canSubmitForEntry(ws, payload.entryId)
        ) {
          ws.send(
            JSON.stringify(
              serverMessage("error", {
                message: "Not authorized for this car",
                code: "forbidden",
              }),
            ),
          );
          return;
        }
        const result = host.updateCarBriefing(payload);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("session_init", host.getSessionInit()));
        }
      } else if (msg.type === "debug_race_control") {
        if (process.env.DEV_TOOLS === "0") {
          ws.send(
            JSON.stringify(
              serverMessage("error", {
                message: "Debug race control disabled (DEV_TOOLS=0)",
              }),
            ),
          );
          return;
        }
        const payload = msg.payload as DebugRaceControlPayload;
        const debugError = host.debugRaceControl(payload);
        if (debugError) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: debugError })),
          );
        }
      } else if (msg.type === "hire_staff") {
        const payload = msg.payload as HireStaffPayload;
        const meta = host.hireStaff(payload.role, payload.name, payload.skill);
        broadcast(clients, serverMessage("meta_state", meta));
      } else if (msg.type === "rd_invest") {
        const payload = msg.payload as RdInvestPayload;
        const meta = host.investRd(payload.partId, payload.points);
        broadcast(clients, serverMessage("meta_state", meta));
      } else if (msg.type === "complete_round") {
        const payload = msg.payload as CompleteRoundPayload;
        const position = Number(payload.position ?? 0);
        const classId = String(payload.classId ?? "");
        const meta = host.completeRound(position, classId);
        broadcast(clients, serverMessage("meta_state", meta));
      } else if (msg.type === "sign_sponsor") {
        const payload = msg.payload as SignSponsorPayload;
        const result = host.signSponsor(payload.offerId ?? "");
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "drop_sponsor") {
        const payload = msg.payload as DropSponsorPayload;
        const result = host.dropSponsor(payload.offerId ?? "");
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "continue_private_test") {
        if (!host.getMetaState().setupComplete) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Complete team setup first" }),
            ),
          );
        } else {
          const startErr = host.continuePrivateTest();
          if (startErr) {
            ws.send(
              JSON.stringify(serverMessage("error", { message: startErr })),
            );
          } else {
            broadcast(clients, serverMessage("session_init", host.getSessionInit()));
            broadcast(clients, serverMessage("meta_state", host.getMetaState()));
          }
        }
      } else if (msg.type === "start_private_test") {
        const prep = (msg.payload ?? {}) as import("./ws_protocol").StartPrivateTestPayload;
        if (!host.getMetaState().setupComplete) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Complete team setup first" }),
            ),
          );
        } else {
          const fleetErr = host.validateFleetForRace();
          if (fleetErr) {
            ws.send(
              JSON.stringify(serverMessage("error", { message: fleetErr })),
            );
          } else {
            const startErr = host.startPrivateTest(prep);
            if (startErr) {
              ws.send(
                JSON.stringify(serverMessage("error", { message: startErr })),
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
                raceControl: host.getRaceControl(),
              };
              broadcast(clients, serverMessage("tick", payload));
              afterSessionChange();
              console.log("[server] Private test started");
            }
          }
        }
      } else if (
        msg.type === "start_round" ||
        msg.type === "continue_weekend_session"
      ) {
        const prep = (msg.payload ?? {}) as StartRoundPayload;
        if (!host.getMetaState().setupComplete) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Complete team setup first" }),
            ),
          );
        } else {
          const fleetErr = host.validateFleetForRace();
          if (fleetErr) {
            ws.send(
              JSON.stringify(serverMessage("error", { message: fleetErr })),
            );
          } else {
            const startErr = host.startRound(prep);
            if (startErr) {
              ws.send(
                JSON.stringify(serverMessage("error", { message: startErr })),
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
                raceControl: host.getRaceControl(),
              };
              broadcast(clients, serverMessage("tick", payload));
              afterSessionChange();
              const label =
                msg.type === "continue_weekend_session"
                  ? `Weekend session (${host.getWeekendSessionType()})`
                  : "Round";
              console.log(`[server] ${label} started`);
            }
          }
        }
      } else if (msg.type === "create_team") {
        const payload = msg.payload as CreateTeamPayload;
        const result = host.createTeam(payload);
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Team created:", result.teamName);
        }
      } else if (msg.type === "save_team_creation_draft") {
        const draft = msg.payload as TeamCreationDraftPayload;
        const result = host.saveTeamCreationDraft(draft);
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          ws.send(JSON.stringify(serverMessage("meta_state", result)));
        }
      } else if (msg.type === "repair_car_condition") {
        const payload = msg.payload as import("./ws_protocol").RepairCarConditionPayload;
        const result = host.repairCarCondition(payload.carId, {
          parts: payload.parts,
          rebuild: payload.rebuild,
          reveal: payload.reveal,
        });
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "save_car_build") {
        const raw = msg.payload as CarBuildPayload | { build: CarBuildPayload; carId?: string };
        const carId =
          raw && typeof raw === "object" && "build" in raw && raw.build
            ? raw.carId
            : undefined;
        const build =
          raw && typeof raw === "object" && "build" in raw && raw.build
            ? raw.build
            : (raw as CarBuildPayload);
        const result = host.saveCarBuild(build, carId);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Car build saved");
        }
      } else if (msg.type === "save_driver_roster") {
        const payload = msg.payload as {
          roster?: import("./ws_protocol").DriverProfilePayload[];
          assignments?: Record<string, string[]>;
        };
        const result = host.saveDriverRoster(
          payload.roster ?? [],
          payload.assignments,
        );
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Driver roster saved");
        }
      } else if (msg.type === "refresh_driver_market") {
        const result = host.refreshDriverMarket();
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Driver market refreshed");
        }
      } else if (msg.type === "sign_driver_contract") {
        const listingId =
          (msg.payload as { listingId?: string }).listingId ?? "";
        const result = host.signDriverContract(listingId);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Driver contract signed");
        }
      } else if (msg.type === "refresh_staff_market") {
        const result = host.refreshStaffMarket();
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Staff market refreshed");
        }
      } else if (msg.type === "sign_staff_contract") {
        const payload = msg.payload as {
          listingId?: string;
          carId?: string;
        };
        const result = host.signStaffContract(
          payload.listingId ?? "",
          payload.carId,
        );
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Staff contract signed");
        }
      } else if (msg.type === "start_negotiation") {
        const payload = msg.payload as {
          kind?: import("./ws_protocol").NegotiationKind;
          subjectRef?: string;
        };
        const result = host.startNegotiation(
          payload.kind ?? "driver_employment",
          payload.subjectRef ?? "",
        );
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "submit_negotiation_offer") {
        const payload = msg.payload as import("./ws_protocol").SubmitNegotiationOfferPayload;
        const result = host.submitNegotiationOffer(
          payload.negotiationId ?? "",
          payload.terms ?? {},
        );
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "accept_negotiation") {
        const negotiationId =
          (msg.payload as { negotiationId?: string }).negotiationId ?? "";
        const result = host.acceptNegotiation(negotiationId);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "withdraw_negotiation") {
        const negotiationId =
          (msg.payload as { negotiationId?: string }).negotiationId ?? "";
        const result = host.withdrawNegotiation(negotiationId);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "save_team_colors") {
        const payload = msg.payload as SaveTeamColorsPayload;
        const meta = host.saveTeamColors(payload);
        if (!meta) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Invalid team colors" }),
            ),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", meta));
          console.log("[server] Team livery saved");
        }
      } else if (msg.type === "buy_car") {
        const payload = msg.payload as BuyCarPayload;
        const result = host.buyCar(payload);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] Car purchased");
        }
      } else if (msg.type === "set_active_car") {
        const carId = (msg.payload as { carId?: string }).carId ?? "";
        const meta = host.setActiveCar(carId);
        if (!meta) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Unknown car" }),
            ),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", meta));
        }
      } else if (msg.type === "set_player_entry") {
        const carId = (msg.payload as { carId?: string }).carId ?? "";
        const meta = host.setPlayerEntry(carId);
        if (!meta) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Unknown car" }),
            ),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", meta));
        }
      } else if (msg.type === "remove_car") {
        const carId = (msg.payload as { carId?: string }).carId ?? "";
        const result = host.removeCar(carId);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "ask_garage_engineer") {
        const payload = msg.payload as AskGarageEngineerPayload;
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
        ws.send(JSON.stringify(serverMessage("garage_advice", advice)));
      } else if (msg.type === "get_engineer_status") {
        const status = await engineer.getStatus();
        ws.send(JSON.stringify(serverMessage("engineer_status", status)));
      } else if (msg.type === "ask_engineer") {
        const payload = msg.payload as AskEngineerPayload;
        const entryId = String(payload.entryId ?? "").trim();
        const snap = host
          .getSnapshots()
          .find((row) => row.entryId === entryId);
        if (!snap) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Unknown entry for engineer" }),
            ),
          );
        } else {
          const meta = host.getMetaState();
          const engineerSkill =
            meta.staff?.find((s) => s.role === "engineer")?.skill ?? 75;
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
          ws.send(JSON.stringify(serverMessage("engineer_advice", advice)));
        }
      } else if (msg.type === "get_track_preview") {
        const trackId = String(
          (msg.payload as GetTrackPreviewPayload).trackId ?? "",
        ).trim();
        const geometry = host.getTrackPreview(trackId);
        if (!geometry) {
          ws.send(
            JSON.stringify(
              serverMessage("error", {
                message: `Unknown track: ${trackId}`,
              }),
            ),
          );
        } else {
          const payload: TrackPreviewPayload = { trackId, geometry };
          ws.send(JSON.stringify(serverMessage("track_preview", payload)));
        }
      } else if (msg.type === "finalize_season") {
        const result = host.finalizeSeasonIfReady();
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "start_next_season") {
        const result = host.startNextSeason();
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          console.log("[server] New season started");
        }
      } else if (msg.type === "restart_season") {
        const result = host.restartSeason();
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
          broadcast(clients, serverMessage("session_init", host.getSessionInit()));
          afterSessionChange();
          console.log("[server] Season restarted");
        }
      } else if (msg.type === "new_game") {
        const meta = host.newGame();
        broadcast(clients, serverMessage("meta_state", meta));
        broadcast(clients, serverMessage("session_init", host.getSessionInit()));
        afterSessionChange();
        console.log("[server] New game started");
      } else if (msg.type === "set_weekend_tire_compound") {
        const compound = String(
          (msg.payload as { compound?: string }).compound ?? "Medium",
        );
        const result = host.setWeekendTireCompound(compound);
        if ("error" in result) {
          ws.send(
            JSON.stringify(serverMessage("error", { message: result.error })),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "save_track_setup") {
        const body = msg.payload as SaveTrackSetupPayload;
        const trackId = String(body.trackId ?? "").trim();
        const preset = body.preset;
        if (!trackId || !preset) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "trackId and preset required" }),
            ),
          );
        } else {
          const result = host.saveTrackSetupPreset(trackId, {
            ...preset,
            trackId,
          });
          if ("error" in result) {
            ws.send(
              JSON.stringify(serverMessage("error", { message: result.error })),
            );
          } else {
            broadcast(clients, serverMessage("meta_state", result));
          }
        }
      }
    });

    ws.on("close", () => {
      const session = sessions.detach(ws);
      clients.delete(ws);
      if (session) {
        broadcastRoster();
        console.log(
          `[server] ${session.displayName} disconnected (${clients.size} total)`,
        );
      } else {
        console.log(`[server] Client disconnected (${clients.size} total)`);
      }
    });
  });

  host.start(
    (raceTime, snapshots) => {
      const payload: TickPayload = {
        raceTime,
        snapshots,
        raceControl: host.getRaceControl(),
      };
      broadcast(clients, serverMessage("tick", payload));
    },
    (events) => {
      const payload: EventsPayload = { events };
      broadcast(clients, serverMessage("events", payload));
    },
    (raceTime, results, weekendSessionType, sessionLogId) => {
      const sessionKind = host.getSessionKind();
      const meta = host.getMetaState();
      const session = host.getSessionInit();
      const managedIds =
        session.managedEntryIds?.length
          ? session.managedEntryIds
          : [session.playerEntryId ?? meta.playerEntryId];
      const managedResults = results.filter((r) =>
        managedIds.includes(r.entryId),
      );
      const classifiedManaged = managedResults.filter((r) => !r.retired);
      const playerResult =
        classifiedManaged.length > 0
          ? classifiedManaged.reduce((best, r) =>
              r.position < best.position ? r : best,
            )
          : managedResults.length > 0
            ? managedResults.reduce((best, r) =>
                r.position < best.position ? r : best,
              )
            : undefined;
      const event = meta.calendar.find((e) => e.round === meta.currentRound);
      const scoring =
        event?.eventType !== "test" && event?.format !== "test";
      const isRaceSession = weekendSessionType === "race";

      const fleetById = new Map((meta.fleet ?? []).map((c) => [c.id, c]));
      const entryFleetMap = host.getFleetEntryMap();
      const resolveEntryMode = (entryId: string) => {
        const fleetCarId = entryFleetMap.get(entryId);
        const car = fleetCarId ? fleetById.get(fleetCarId) : undefined;
        return car ? fleetEntryMode(car) : undefined;
      };

      const playerCarId =
        meta.playerCarId ?? meta.activeCarId ?? meta.fleet?.[0]?.id;
      const primaryResult =
        results.find((r) => entryFleetMap.get(r.entryId) === playerCarId) ??
        playerResult;

      const finances =
        isRaceSession && primaryResult && event
          ? computeRaceFinances(
              primaryResult.position,
              primaryResult.classId,
              event.format,
              meta.sponsors ?? [],
              meta.staff,
              {
                scoring,
                entryMode: resolveEntryMode(primaryResult.entryId),
                racePosition: primaryResult.position,
                employmentContracts: meta.employmentContracts,
                teamName: meta.teamName,
              },
            )
          : undefined;

      let updatedMeta = meta;
      let progressionSummary: import("./ws_protocol").ProgressionSummaryPayload | undefined;

      let nextJointTestSessionIndex: number | null = null;
      let jointTestSessionCount: number | undefined;

      if (sessionKind === "private_test") {
        const completion = host.completePrivateTest();
        if (completion) {
          updatedMeta = completion.meta;
          progressionSummary = completion.summary;
          nextJointTestSessionIndex = completion.nextJointTestSessionIndex;
          jointTestSessionCount = completion.jointTestSessionCount;
        }
      } else if (isRaceSession && primaryResult && event && !event.completed) {
        updatedMeta = host.completeRound(
          primaryResult.position,
          primaryResult.classId,
          results.map((r) => ({
            entryId: r.entryId,
            teamName: r.teamName,
            carNumber: r.carNumber,
            classId: r.classId,
            position: r.position,
            driverName: r.driverName,
            entryMode: resolveEntryMode(r.entryId),
          })),
        );
      } else if (!isRaceSession) {
        updatedMeta = host.completeWeekendSession(weekendSessionType, results);
      }

      const completedSessions =
        updatedMeta.weekendProgress?.round === updatedMeta.currentRound
          ? updatedMeta.weekendProgress.completedSessions
          : isRaceSession
            ? []
            : [weekendSessionType];
      const nextSession: WeekendSessionType | null =
        sessionKind === "private_test"
          ? null
          : isRaceSession
            ? null
            : nextWeekendSession(completedSessions);

      const finalResults =
        sessionKind === "private_test" || !isRaceSession
          ? sortTimingResults(results)
          : results;

      const payload: RaceCompletePayload = {
        raceTime,
        results: finalResults,
        championshipPoints: finances?.championshipPoints ?? 0,
        finances: isRaceSession ? finances : undefined,
        weekendSessionType,
        sessionKind,
        progressionSummary,
        nextWeekendSession: nextSession,
        nextJointTestSessionIndex,
        jointTestSessionCount,
        sessionLogId,
      };
      host.setLastRaceComplete(payload);
      if (updatedMeta !== meta) {
        broadcast(clients, serverMessage("meta_state", updatedMeta));
      }
      broadcast(clients, serverMessage("race_complete", payload));
      if (updatedMeta.seasonComplete && sessionKind !== "private_test") {
        host.endSession();
        broadcast(clients, serverMessage("session_init", host.getSessionInit()));
      }
      const completeLabel =
        sessionKind === "private_test"
          ? "Private test"
          : `${weekendSessionType} session`;
      console.log(`[server] ${completeLabel} complete`);
    },
  );

  if (process.env.DEV_TOOLS !== "0") {
    startDevSessionLogApi(
      host.repoRoot,
      Number(process.env.DEV_HTTP_PORT ?? PORT + 1),
    );
  }

  process.on("SIGINT", () => {
    host.stop();
    wss.close();
    process.exit(0);
  });
}

main();
