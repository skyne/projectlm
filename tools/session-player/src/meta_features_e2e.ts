import type { SessionPlayer } from "./client.js";
import { buildPrivateTestPayload } from "./private_test_payload.js";
import { buildCreateTeamPayload } from "./team_presets.js";

export interface MetaFeaturesResult {
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; detail?: unknown; error?: string }>;
}

function step(
  name: string,
  ok: boolean,
  detail?: unknown,
  error?: string,
) {
  return { step: name, ok, detail, error };
}

/** Catalog glossary, adaptability, part instances, and progression on session complete. */
export async function runMetaFeaturesE2E(
  player: SessionPlayer,
  options: { watchSeconds?: number; timeScale?: number } = {},
): Promise<MetaFeaturesResult> {
  const steps: Array<{ step: string; ok: boolean; detail?: unknown; error?: string }> = [];
  const timeScale = options.timeScale ?? 80;

  try {
    await player.waitForCatalog();
    const catalog = player.state.gameCatalog;
    const glossaryLen = catalog?.glossary?.length ?? 0;
    steps.push(
      step("glossary_in_catalog", glossaryLen >= 10, { count: glossaryLen }),
    );

    const adaptDef = catalog?.driverStatDefs?.find((d) => d.key === "adaptability");
    steps.push(
      step("adaptability_stat_def", Boolean(adaptDef), { key: adaptDef?.key }),
    );

    if (player.state.sessionInit?.raceActive) {
      player.send("end_session", {});
      await player.waitForSessionUpdate(10000);
    }
    player.send("new_game", {});
    const resetMeta = await player.waitForMetaUpdate(15000);
    steps.push(
      step("new_game_reset", resetMeta.setupComplete !== true, {
        setupComplete: resetMeta.setupComplete,
      }),
    );

    const payload = buildCreateTeamPayload(catalog!, "lmp2-privateer", {
      teamName: "Meta QA",
    });
    player.send("create_team", payload);
    await player.waitForSetupComplete(15000);
    const meta = player.state.metaState!;
    steps.push(
      step("create_team", meta.setupComplete === true, {
        teamName: meta.teamName,
      }),
    );

    const instanceCount = meta.partInstances?.length ?? 0;
    steps.push(
      step("part_instances_seeded", instanceCount >= 8, { count: instanceCount }),
    );

    const carId = meta.fleet?.[0]?.id;
    if (!carId) {
      steps.push(step("private_test_progression", false, undefined, "No fleet car"));
      return { ok: false, steps };
    }

    const privateTest = buildPrivateTestPayload(meta, {
      trackId: "paul_ricard",
      durationHours: 1,
    });
    if ("error" in privateTest) {
      steps.push(
        step("private_test_progression", false, undefined, privateTest.error),
      );
      return { ok: steps.every((s) => s.ok), steps };
    }

    const sessionBefore = JSON.stringify(player.state.sessionInit);
    player.send("start_private_test", privateTest);
    await player.waitFor(
      () => {
        const init = player.state.sessionInit;
        if (!init?.raceActive || init.raceComplete) return null;
        if (init.sessionKind !== "private_test") return null;
        if (!player.sessionHasTeam(init, "Meta QA")) return null;
        if (JSON.stringify(init) === sessionBefore) return null;
        return init;
      },
      20000,
      "Timed out waiting for private test session",
    );
    steps.push(step("start_private_test", true));

    player.send("set_time_scale", { timeScale });
    player.send("resume", {});
    // 1 h sim @ 100× ≈ 36 s wall clock
    const raceComplete = await player.waitForRaceComplete(120_000);
    const prog = raceComplete.progressionSummary;
    const hasProgression =
      (prog?.drivers?.length ?? 0) > 0 || (prog?.staff?.length ?? 0) > 0;
    steps.push(
      step("progression_summary", hasProgression, {
        drivers: prog?.drivers?.length ?? 0,
        staff: prog?.staff?.length ?? 0,
        sessionKind: raceComplete.sessionKind,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push(step("exception", false, undefined, message));
  }

  const ok = steps.every((s) => s.ok) && player.state.errors.length === 0;
  return { ok, steps };
}
