#!/usr/bin/env node
/**
 * Isolate quali vs race lap-time gap — wear, hybrid, fuel, session mode.
 * Usage: node tools/benchmark/diag_lap_gap.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
process.chdir(repoRoot);

const require = createRequire(import.meta.url);
const sim = require(path.join(repoRoot, "bindings/node/index.js"));
const { PitBotManager } = require(
  path.join(repoRoot, "server/dist/game/pitbot/pitbot_manager.js"),
);

const CAR =
  process.env.CAR ??
  "tmp/sweep/pt_Gas-ICE-HV_WinglessGroundEffect_DoubleDeckerDiffuser_StraightLowRestriction.txt";
const TRACK = process.env.TRACK ?? "tracks/lemans_la_sarthe.json";
const SIM_DT = 0.1;
const TIME_SCALE = parseFloat(process.env.TIME_SCALE ?? "2000");

function fmt(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0")}`;
}

function runSession({ sessionMode, targetLaps, durationSec }) {
  const tmp = `tmp/sweep/lap-gap-${sessionMode}-${process.pid}`;
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(`${tmp}/car.txt`, fs.readFileSync(CAR));
  fs.writeFileSync(`${tmp}/entries.txt`, `entry=T,${tmp}/car.txt,Hypercar,1,1\n`);
  fs.writeFileSync(
    `${tmp}/drivers.txt`,
    "entry=T,1\ndriver=Bot|GB|Platinum|93|87|91|89|86|88|88|86|85|87|82|90|86|84|88|3.5\n",
  );
  const lines = [
    "part_catalog=configs/part_catalog.txt",
    "physics_config=configs/physics_config.txt",
    `track_config=${TRACK}`,
    `car_config=${tmp}/car.txt`,
    "target_laps=0",
    targetLaps > 0
      ? `target_laps=${targetLaps}`
      : `target_duration_seconds=${durationSec}`,
    `session_mode=${sessionMode}`,
    `sim_timestep=${SIM_DT}`,
    `entries=${tmp}/entries.txt`,
    `driver_config=${tmp}/drivers.txt`,
    "class_rules=configs/class_rules.txt",
    "rng_seed=42",
    "weather_resolved=1",
    "weather_rain_chance=0",
    "weather_base_wetness=0",
  ];
  fs.writeFileSync(`${tmp}/session.txt`, lines.join("\n") + "\n");

  const pitBot = new PitBotManager();
  pitBot.reset();
  sim.initFromRaceConfig(`${tmp}/session.txt`);
  const managed = new Set();
  let pitBotAccum = 0;
  const laps = [];

  while (!sim.isRaceComplete()) {
    let remaining = SIM_DT * TIME_SCALE;
    while (remaining > 1e-9) {
      const dt = Math.min(SIM_DT, remaining);
      sim.tick(dt);
      remaining -= dt;
      pitBotAccum += dt;
      if (pitBotAccum >= 1) {
        pitBotAccum = 0;
        const rc = sim.getRaceControl();
        pitBot.tick(
          sim.getSnapshots(),
          managed,
          {
            weekendSessionType: sessionMode,
            trackWetness: rc.trackWetness ?? 0,
            raceTimeSec: sim.getRaceTime(),
            flagPhase: rc.flagPhase,
            fcyActive: rc.fcyActive,
            scActive: rc.scActive,
          },
          (id, c) => sim.submitCommand(id, c),
        );
      }
    }
    for (const ev of sim.drainEvents()) {
      if (ev.type !== "lap_complete") continue;
      const s = sim.getSnapshots()[0];
      laps.push({
        lap: s.lap,
        t: s.lastLapTime,
        fuel: s.fuel,
        wear: (s.tireWear ?? 0) * 100,
        hyb: s.hybridDeployMJ ?? 0,
        mode: s.driverMode,
        inPit: s.inPit,
      });
    }
  }
  const s = sim.getSnapshots()[0];
  return { best: s.bestLapTime, laps };
}

function printLaps(label, { best, laps }) {
  console.log(`\n## ${label} — best ${fmt(best)} (${best.toFixed(1)}s)`);
  for (const r of laps.filter((x) => x.lap <= 20)) {
    console.log(
      `  L${String(r.lap).padStart(2)} ${fmt(r.t)}  wear=${r.wear.toFixed(1)}%  fuel=${r.fuel.toFixed(0)}L  hyb=${r.hyb.toFixed(2)}MJ  ${r.mode}${r.inPit ? " inPit" : ""}`,
    );
  }
}

const quali = runSession({ sessionMode: "qualifying", durationSec: 900 });
const raceNoPit = runSession({ sessionMode: "race", targetLaps: 8 });
const raceWithPit = runSession({ sessionMode: "race", durationSec: 7200 });

printLaps("Quali (15 min)", quali);
printLaps("Race (8 laps, no pit)", raceNoPit);

const qFly = quali.laps.filter((r) => r.lap >= 3 && r.t > 0);
const rFly = raceNoPit.laps.filter((r) => r.lap >= 3 && r.t > 0);
const qAvg = qFly.reduce((a, b) => a + b.t, 0) / (qFly.length || 1);
const rAvg = rFly.reduce((a, b) => a + b.t, 0) / (rFly.length || 1);

console.log("\n## Flying laps (L3+, no pit)");
console.log(`  Quali avg: ${fmt(qAvg)}  n=${qFly.length}`);
console.log(`  Race avg:  ${fmt(rAvg)}  n=${rFly.length}`);
console.log(`  Delta:     +${(rAvg - qAvg).toFixed(1)}s`);

const r2 = raceNoPit.laps.find((r) => r.lap === 3);
const qBest = quali.best;
const r3 = raceNoPit.laps.find((r) => r.lap === 3);
if (r3 && qBest > 0) {
  console.log(`\n## Lap 3 compare`);
  console.log(`  Quali best: ${fmt(qBest)}`);
  console.log(`  Race L3:    ${fmt(r3.t)}  wear=${r3.wear.toFixed(1)}%  delta=+${(r3.t - qBest).toFixed(1)}s`);
}

// After pit stint from 2h race
const pitIdx = raceWithPit.laps.findIndex((r) => r.lap >= 16 && r.t < 280);
if (pitIdx >= 0) {
  const stint = raceWithPit.laps.slice(pitIdx, pitIdx + 6);
  console.log("\n## Race stint after pit (from 2h sample)");
  for (const r of stint) {
    console.log(
      `  L${r.lap} ${fmt(r.t)}  wear=${r.wear.toFixed(1)}%  ${r.mode}`,
    );
  }
}
