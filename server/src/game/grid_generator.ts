import * as fs from "fs";
import * as path from "path";
import { formatEntryLine, parseCarNumber } from "../config_parser";
import type { FleetCarPayload } from "../ws_protocol";
import { fleetEntryMode } from "./experimental_entry";

export interface GridTemplate {
  classId: string;
  count: number;
  templateCar: string;
}

export interface GeneratedEntry {
  entryId: string;
  teamName: string;
  carConfigPath: string;
  classId: string;
  grid: number;
  carNumber: string;
  isPlayer: boolean;
  fleetCarId?: string;
  entryMode?: FleetCarPayload["entryMode"];
}

export interface LeMansGridEntry {
  teamName: string;
  carConfigPath: string;
  classId: string;
  grid: number;
  carNumber: string;
}

/** Official 2026 Le Mans entry list (62-car grid + optional reserves). */
export const LEMANS_ENTRIES_PATH = "configs/entries.txt";
export const LEMANS_OFFICIAL_GRID_SIZE = 62;

export function loadLeMansEntries(
  repoRoot: string,
  options: { includeReserves?: boolean } = {},
): LeMansGridEntry[] {
  const abs = path.join(repoRoot, LEMANS_ENTRIES_PATH);
  if (!fs.existsSync(abs)) return [];

  const entries: LeMansGridEntry[] = [];
  let inReserveSection = false;

  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      if (trimmed.startsWith("# Reserve Hypercar")) {
        inReserveSection = true;
      }
      continue;
    }
    if (!trimmed.startsWith("entry=")) continue;
    if (inReserveSection && !options.includeReserves) continue;

    const parts = trimmed.slice("entry=".length).split(",");
    if (parts.length < 4) continue;

    const grid = parseInt(parts[3].trim(), 10);
    if (!Number.isFinite(grid) || grid <= 0) continue;
    if (!options.includeReserves && grid > LEMANS_OFFICIAL_GRID_SIZE) continue;

    const carConfigPath = parts[1].trim();
    const configAbs = path.join(repoRoot, carConfigPath);
    if (!fs.existsSync(configAbs)) {
      console.warn(
        `[grid_generator] Skipping grid ${grid}: missing car config ${carConfigPath}`,
      );
      continue;
    }

    entries.push({
      teamName: parts[0].trim(),
      carConfigPath,
      classId: parts[2].trim(),
      grid,
      carNumber: parseCarNumber(parts[4], grid),
    });
  }

  entries.sort((a, b) => a.grid - b.grid);
  return entries;
}

/** Parse class_rules template_car= lines when present. */
export function loadClassTemplates(repoRoot: string): Map<string, string> {
  const rulesPath = path.join(repoRoot, "configs/class_rules.txt");
  const templates = new Map<string, string>();
  if (!fs.existsSync(rulesPath)) return templates;

  let currentClass = "";
  for (const line of fs.readFileSync(rulesPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("class=")) {
      currentClass = trimmed.slice("class=".length).trim();
      continue;
    }
    if (trimmed.startsWith("template_car=") && currentClass) {
      templates.set(currentClass, trimmed.slice("template_car=".length).trim());
    }
  }
  return templates;
}

