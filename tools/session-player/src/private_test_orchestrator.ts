/**
 * Autonomous private / joint test sessions with PitBot on the player's cars.
 *
 * Usage:
 *   npx tsx src/private_test_orchestrator.ts [--url ws://localhost:9785] [--joint]
 */
import { SessionPlayer } from "./client.js";
import type { RaceCompletePayload, StartPrivateTestPayload } from "./protocol.js";
import { buildPrivateTestPayload } from "./private_test_payload.js";
import {
  reportSessionComplete,
  runSession,
  sessionAlreadyComplete,
  waitForRaceComplete,
} from "./weekend_orchestrator.js";
import { defaultWsUrl } from "./ws_url.js";

const URL = process.argv.find((a) => a.startsWith("ws://")) ?? defaultWsUrl();
const JOINT = process.argv.includes("--joint");
const AGREEMENT_ID = (() => {
  const idx = process.argv.indexOf("--agreement-id");
  return idx >= 0 ? process.argv[idx + 1] : undefined;
})();
const TRACK_ID = (() => {
  const idx = process.argv.indexOf("--track");
  return idx >= 0 ? process.argv[idx + 1] : undefined;
})();

function canStartPrivateTest(player: SessionPlayer): boolean {
  const perms = player.state.clientAssignment?.permissions ?? [];
  return (
    perms.includes("start_private_test") ||
    perms.includes("continue_private_test")
  );
}

async function waitForPrivateTestStart(
  player: SessionPlayer,
  teamName: string,
  timeoutMs = 20_000,
): Promise<void> {
  await player.waitFor(
    () => {
      const init = player.state.sessionInit;
      if (!init?.raceActive || init.raceComplete) return null;
      if (init.sessionKind !== "private_test") return null;
      return player.sessionHasTeam(init, teamName) ? init : null;
    },
    timeoutMs,
    "Timed out waiting for private test session",
  );
}

async function startPrivateTest(
  player: SessionPlayer,
  payload: StartPrivateTestPayload,
): Promise<void> {
  const teamName = player.state.metaState?.teamName ?? "Player";
  const errorsBefore = player.state.errors.length;
  player.state.raceComplete = null;

  player.send("start_private_test", payload);
  await player.sleep(800);

  if (player.state.errors.length > errorsBefore) {
    throw new Error(player.state.errors.at(-1) ?? "Failed to start private test");
  }

  await waitForPrivateTestStart(player, teamName);
}

async function continuePrivateTest(player: SessionPlayer): Promise<void> {
  const teamName = player.state.metaState?.teamName ?? "Player";
  const errorsBefore = player.state.errors.length;
  const sessionBefore = JSON.stringify(player.state.sessionInit);
  player.state.raceComplete = null;

  player.send("continue_private_test", {});
  await player.sleep(800);

  if (player.state.errors.length > errorsBefore) {
    throw new Error(player.state.errors.at(-1) ?? "Failed to continue private test");
  }

  await player.waitFor(
    () => {
      const init = player.state.sessionInit;
      if (!init?.raceActive || init.raceComplete) return null;
      if (init.sessionKind !== "private_test") return null;
      if (JSON.stringify(init) === sessionBefore) return null;
      return player.sessionHasTeam(init, teamName) ? init : null;
    },
    20_000,
    "Timed out waiting for continued private test session",
  );
}

async function runPrivateTestSession(
  player: SessionPlayer,
  label: string,
): Promise<RaceCompletePayload> {
  console.log(`[PitBot] ▶ ${label}`);
  const payload = await runSession(player, "practice");
  reportSessionComplete(player, "practice", payload);
  return payload;
}

