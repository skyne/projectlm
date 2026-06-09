#!/usr/bin/env node
import * as fs from "fs";
import { SessionPlayer } from "./client.js";
import { runE2E } from "./e2e.js";
import { runReconnectE2E } from "./reconnect_e2e.js";
import { runSpectatorE2E } from "./spectator_e2e.js";
import { runCoopE2E } from "./coop_e2e.js";
import type { CreateTeamPayload } from "./protocol.js";
import type { ClientRole } from "./protocol.js";
import {
  buildCreateTeamPayload,
  catalogSummary,
  type TeamPresetId,
} from "./team_presets.js";
import {
  runContinuePrivateTestOnly,
  runPrivateTestCampaign,
} from "./private_test_orchestrator.js";
import { runFullSeason, runFullWeekend } from "./weekend_orchestrator.js";
import { resolveNextSession } from "./weekend_sessions.js";
import { defaultWsUrl } from "./ws_url.js";

interface GlobalOptions {
  url: string;
  pretty: boolean;
  timeoutMs: number;
  displayName: string;
  requestedRole: ClientRole;
}

function parseArgs(argv: string[]): {
  command: string;
  options: Record<string, string | boolean | number>;
  positionals: string[];
} {
  const options: Record<string, string | boolean | number> = {};
  const positionals: string[] = [];
  let command = "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!command && !arg.startsWith("-")) {
      command = arg;
      continue;
    }
    if (arg === "--pretty") {
      options.pretty = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        const asNumber = Number(next);
        options[key] = Number.isFinite(asNumber) && next !== "" ? asNumber : next;
        i++;
      } else {
        options[key] = true;
      }
      continue;
    }
    positionals.push(arg);
  }

  return { command, options, positionals };
}

