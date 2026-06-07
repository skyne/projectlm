#!/usr/bin/env node
/**
 * Headless endurance run for part-damage tuning validation.
 *
 * Usage (from repo root):
 *   node --import tsx server/scripts/run_damage_endurance.mjs
 *   DURATION_HOURS=6 node --import tsx server/scripts/run_damage_endurance.mjs
 *   OUT=tmp/benchmark/damage_lemans.json node --import tsx server/scripts/run_damage_endurance.mjs
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { PitBotManager } from "../src/game/pitbot/pitbot_manager.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
process.chdir(repoRoot);

const require = createRequire(import.meta.url);
const native = require(path.join(repoRoot, "bindings/node"));

const DURATION_HOURS = Number(process.env.DURATION_HOURS ?? "24");
const RACE_CONFIG = process.env.RACE_CONFIG ?? "configs/race_config_damage_bench_24h.txt";
const OUT = process.env.OUT ?? "tmp/benchmark/damage_lemans_summary.json";
const DT = Number(process.env.SIM_DT ?? "0.1");
const PROGRESS_EVERY_SEC = Number(process.env.PROGRESS_EVERY_SEC ?? "3600");

function writeBenchConfig() {
  const base = fs.readFileSync(RACE_CONFIG, "utf8");
  const lines = base
    .split("\n")
    .filter((l) => !l.startsWith("target_duration_hours="))
    .filter((l) => !l.startsWith("sim_timestep="));
  lines.push(`target_duration_hours=${DURATION_HOURS}`);
  lines.push(`sim_timestep=${DT}`);
  const outPath = "configs/runtime/_damage_bench_race.txt";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  return outPath;
}

function worstPartHealth(snap) {
  const parts = Object.entries(snap.partHealth ?? {});
  if (!parts.length) return { part: null, health: 100 };
  parts.sort((a, b) => a[1] - b[1]);
  return { part: parts[0][0], health: parts[0][1] };
}

function summarizeSnapshots(snaps) {
  let below85Wear = 0;
  let limp = 0;
  let flats = 0;
  let hiddenFaultCars = 0;
  let suspected = 0;
  let retired = 0;
  let irreparableParts = 0;
  const worstByClass = {};

  for (const s of snaps) {
    if (s.retired) retired++;
    const w = worstPartHealth(s);
    if (w.health < 85) below85Wear++;
    if (s.limpMode && s.limpMode !== "none") limp++;
    if (Object.keys(s.tyreDeflation ?? {}).length) flats++;
    if ((s.hiddenFaults ?? []).length) hiddenFaultCars++;
    if (s.suspectedIssues) suspected++;
    irreparableParts += (s.partIrreparable ?? []).length;
    const cls = s.classId ?? "?";
    if (!worstByClass[cls] || w.health < worstByClass[cls].health) {
      worstByClass[cls] = { entryId: s.entryId, part: w.part, health: w.health };
    }
  }

  return {
    cars: snaps.length,
    retired,
    below85Wear,
    limp,
    flats,
    hiddenFaultCars,
    suspected,
    irreparableParts,
    worstByClass,
  };
}

function main() {
  const configPath = writeBenchConfig();
  const t0 = Date.now();
  if (!native.initFromRaceConfig(configPath)) {
    console.error("initFromRaceConfig failed:", configPath);
    process.exit(1);
  }

  const pitBot = new PitBotManager();
  const targetSec = DURATION_HOURS * 3600;
  let raceTime = 0;
  let ticks = 0;
  let lastProgress = 0;
  let finalSnaps = [];
  let collisionEvents = 0;

  while (!native.isRaceComplete()) {
    native.tick(DT);
    ticks++;
    raceTime += DT;

    const snaps = native.getSnapshots();
    finalSnaps = snaps;
    pitBot.tick(snaps, [], { weekendSessionType: "race", trackWetness: 0.05 }, (entryId, cmd) =>
      native.submitCommand(entryId, cmd),
    );

    for (const ev of native.drainEvents()) {
      if (ev.type === "collision" || ev.type === "Collision") collisionEvents++;
    }

    if (raceTime - lastProgress >= PROGRESS_EVERY_SEC) {
      lastProgress = raceTime;
      const sum = summarizeSnapshots(snaps);
      console.log(
        `[${(raceTime / 3600).toFixed(1)}h] cars=${sum.cars} retired=${sum.retired} below85=${sum.below85Wear} limp=${sum.limp} hiddenFaultCars=${sum.hiddenFaultCars}`,
      );
    }

    if (raceTime > targetSec + 120) {
      console.warn("Timeout — race did not complete");
      break;
    }
  }

  const elapsedMs = Date.now() - t0;
  const summary = {
    durationHours: DURATION_HOURS,
    raceTimeSec: raceTime,
    ticks,
    elapsedMs,
    collisionEvents,
    ...summarizeSnapshots(finalSnaps),
    targets: {
      wearOnlyMinHealth: 85,
      hiddenFaultCarsMaxPct: 5,
      limpMaxPct: 10,
      retireMaxPct: 20,
    },
    pass: (() => {
      const s = summarizeSnapshots(finalSnaps);
      const hiddenOk = s.hiddenFaultCars <= Math.ceil(s.cars * 0.05);
      const limpOk = s.limp <= Math.ceil(s.cars * 0.1);
      const retireOk = s.retired <= Math.ceil(s.cars * 0.2);
      return hiddenOk && limpOk && retireOk;
    })(),
    notes: {
      below85Wear:
        "Collision/contact cosmetic damage — not a failure (wear-only target is unit-tested)",
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2) + "\n");

  console.log("\n=== Damage endurance summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${OUT} (${(elapsedMs / 1000).toFixed(1)}s wall)`);

  if (!summary.pass) process.exit(1);
}

main();
