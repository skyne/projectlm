#!/usr/bin/env node
/**
 * Powertrain validation sweep — is any family OP or non-competitive?
 *
 * Runs every powertrain family (Gas ICE, Diesel, H₂ ICE, H₂ FC, Rotary Gas/H₂,
 * REX Gas/Diesel, BEV) over a representative set of legal aero trims.
 * Each build: 15 min quali + 6h race on Spa and Le Mans.
 *
 * Usage (repo root):
 *   node tools/benchmark/run_powertrain_sweep.mjs
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

const OUT_DIR = path.join(repoRoot, "tmp/benchmark/powertrain_sweep");
const SWEEP_DIR = path.join(repoRoot, "tmp/sweep");
const SIM_DT = 0.1;
const TIME_SCALE = parseFloat(process.env.TIME_SCALE ?? "2000");
const DURATION_HOURS = parseFloat(process.env.DURATION_HOURS ?? "6");
const QUALI_SECONDS = 900;

const DRIVER_BLOCK =
  "entry=Sweep,1\n" +
  "driver=Bot Quali|GB|Platinum|93|87|91|89|86|88|88|86|85|87|82|90|86|84|88|3.5\n";

// Aero trims: meta picks from the full 1444-combo sweep (quali, race, stint trims).
const FRONTS = ["LowDragNose"];
const REARS = ["WinglessGroundEffect", "StandardWingLowDrag"];
const DIFFUSERS = [
  "DoubleDeckerDiffuser",
  "FlatFloor",
  "StrakedDiffuser",
  "StandardDiffuser",
];
const ICE_EXHAUSTS = [
  "StraightLowRestriction",
  "SideExitTwin",
  "TwinOutletSide",
  "BlownDiffuser",
];
const DIESEL_EXHAUSTS = [...ICE_EXHAUSTS, "DieselDPF", "DieselDPFSport"];
const EV_OUTLETS = [
  "None",
  "ActiveUnderbody",
  "LowDragUnderfloor",
  "ThermalScoop",
  "WakeNeutralBody",
];

const COMMON = {
  cooling_pack: "MaxFlowEndurance",
  wheel_package: "Hypercar18Standard",
  brake_system: "BremboHypercar",
};

/** Powertrain family definitions — engine + drivetrain-coupled slots. */
const FAMILIES = [
  {
    tag: "Gas-ICE",
    exhausts: ICE_EXHAUSTS,
    build: {
      chassis_type: "LMDhDallara",
      suspension_layout: "PushrodDoubleWishbone",
      fuel_system: "LeMans110L",
      transmission: "XtracP1359",
      hybrid_system: "LMDh50kW",
      engine: {
        engine_layout: "V8", fuel_type: "Gasoline", cylinders: 8,
        bore: 0.093, stroke: 0.074, max_rpm: 8200,
        peak_torque_nm: 650, peak_torque_rpm: 6800, base_vibration: 1.0,
        aspiration: "TwinParallel", drivetrain: "ParallelHybrid",
      },
    },
  },
  {
    // Control: same V8 gas engine as Gas-ICE but with the 200 kW front-axle hybrid,
    // to isolate hybrid vs fuel effects when comparing against H2-ICE.
    tag: "Gas-ICE-HV",
    exhausts: ICE_EXHAUSTS,
    build: {
      chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone",
      fuel_system: "LeMans110L",
      transmission: "XtracP1359",
      hybrid_system: "HypercarHV",
      engine: {
        engine_layout: "V8", fuel_type: "Gasoline", cylinders: 8,
        bore: 0.093, stroke: 0.074, max_rpm: 8200,
        peak_torque_nm: 650, peak_torque_rpm: 6800, base_vibration: 1.0,
        aspiration: "TwinParallel", drivetrain: "FrontAxleHybrid",
      },
    },
  },
  {
    tag: "Diesel",
    exhausts: DIESEL_EXHAUSTS,
    build: {
      chassis_type: "LMDhDallara",
      suspension_layout: "PushrodDoubleWishbone",
      fuel_system: "LeMans110L",
      transmission: "XtracP1359",
      hybrid_system: "LMDh50kW",
      engine: {
        engine_layout: "V8", fuel_type: "Diesel", cylinders: 8,
        bore: 0.095, stroke: 0.09, max_rpm: 5600,
        peak_torque_nm: 900, peak_torque_rpm: 3600, base_vibration: 1.3,
        aspiration: "Single", drivetrain: "ParallelHybrid",
      },
    },
  },
  {
    tag: "H2-ICE",
    exhausts: ICE_EXHAUSTS,
    build: {
      chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone",
      fuel_system: "HydrogenTank",
      transmission: "XtracP1359",
      hybrid_system: "HypercarHV",
      engine: {
        engine_layout: "V6", fuel_type: "Hydrogen", energy_converter: "Combustion",
        cylinders: 6, bore: 0.086, stroke: 0.075, max_rpm: 8500,
        peak_torque_nm: 700, peak_torque_rpm: 6500, base_vibration: 1.0,
        aspiration: "TwinParallel", drivetrain: "FrontAxleHybrid",
      },
    },
  },
  {
    tag: "H2-FC",
    exhausts: EV_OUTLETS,
    build: {
      chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone",
      fuel_system: "HydrogenTank",
      transmission: "SingleSpeedEDrive",
      hybrid_system: "None",
      engine: {
        engine_layout: "V6", fuel_type: "Hydrogen", energy_converter: "FuelCell",
        cylinders: 6, bore: 0.08, stroke: 0.06, max_rpm: 12000,
        peak_torque_nm: 630, peak_torque_rpm: 10200, base_vibration: 0.2,
        aspiration: "NA", drivetrain: "FullEV",
        generator_kw: 420, buffer_size: 0.55,
      },
    },
  },
  {
    // LMDh chassis: LMDh50kW hybrid is incompatible with LMHInHouse.
    tag: "Rotary-Gas",
    exhausts: ICE_EXHAUSTS,
    build: {
      chassis_type: "LMDhDallara",
      suspension_layout: "PushrodDoubleWishbone",
      fuel_system: "LeMans110L",
      transmission: "XtracP1359",
      hybrid_system: "LMDh50kW",
      engine: {
        engine_layout: "Rotary", fuel_type: "Gasoline", cylinders: 2,
        bore: 0.08, stroke: 0.07, max_rpm: 9500,
        peak_torque_nm: 480, peak_torque_rpm: 7800, base_vibration: 0.6,
        aspiration: "Single", drivetrain: "ParallelHybrid",
      },
    },
  },
  {
    tag: "Rotary-H2",
    exhausts: ICE_EXHAUSTS,
    build: {
      chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone",
      fuel_system: "HydrogenTank",
      transmission: "XtracP1359",
      hybrid_system: "HypercarHV",
      engine: {
        engine_layout: "Rotary", fuel_type: "Hydrogen", energy_converter: "Combustion",
        cylinders: 2, bore: 0.08, stroke: 0.07, max_rpm: 9500,
        peak_torque_nm: 450, peak_torque_rpm: 7800, base_vibration: 0.6,
        aspiration: "Single", drivetrain: "FrontAxleHybrid",
      },
    },
  },
  {
    // Battery packs require fuel_type=Electric; generator fuel is not modeled separately.
    tag: "REX",
    exhausts: EV_OUTLETS,
    build: {
      chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone",
      fuel_system: "BatteryPackEndurance",
      transmission: "SingleSpeedEDrive",
      hybrid_system: "None",
      engine: {
        engine_layout: "I4", fuel_type: "Electric", cylinders: 4,
        bore: 0.086, stroke: 0.08, max_rpm: 6500,
        peak_torque_nm: 380, peak_torque_rpm: 4800, base_vibration: 0.8,
        aspiration: "NA", drivetrain: "RangeExtender", generator_kw: 280,
      },
    },
  },
  {
    tag: "BEV",
    exhausts: EV_OUTLETS,
    build: {
      chassis_type: "LMHInHouse",
      suspension_layout: "PullrodDoubleWishbone",
      fuel_system: "BatteryPackEndurance",
      transmission: "SingleSpeedEDrive",
      hybrid_system: "None",
      engine: {
        engine_layout: "V6", fuel_type: "Electric", cylinders: 6,
        bore: 0.08, stroke: 0.06, max_rpm: 14000,
        peak_torque_nm: 720, peak_torque_rpm: 9000, base_vibration: 0.1,
        aspiration: "NA", drivetrain: "FullEV",
      },
    },
  },
];

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

