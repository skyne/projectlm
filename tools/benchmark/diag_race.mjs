#!/usr/bin/env node
/**
 * Single-car race diagnostic: per-lap fuel/wear trace + pit/stint log.
 * Usage: TRACK=lemans|spa CAR=path/to/car.txt HOURS=6 node tools/benchmark/diag_race.mjs
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

const TRACK_PATHS = {
  lemans: "tracks/lemans_la_sarthe.json",
  spa: "tracks/spa.json",
};
const track = TRACK_PATHS[process.env.TRACK ?? "lemans"];
const carSrc = process.env.CAR ?? "configs/cars/lemans2026/bmw_m_hybrid_v8.txt";
const hours = parseFloat(process.env.HOURS ?? "6");
const SIM_DT = 0.1;
const TIME_SCALE = parseFloat(process.env.TIME_SCALE ?? "2000");
const VERBOSE = process.env.VERBOSE === "1";

const tmpDir = `tmp/sweep/diag-${process.pid}`;
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(`${tmpDir}/diag_car.txt`, fs.readFileSync(carSrc));
fs.writeFileSync(`${tmpDir}/entries.txt`, `entry=Diag,${tmpDir}/diag_car.txt,Hypercar,1,1\n`);
fs.writeFileSync(
  `${tmpDir}/drivers.txt`,
  "entry=Diag,1\ndriver=Bot|GB|Platinum|93|87|91|89|86|88|88|86|85|87|82|90|86|84|88|3.5\n",
);
fs.writeFileSync(
  `${tmpDir}/diag_race.txt`,
  [
    "part_catalog=configs/part_catalog.txt",
    "physics_config=configs/physics_config.txt",
    `track_config=${track}`,
    `car_config=${tmpDir}/diag_car.txt`,
    "target_laps=0",
    `target_duration_hours=${hours}`,
    "session_mode=race",
    `sim_timestep=${SIM_DT}`,
    `entries=${tmpDir}/entries.txt`,
    `driver_config=${tmpDir}/drivers.txt`,
    "class_rules=configs/class_rules.txt",
    ...(process.env.WEATHER === "random"
      ? []
      : [
          "rng_seed=42",
          "weather_resolved=1",
          "weather_rain_chance=0",
          "weather_base_wetness=0",
          "weather_base_temp_c=22",
          "weather_temp_drift=0",
        ]),
  ].join("\n") + "\n",
);

const pitBot = new PitBotManager();
pitBot.reset();
sim.initFromRaceConfig(`${tmpDir}/diag_race.txt`);
const managed = new Set();
let acc = 0;
let sampleAcc = 0;
let lastFuel = null;
let stintStart = 1;
const stints = [];
const laps = [];

while (!sim.isRaceComplete()) {
  let rem = SIM_DT * TIME_SCALE;
  while (rem > 1e-9) {
    const dt = Math.min(SIM_DT, rem);
    sim.tick(dt);
    rem -= dt;
    acc += dt;
    if (acc >= 1) {
      acc = 0;
      const rc = sim.getRaceControl();
      const actions = pitBot.tick(
        sim.getSnapshots(),
        managed,
        {
          weekendSessionType: "race",
          trackWetness: rc.trackWetness ?? 0,
          raceTimeSec: sim.getRaceTime(),
          flagPhase: rc.flagPhase,
          fcyActive: rc.fcyActive,
          scActive: rc.scActive,
        },
        (id, c) => sim.submitCommand(id, c),
      );
      for (const a of actions) {
        if (!a.command.startsWith("pit")) continue;
        const rt = sim.getRaceTime();
        console.log(`CMD t=${(rt / 3600).toFixed(2)}h ${a.command} (${a.label})`);
      }
    }
    sampleAcc += dt;
    if (sampleAcc >= 600) {
      sampleAcc = 0;
      const s = sim.getSnapshots()[0];
      const rt = sim.getRaceTime();
      console.log(
        `SAMPLE t=${(rt / 3600).toFixed(2)}h lap=${s.lap} T=${s.normalizedT.toFixed(3)} v=${s.speed.toFixed(0)} fuel=${s.fuel.toFixed(1)} inPit=${s.inPit} q=${s.pitQueued} garage=${s.inGarage} limp=${s.limpMode ?? "-"} pen=${s.pendingPenalty ?? "-"} bf=${s.blackFlag ?? false} mb=${s.meatballFlag ?? false} status=${s.trackStatus ?? "-"} stintSec=${(s.driverStintSeconds ?? 0).toFixed(0)} mode=${s.driverMode ?? "-"}`,
      );
    }
    for (const ev of sim.drainEvents()) {
      const s = sim.getSnapshots()[0];
      const rt = sim.getRaceTime();
      if (ev.type === "lap_complete") {
        const burn = lastFuel != null ? lastFuel - s.fuel : NaN;
        laps.push(s.lastLapTime);
        if (VERBOSE) {
          console.log(
            `lap ${s.lap} t=${(rt / 3600).toFixed(2)}h fuel=${s.fuel.toFixed(1)} burn=${Number.isFinite(burn) ? burn.toFixed(1) : "?"} wear=${(s.tireWear * 100).toFixed(0)}% hyb=${(s.hybridDeployMJ ?? 0).toFixed(1)}/${(s.hybridBudgetMJ ?? 0).toFixed(1)} lapT=${s.lastLapTime.toFixed(1)} pits=${s.pitCount}`,
          );
        }
        lastFuel = s.fuel;
      }
      if (ev.type === "pit_enter") {
        const stintLaps = s.lap - stintStart;
        stints.push(stintLaps);
        console.log(
          `PIT lap=${s.lap} t=${(rt / 3600).toFixed(2)}h stint=${stintLaps} laps fuel=${s.fuel.toFixed(1)} wear=${(s.tireWear * 100).toFixed(0)}% hyb=${(s.hybridDeployMJ ?? 0).toFixed(1)}`,
        );
        stintStart = s.lap;
        lastFuel = null;
      }
      if (ev.type === "retirement") {
        console.log(`RETIRED lap=${s.lap} t=${(rt / 3600).toFixed(2)}h reason=${s.retireReason}`);
      }
      if (!["lap_complete", "pit_enter", "pit_exit", "sector_complete", "sector_cross", "position_change", "command_ack"].includes(ev.type)) {
        console.log(`EV t=${(rt / 3600).toFixed(2)}h ${ev.type} ${JSON.stringify(ev).slice(0, 200)}`);
      }
    }
  }
}

const s = sim.getSnapshots()[0];
const avgLap = laps.length ? laps.reduce((a, b) => a + b, 0) / laps.length : 0;
const avgStint = stints.length ? stints.reduce((a, b) => a + b, 0) / stints.length : s.lap;
console.log(
  `\nEND: laps=${s.lap} raceTime=${(sim.getRaceTime() / 3600).toFixed(2)}h pits=${s.pitCount} avgLap=${avgLap.toFixed(1)}s avgStint=${avgStint.toFixed(1)} laps best=${s.bestLapTime.toFixed(1)} retired=${s.retired} ${s.retireReason ?? ""}`,
);
