#!/usr/bin/env node
/**
 * Quali vs race pace breakdown for a single car — where does the delta come from?
 *
 * Usage (repo root):
 *   node tools/benchmark/diag_pace_delta.mjs
 *   TRACK=spa CAR=tmp/sweep/pt_Gas-ICE-HV_....txt node tools/benchmark/diag_pace_delta.mjs
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

const TRACKS = {
  lemans: "tracks/lemans_la_sarthe.json",
  spa: "tracks/spa.json",
};
const trackKey = process.env.TRACK ?? "lemans";
const trackPath = TRACKS[trackKey] ?? process.env.TRACK_PATH;
const carSrc =
  process.env.CAR ??
  "tmp/sweep/pt_Gas-ICE-HV_WinglessGroundEffect_DoubleDeckerDiffuser_StraightLowRestriction.txt";
const hours = parseFloat(process.env.HOURS ?? "6");
const SIM_DT = 0.1;
const TIME_SCALE = parseFloat(process.env.TIME_SCALE ?? "2000");
const QUALI_SECONDS = 900;
/** Override pit-bot conserve: push | normal (unset = pit-bot default) */
const FORCE_DRIVER = process.env.FORCE_DRIVER ?? "";

function fmtLap(sec) {
  if (!sec || sec <= 0 || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0")}`;
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function writeSessionConfig(tmpDir, { sessionMode, durationHours, durationSeconds }) {
  fs.writeFileSync(`${tmpDir}/entries.txt`, `entry=PaceDiag,${tmpDir}/car.txt,Hypercar,1,1\n`);
  fs.writeFileSync(
    `${tmpDir}/drivers.txt`,
    "entry=PaceDiag,1\ndriver=Bot|GB|Platinum|93|87|91|89|86|88|88|86|85|87|82|90|86|84|88|3.5\n",
  );
  fs.writeFileSync(`${tmpDir}/car.txt`, fs.readFileSync(carSrc));
  const lines = [
    "part_catalog=configs/part_catalog.txt",
    "physics_config=configs/physics_config.txt",
    `track_config=${trackPath}`,
    `car_config=${tmpDir}/car.txt`,
    "target_laps=0",
    sessionMode === "race"
      ? `target_duration_hours=${durationHours}`
      : `target_duration_seconds=${durationSeconds}`,
    `session_mode=${sessionMode}`,
    `sim_timestep=${SIM_DT}`,
    `entries=${tmpDir}/entries.txt`,
    `driver_config=${tmpDir}/drivers.txt`,
    "class_rules=configs/class_rules.txt",
    "rng_seed=42",
    "weather_resolved=1",
    "weather_rain_chance=0",
    "weather_base_wetness=0",
    "weather_base_temp_c=22",
    "weather_temp_drift=0",
  ];
  fs.writeFileSync(`${tmpDir}/session.txt`, lines.join("\n") + "\n");
  return `${tmpDir}/session.txt`;
}

function runSession({ configRel, sessionType }) {
  const pitBot = new PitBotManager();
  pitBot.reset();
  if (!sim.initFromRaceConfig(configRel)) throw new Error(`init failed: ${configRel}`);

  const managed = new Set();
  let pitBotAccum = 0;
  const lapRows = [];
  let stintLap = 0;
  let inPitLap = false;

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
            weekendSessionType: sessionType,
            trackWetness: rc.trackWetness ?? 0,
            raceTimeSec: sim.getRaceTime(),
            flagPhase: rc.flagPhase,
            fcyActive: rc.fcyActive,
            scActive: rc.scActive,
          },
          (entryId, command) => sim.submitCommand(entryId, command),
        );
        if (FORCE_DRIVER && sessionType === "race") {
          const snap = sim.getSnapshots()[0];
          sim.submitCommand(snap.entryId, `driver_mode=${FORCE_DRIVER}`);
          if (FORCE_DRIVER === "push") {
            sim.submitCommand(snap.entryId, "hybrid_strategy=deploy");
          }
        }
      }
    }
    for (const ev of sim.drainEvents()) {
      const s = sim.getSnapshots()[0];
      if (ev.type === "pit_enter" && sessionType === "race") {
        inPitLap = true;
        stintLap = 0;
      }
      if (ev.type === "pit_exit" && sessionType === "race") {
        inPitLap = false;
      }
      if (ev.type === "lap_complete") {
        const tank = s.fuelTankCapacity > 0 ? s.fuelTankCapacity : 110;
        const row = {
          lap: s.lap,
          lapTime: s.lastLapTime,
          fuelPct: (s.fuel / tank) * 100,
          wearPct: (s.tireWear ?? 0) * 100,
          inPitLap,
          stintLap: sessionType === "race" ? ++stintLap : s.lap,
        };
        if (sessionType === "race") lapRows.push(row);
      }
    }
  }

  const s = sim.getSnapshots()[0];
  return { snapshot: s, lapRows };
}