function writeRaceConfig({ relPath, trackPath, carPath, sessionMode, durationHours, durationSeconds }) {
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
    s.fuel <= tank * fuelCrit ? 0 : burn > 0 ? (s.fuel - tank * fuelCrit) / burn : 99;
  const wearRate = wear / lap;
  const tyreLaps =
    wear >= tyreCrit ? 0 : wearRate > 0 ? (tyreCrit - wear) / wearRate : 99;
  if (Math.abs(fuelLaps - tyreLaps) <= 1) return "both";
  return fuelLaps < tyreLaps ? "fuel" : "tyre";
}

function mode(arr) {
  if (!arr.length) return "none";
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function runSession({ configRel, sessionType }) {
  const pitBot = new PitBotManager();
  pitBot.reset();
  if (!sim.initFromRaceConfig(configRel)) throw new Error(`init failed: ${configRel}`);

  const managed = new Set();
  let pitBotAccum = 0;
  const raceLaps = [];
  const stints = [];
  let stintStartLap = 1;
  let fuelAtLastPit = 110;
  let sincePit = 0;

  while (!sim.isRaceComplete()) {
    let remaining = SIM_DT * TIME_SCALE;
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
        stints.push({
          laps: Math.max(1, s.lap - stintStartLap),
          cause: stintLimitCause(s, sincePit, fuelAtLastPit),
        });
        stintStartLap = s.lap;
        fuelAtLastPit = s.fuel;
        sincePit = 0;
      }
    }
  }

  const s = sim.getSnapshots()[0];
  return {
    bestLap: s.bestLapTime,
    racePace: raceLaps.length
      ? raceLaps.reduce((a, b) => a + b, 0) / raceLaps.length
      : s.bestLapTime,
    laps: s.lap,
    pitCount: s.pitCount ?? stints.length,
    avgStintLaps: stints.length
      ? stints.reduce((a, b) => a + b.laps, 0) / stints.length
      : s.lap,
    dominantStintCause: mode(stints.map((x) => x.cause)),
    retired: s.retired,
    retireReason: s.retireReason ?? "",
    engineHealth: s.engineHealth,
  };
}