export async function runPrivateTestCampaign(opts: {
  url: string;
  displayName: string;
  joint?: boolean;
  agreementId?: string;
  trackId?: string;
}): Promise<void> {
  const player = new SessionPlayer();
  await player.connect({
    url: opts.url,
    displayName: opts.displayName,
    requestedRole: "host",
    timeoutMs: 10_000,
  });

  await player.waitFor(() => player.state.metaState, 5000, "meta_state timeout");

  if (!canStartPrivateTest(player)) {
    throw new Error("No permission to start private tests (join as host)");
  }

  const meta = player.state.metaState!;
  const teamName = meta.teamName;

  if (meta.privateTestProgress) {
    console.log(
      `[PitBot] Resuming joint test campaign (session ${meta.privateTestProgress.completedSessionIndices.length + 1})`,
    );
    if (player.state.sessionInit?.raceActive && !player.state.sessionInit.raceComplete) {
      const payload = await runPrivateTestSession(player, "Joint test (in progress)");
      await handleCampaignContinuation(player, payload);
      player.close();
      return;
    }
    await continuePrivateTest(player);
    const payload = await runPrivateTestSession(player, "Joint test (continued)");
    await handleCampaignContinuation(player, payload);
    player.close();
    return;
  }

  const built = buildPrivateTestPayload(meta, {
    joint: opts.joint,
    agreementId: opts.agreementId,
    trackId: opts.trackId,
  });
  if ("error" in built) throw new Error(built.error);

  const kind = built.jointAgreementId ? "Joint test" : "Private test";
  console.log(
    `[PitBot] Starting ${kind} @ ${built.trackId}${built.jointPartnerTeams?.length ? ` with ${built.jointPartnerTeams.join(" + ")}` : ""}`,
  );

  await startPrivateTest(player, built);
  let payload = await runPrivateTestSession(player, kind);

  while (await handleCampaignContinuation(player, payload)) {
    player.state.raceComplete = null;
    await continuePrivateTest(player);
    payload = await runPrivateTestSession(
      player,
      `${kind} session ${(player.state.metaState?.privateTestProgress?.completedSessionIndices.length ?? 0) + 1}`,
    );
  }

  console.log(`[PitBot] ✓ ${kind} complete`);
  player.close();
}

async function handleCampaignContinuation(
  player: SessionPlayer,
  payload: RaceCompletePayload,
): Promise<boolean> {
  await player.sleep(500);
  const nextIndex = payload.nextJointTestSessionIndex;
  const total = payload.jointTestSessionCount ?? 0;
  if (nextIndex == null || total <= 1) return false;
  if (nextIndex >= total) return false;
  console.log(
    `[PitBot] Joint test campaign: ${nextIndex + 1}/${total} sessions remaining`,
  );
  return true;
}

export async function runContinuePrivateTestOnly(opts: {
  url: string;
  displayName: string;
}): Promise<void> {
  const player = new SessionPlayer();
  await player.connect({
    url: opts.url,
    displayName: opts.displayName,
    requestedRole: "host",
    timeoutMs: 10_000,
  });

  await player.waitFor(() => player.state.metaState, 5000, "meta_state timeout");
  if (!player.state.metaState?.privateTestProgress) {
    throw new Error("No joint test campaign in progress");
  }

  if (sessionAlreadyComplete(player) && player.state.raceComplete) {
    const next = player.state.raceComplete.nextJointTestSessionIndex;
    if (next == null) {
      console.log("[PitBot] Joint test campaign already complete");
      player.close();
      return;
    }
  }

  await continuePrivateTest(player);
  const payload = await runPrivateTestSession(player, "Joint test (continued)");
  if (await handleCampaignContinuation(player, payload)) {
    console.log("[PitBot] More sessions remain — run continue-private-test again");
  } else {
    console.log("[PitBot] ✓ Joint test campaign complete");
  }
  player.close();
}

async function main() {
  await runPrivateTestCampaign({
    url: URL,
    displayName: "PitBot",
    joint: JOINT,
    agreementId: AGREEMENT_ID,
    trackId: TRACK_ID,
  });
}

const isDirectRun =
  process.argv[1]?.includes("private_test_orchestrator") ||
  process.argv.includes("private-test");

if (isDirectRun) {
  main().catch((err) => {
    console.error("[PitBot]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
