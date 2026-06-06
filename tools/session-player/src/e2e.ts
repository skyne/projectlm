import type { SessionPlayer } from "./client.js";
import type { CreateTeamPayload } from "./protocol.js";
import {
  buildCreateTeamPayload,
  type TeamPresetId,
  type TeamPresetOptions,
} from "./team_presets.js";

export interface E2EOptions {
  preset?: TeamPresetId;
  teamName?: string;
  platformId?: string;
  watchSeconds?: number;
  timeScale?: number;
  reset?: boolean;
}

export interface E2EStepResult {
  step: string;
  ok: boolean;
  detail?: unknown;
  error?: string;
}

export interface E2EResult {
  ok: boolean;
  steps: E2EStepResult[];
  teamName?: string;
  playerEntryId?: string | null;
  raceTime?: number | null;
  playerCar?: unknown;
  leaderboard?: unknown[];
  events?: unknown[];
  tickCount?: number;
  errors: string[];
}

function step(
  name: string,
  ok: boolean,
  detail?: unknown,
  error?: string,
): E2EStepResult {
  return { step: name, ok, detail, error };
}

export async function runE2E(
  player: SessionPlayer,
  options: E2EOptions = {},
): Promise<E2EResult> {
  const steps: E2EStepResult[] = [];
  const preset = options.preset ?? "lmp2-privateer";
  const watchSeconds = options.watchSeconds ?? 8;
  const timeScale = options.timeScale ?? 20;
  const reset = options.reset !== false;

  try {
    await player.waitForCatalog();

    if (reset) {
      if (!player.state.metaState?.setupComplete) {
        steps.push(
          step("new_game", true, {
            skipped: true,
            reason: "Already in team-creation lobby",
          }),
        );
      } else {
        player.send("new_game", {});
        try {
          const meta = await player.waitForMetaUpdate(10000);
          steps.push(
            step("new_game", !meta.setupComplete, {
              setupComplete: meta.setupComplete,
              teamName: meta.teamName,
            }),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          steps.push(step("new_game", false, undefined, message));
          return finalize(false, steps, player, { failedAt: "new_game" });
        }
      }
    } else if (player.state.metaState?.setupComplete) {
      steps.push(
        step("skip_create_team", true, {
          reason: "Team already founded",
          teamName: player.state.metaState.teamName,
        }),
      );
    }

    let createPayload: CreateTeamPayload | null = null;
    if (!player.state.metaState?.setupComplete) {
      const catalog = player.state.gameCatalog!;
      createPayload = buildCreateTeamPayload(catalog, preset, {
        teamName: options.teamName,
        platformId: options.platformId,
      });
      player.send("create_team", createPayload);
      const meta = await player.waitForSetupComplete();
      steps.push(
        step("create_team", true, {
          teamName: meta.teamName,
          budget: meta.budget,
          fleet: meta.fleet?.map((c) => ({
            id: c.id,
            carNumber: c.carNumber,
            classId: c.classId,
          })),
          setupComplete: meta.setupComplete,
        }),
      );
    }

    const teamName =
      player.state.metaState?.teamName ??
      options.teamName ??
      "Cursor Racing";
    const errorsBeforeRound = player.state.errors.length;
    const sessionBeforeRound = JSON.stringify(player.state.sessionInit);

    player.send("start_round", {});
    await player.sleep(300);

    if (player.state.errors.length > errorsBeforeRound) {
      const err = player.state.errors[player.state.errors.length - 1];
      steps.push(step("start_round", false, undefined, err));
      return finalize(false, steps, player, { failedAt: "start_round", teamName });
    }

    let session;
    try {
      session = await player.waitForRoundStart(
        teamName,
        8000,
        sessionBeforeRound,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps.push(step("start_round", false, undefined, message));
      return finalize(false, steps, player, { failedAt: "start_round", teamName });
    }

    const playerEntry = session.entries.find((e) =>
      e.teamName.toLowerCase().includes(teamName.toLowerCase()),
    );

    steps.push(
      step("start_round", Boolean(playerEntry), {
        trackName: session.trackName,
        entries: session.entries.length,
        raceFormat: session.raceFormat,
        roundNumber: session.roundNumber,
        playerEntryId: session.playerEntryId,
        playerCar: playerEntry ?? null,
      }, playerEntry ? undefined : `${teamName} missing from grid`),
    );

    if (!playerEntry || player.state.errors.length > errorsBeforeRound) {
      return finalize(false, steps, player, {
        failedAt: "start_round",
        teamName,
      });
    }

    player.send("set_time_scale", { timeScale });
    player.send("resume", {});
    await player.sleep(300);

    const ticks = await player.watchTicks(watchSeconds * 1000);
    const latest = player.state.latestTick;
    const playerEntryId = player.playerEntryId();
    const playerCar = playerEntryId
      ? latest?.snapshots.find((s) => s.entryId === playerEntryId) ?? null
      : null;

    steps.push(
      step("watch_race", ticks.length > 0, {
        watchSeconds,
        timeScale,
        tickCount: ticks.length,
        raceTime: latest?.raceTime ?? null,
      }, ticks.length > 0 ? undefined : "No ticks received"),
    );

    const events = player.state.events.slice(-20);
    const ok =
      steps.every((s) => s.ok) && player.state.errors.length === 0;

    return finalize(ok, steps, player, {
      teamName: player.state.metaState?.teamName,
      playerEntryId,
      raceTime: latest?.raceTime ?? null,
      playerCar,
      leaderboard: player.leaderboard().slice(0, 10),
      events,
      tickCount: ticks.length,
      preset,
      createPayload,
    });
  } catch (err) {
    steps.push(
      step("exception", false, undefined, err instanceof Error ? err.message : String(err)),
    );
    return finalize(false, steps, player, {});
  }
}

function finalize(
  ok: boolean,
  steps: E2EStepResult[],
  player: SessionPlayer,
  extra: Record<string, unknown>,
): E2EResult {
  return {
    ok: ok && steps.every((s) => s.ok),
    steps,
    errors: player.state.errors,
    ...extra,
  } as E2EResult;
}
