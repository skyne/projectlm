import * as fs from "fs";
import * as path from "path";

export interface ParsedRaceConfig {
  trackConfigPath: string;
  targetLaps: number;
  targetDurationSeconds: number;
  simTimestep: number;
  entriesPath: string;
  classRulesPath: string;
}

export interface ParsedEntry {
  entryId: string;
  teamName: string;
  carNumber: string;
  classId: string;
  fleetCarId?: string;
}

export function parseCarNumber(raw: string | undefined, fallbackGrid: number): string {
  const trimmed = raw?.trim() ?? "";
  if (/^\d+$/.test(trimmed) && trimmed !== "0") return trimmed;
  return String(fallbackGrid);
}

/** Legacy id when entry_id column is absent — unique only for global grid slots. */
export function legacyEntryIdFromGrid(grid: number): string {
  return `entry-${grid}`;
}

export interface ParsedEntryFields {
  teamName: string;
  carConfigPath: string;
  classId: string;
  grid: number;
  carNumber: string;
  entryId: string;
}

/** Parse `entry=team,path,class,grid,car_number[,entry_id]` */
export function parseEntryFields(line: string): ParsedEntryFields | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("entry=")) {
    return null;
  }
  const parts = trimmed.slice("entry=".length).split(",");
  if (parts.length < 4) return null;
  const grid = parseInt(parts[3].trim(), 10);
  if (!Number.isFinite(grid) || grid <= 0) return null;

  const teamName = parts[0].trim();
  const carConfigPath = parts[1].trim();
  const classId = parts[2].trim();
  if (!teamName || !carConfigPath || !classId) return null;

  const carNumber = parseCarNumber(parts[4], grid);
  const explicitId = parts[5]?.trim();
  const entryId =
    explicitId && explicitId.length > 0 ? explicitId : legacyEntryIdFromGrid(grid);

  return { teamName, carConfigPath, classId, grid, carNumber, entryId };
}

export function formatEntryLine(fields: ParsedEntryFields): string {
  return `entry=${fields.teamName},${fields.carConfigPath},${fields.classId},${fields.grid},${fields.carNumber},${fields.entryId}`;
}

export function parseRaceConfig(
  repoRoot: string,
  configPath: string,
): ParsedRaceConfig {
  const abs = path.isAbsolute(configPath)
    ? configPath
    : path.join(repoRoot, configPath);
  const text = fs.readFileSync(abs, "utf8");
  const config: ParsedRaceConfig = {
    trackConfigPath: "tracks/sample_circuit.json",
    targetLaps: 0,
    targetDurationSeconds: 0,
    simTimestep: 0.1,
    entriesPath: "",
    classRulesPath: "configs/class_rules.txt",
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "track_config") config.trackConfigPath = val;
    else if (key === "target_laps") config.targetLaps = parseInt(val, 10);
    else if (key === "target_duration_hours")
      config.targetDurationSeconds = parseFloat(val) * 3600;
    else if (key === "target_duration_seconds")
      config.targetDurationSeconds = parseFloat(val);
    else if (key === "sim_timestep") config.simTimestep = parseFloat(val);
    else if (key === "entries") config.entriesPath = val;
    else if (key === "class_rules") config.classRulesPath = val;
  }

  return config;
}

export function parseEntries(
  repoRoot: string,
  entriesPath: string,
): ParsedEntry[] {
  const abs = path.join(repoRoot, entriesPath);
  const rows: ParsedEntry[] = [];

  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const parsed = parseEntryFields(line);
    if (!parsed) continue;
    rows.push({
      entryId: parsed.entryId,
      teamName: parsed.teamName,
      carNumber: parsed.carNumber,
      classId: parsed.classId,
    });
  }

  return rows;
}

export function loadTrackName(repoRoot: string, trackPath: string): string {
  const abs = path.join(repoRoot, trackPath);
  const track = JSON.parse(fs.readFileSync(abs, "utf8")) as { name?: string };
  return track.name ?? "Unknown";
}

export interface TrackMapLabelJson {
  text: string;
  x: number;
  z: number;
  anchor?: "start" | "middle" | "end";
}

export function loadMapLabels(
  repoRoot: string,
  trackPath: string,
): TrackMapLabelJson[] {
  const abs = path.join(repoRoot, trackPath);
  const track = JSON.parse(fs.readFileSync(abs, "utf8")) as {
    map_labels?: TrackMapLabelJson[];
  };
  return track.map_labels ?? [];
}
