#!/usr/bin/env node
/**
 * CI-friendly functional test suite — short watch windows, high time scale.
 * Requires a running ProjectLM server (see scripts/ci-e2e.sh).
 */
import { SessionPlayer } from "./client.js";
import { runE2E } from "./e2e.js";
import { runReconnectE2E } from "./reconnect_e2e.js";
import { defaultWsUrl } from "./ws_url.js";

export interface CiSuiteResult {
  ok: boolean;
  suites: Array<{ name: string; ok: boolean; detail?: unknown; error?: string }>;
}

const WS_URL = defaultWsUrl();
const TIME_SCALE = Number(process.env.TIME_SCALE ?? 50);
const WATCH_SEC = Number(process.env.WATCH_SEC ?? 12);
const MAX_RETRIES = Number(process.env.CI_E2E_RETRIES ?? 1);

async function runWithRetry<T extends { ok: boolean }>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ name: string; ok: boolean; detail?: unknown; error?: string }> {
  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      if (result.ok) {
        return { name, ok: true, detail: result };
      }
      lastError = `${name} failed`;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  return { name, ok: false, error: lastError };
}

export async function runCiSuite(): Promise<CiSuiteResult> {
  const suites: CiSuiteResult["suites"] = [];

  suites.push(
    await runWithRetry("e2e_team_race", async () => {
      const player = new SessionPlayer();
      try {
        await player.connect({ url: WS_URL, timeoutMs: 15000 });
        return await runE2E(player, {
          preset: "lmp2-privateer",
          teamName: "CI Racing",
          watchSeconds: WATCH_SEC,
          timeScale: TIME_SCALE,
          reset: true,
        });
      } finally {
        player.close();
      }
    }),
  );

  if (process.env.RUN_RECONNECT_E2E === "1") {
    suites.push(
      await runWithRetry("reconnect", async () =>
        runReconnectE2E(WS_URL, { timeScale: TIME_SCALE, settleMs: 400 }),
      ),
    );
  }

  const ok = suites.every((s) => s.ok);
  return { ok, suites };
}

async function main(): Promise<void> {
  const result = await runCiSuite();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err) }));
  process.exit(1);
});