function printJson(value: unknown, pretty: boolean): void {
  process.stdout.write(
    pretty ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`,
  );
}

function fail(message: string): never {
  printJson({ ok: false, error: message }, false);
  process.exit(1);
}

function usage(): void {
  process.stderr.write(`ProjectLM live session player

Usage:
  npm run player -- <command> [options]     (from tools/session-player)
  npx tsx tools/session-player/src/cli.ts <command> [options]

Global options:
  --url <ws://host:port>   WebSocket URL (default: ws://localhost:9785)
  --timeout <ms>           Connect / wait timeout (default: 5000)
  --pretty                 Pretty-print JSON output

Commands:
  ping                     Verify the server is reachable
  session                  Return session_init payload
  meta                     Return meta_state (team, budget, calendar)
  roster                   Your client_assignment + connected roster
  status                   Session + latest tick (or paused / lobby state)
  leaderboard              Current race order
  car                      Snapshot for one car (--entry | --car | --team)
  weather                  Current race control / weather state
  events                   Collect events for --seconds (default: 3)
  watch                    Collect ticks for --seconds (default: 5)
  pause | resume           Pause or resume the simulation
  time-scale <n>           Set time scale multiplier
  restart                  Restart the race
  start-round              Start the current calendar round (game mode)
  continue-weekend         Start the next weekend session (practice/quali/race)
  private-test             Run private test with PitBot on your cars
                             --joint for pending joint-testing contract
                             --agreement-id <id> --track <trackId>
  continue-private-test    Continue an in-progress multi-day joint test campaign
  weekend                  Run full weekend (practice → quali → race)
                             Co-op default: --advance host (you click Continue)
                             Solo host: --advance auto
  season                   Run all remaining calendar rounds to season end
                             Co-op: --role player --advance auto
  new-game                 Reset career to team-creation lobby
  catalog                  Summarize game_catalog (classes, platforms, staff)
  create-team              Found a team (--preset lmp2-privateer, --name, etc.)
  e2e                      Full test: new-game → create-team → start → watch
  reconnect-e2e            RC-1: start race, disconnect, reconnect mid-session
  spectator-e2e            MP-0: spectator cannot pause; host can
  coop-e2e                 MP-2: co-op pit wall — shared cars, player commands
  pit                      Submit pit command for player car
  submit <command>         Submit raw strategy command for player car

Team creation (create-team / e2e):
  --preset <id>            lmp2-privateer | lmgt3-privateer | hypercar-manufacturer
  --name <teamName>        Default: "Cursor Racing"
  --platform <platformId>  Override platform (e.g. oreca_07_gibson)
  --file <path.json>       Load CreateTeamPayload from JSON (create-team only)

E2E options:
  --watch-seconds <n>       Race observation window (default: 8)
  --time-scale <n>          Sim speed during watch (default: 20)
  --no-reset                Skip new-game if team already exists

Reconnect E2E options:
  --time-scale <n>          Sim speed before disconnect (default: 20)
  --settle-ms <n>           Pause before reconnect (default: 500)

Global join:
  --name <displayName>      join_session display name (default: Session Player)
  --role <host|player|spectator>  Requested role (default: host)

Weekend orchestration (weekend command):
  --advance <auto|host>     Who starts the next session (default: auto if host, host if player)

Player car selection (pit / submit / car):
  --entry <entryId>        Defaults to session playerEntryId when possible
  --car <number>
  --team <name substring>
`);
}

async function withPlayer<T>(
  opts: GlobalOptions,
  run: (player: SessionPlayer) => Promise<T>,
): Promise<T> {
  const player = new SessionPlayer();
  try {
    await player.connect({
      url: opts.url,
      timeoutMs: opts.timeoutMs,
      displayName: opts.displayName,
      requestedRole: opts.requestedRole,
    });
    return await run(player);
  } finally {
    player.close();
  }
}

function parseRole(raw: unknown): ClientRole {
  const role = String(raw ?? "host");
  if (role === "player" || role === "spectator" || role === "host") return role;
  fail(`Invalid role: ${role} (use host, player, or spectator)`);
}

function globalOptions(raw: Record<string, string | boolean | number>): GlobalOptions {
  return {
    url: String(raw.url ?? defaultWsUrl()),
    pretty: Boolean(raw.pretty),
    timeoutMs: Number(raw.timeout ?? 5000),
    displayName: String(raw.name ?? "Session Player"),
    requestedRole: parseRole(raw.role),
  };
}

function carQuery(raw: Record<string, string | boolean | number>) {
  return {
    entryId: raw.entry ? String(raw.entry) : undefined,
    carNumber: raw.car !== undefined ? Number(raw.car) : undefined,
    teamName: raw.team ? String(raw.team) : undefined,
    usePlayerDefault: true,
  };
}

async function main(): Promise<void> {
  const { command, options, positionals } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || options.help) {
    usage();
    process.exit(command ? 0 : 1);
  }

  const opts = globalOptions(options);

  try {
    switch (command) {
      case "ping": {
        const result = await withPlayer(opts, async (player) => ({
          ok: true,
          trackName: player.state.sessionInit?.trackName,
          entries: player.state.sessionInit?.entries.length ?? 0,
          playerEntryId: player.playerEntryId(),
          paused: player.isPaused(),
          setupComplete: player.state.metaState?.setupComplete ?? false,
        }));
        printJson(result, opts.pretty);
        return;
      }

      case "session": {
        const result = await withPlayer(opts, async (player) => ({
          ok: true,
          session: player.state.sessionInit,
        }));
        printJson(result, opts.pretty);
        return;
      }

      case "meta": {
        const result = await withPlayer(opts, async (player) => ({
          ok: true,
          meta: player.state.metaState,
        }));
        printJson(result, opts.pretty);
        return;
      }

      case "roster": {
        const result = await withPlayer(opts, async (player) => ({
          ok: true,
          assignment: player.state.clientAssignment,
          roster: player.state.roster,
          managedEntryIds: player.state.sessionInit?.managedEntryIds ?? [],
        }));
        printJson(result, opts.pretty);
        return;
      }

      case "status": {
        const result = await withPlayer(opts, async (player) => {
          const tick = await player.waitForTick(opts.timeoutMs);
          return {
            ok: true,
            session: player.state.sessionInit,
            playerEntryId: player.playerEntryId(),
            paused: player.isPaused(),
            hasActiveRace: player.hasActiveRace(),
            raceTime: tick?.raceTime ?? null,
            raceControl: tick?.raceControl ?? null,
            cars: tick?.snapshots.length ?? 0,
            raceComplete: Boolean(player.state.raceComplete),
            setupComplete: player.state.metaState?.setupComplete ?? false,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "leaderboard": {
        const result = await withPlayer(opts, async (player) => {
          const tick = await player.waitForTick(opts.timeoutMs);
          if (!tick) {
            return {
              ok: false,
              error: player.hasActiveRace()
                ? "Race is paused — run resume first"
                : "No active race — run start-round first",
              paused: player.isPaused(),
            };
          }
          return {
            ok: true,
            raceTime: tick.raceTime,
            leaderboard: player.leaderboard(),
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "car": {
        const result = await withPlayer(opts, async (player) => {
          const tick = await player.waitForTick(opts.timeoutMs);
          if (!tick) fail("No tick available — resume the race or start a round");
          const car = player.findCar(carQuery(options));
          if (!car) fail("Car not found in current tick");
          return { ok: true, entry: player.resolveEntry(carQuery(options)), car };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "weather": {
        const result = await withPlayer(opts, async (player) => {
          const tick = await player.waitForTick(opts.timeoutMs);
          return {
            ok: true,
            raceTime: tick?.raceTime ?? null,
            raceControl: player.raceControl(),
            paused: player.isPaused(),
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "events": {
        const seconds = Number(options.seconds ?? 3);
        const result = await withPlayer(opts, async (player) => {
          const events = await player.collectEvents(seconds * 1000);
          return {
            ok: true,
            seconds,
            events,
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "watch": {
        const seconds = Number(options.seconds ?? 5);
        const result = await withPlayer(opts, async (player) => {
          if (!player.hasActiveRace()) {
            return {
              ok: false,
              error: "No active race — run start-round and resume first",
            };
          }
          if (player.isPaused()) {
            player.send("resume", {});
            await player.sleep(200);
          }
          const ticks = await player.watchTicks(seconds * 1000);
          return {
            ok: true,
            seconds,
            tickCount: ticks.length,
            ticks: ticks.map((t) => ({
              raceTime: t.raceTime,
              raceControl: t.raceControl ?? null,
              leaderboard: [...t.snapshots]
                .sort((a, b) => a.racePosition - b.racePosition)
                .map((s) => ({
                  position: s.racePosition,
                  carNumber: s.carNumber,
                  teamName: s.teamName,
                  lap: s.lap,
                  speed: s.speed,
                  fuel: s.fuel,
                })),
            })),
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "pause":
      case "resume": {
        const result = await withPlayer(opts, async (player) => {
          player.send(command, {});
          await player.sleep(300);
          return {
            ok: player.state.errors.length === 0,
            action: command,
            paused: command === "pause",
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "time-scale": {
        const scale = Number(positionals[0] ?? options.scale);
        if (!Number.isFinite(scale)) fail("time-scale requires a numeric value");
        const result = await withPlayer(opts, async (player) => {
          player.send("set_time_scale", { timeScale: scale });
          return { ok: true, timeScale: scale };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "restart": {
        const result = await withPlayer(opts, async (player) => {
          player.send("restart_race", {});
          const tick = await player.waitForTick(opts.timeoutMs);
          return {
            ok: player.state.errors.length === 0,
            raceTime: tick?.raceTime ?? null,
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "start-round": {
        const result = await withPlayer(opts, async (player) => {
          const teamName = player.state.metaState?.teamName ?? "Player";
          const errorsBefore = player.state.errors.length;
          const sessionBefore = JSON.stringify(player.state.sessionInit);
          player.send("start_round", {});
          await player.sleep(300);

          if (player.state.errors.length > errorsBefore) {
            return {
              ok: false,
              errors: player.state.errors,
              setupComplete: player.state.metaState?.setupComplete ?? false,
            };
          }

          try {
            const session = await player.waitForRoundStart(
              teamName,
              opts.timeoutMs,
              sessionBefore,
            );
            return {
              ok: true,
              session,
              errors: player.state.errors,
            };
          } catch (err) {
            return {
              ok: false,
              errors: player.state.errors,
              setupComplete: player.state.metaState?.setupComplete ?? false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        });
        printJson(result, opts.pretty);
        return;
      }

      case "new-game": {
        const result = await withPlayer(opts, async (player) => {
          player.send("new_game", {});
          const meta = await player.waitForMetaUpdate(opts.timeoutMs);
          return {
            ok: !meta.setupComplete,
            meta,
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "catalog": {
        const result = await withPlayer(opts, async (player) => {
          const catalog = await player.waitForCatalog(opts.timeoutMs);
          return { ok: true, catalog: catalogSummary(catalog) };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "create-team": {
        const result = await withPlayer(opts, async (player) => {
          if (player.state.metaState?.setupComplete) {
            return {
              ok: false,
              error: "Team already founded — run new-game first",
              teamName: player.state.metaState.teamName,
            };
          }

          let payload: CreateTeamPayload;
          if (options.file) {
            payload = JSON.parse(
              fs.readFileSync(String(options.file), "utf8"),
            ) as CreateTeamPayload;
          } else {
            const catalog = await player.waitForCatalog(opts.timeoutMs);
            const preset = String(options.preset ?? "lmp2-privateer") as TeamPresetId;
            payload = buildCreateTeamPayload(catalog, preset, {
              teamName: options.name ? String(options.name) : undefined,
              platformId: options.platform ? String(options.platform) : undefined,
            });
          }

          player.send("create_team", payload);
          const meta = await player.waitForSetupComplete(opts.timeoutMs);
          return {
            ok: player.state.errors.length === 0 && meta.setupComplete === true,
            payload,
            meta,
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "e2e": {
        const result = await withPlayer(opts, async (player) => {
          return runE2E(player, {
            preset: String(options.preset ?? "lmp2-privateer") as TeamPresetId,
            teamName: options.name ? String(options.name) : undefined,
            platformId: options.platform ? String(options.platform) : undefined,
            watchSeconds: Number(options["watch-seconds"] ?? 8),
            timeScale: Number(options["time-scale"] ?? 20),
            reset: !options["no-reset"],
          });
        });
        printJson(result, opts.pretty);
        process.exit(result.ok ? 0 : 1);
      }

      case "reconnect-e2e": {
        const result = await runReconnectE2E(opts.url, {
          timeScale: Number(options["time-scale"] ?? 20),
          settleMs: Number(options["settle-ms"] ?? 500),
        });
        printJson(result, opts.pretty);
        process.exit(result.ok ? 0 : 1);
      }

      case "spectator-e2e": {
        const result = await runSpectatorE2E(opts.url);
        printJson(result, opts.pretty);
        process.exit(result.ok ? 0 : 1);
      }

      case "coop-e2e": {
        const result = await runCoopE2E(opts.url);
        printJson(result, opts.pretty);
        process.exit(result.ok ? 0 : 1);
      }

      case "pit": {
        const result = await withPlayer(opts, async (player) => {
          const entry = player.resolveEntry(carQuery(options));
          player.send("submit_command", { entryId: entry.entryId, command: "pit" });
          await player.sleep(300);
          return {
            ok: player.state.errors.length === 0,
            entry,
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "submit": {
        const rawCommand = positionals[0] ?? options.command;
        if (!rawCommand) fail("submit requires a command string");
        const result = await withPlayer(opts, async (player) => {
          const entry = player.resolveEntry(carQuery(options));
          player.send("submit_command", {
            entryId: entry.entryId,
            command: String(rawCommand),
          });
          await player.sleep(300);
          return {
            ok: player.state.errors.length === 0,
            entry,
            command: String(rawCommand),
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        return;
      }

      case "continue-weekend": {
        const result = await withPlayer(opts, async (player) => {
          const errorsBefore = player.state.errors.length;
          const canContinue = player.state.clientAssignment?.permissions.includes(
            "continue_weekend_session",
          );
          const canStart = player.state.clientAssignment?.permissions.includes("start_round");
          if (canContinue) {
            player.send("continue_weekend_session", {});
          } else if (canStart) {
            player.send("start_round", {});
          } else {
            return { ok: false, error: "No permission to start weekend session" };
          }
          await player.sleep(800);
          return {
            ok: player.state.errors.length === errorsBefore,
            session: player.state.sessionInit,
            nextFromMeta: player.state.metaState
              ? resolveNextSession(player.state.metaState)
              : null,
            errors: player.state.errors,
          };
        });
        printJson(result, opts.pretty);
        process.exit(result.ok ? 0 : 1);
      }

      case "private-test": {
        try {
          await runPrivateTestCampaign({
            url: opts.url,
            displayName: opts.displayName,
            joint: Boolean(options.joint),
            agreementId: options["agreement-id"]
              ? String(options["agreement-id"])
              : undefined,
            trackId: options.track ? String(options.track) : undefined,
          });
          printJson({ ok: true }, opts.pretty);
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      case "continue-private-test": {
        try {
          await runContinuePrivateTestOnly({
            url: opts.url,
            displayName: opts.displayName,
          });
          printJson({ ok: true }, opts.pretty);
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      case "weekend": {
        try {
          const advanceRaw = options.advance;
          const advance =
            advanceRaw === "auto" || advanceRaw === "host" ? advanceRaw : undefined;
          await runFullWeekend({
            url: opts.url,
            displayName: opts.displayName,
            role: opts.requestedRole,
            advance,
          });
          printJson({ ok: true }, opts.pretty);
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      case "season": {
        try {
          const advanceRaw = options.advance;
          const advance =
            advanceRaw === "auto" || advanceRaw === "host"
              ? advanceRaw
              : opts.requestedRole === "host"
                ? "auto"
                : "auto";
          await runFullSeason({
            url: opts.url,
            displayName: opts.displayName,
            role: opts.requestedRole,
            advance,
          });
          printJson({ ok: true }, opts.pretty);
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      default:
        fail(`Unknown command: ${command}`);
    }
  } catch (err) {
    let message = "Unknown error";
    if (err instanceof Error) {
      if (err.message) {
        message = err.message;
      } else if (err.name === "AggregateError" && "errors" in err) {
        const nested = (err as AggregateError).errors
          .map((e) => (e instanceof Error ? e.message : String(e)))
          .filter(Boolean)
          .join("; ");
        message = nested || "Connection failed (is the server running?)";
      } else {
        message = err.name;
      }
    } else {
      message = String(err);
    }
    fail(message);
  }
}

main();
