#!/usr/bin/env node
/**
 * Headless endurance benchmark — stock or exotic grid on long races.
 *
 * Usage (from repo root):
 *   node tools/benchmark/run_endurance.mjs
 *   ENTRIES_PATH=configs/entries.txt DURATION_HOURS=24 RUNS=3 TIME_SCALE=600 node tools/benchmark/run_endurance.mjs
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
  lemans: {
    id: "lemans",
    name: "Circuit de la Sarthe",
    path: "tracks/lemans_la_sarthe.json",
    defaultHours: 24,
  },
  spa: {
    id: "spa",
    name: "Spa-Francorchamps",
    path: "tracks/spa.json",
    defaultHours: 24,
  },
  ricard: {
    id: "ricard",
    name: "Paul Ricard",
    path: "tracks/paul_ricard.json",
    defaultHours: 24,
  },
};

const ENTRIES_PATH =
  process.env.ENTRIES_PATH ?? "configs/entries/exotic_benchmark.txt";
const DRIVER_CONFIG =
  process.env.DRIVER_CONFIG ??
  (ENTRIES_PATH === "configs/entries.txt"
    ? "configs/drivers/lemans2026_drivers.txt"
    : null);
const OUT_DIR = path.join(repoRoot, "tmp/benchmark");
const SIM_TIMESTEP = 0.1;

const GENERIC_DRIVER =
  "driver=Alex Benchmark|GB|Gold|86|80|84|82|80|82|80|78|76|80|76|82|78|74|82|3\n" +
  "driver=Sam Endurance|US|Gold|85|79|83|81|79|81|79|77|75|79|75|81|77|73|81|3\n" +
  "driver=Chris Stint|DE|Silver|80|74|78|76|74|76|74|72|70|74|72|76|72|68|78|2.5\n";

function parseEntries(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const entries = [];
  for (const line of lines) {
    if (!line.startsWith("entry=")) continue;
    const parts = line.slice(6).split(",");
    if (parts.length < 5) continue;
    entries.push({
      teamName: parts[0],
      carConfig: parts[1],
      classId: parts[2],
      grid: parseInt(parts[3], 10),
      carNumber: parts[4],
    });
  }
  return entries;
}

function writeDriversFile(entries, outPath) {
  const blocks = entries.map(
    (e) => `entry=${e.teamName},${e.carNumber}\n${GENERIC_DRIVER}`,
  );
  fs.writeFileSync(outPath, blocks.join("\n") + "\n");
}

function writeRaceConfig({ trackPath, durationHours, driversPath, outPath }) {
  const body = `# Auto-generated endurance benchmark
part_catalog=configs/part_catalog.txt
physics_config=configs/physics_config.txt
track_config=${trackPath}
car_config=configs/car_config.txt
target_laps=0
target_duration_hours=${durationHours}
sim_timestep=${SIM_TIMESTEP}
telemetry_output=
entries=${ENTRIES_PATH}
driver_config=${driversPath}
class_rules=configs/class_rules.txt
`;
  fs.writeFileSync(outPath, body);
}

function fmtLap(sec) {
  if (!sec || sec <= 0 || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

function fmtHours(sec) {
  return (sec / 3600).toFixed(2);
}

function powertrainTag(carConfigPath) {
  const base = path.basename(carConfigPath, ".txt");
  if (base.includes("h2_fc") || base.includes("fuel_cell")) return "H2-FC";
  if (base.includes("h2") || base.includes("h2_")) return "H2-ICE";
  if (base.includes("diesel_rex") || base.includes("rex_diesel")) return "REX-D";
  if (base.includes("rex")) return "REX-G";
  if (base.includes("fullev")) return "FullEV";
  if (base.includes("diesel")) return "Diesel";
  if (base.includes("toyota") || base.includes("bmw") || base.includes("ferrari"))
    return "Stock-G";
  if (base.includes("peugeot") || base.includes("aston") || base.includes("cadillac"))
    return "Stock-G";
  if (base.includes("alpine") || base.includes("genesis") || base.includes("porsche"))
    return "Stock-G";
  return "Gas-ICE";
}

function runRace({ track, durationHours, timeScale }) {
  const stamp = Date.now();
  const generatedDriversRel = `tmp/benchmark/drivers_${stamp}.txt`;
  const driversRel = DRIVER_CONFIG ?? generatedDriversRel;
  const configRel = `tmp/benchmark/race_${track.id}_${durationHours}h_${stamp}.txt`;
  const driversPath = path.join(repoRoot, driversRel);
  const configPath = path.join(repoRoot, configRel);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const entries = parseEntries(ENTRIES_PATH);
  if (!DRIVER_CONFIG) {
    writeDriversFile(entries, driversPath);
  }
  writeRaceConfig({
    trackPath: track.path,
    durationHours,
    driversPath: driversRel,
    outPath: configPath,
  });

  const pitBot = new PitBotManager();
  pitBot.reset();

  const t0 = Date.now();
  const ok = sim.initFromRaceConfig(configRel);
  if (!ok) throw new Error(`initFromRaceConfig failed: ${configRel}`);

  // Empty set = all entries get PitBot strategy (managed = human-controlled only).
  const managed = new Set();
  const targetDuration = durationHours * 3600;

  let lastLogHour = 0;
  let ticks = 0;
  let pitBotAccumSec = 0;
  const PITBOT_INTERVAL_SEC = 1.0;

  while (!sim.isRaceComplete()) {
    const frameDelta = SIM_TIMESTEP * timeScale;
    let remaining = frameDelta;
    while (remaining > 1e-9) {
      const dt = Math.min(SIM_TIMESTEP, remaining);
      sim.tick(dt);
      remaining -= dt;
      ticks++;
      pitBotAccumSec += dt;
      if (pitBotAccumSec >= PITBOT_INTERVAL_SEC) {
        pitBotAccumSec = 0;
        pitBot.tick(
          sim.getSnapshots(),
          managed,
          { weekendSessionType: "race", trackWetness: 0 },
          (entryId, command) => sim.submitCommand(entryId, command),
        );
      }
    }

    if (pitBotAccumSec > 0) {
      pitBot.tick(
        sim.getSnapshots(),
        managed,
        { weekendSessionType: "race", trackWetness: 0 },
        (entryId, command) => sim.submitCommand(entryId, command),
      );
      pitBotAccumSec = 0;
    }

    const raceTime = sim.getRaceTime();
    const snapshots = sim.getSnapshots();

    for (const ev of sim.drainEvents()) {
      void ev;
    }

    const hour = Math.floor(raceTime / 3600);
    if (hour > lastLogHour) {
      lastLogHour = hour;
      const racing = snapshots.filter((s) => !s.retired).length;
      process.stdout.write(
        `  [${track.id}] ${hour}h sim — ${racing}/${snapshots.length} racing (${((Date.now() - t0) / 1000).toFixed(0)}s wall)\n`,
      );
    }
  }

  const raceTime = sim.getRaceTime();
  const snapshots = sim.getSnapshots().sort(
    (a, b) => a.racePosition - b.racePosition,
  );

  const results = snapshots.map((s) => {
    const entry = entries.find((e) => e.carNumber === s.carNumber);
    return {
      position: s.racePosition,
      classId: entry?.classId ?? s.classId ?? "",
      classPosition: s.classPosition ?? null,
      teamName: s.teamName,
      carNumber: s.carNumber,
      carConfig: entry?.carConfig ?? "",
      powertrain: powertrainTag(entry?.carConfig ?? ""),
      laps: s.lap,
      bestLap: s.bestLapTime,
      lastLap: s.lastLapTime,
      retired: s.retired,
      retireReason: s.retireReason ?? "",
      pitCount: s.pitCount ?? 0,
      engineHealth: s.engineHealth,
      fuelRemaining: s.fuel,
      fuelTankCapacity: s.fuelTankCapacity,
    };
  });

  const wallSec = (Date.now() - t0) / 1000;
  return {
    track: track.id,
    trackName: track.name,
    durationHours,
    targetDurationSec: targetDuration,
    raceTimeSec: raceTime,
    timeScale,
    simTicks: ticks,
    wallSeconds: wallSec,
    simRatio: raceTime / wallSec,
    results,
  };
}

function summarizeByClass(allRaces) {
  const groups = new Map();
  for (const race of allRaces) {
    for (const r of race.results) {
      const key = r.classId || "Unknown";
      let g = groups.get(key);
      if (!g) {
        g = {
          classId: key,
          count: 0,
          finishes: 0,
          totalLaps: 0,
          totalPits: 0,
          bestLaps: [],
          engineHealths: [],
          classPositions: [],
          overallPositions: [],
        };
        groups.set(key, g);
      }
      g.count++;
      if (!r.retired) g.finishes++;
      g.totalLaps += r.laps;
      g.totalPits += r.pitCount;
      if (r.bestLap > 0) g.bestLaps.push(r.bestLap);
      g.engineHealths.push(r.engineHealth);
      g.overallPositions.push(r.position);
      if (r.classPosition != null) g.classPositions.push(r.classPosition);
    }
  }
  return [...groups.values()].map((g) => ({
    classId: g.classId,
    entries: g.count,
    finishRate: `${((g.finishes / g.count) * 100).toFixed(0)}%`,
    avgLaps: (g.totalLaps / g.count).toFixed(1),
    avgPits: (g.totalPits / g.count).toFixed(1),
    avgEngineHealth: (
      g.engineHealths.reduce((a, b) => a + b, 0) / g.engineHealths.length
    ).toFixed(1),
    avgBestLap: g.bestLaps.length
      ? fmtLap(g.bestLaps.reduce((a, b) => a + b, 0) / g.bestLaps.length)
      : "—",
    fastestBestLap: g.bestLaps.length
      ? fmtLap(Math.min(...g.bestLaps))
      : "—",
    avgOverallPos: (
      g.overallPositions.reduce((a, b) => a + b, 0) / g.overallPositions.length
    ).toFixed(1),
  }));
}

function summarizeByPowertrain(allRaces) {
  const groups = new Map();
  for (const race of allRaces) {
    for (const r of race.results) {
      const key = r.powertrain;
      let g = groups.get(key);
      if (!g) {
        g = {
          tag: key,
          count: 0,
          finishes: 0,
          retirements: 0,
          totalLaps: 0,
          totalPits: 0,
          bestLaps: [],
          engineHealths: [],
        };
        groups.set(key, g);
      }
      g.count++;
      if (!r.retired) g.finishes++;
      else g.retirements++;
      g.totalLaps += r.laps;
      g.totalPits += r.pitCount;
      if (r.bestLap > 0) g.bestLaps.push(r.bestLap);
      g.engineHealths.push(r.engineHealth);
    }
  }
  return [...groups.values()].map((g) => ({
    tag: g.tag,
    entries: g.count,
    finishRate: `${((g.finishes / g.count) * 100).toFixed(0)}%`,
    avgLaps: (g.totalLaps / g.count).toFixed(1),
    avgPits: (g.totalPits / g.count).toFixed(1),
    avgEngineHealth: (g.engineHealths.reduce((a, b) => a + b, 0) / g.engineHealths.length).toFixed(1),
    bestLapAvg: g.bestLaps.length
      ? fmtLap(g.bestLaps.reduce((a, b) => a + b, 0) / g.bestLaps.length)
      : "—",
  }));
}

function printReport(allRaces, { showPowertrain = true, showClass = true } = {}) {
  console.log("\n========== ENDURANCE BENCHMARK REPORT ==========\n");
  for (const race of allRaces) {
    console.log(
      `## ${race.trackName} — ${race.durationHours}h (run ${race.runIndex ?? 1}) (${fmtHours(race.raceTimeSec)}h sim, ${race.wallSeconds.toFixed(0)}s wall)\n`,
    );
    if (showClass) {
      console.log("### By class (class leader lap / best lap)\n");
      for (const cls of ["Hypercar", "LMP2", "LMGT3"]) {
        const inClass = race.results
          .filter((r) => r.classId === cls && !r.retired)
          .sort((a, b) => (a.classPosition ?? 99) - (b.classPosition ?? 99));
        if (!inClass.length) continue;
        const leader = inClass[0];
        const bestLap = Math.min(...inClass.map((r) => r.bestLap).filter((t) => t > 0));
        console.log(
          `  ${cls}: leader #${leader.carNumber} ${leader.laps} laps, best ${fmtLap(bestLap)}, ${inClass.length}/${race.results.filter((r) => r.classId === cls).length} finished`,
        );
      }
      console.log("");
    }
    if (allRaces.length === 1 || race.results.length <= 30) {
      console.log(
        "| Pos | Cls | # | Team | Laps | Best | Pits | Eng% | Status |",
      );
      console.log("|-----|-----|---|------|------|------|------|------|--------|");
      for (const r of race.results) {
        const status = r.retired ? `DNF: ${r.retireReason}` : "Finished";
        console.log(
          `| ${r.position} | ${r.classId} | ${r.carNumber} | ${r.teamName.slice(0, 18)} | ${r.laps} | ${fmtLap(r.bestLap)} | ${r.pitCount} | ${r.engineHealth.toFixed(0)} | ${status} |`,
        );
      }
      console.log("");
    }
  }

  if (showClass) {
    console.log("## Class summary (all runs)\n");
    const classSummary = summarizeByClass(allRaces);
    console.log(
      "| Class | Cars×runs | Finish% | Avg laps | Avg pits | Avg eng% | Avg best | Fastest | Avg overall pos |",
    );
    console.log(
      "|-------|-----------|---------|----------|----------|----------|----------|---------|-----------------|",
    );
    for (const s of classSummary.sort((a, b) =>
      a.classId.localeCompare(b.classId),
    )) {
      console.log(
        `| ${s.classId} | ${s.entries} | ${s.finishRate} | ${s.avgLaps} | ${s.avgPits} | ${s.avgEngineHealth} | ${s.avgBestLap} | ${s.fastestBestLap} | ${s.avgOverallPos} |`,
      );
    }
    console.log("");
  }

  if (showPowertrain) {
    console.log("## Powertrain summary (all races)\n");
    const summary = summarizeByPowertrain(allRaces);
    console.log("| Type | Runs | Finish% | Avg laps | Avg pits | Avg eng% | Avg best lap |");
    console.log("|------|------|---------|----------|----------|----------|--------------|");
    for (const s of summary.sort((a, b) => parseFloat(b.avgLaps) - parseFloat(a.avgLaps))) {
      console.log(
        `| ${s.tag} | ${s.entries} | ${s.finishRate} | ${s.avgLaps} | ${s.avgPits} | ${s.avgEngineHealth} | ${s.bestLapAvg} |`,
      );
    }
    console.log("");
  }
}

async function main() {
  const durationHours = parseFloat(process.env.DURATION_HOURS ?? "24");
  const timeScale = parseFloat(process.env.TIME_SCALE ?? "600");
  const runs = parseInt(process.env.RUNS ?? "1", 10);
  const trackFilter = (process.env.TRACKS ?? "lemans,spa,ricard")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const selectedTracks = trackFilter.map((id) => {
    const t = TRACKS[id];
    if (!t) throw new Error(`Unknown track: ${id}. Use: ${Object.keys(TRACKS).join(", ")}`);
    return t;
  });

  const lemans48 = process.env.LEMANS_48H === "1";
  const isStockGrid = ENTRIES_PATH === "configs/entries.txt";

  console.log(
    `Endurance benchmark — ${durationHours}h × ${selectedTracks.length} track(s) × ${runs} run(s), TIME_SCALE=${timeScale}`,
  );
  console.log(`Grid: ${ENTRIES_PATH} (${parseEntries(ENTRIES_PATH).length} cars)`);
  if (DRIVER_CONFIG) console.log(`Drivers: ${DRIVER_CONFIG}`);
  console.log("");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const allRaces = [];

  for (const track of selectedTracks) {
    for (let run = 1; run <= runs; run++) {
      console.log(`\n>>> ${track.name} (${durationHours}h) — run ${run}/${runs}...`);
      const result = runRace({ track, durationHours, timeScale });
      result.runIndex = run;
      allRaces.push(result);
      const outFile = path.join(
        OUT_DIR,
        `result_${track.id}_${durationHours}h_run${run}_${Date.now()}.json`,
      );
      fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
      console.log(`    Saved ${outFile}`);
    }
  }

  if (lemans48) {
    console.log("\n>>> Starting Le Mans 48h bonus...");
    const result = runRace({
      track: TRACKS.lemans,
      durationHours: 48,
      timeScale,
    });
    allRaces.push(result);
    fs.writeFileSync(
      path.join(OUT_DIR, `result_lemans_48h_${Date.now()}.json`),
      JSON.stringify(result, null, 2),
    );
  }

  printReport(allRaces, {
    showPowertrain: !isStockGrid,
    showClass: isStockGrid || allRaces.some((r) =>
      r.results.some((x) => x.classId === "LMP2" || x.classId === "LMGT3"),
    ),
  });

  const summaryName = isStockGrid
    ? "stock_lemans_summary.json"
    : "latest_summary.json";
  fs.writeFileSync(
    path.join(OUT_DIR, summaryName),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        entriesPath: ENTRIES_PATH,
        runs,
        races: allRaces,
        classSummary: summarizeByClass(allRaces),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
