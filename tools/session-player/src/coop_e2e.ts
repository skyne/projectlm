import { SessionPlayer } from "./client.js";
import type { E2EStepResult } from "./e2e.js";

export interface CoopE2EResult {
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

/** Host + player co-op: shared entryIds, player can submit team commands. */
export async function runCoopE2E(url: string): Promise<CoopE2EResult> {
  const steps: E2EStepResult[] = [];
  const host = new SessionPlayer();
  const player = new SessionPlayer();

  try {
    await host.connect({ url, displayName: "E2E Host", requestedRole: "host" });
    steps.push(step("host_join", host.clientId() != null, { clientId: host.clientId() }));

    await player.connect({
      url,
      displayName: "E2E Pit Crew",
      requestedRole: "player",
    });
    steps.push(
      step("player_join", player.state.clientAssignment?.role === "player", {
        role: player.state.clientAssignment?.role,
        clientId: player.clientId(),
      }),
    );

    const coopMode =
      player.state.clientAssignment?.sessionMode === "coop" ||
      player.state.roster?.sessionMode === "coop";
    steps.push(step("coop_mode", coopMode, {
      assignmentMode: player.state.clientAssignment?.sessionMode,
      rosterMode: player.state.roster?.sessionMode,
    }));

    const hostEntries = host.state.clientAssignment?.entryIds ?? [];
    const playerEntries = player.state.clientAssignment?.entryIds ?? [];
    const sharedEntries =
      hostEntries.length > 0 &&
      hostEntries.length === playerEntries.length &&
      hostEntries.every((id, i) => id === playerEntries[i]);
    steps.push(step("shared_entry_ids", sharedEntries, {
      hostEntries,
      playerEntries,
    }));

    const entryId = playerEntries[0];
    if (!entryId) {
      steps.push(step("player_submit_command", false, undefined, "No managed entry"));
    } else {
      const errBefore = player.state.errors.length;
      player.send("submit_command", { entryId, command: "driver_mode=push" });
      await player.sleep(300);
      const submitOk = player.state.errors.length === errBefore;
      steps.push(step("player_submit_command", submitOk, { entryId }));

      const badBefore = player.state.errors.length;
      player.send("submit_command", {
        entryId: "entry-not-on-team",
        command: "pit",
      });
      await player.sleep(300);
      const blocked = player.state.errors
        .slice(badBefore)
        .some((e) => e.toLowerCase().includes("not authorized"));
      steps.push(step("foreign_entry_blocked", blocked, {
        errors: player.state.errors.slice(badBefore),
      }));
    }

    host.close();
    player.close();
    const ok = steps.every((s) => s.ok);
    return { ok, steps, errors: [...host.state.errors, ...player.state.errors] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push(step("coop_e2e", false, undefined, message));
    host.close();
    player.close();
    return { ok: false, steps, errors: [message] };
  }
}