function mergePlayerFleet(
  base: LeMansGridEntry[],
  options: {
    playerTeamName: string;
    playerEntryId: string;
    playerFleet?: FleetCarPayload[];
    playerCarId?: string;
    playerCarPath?: string;
    playerClassId?: string;
  },
): GeneratedEntry[] {
  const playerFleet = options.playerFleet ?? [];
  const fleetByClass = new Map<string, FleetCarPayload[]>();
  for (const car of playerFleet) {
    const list = fleetByClass.get(car.classId) ?? [];
    list.push(car);
    fleetByClass.set(car.classId, list);
  }
  const fleetUsed = new Map<string, number>();

  const merged: GeneratedEntry[] = base.map((entry) => {
    const fleetInClass = fleetByClass.get(entry.classId) ?? [];
    const used = fleetUsed.get(entry.classId) ?? 0;

    if (used < fleetInClass.length) {
      const fleetCar = fleetInClass[used];
      fleetUsed.set(entry.classId, used + 1);
      const entryId = `entry-${entry.grid}`;
      return {
        entryId,
        teamName: options.playerTeamName,
        carConfigPath: fleetCar.carConfigPath,
        classId: fleetCar.classId,
        grid: entry.grid,
        carNumber: fleetCar.carNumber,
        isPlayer: true,
        fleetCarId: fleetCar.id,
        entryMode: fleetEntryMode(fleetCar),
      };
    }

    const entryId = `entry-${entry.grid}`;
    const isPlayerLegacy =
      playerFleet.length === 0 &&
      entryId === options.playerEntryId &&
      entry.classId === (options.playerClassId ?? "Hypercar");

    return {
      entryId,
      teamName: isPlayerLegacy ? options.playerTeamName : entry.teamName,
      carConfigPath:
        isPlayerLegacy && options.playerCarPath
          ? options.playerCarPath
          : entry.carConfigPath,
      classId: entry.classId,
      grid: entry.grid,
      carNumber: entry.carNumber,
      isPlayer: isPlayerLegacy,
    };
  });

  for (const [classId, fleetInClass] of fleetByClass) {
    const used = fleetUsed.get(classId) ?? 0;
    if (used >= fleetInClass.length) continue;
    if (base.some((e) => e.classId === classId)) continue;

    let grid = merged.reduce((max, e) => Math.max(max, e.grid), 0) + 1;
    for (let i = used; i < fleetInClass.length; i++) {
      const fleetCar = fleetInClass[i];
      const entryId = `entry-${grid}`;
      merged.push({
        entryId,
        teamName: options.playerTeamName,
        carConfigPath: fleetCar.carConfigPath,
        classId: fleetCar.classId,
        grid,
        carNumber: fleetCar.carNumber,
        isPlayer: true,
        fleetCarId: fleetCar.id,
        entryMode: fleetEntryMode(fleetCar),
      });
      grid++;
    }
  }

  merged.sort((a, b) => a.grid - b.grid);
  return merged;
}

export function generatePlayerOnlyGrid(options: {
  playerTeamName: string;
  playerFleet: FleetCarPayload[];
  playerCarId?: string;
}): GeneratedEntry[] {
  const fleet = options.playerFleet;
  if (!fleet.length) return [];

  let grid = 1;
  return fleet.map((fleetCar) => {
    const entry: GeneratedEntry = {
      entryId: `entry-${grid}`,
      teamName: options.playerTeamName,
      carConfigPath: fleetCar.carConfigPath,
      classId: fleetCar.classId,
      grid,
      carNumber: fleetCar.carNumber,
      isPlayer: true,
      fleetCarId: fleetCar.id,
      entryMode: fleetEntryMode(fleetCar),
    };
    grid++;
    return entry;
  });
}

export function generateGrid(options: {
  repoRoot: string;
  playerTeamName: string;
  playerEntryId: string;
  playerFleet?: FleetCarPayload[];
  playerCarId?: string;
  playerCarPath?: string;
  playerClassId?: string;
  seasonYear: number;
  includeReserves?: boolean;
  /** @deprecated ignored — grid comes from configs/entries.txt */
  templates?: GridTemplate[];
}): GeneratedEntry[] {
  const base = loadLeMansEntries(options.repoRoot, {
    includeReserves: options.includeReserves,
  });
  if (base.length === 0) {
    console.warn("[grid_generator] No Le Mans entries loaded");
    return [];
  }

  return mergePlayerFleet(base, options);
}

export function writeEntriesFile(
  repoRoot: string,
  relPath: string,
  entries: GeneratedEntry[],
): string {
  const abs = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const lines = [
    "# Generated grid — 2026 Le Mans entry list with player fleet merged",
    "# entry=team,config,class,start_grid,car_number,entry_id",
    ...entries.map((e) =>
      formatEntryLine({
        teamName: e.teamName,
        carConfigPath: e.carConfigPath,
        classId: e.classId,
        grid: e.grid,
        carNumber: e.carNumber,
        entryId: e.entryId,
      }),
    ),
  ];
  fs.writeFileSync(abs, lines.join("\n") + "\n");
  return relPath;
}
