#!/usr/bin/env npx tsx
/**
 * Populate pit_lane.polyline (with role-marked nodes) on all catalog tracks.
 * Baseline matches C++ GenerateDefaultPitLaneGeometry — edit manually after run.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { generateDefaultPitLaneFields } from "../server/src/game/pit_lane_baseline.ts";
import type { TrackJson } from "../server/src/game/track_json.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracksDir = path.join(repoRoot, "tracks");
const force = process.argv.includes("--force");

function migrateFile(filePath: string): boolean {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as TrackJson;
  if (raw.pit_lane?.polyline?.length && !force) {
    console.log(`skip ${path.basename(filePath)} (polyline exists)`);
    return false;
  }
  const pit_lane = generateDefaultPitLaneFields(raw);
  const next: TrackJson = { ...raw, pit_lane };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(
    `wrote ${path.basename(filePath)} — ${pit_lane.polyline?.length ?? 0} pit nodes`,
  );
  return true;
}

const files = fs
  .readdirSync(tracksDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

let count = 0;
for (const file of files) {
  if (migrateFile(path.join(tracksDir, file))) count++;
}
console.log(`Done. Updated ${count} track file(s).`);
