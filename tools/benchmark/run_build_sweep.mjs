#!/usr/bin/env node
/**
 * Hypercar aero build sweep — quali + 6h race on Spa and Le Mans.
 *
 * Enumerates every legal front/rear/diffuser/exhaust combo (ICE Gas + H₂ fuel cell)
 * on reference platforms, runs track sim, reports lap times and stint metrics.
 *
 * Usage (repo root):
 *   node tools/benchmark/run_build_sweep.mjs
 *   TIME_SCALE=2000 node tools/benchmark/run_build_sweep.mjs
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
const {
  loadAssemblyRules,
  validateAssemblyCompatibility,
} = require(path.join(repoRoot, "server/dist/game/part_compatibility.js"));

const TRACKS = {
  spa: { id: "spa", path: "tracks/spa.json", name: "Spa" },
  lemans: { id: "lemans", path: "tracks/lemans_la_sarthe.json", name: "Le Mans" },
};

const OUT_DIR = path.join(repoRoot, "tmp/benchmark/build_sweep");
const SWEEP_DIR = path.join(repoRoot, "tmp/sweep");
const SIM_DT = 0.1;
const TIME_SCALE = parseFloat(process.env.TIME_SCALE ?? "2000");
const DURATION_HOURS = parseFloat(process.env.DURATION_HOURS ?? "6");
const QUALI_SECONDS = 900;

const DRIVER_BLOCK =
  "entry=Sweep,1\n" +
  "driver=Bot Quali|GB|Platinum|93|87|91|89|86|88|88|86|85|87|82|90|86|84|88|3.5\n";

function parseLegalParts(classId) {
  const text = fs.readFileSync(
    path.join(repoRoot, "configs/class_rules.txt"),
    "utf8",
  );
  const block = text.split(/(?=class=)/).find((b) => b.startsWith(`class=${classId}`));
  if (!block) throw new Error(`class ${classId} not found`);
  const legal = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^legal_(\w+)=(.+)/);
    if (m) legal[m[1]] = m[2].split(",");
  }
  return legal;
}

const ICE_EXHAUST = [
  "None",
  "TwinOutletSide",
  "SideExitTwin",
  "SingleCenterOutlet",
  "StraightLowRestriction",
  "TopExitBodywork",
  "BlownDiffuser",
  "DieselDPF",
  "DieselDPFSport",
];

const EV_OUTLETS = [
  "None",
  "ActiveUnderbody",
  "LowDragUnderfloor",
  "ThermalScoop",
  "WakeNeutralBody",
];

const BASE_ICE = {
  carName: "Sweep ICE",
  chassis_type: "LMDhDallara",
  cooling_pack: "MaxFlowEndurance",
  wheel_package: "Hypercar18Standard",
  suspension_layout: "PushrodDoubleWishbone",
  fuel_system: "LeMans110L",
  brake_system: "BremboHypercar",
  transmission: "XtracP1359",
  hybrid_system: "LMDh50kW",
  engine: {
    engine_layout: "V8",
    fuel_type: "Gasoline",
    cylinders: 8,
    bore: 0.093,
    stroke: 0.074,
    max_rpm: 8200,
    peak_torque_nm: 650,
    peak_torque_rpm: 6800,
    base_vibration: 1.0,
    aspiration: "TwinTurbo",
    drivetrain: "RWD",
  },
};

const BASE_FC = {
  carName: "Sweep H2 FC",
  chassis_type: "LMHInHouse",
  cooling_pack: "MaxFlowEndurance",
  wheel_package: "Hypercar18Standard",
  suspension_layout: "PullrodDoubleWishbone",
  fuel_system: "HydrogenTank",
  brake_system: "APRacingPrototype",
  transmission: "SingleSpeedEDrive",
  hybrid_system: "None",
  engine: {
    engine_layout: "V6",
    fuel_type: "Hydrogen",
    energy_converter: "FuelCell",
    cylinders: 6,
    bore: 0.08,
    stroke: 0.06,
    max_rpm: 12000,
    peak_torque_nm: 630,
    peak_torque_rpm: 10200,
    base_vibration: 0.2,
    aspiration: "NA",
    drivetrain: "FullEV",
    generator_kw: 420,
    buffer_size: 0.55,
  },
};

function engineLines(engine) {
  const lines = [
    `engine_layout=${engine.engine_layout}`,
    `fuel_type=${engine.fuel_type}`,
    `cylinders=${engine.cylinders}`,
    `bore=${engine.bore}`,
    `stroke=${engine.stroke}`,
    `max_rpm=${engine.max_rpm}`,
    `peak_torque_nm=${engine.peak_torque_nm}`,
    `peak_torque_rpm=${engine.peak_torque_rpm}`,
    `base_vibration=${engine.base_vibration}`,
  ];
  if (engine.aspiration) lines.push(`aspiration=${engine.aspiration}`);
  if (engine.drivetrain) lines.push(`drivetrain=${engine.drivetrain}`);
  if (engine.energy_converter)
    lines.push(`energy_converter=${engine.energy_converter}`);
  if (engine.generator_kw != null) lines.push(`generator_kw=${engine.generator_kw}`);
  if (engine.buffer_size != null) lines.push(`buffer_size=${engine.buffer_size}`);
  return lines;
}

function writeCarConfig(build, relPath) {
  const abs = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const lines = [
    `# ${build.carName}`,
    `car_name=${build.carName}`,
    ...engineLines(build.engine),
    `chassis_type=${build.chassis_type}`,
    `front_aero_type=${build.front_aero_type}`,
    `rear_aero_type=${build.rear_aero_type}`,
    `diffuser_type=${build.diffuser_type}`,
    `exhaust_type=${build.exhaust_type}`,
    `cooling_pack=${build.cooling_pack}`,
    `wheel_package=${build.wheel_package}`,
    `suspension_layout=${build.suspension_layout}`,
    `starting_tire_compound=Medium`,
    `fuel_system=${build.fuel_system}`,
    `brake_system=${build.brake_system}`,
    `transmission=${build.transmission}`,
    `hybrid_system=${build.hybrid_system}`,
  ];
  fs.writeFileSync(abs, lines.join("\n") + "\n");
}

function enumerateBuilds(legal, rules, base, exhaustList, powertrain) {
  const builds = [];
  for (const front_aero_type of legal.front_aero)
    for (const rear_aero_type of legal.rear_aero)
      for (const diffuser_type of legal.diffuser)
        for (const exhaust_type of exhaustList) {
          const build = {
            ...base,
            front_aero_type,
            rear_aero_type,
            diffuser_type,
            exhaust_type,
          };
          if (validateAssemblyCompatibility(build, rules)) continue;
          builds.push({
            powertrain,
            front: front_aero_type,
            rear: rear_aero_type,
            diffuser: diffuser_type,
            exhaust: exhaust_type,
            build,
            id: `${powertrain}|${front_aero_type}|${rear_aero_type}|${diffuser_type}|${exhaust_type}`,
          });
        }
  return builds;
}

function writeRaceConfig({
  relPath,
  trackPath,
  carPath,
  sessionMode,
  durationHours,
  durationSeconds,
}) {
  const lines = [
    "part_catalog=configs/part_catalog.txt",
    "physics_config=configs/physics_config.txt",
    `track_config=${trackPath}`,
    `car_config=${carPath}`,
    "target_laps=0",
    sessionMode === "race"
      ? `target_duration_hours=${durationHours}`
      : `target_duration_seconds=${durationSeconds}`,
    `session_mode=${sessionMode}`,
    `sim_timestep=${SIM_DT}`,
    "entries=tmp/sweep/entries.txt",
    "driver_config=tmp/sweep/drivers.txt",
    "class_rules=configs/class_rules.txt",
  ];
  fs.writeFileSync(path.join(repoRoot, relPath), lines.join("\n") + "\n");
}

function fmtLap(sec) {
  if (!sec || sec <= 0 || !Number.isFinite(sec)) return null;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return { sec, display: `${m}:${s.toFixed(3).padStart(6, "0")}` };
}

function stintLimitCause(s, sincePit, fuelAtLastPit) {
  const tank = s.fuelTankCapacity > 0 ? s.fuelTankCapacity : 110;
  const wear = s.tireWear ?? 0;
  const lap = Math.max(1, s.lap);
  const fuelCrit = 0.14;
  const tyreCrit = 0.72;
  const burn =
    sincePit > 0 && fuelAtLastPit > s.fuel
      ? (fuelAtLastPit - s.fuel) / sincePit
      : 2.6;
  const fuelLaps =
    s.fuel <= tank * fuelCrit
      ? 0
      : burn > 0
        ? (s.fuel - tank * fuelCrit) / burn
        : 99;
  const wearRate = wear / lap;
  const tyreLaps =
    wear >= tyreCrit
      ? 0
      : wearRate > 0
        ? (tyreCrit - wear) / wearRate
        : 99;
  if (Math.abs(fuelLaps - tyreLaps) <= 1) return "both";
  return fuelLaps < tyreLaps ? "fuel" : "tyre";
}

function runSession({ configRel, sessionType }) {
  const pitBot = new PitBotManager();
  pitBot.reset();
  if (!sim.initFromRaceConfig(configRel)) {
    throw new Error(`init failed: ${configRel}`);
  }

  const managed = new Set();
  let pitBotAccum = 0;
  const raceLaps = [];
  const stints = [];
  let stintStartLap = 1;
  let fuelAtLastPit = 110;
  let sincePit = 0;

  while (!sim.isRaceComplete()) {
    const frameDelta = SIM_DT * TIME_SCALE;
    let remaining = frameDelta;
    while (remaining > 1e-9) {
      const dt = Math.min(SIM_DT, remaining);
      sim.tick(dt);
      remaining -= dt;
      pitBotAccum += dt;
      if (pitBotAccum >= 1) {
        pitBotAccum = 0;
        pitBot.tick(
          sim.getSnapshots(),
          managed,
          { weekendSessionType: sessionType, trackWetness: 0 },
          (entryId, command) => sim.submitCommand(entryId, command),
        );
      }
    }

    for (const ev of sim.drainEvents()) {
      if (ev.type === "lap_complete" && sessionType === "race") {
        sincePit++;
        const s = sim.getSnapshots()[0];
        if (s.lastLapTime > 0 && s.lap >= 3) raceLaps.push(s.lastLapTime);
      }
      if (ev.type === "pit_enter" && sessionType === "race") {
        const s = sim.getSnapshots()[0];
        const stintLaps = Math.max(1, s.lap - stintStartLap);
        stints.push({
          laps: stintLaps,
          cause: stintLimitCause(s, sincePit, fuelAtLastPit),
          fuelPct: s.fuel / (s.fuelTankCapacity || 110),
          wear: s.tireWear ?? 0,
        });
        stintStartLap = s.lap;
        fuelAtLastPit = s.fuel;
        sincePit = 0;
      }
    }
  }

  const s = sim.getSnapshots()[0];
  const racePace =
    raceLaps.length > 0
      ? raceLaps.reduce((a, b) => a + b, 0) / raceLaps.length
      : s.bestLapTime;

  const avgStint =
    stints.length > 0
      ? stints.reduce((a, b) => a + b.laps, 0) / stints.length
      : s.lap;

  return {
    bestLap: s.bestLapTime,
    racePace,
    laps: s.lap,
    pitCount: s.pitCount ?? stints.length,
    firstStintLaps: stints[0]?.laps ?? s.lap,
    firstStintCause: stints[0]?.cause ?? "none",
    avgStintLaps: avgStint,
    dominantStintCause: mode(stints.map((x) => x.cause)),
    retired: s.retired,
    retireReason: s.retireReason ?? "",
  };
}

function mode(arr) {
  if (!arr.length) return "none";
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = arr[0];
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function runBuildOnTrack(buildEntry, track) {
  const carRel = `tmp/sweep/cars/${buildEntry.powertrain}_${buildEntry.front}_${buildEntry.rear}_${buildEntry.diffuser}_${buildEntry.exhaust}.txt`;
  writeCarConfig(buildEntry.build, carRel);

  fs.mkdirSync(SWEEP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, "tmp/sweep/entries.txt"),
    `entry=Sweep,${carRel},Hypercar,1,1\n`,
  );
  fs.writeFileSync(path.join(repoRoot, "tmp/sweep/drivers.txt"), DRIVER_BLOCK);

  const qualiConfig = `tmp/sweep/quali_${track.id}.txt`;
  writeRaceConfig({
    relPath: qualiConfig,
    trackPath: track.path,
    carPath: carRel,
    sessionMode: "qualifying",
    durationSeconds: QUALI_SECONDS,
  });

  const raceConfig = `tmp/sweep/race_${track.id}.txt`;
  writeRaceConfig({
    relPath: raceConfig,
    trackPath: track.path,
    carPath: carRel,
    sessionMode: "race",
    durationHours: DURATION_HOURS,
  });

  const quali = runSession({ configRel: qualiConfig, sessionType: "qualifying" });
  const race = runSession({ configRel: raceConfig, sessionType: "race" });

  return {
    track: track.id,
    qualiLapSec: quali.bestLap,
    raceLapSec: race.racePace,
    raceBestSec: race.bestLap,
    stintLaps: race.avgStintLaps,
    firstStintLaps: race.firstStintLaps,
    stintEndCause: race.dominantStintCause,
    firstStintCause: race.firstStintCause,
    totalLaps: race.laps,
    pitCount: race.pitCount,
    retired: race.retired,
    retireReason: race.retireReason,
  };
}

function csvEscape(v) {
  const s = String(v ?? "");
  return s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rules = loadAssemblyRules(repoRoot);
  const legal = parseLegalParts("Hypercar");

  const builds = [
    ...enumerateBuilds(legal, rules, BASE_ICE, ICE_EXHAUST, "ICE-Gas"),
    ...enumerateBuilds(legal, rules, BASE_FC, EV_OUTLETS, "H2-FC"),
  ];

  const tracks = Object.values(TRACKS);
  console.log(
    `Build sweep: ${builds.length} legal aero combos × ${tracks.length} tracks (quali + ${DURATION_HOURS}h race), TIME_SCALE=${TIME_SCALE}`,
  );

  const results = [];
  const t0 = Date.now();
  let done = 0;

  for (const build of builds) {
    const row = {
      id: build.id,
      powertrain: build.powertrain,
      front: build.front,
      rear: build.rear,
      diffuser: build.diffuser,
      exhaust: build.exhaust,
    };

    for (const track of tracks) {
      try {
        const r = runBuildOnTrack(build, track);
        Object.assign(row, {
          [`${track.id}_quali_sec`]: r.qualiLapSec,
          [`${track.id}_race_lap_sec`]: r.raceLapSec,
          [`${track.id}_stint_laps`]: r.stintLaps,
          [`${track.id}_stint_cause`]: r.stintEndCause,
          [`${track.id}_first_stint_laps`]: r.firstStintLaps,
          [`${track.id}_first_stint_cause`]: r.firstStintCause,
          [`${track.id}_total_laps`]: r.totalLaps,
          [`${track.id}_pits`]: r.pitCount,
        });
      } catch (err) {
        row[`${track.id}_error`] = err.message;
      }
    }

    results.push(row);
    done++;
    if (done % 25 === 0 || done === builds.length) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = done / elapsed;
      const eta = (builds.length - done) / rate;
      process.stdout.write(
        `  ${done}/${builds.length} (${rate.toFixed(1)}/s, ETA ${(eta / 60).toFixed(1)}m)\n`,
      );
    }
  }

  const stamp = Date.now();
  const jsonPath = path.join(OUT_DIR, `sweep_${stamp}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        builds: builds.length,
        durationHours: DURATION_HOURS,
        timeScale: TIME_SCALE,
        wallSeconds: (Date.now() - t0) / 1000,
        results,
      },
      null,
      2,
    ),
  );

  const headers = [
    "powertrain",
    "front",
    "rear",
    "diffuser",
    "exhaust",
    "spa_quali",
    "spa_race_lap",
    "spa_stint_laps",
    "spa_stint_cause",
    "lemans_quali",
    "lemans_race_lap",
    "lemans_stint_laps",
    "lemans_stint_cause",
  ];
  const csvLines = [headers.join(",")];
  for (const r of results) {
    csvLines.push(
      [
        r.powertrain,
        r.front,
        r.rear,
        r.diffuser,
        r.exhaust,
        fmtLap(r.spa_quali_sec)?.display ?? "",
        fmtLap(r.spa_race_lap_sec)?.display ?? "",
        r.spa_stint_laps?.toFixed?.(1) ?? "",
        r.spa_stint_cause ?? "",
        fmtLap(r.lemans_quali_sec)?.display ?? "",
        fmtLap(r.lemans_race_lap_sec)?.display ?? "",
        r.lemans_stint_laps?.toFixed?.(1) ?? "",
        r.lemans_stint_cause ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const csvPath = path.join(OUT_DIR, `sweep_${stamp}.csv`);
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");

  printSummary(results, tracks);
  console.log(`\nSaved ${jsonPath}`);
  console.log(`Saved ${csvPath}`);
}

function printSummary(results, tracks) {
  console.log("\n========== BUILD SWEEP SUMMARY ==========\n");
  for (const track of tracks) {
    const qualiKey = `${track.id}_quali_sec`;
    const raceKey = `${track.id}_race_lap_sec`;
    const stintKey = `${track.id}_stint_laps`;
    const causeKey = `${track.id}_stint_cause`;

    const valid = results.filter((r) => r[qualiKey] > 0);
    if (!valid.length) continue;

    const byQuali = [...valid].sort((a, b) => a[qualiKey] - b[qualiKey]);
    const byRace = [...valid].sort((a, b) => a[raceKey] - b[raceKey]);
    const byStint = [...valid].sort((a, b) => b[stintKey] - a[stintKey]);

    const fastestQ = byQuali[0];
    const fastestR = byRace[0];
    const longestS = byStint[0];

    console.log(`## ${track.name}`);
    console.log(
      `  Fastest quali: ${fmtLap(fastestQ[qualiKey]).display} — ${fastestQ.front}/${fastestQ.rear}/${fastestQ.diffuser}/${fastestQ.exhaust} (${fastestQ.powertrain})`,
    );
    console.log(
      `  Fastest race pace: ${fmtLap(fastestR[raceKey]).display} — ${fastestR.front}/${fastestR.rear}/${fastestR.diffuser}/${fastestR.exhaust} (${fastestR.powertrain})`,
    );
    console.log(
      `  Longest avg stint: ${longestS[stintKey].toFixed(1)} laps — ${longestS.front}/${longestS.rear}/${longestS.diffuser}/${longestS.exhaust} (cause: ${longestS[causeKey]})`,
    );

    const causes = { fuel: 0, tyre: 0, both: 0, none: 0 };
    for (const r of valid) {
      const c = r[causeKey] ?? "none";
      causes[c] = (causes[c] ?? 0) + 1;
    }
    console.log(
      `  Dominant stint limiter: fuel ${causes.fuel}, tyre ${causes.tyre}, both ${causes.both}`,
    );
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
