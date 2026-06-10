import { randomUUID } from "crypto";
import { SessionPlayer } from "./client.js";
import type { E2EStepResult } from "./e2e.js";
import { runE2E } from "./e2e.js";

export interface ReconnectE2EResult {
  ok: boolean;
  steps: E2EStepResult[];
  reconnectSession?: {
    raceActive: boolean;
    raceComplete?: boolean;
    timeScale?: number;
    raceTime?: number;
    catchUpTick: boolean;
    clientId?: string;
  };
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

/** Start a race, disconnect, reconnect — assert live session restores. */
export async function runReconnectE2E(
  url: string,
  options: { timeScale?: number; settleMs?: number; playerId?: string } = {},
): Promise<ReconnectE2EResult> {
  const steps: E2EStepResult[] = [];
  const timeScale = options.timeScale ?? 20;
  const settleMs = options.settleMs ?? 500;
  const playerId = options.playerId ?? randomUUID();

  const player1 = new SessionPlayer();
  try {
    await player1.connect({ url, displayName: "Reconnect Host", playerId });

    const bootstrap = await runE2E(player1, {
      timeScale,
      watchSeconds: 0,
      reset: true,
    });
    steps.push(...bootstrap.steps);
    if (!bootstrap.ok) {
      return { ok: false, steps, errors: player1.state.errors };
    }

    player1.send("resume", {});
    await player1.waitForTicks(2, 10000);
    const preRaceTime = player1.state.latestTick?.raceTime ?? 0;
    const preEventCount = player1.state.events.length;
    const preClientId = player1.clientId();
    steps.push(
      step("pre_disconnect_race", player1.hasActiveRace(), {
        raceTime: preRaceTime,
        eventCount: preEventCount,
        timeScale: player1.state.sessionInit?.timeScale,
        clientId: preClientId,
      }),
    );

    player1.close();
    await player1.sleep(settleMs);

    let catchUpTick = false;
    const player2 = new SessionPlayer();
    await player2.connect({
      url,
      displayName: "Reconnect Host",
      playerId,
      reconnectClientId: preClientId ?? undefined,
    });

    if (player2.state.latestTick) {
      catchUpTick = true;
    } else {
      try {
        await player2.waitForTick(3000);
        catchUpTick = player2.state.latestTick != null;
      } catch {
        catchUpTick = false;
      }
    }

    const init = player2.state.sessionInit;
    const scaleOk = (init?.timeScale ?? 0) >= timeScale - 0.01;
    const raceActiveOk = init?.raceActive === true && init.raceComplete !== true;

    steps.push(
      step("reconnect_session_init", raceActiveOk, {
        raceActive: init?.raceActive,
        raceComplete: init?.raceComplete,
        timeScale: init?.timeScale,
        raceTime: init?.raceTime,
        preRaceTime,
      }),
    );
    steps.push(
      step("reconnect_time_scale", scaleOk, {
        expected: timeScale,
        actual: init?.timeScale,
      }),
    );
    steps.push(
      step("reconnect_catch_up_tick", catchUpTick, {
        raceTime: player2.state.latestTick?.raceTime,
      }),
    );
    const catchUpEvents =
      preEventCount > 0 && player2.state.events.length >= preEventCount;
    steps.push(
      step("reconnect_catch_up_events", preEventCount === 0 || catchUpEvents, {
        preEventCount,
        reconnectEventCount: player2.state.events.length,
      }),
    );
    steps.push(
      step("reconnect_client_assignment", player2.clientId() != null, {
        clientId: player2.clientId(),
        role: player2.state.clientAssignment?.role,
      }),
    );

    player2.close();
    const ok = steps.every((s) => s.ok);
    return {
      ok,
      steps,
      reconnectSession: init
        ? {
            raceActive: init.raceActive,
            raceComplete: init.raceComplete,
            timeScale: init.timeScale,
            raceTime: init.raceTime,
            catchUpTick,
            clientId: player2.clientId() ?? undefined,
          }
        : undefined,
      errors: player2.state.errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push(step("reconnect_e2e", false, undefined, message));
    player1.close();
    return { ok: false, steps, errors: [message, ...player1.state.errors] };
  }
}