function fmtLap(sec) {
  if (!sec || sec <= 0 || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0")}`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SWEEP_DIR, { recursive: true });
  const rules = loadAssemblyRules(repoRoot);

  // Enumerate legal trims per family
  const familyFilter = process.env.FAMILIES?.split(",").map((s) => s.trim());
  const families = familyFilter
    ? FAMILIES.filter((f) => familyFilter.includes(f.tag))
    : FAMILIES;
  const jobs = [];
  for (const fam of families) {
    for (const front of FRONTS)
      for (const rear of REARS)
        for (const diffuser of DIFFUSERS)
          for (const exhaust of fam.exhausts) {
            const build = {
              ...COMMON,
              ...fam.build,
              carName: `${fam.tag} sweep`,
              front_aero_type: front,
              rear_aero_type: rear,
              diffuser_type: diffuser,
              exhaust_type: exhaust,
            };
            if (validateAssemblyCompatibility(build, rules)) continue;
            jobs.push({ tag: fam.tag, front, rear, diffuser, exhaust, build });
          }
  }

  console.log(`Powertrain sweep: ${jobs.length} builds × 2 tracks (quali + ${DURATION_HOURS}h race)`);
  const byFam = {};
  for (const j of jobs) byFam[j.tag] = (byFam[j.tag] ?? 0) + 1;
  console.log("Trims per family:", JSON.stringify(byFam));

  const results = [];
  const t0 = Date.now();
  let done = 0;

  for (const job of jobs) {
    const carRel = `tmp/sweep/pt_${job.tag}_${job.rear}_${job.diffuser}_${job.exhaust}.txt`;
    writeCarConfig(job.build, carRel);
    fs.writeFileSync(
      path.join(repoRoot, "tmp/sweep/entries.txt"),
      `entry=Sweep,${carRel},Hypercar,1,1\n`,
    );
    fs.writeFileSync(path.join(repoRoot, "tmp/sweep/drivers.txt"), DRIVER_BLOCK);

    const row = {
      powertrain: job.tag,
      front: job.front,
      rear: job.rear,
      diffuser: job.diffuser,
      exhaust: job.exhaust,
    };

    for (const track of Object.values(TRACKS)) {
      const qualiRel = `tmp/sweep/pt_quali_${track.id}.txt`;
      writeRaceConfig({
        relPath: qualiRel, trackPath: track.path, carPath: carRel,
        sessionMode: "qualifying", durationSeconds: QUALI_SECONDS,
      });
      const raceRel = `tmp/sweep/pt_race_${track.id}.txt`;
      writeRaceConfig({
        relPath: raceRel, trackPath: track.path, carPath: carRel,
        sessionMode: "race", durationHours: DURATION_HOURS,
      });
      try {
        const quali = runSession({ configRel: qualiRel, sessionType: "qualifying" });
        const race = runSession({ configRel: raceRel, sessionType: "race" });
        Object.assign(row, {
          [`${track.id}_quali_sec`]: quali.bestLap,
          [`${track.id}_race_lap_sec`]: race.racePace,
          [`${track.id}_stint_laps`]: race.avgStintLaps,
          [`${track.id}_stint_cause`]: race.dominantStintCause,
          [`${track.id}_total_laps`]: race.laps,
          [`${track.id}_pits`]: race.pitCount,
          [`${track.id}_retired`]: race.retired,
          [`${track.id}_retire_reason`]: race.retireReason,
          [`${track.id}_engine_health`]: race.engineHealth,
        });
      } catch (err) {
        row[`${track.id}_error`] = err.message;
      }
    }

    results.push(row);
    done++;
    if (done % 20 === 0 || done === jobs.length) {
      const elapsed = (Date.now() - t0) / 1000;
      const eta = ((jobs.length - done) / (done / elapsed)) / 60;
      process.stdout.write(`  ${done}/${jobs.length} (ETA ${eta.toFixed(1)}m)\n`);
    }
  }

  const stamp = Date.now();
  const jsonPath = path.join(OUT_DIR, `powertrains_${stamp}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        durationHours: DURATION_HOURS,
        wallSeconds: (Date.now() - t0) / 1000,
        results,
      },
      null,
      2,
    ),
  );

  // Per-family summary
  console.log("\n========== POWERTRAIN SUMMARY ==========");
  for (const track of Object.values(TRACKS)) {
    const qk = `${track.id}_quali_sec`;
    const rk = `${track.id}_race_lap_sec`;
    const sk = `${track.id}_stint_laps`;
    const lk = `${track.id}_total_laps`;
    console.log(`\n## ${track.name}`);
    console.log("| Family | Best quali | Best race pace | Max laps (6h) | Avg stint | Retired |");
    console.log("|--------|-----------|----------------|---------------|-----------|---------|");
    for (const fam of families) {
      const rows = results.filter((r) => r.powertrain === fam.tag && r[qk] > 0);
      if (!rows.length) {
        console.log(`| ${fam.tag} | — | — | — | — | all failed |`);
        continue;
      }
      const bq = Math.min(...rows.map((r) => r[qk]));
      const br = Math.min(...rows.map((r) => r[rk]));
      const ml = Math.max(...rows.map((r) => r[lk]));
      const bestLapsRow = rows.find((r) => r[lk] === ml);
      const retiredCount = rows.filter((r) => r[`${track.id}_retired`]).length;
      console.log(
        `| ${fam.tag} | ${fmtLap(bq)} | ${fmtLap(br)} | ${ml} | ${bestLapsRow[sk].toFixed(1)}L (${bestLapsRow[`${track.id}_stint_cause`]}) | ${retiredCount}/${rows.length} |`,
      );
    }
  }

  console.log(`\nSaved ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