function analyzeRaceLaps(lapRows, qualiBest) {
  const raceLaps = lapRows.filter((r) => r.lap >= 3 && r.lapTime > 0);
  const clean = raceLaps.filter((r) => !r.inPitLap && r.lapTime < qualiBest + 25);
  const pitProx = raceLaps.filter((r) => r.inPitLap || r.lapTime >= qualiBest + 25);
  const stintFirst = raceLaps.filter((r) => r.stintLap === 1 && !r.inPitLap);
  const stintMid = raceLaps.filter((r) => r.stintLap >= 2 && r.stintLap <= 4 && !r.inPitLap);
  const stintLate = raceLaps.filter((r) => r.stintLap >= 5 && !r.inPitLap);

  const byWear = (lo, hi) =>
    raceLaps.filter(
      (r) => !r.inPitLap && r.wearPct >= lo && r.wearPct < hi && r.lapTime < qualiBest + 25,
    );

  return {
    allAvg: avg(raceLaps.map((r) => r.lapTime)),
    sweepAvg: avg(raceLaps.map((r) => r.lapTime)),
    cleanAvg: avg(clean.map((r) => r.lapTime)),
    pitProxAvg: avg(pitProx.map((r) => r.lapTime)),
    bestRace: Math.min(...raceLaps.map((r) => r.lapTime)),
    p50: percentile(clean.map((r) => r.lapTime), 0.5),
    stintFirst: avg(stintFirst.map((r) => r.lapTime)),
    stintMid: avg(stintMid.map((r) => r.lapTime)),
    stintLate: avg(stintLate.map((r) => r.lapTime)),
    wear0_25: avg(byWear(0, 25).map((r) => r.lapTime)),
    wear25_50: avg(byWear(25, 50).map((r) => r.lapTime)),
    wear50_75: avg(byWear(50, 75).map((r) => r.lapTime)),
    wear75_100: avg(byWear(75, 100).map((r) => r.lapTime)),
    fuelFull: avg(
      clean.filter((r) => r.fuelPct >= 70).map((r) => r.lapTime),
    ),
    fuelMid: avg(
      clean.filter((r) => r.fuelPct >= 35 && r.fuelPct < 70).map((r) => r.lapTime),
    ),
    fuelLow: avg(
      clean.filter((r) => r.fuelPct < 35).map((r) => r.lapTime),
    ),
    counts: {
      total: raceLaps.length,
      clean: clean.length,
      pitProx: pitProx.length,
      stintFirst: stintFirst.length,
      stintMid: stintMid.length,
      stintLate: stintLate.length,
    },
  };
}

function printSection(title, qualiBest, stats) {
  console.log(`\n=== ${title} ===`);
  console.log(`Car: ${carSrc}`);
  console.log(`Quali best:     ${fmtLap(qualiBest)} (${qualiBest.toFixed(1)}s)`);
  console.log(`Race best:      ${fmtLap(stats.bestRace)} (${stats.bestRace.toFixed(1)}s)`);
  console.log(`Sweep avg (L3+): ${fmtLap(stats.sweepAvg)} (+${(stats.sweepAvg - qualiBest).toFixed(1)}s)`);
  console.log(`Clean avg:      ${fmtLap(stats.cleanAvg)} (+${(stats.cleanAvg - qualiBest).toFixed(1)}s)  [${stats.counts.clean}/${stats.counts.total} laps]`);
  console.log(`Pit-prox avg:   ${fmtLap(stats.pitProxAvg)}  [${stats.counts.pitProx} laps]`);
  console.log(`Clean p50:      ${fmtLap(stats.p50)}`);
  console.log(`\nBy stint position (clean laps):`);
  console.log(`  Out-lap (L1):  ${fmtLap(stats.stintFirst)} (+${(stats.stintFirst - qualiBest).toFixed(1)}s)  n=${stats.counts.stintFirst}`);
  console.log(`  Mid (L2-4):    ${fmtLap(stats.stintMid)} (+${(stats.stintMid - qualiBest).toFixed(1)}s)  n=${stats.counts.stintMid}`);
  console.log(`  Late (L5+):    ${fmtLap(stats.stintLate)} (+${(stats.stintLate - qualiBest).toFixed(1)}s)  n=${stats.counts.stintLate}`);
  console.log(`\nBy tyre wear (clean laps):`);
  console.log(`  0-25%:  ${fmtLap(stats.wear0_25)}  n=${stats.counts.clean}`);
  console.log(`  25-50%: ${fmtLap(stats.wear25_50)}`);
  console.log(`  50-75%: ${fmtLap(stats.wear50_75)}`);
  console.log(`  75%+:   ${fmtLap(stats.wear75_100)}`);
  console.log(`\nBy fuel load (clean laps):`);
  console.log(`  >70%:   ${fmtLap(stats.fuelFull)}`);
  console.log(`  35-70%: ${fmtLap(stats.fuelMid)}`);
  console.log(`  <35%:  ${fmtLap(stats.fuelLow)}`);
}

const tmpDir = `tmp/sweep/pace-diag-${process.pid}`;
fs.mkdirSync(tmpDir, { recursive: true });

const qualiCfg = writeSessionConfig(tmpDir, {
  sessionMode: "qualifying",
  durationSeconds: QUALI_SECONDS,
});
const quali = runSession({ configRel: qualiCfg, sessionType: "qualifying" });
const qualiBest = quali.snapshot.bestLapTime;

const raceCfg = writeSessionConfig(tmpDir, {
  sessionMode: "race",
  durationHours: hours,
});
const race = runSession({ configRel: raceCfg, sessionType: "race" });
const stats = analyzeRaceLaps(race.lapRows, qualiBest);

const modeLabel = FORCE_DRIVER ? `, FORCE_DRIVER=${FORCE_DRIVER}` : "";
printSection(`${trackKey.toUpperCase()} — ${hours}h race${modeLabel}`, qualiBest, stats);
console.log(
  `\nRace totals: laps=${race.snapshot.lap} pits=${race.snapshot.pitCount} retired=${race.snapshot.retired}`,
);
