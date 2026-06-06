import { SessionPlayer } from "./client.js";
import type { E2EStepResult } from "./e2e.js";

export interface SpectatorE2EResult {
  ok: boolean;
  steps: E2EStepResult[];
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

/** Host + spectator: spectator pause must be forbidden. */
export async function runSpectatorE2E(url: string): Promise<SpectatorE2EResult> {
  const steps: E2EStepResult[] = [];
  const host = new SessionPlayer();
  const spectator = new SessionPlayer();

  try {
    await host.connect({ url, displayName: "E2E Host", requestedRole: "host" });
    steps.push(step("host_join", host.clientId() != null, { clientId: host.clientId() }));

    await spectator.connect({
      url,
      displayName: "E2E Spectator",
      requestedRole: "spectator",
    });
    steps.push(
      step("spectator_join", spectator.state.clientAssignment?.role === "spectator", {
        role: spectator.state.clientAssignment?.role,
        clientId: spectator.clientId(),
      }),
    );

    const errorsBefore = spectator.state.errors.length;
    spectator.send("pause", {});
    await spectator.sleep(300);
    const forbidden =
      spectator.state.errors.some((e) =>
        e.toLowerCase().includes("not permitted"),
      ) || spectator.state.errors.length > errorsBefore;

    steps.push(step("spectator_pause_blocked", forbidden, {
      errors: spectator.state.errors.slice(errorsBefore),
    }));

    const ngBefore = spectator.state.errors.length;
    spectator.send("new_game", {});
    await spectator.sleep(300);
    const newGameBlocked = spectator.state.errors
      .slice(ngBefore)
      .some((e) => e.toLowerCase().includes("not permitted"));
    steps.push(step("spectator_new_game_blocked", newGameBlocked, {
      errors: spectator.state.errors.slice(ngBefore),
    }));

    host.send("pause", {});
    await host.sleep(200);
    steps.push(
      step("host_pause_ok", host.state.errors.length === 0, {
        paused: host.state.sessionInit?.paused,
      }),
    );

    host.close();
    spectator.close();
    const ok = steps.every((s) => s.ok);
    return { ok, steps, errors: [...host.state.errors, ...spectator.state.errors] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push(step("spectator_e2e", false, undefined, message));
    host.close();
    spectator.close();
    return { ok: false, steps, errors: [message] };
  }
}
