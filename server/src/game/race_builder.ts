import * as fs from "fs";
import * as path from "path";
import type { WeekendSessionType } from "./car_setup";
import { writeFleetCarConfig, type CarBuildPayload } from "./car_builder";
import { trackConfigPath } from "./track_catalog";
import { validateAndFixGrid } from "./grid_generator";
import { weatherForEvent } from "./weather_model";

export interface CalendarEvent {
  round: number;
  trackId: string;
  format: string;
  eventType: string;
  eventName: string;
  completed: boolean;
  championshipPoints?: number;
}

export interface FleetCarRecord {
  id: string;
  carNumber: string;
  classId: string;
  build: CarBuildPayload;
  carConfigPath: string;
}

export interface QualiResult {
  entryId: string;
  bestLapTime: number;
}

export interface BuiltRace {
  roundNumber: number;
  sessionType: WeekendSessionType;
  eventName: string;
  trackName: string;
  raceConfigPath: string;
  playerEntryId: string;
  targetDurationMinutes: number;
}

function formatDurationMinutes(format: string, session: WeekendSessionType): number {
  if (session === "practice") return format === "test" ? 45 : 60;
  if (session === "qualifying") return 15;
  switch (format) {
    case "test":
      return 30;
    case "6h":
      return 360;
    case "8h":
      return 480;
    case "24h":
      return 1440;
    case "1812km":
      return 720;
    default:
      return 180;
  }
}

function loadBaseEntries(repoRoot: string): string[] {
  const runtimePath = path.join(repoRoot, "configs/runtime/entries.txt");
  if (fs.existsSync(runtimePath)) {
    return fs
      .readFileSync(runtimePath, "utf8")
      .split("\n")
      .filter((line) => line.trim().startsWith("entry="));
  }
  const fallback = path.join(repoRoot, "configs/entries.txt");
  return fs
    .readFileSync(fallback, "utf8")
    .split("\n")
    .filter((line) => line.trim().startsWith("entry="));
}

function applyQualiGrid(
  entryLines: string[],
  qualiResults: QualiResult[],
): string[] {
  if (qualiResults.length === 0) return entryLines;

  const qualiByEntry = new Map(
    qualiResults.map((q) => [q.entryId, q.bestLapTime]),
  );

  const parsed = entryLines.map((line) => {
    const parts = line.slice("entry=".length).split(",");
    const grid = parseInt(parts[3]?.trim() ?? "0", 10);
    const entryId = `entry-${grid}`;
    return {
      parts,
      classId: parts[2]?.trim() ?? "",
      bestLap: qualiByEntry.get(entryId) ?? Number.POSITIVE_INFINITY,
    };
  });

  const byClass = new Map<string, typeof parsed>();
  for (const row of parsed) {
    const list = byClass.get(row.classId) ?? [];
    list.push(row);
    byClass.set(row.classId, list);
  }

  const classOrder = [...byClass.keys()];
  let gridCounter = 1;
  const finalLines: string[] = [];
  for (const classId of classOrder) {
    const rows = byClass.get(classId)!;
    rows.sort((a, b) => a.bestLap - b.bestLap);
    for (const row of rows) {
      const parts = [...row.parts];
      parts[3] = String(gridCounter++);
      finalLines.push(`entry=${parts.join(",")}`);
    }
  }
  return finalLines;
}

export function buildRaceForSession(
  repoRoot: string,
  event: CalendarEvent,
  session: WeekendSessionType,
  fleet: FleetCarRecord[],
  teamName: string,
  playerEntryId: string,
  tireCompound: string,
  carSetups: Record<string, import("./car_setup").CarSessionSetup>,
  qualiResults: QualiResult[],
): BuiltRace {
  const runtimeDir = path.join(repoRoot, "configs/runtime");
  const fleetDir = path.join(runtimeDir, "fleet");
  fs.mkdirSync(fleetDir, { recursive: true });

  for (const car of fleet) {
    const setup = carSetups[car.id];
    if (!setup) continue;
    const outPath = path.join(repoRoot, car.carConfigPath);
    writeFleetCarConfig(outPath, car.build, setup, tireCompound);
  }

  let entryLines = loadBaseEntries(repoRoot);

  for (let i = 0; i < entryLines.length; i++) {
    const parts = entryLines[i].slice("entry=".length).split(",");
    const fleetCar = fleet.find(
      (c) => c.carNumber === parts[4]?.trim() || c.carNumber === parts[3]?.trim(),
    );
    if (fleetCar && parts[0].trim() === teamName) {
      parts[1] = fleetCar.carConfigPath;
      entryLines[i] = `entry=${parts.join(",")}`;
    }
  }

  if (session === "race" && qualiResults.length > 0) {
    entryLines = applyQualiGrid(entryLines, qualiResults);
  }

  const entriesPath = path.join(runtimeDir, "entries.txt");
  fs.writeFileSync(
    entriesPath,
    `# Runtime grid — ${session}\n${entryLines.join("\n")}\n`,
    "utf8",
  );

  const gridFixes = validateAndFixGrid(repoRoot, "configs/runtime/entries.txt");
  if (gridFixes.length > 0) {
    console.log(
      `[race_builder] Auto-fixed ${gridFixes.length} illegal car config(s) for class rules`,
    );
  }

  const durationMin = formatDurationMinutes(event.format, session);
  const weather = weatherForEvent(event.trackId, event.format, event.round);
  const trackPath = trackConfigPath(event.trackId);
  const raceConfigPath = path.join(runtimeDir, "race.txt");

  const raceLines = [
    `# Runtime race — ${event.eventName} (${session})`,
    `part_catalog=configs/part_catalog.txt`,
    `physics_config=configs/physics_config.txt`,
    `track_config=${trackPath}`,
    `car_config=configs/car_config.txt`,
    `target_laps=0`,
    `target_duration_minutes=${durationMin}`,
    `session_type=${session}`,
    `sim_timestep=0.1`,
    `weather_profile=${weather.profile}`,
    `track_wetness=${weather.trackWetness.toFixed(3)}`,
    `ambient_temp_c=${weather.ambientTempC.toFixed(1)}`,
    `rng_seed=${20260306 + event.round}`,
    `telemetry_output=`,
    `entries=configs/runtime/entries.txt`,
    "",
  ];
  fs.writeFileSync(raceConfigPath, raceLines.join("\n"), "utf8");

  const trackAbs = path.join(repoRoot, trackPath);
  let trackName = event.trackId;
  try {
    const trackJson = JSON.parse(fs.readFileSync(trackAbs, "utf8")) as {
      name?: string;
    };
    trackName = trackJson.name ?? trackName;
  } catch {
    /* use trackId */
  }

  return {
    roundNumber: event.round,
    sessionType: session,
    eventName: event.eventName,
    trackName,
    raceConfigPath: "configs/runtime/race.txt",
    playerEntryId,
    targetDurationMinutes: durationMin,
  };
}
