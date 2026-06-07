import { WebSocketServer, WebSocket } from "ws";
import { ClientSessionManager } from "./client_sessions";
import { computeRaceFinances } from "./game/economy";
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
  type GetTrackPreviewPayload,
  type SubmitCommandPayload,
  type TickPayload,
  type TrackGeometryPayload,
  type TrackPreviewPayload,
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

function main(): void {
  const host = new SimHost();
  const engineer = new EngineerService();
  const garageEngineer = new GarageEngineerService();
  const sessions = new ClientSessionManager();
  const wss = new WebSocketServer({ port: PORT });
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
    ws.send(JSON.stringify(serverMessage("session_init", sessionInit)));
    if (sessionInit.raceActive) {
      const catchUp: TickPayload = {
        raceTime: host.getRaceTime(),
        snapshots: host.getSnapshots(),
        raceControl: host.getRaceControl(),
      };
      ws.send(JSON.stringify(serverMessage("tick", catchUp)));
    }
    ws.send(JSON.stringify(serverMessage("meta_state", host.getMetaState())));
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
      } else if (msg.type === "start_round") {
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
            const startErr = host.startRound(
              msg.payload as import("./ws_protocol").StartRoundPayload,
            );
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
              console.log("[server] Round started");
            }
          }
        }
      } else if (msg.type === "create_team") {
        const payload = msg.payload as CreateTeamPayload;
        const meta = host.createTeam(payload);
        if (!meta) {
          ws.send(
            JSON.stringify(
              serverMessage("error", { message: "Invalid team setup" }),
            ),
          );
        } else {
          broadcast(clients, serverMessage("meta_state", meta));
          console.log("[server] Team created:", meta.teamName);
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
        });
        if ("error" in result) {
          ws.send(JSON.stringify(serverMessage("error", { message: result.error })));
        } else {
          broadcast(clients, serverMessage("meta_state", result));
        }
      } else if (msg.type === "save_car_build") {
        const payload = msg.payload as CarBuildPayload;
        const result = host.saveCarBuild(payload);
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
          assignments?: Record<string, number[]>;
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
    (raceTime, results, weekendSessionType) => {
      const meta = host.getMetaState();
      const session = host.getSessionInit();
      const managedIds =
        session.managedEntryIds?.length
          ? session.managedEntryIds
          : [session.playerEntryId ?? meta.playerEntryId];
      const managedResults = results.filter((r) =>
        managedIds.includes(r.entryId),
      );
      const playerResult =
        managedResults.length > 0
          ? managedResults.reduce((best, r) =>
              r.position < best.position ? r : best,
            )
          : undefined;
      const event = meta.calendar.find((e) => e.round === meta.currentRound);
      const scoring =
        event?.eventType !== "test" && event?.format !== "test";
      const isRaceSession = weekendSessionType === "race";

      const finances =
        isRaceSession && playerResult && event
          ? computeRaceFinances(
              playerResult.position,
              playerResult.classId,
              event.format,
              meta.sponsors ?? [],
              meta.staff,
              { scoring },
            )
          : undefined;

      let updatedMeta = meta;
      if (isRaceSession && playerResult && event && !event.completed) {
        updatedMeta = host.completeRound(
          playerResult.position,
          playerResult.classId,
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
      const nextSession: WeekendSessionType | null = isRaceSession
        ? null
        : nextWeekendSession(completedSessions);

      const finalResults = isRaceSession ? results : sortTimingResults(results);

      const payload: RaceCompletePayload = {
        raceTime,
        results: finalResults,
        championshipPoints: finances?.championshipPoints ?? 0,
        finances: isRaceSession ? finances : undefined,
        weekendSessionType,
        nextWeekendSession: nextSession,
      };
      broadcast(clients, serverMessage("race_complete", payload));
      if (updatedMeta !== meta) {
        broadcast(clients, serverMessage("meta_state", updatedMeta));
      }
      console.log(`[server] ${weekendSessionType} session complete`);
    },
  );

  process.on("SIGINT", () => {
    host.stop();
    wss.close();
    process.exit(0);
  });
}

main();
