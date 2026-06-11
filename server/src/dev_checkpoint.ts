import * as fs from "fs";
import * as path from "path";
import type { SessionInitExtra } from "./sim_host";
import type {
  EntrySessionBriefing,
  SessionKind,
  SimEvent,
  StartPrivateTestPayload,
  WeekendSessionType,
} from "./ws_protocol";
import type { SessionEntryRosters } from "./game/driver_catalog";
import type { ParsedEntry } from "./config_parser";
import type { CarPitState } from "./game/pitbot/pit_wall";
import type { AiStintPlan } from "./llm/stint_plan";
import type { StaffMemberPayload } from "./ws_protocol";

export const DEV_CHECKPOINT_VERSION = 1;
export const DEV_CHECKPOINT_REL = "server/data/dev_checkpoint.json";

export interface DevCheckpointHostOverlay {
  inRaceSession: boolean;
  paused: boolean;
  timeScale: number;
  raceConfigPath: string;
  sessionExtra: SessionInitExtra;
  entries: ParsedEntry[];
  fleetEntryMap: [string, string][];
  runtimePlayerEntryId: string;
  runtimeManagedEntryIds: string[];
  activeRoundNumber: number;
  sessionKind: SessionKind;
  privateTestPayload: StartPrivateTestPayload | null;
  sessionEntryRosters: SessionEntryRosters;
  pitBot: {
    carState: [string, CarPitState][];
    gridSetupDone: boolean;
  };
  stintGuide: {
    plans: [string, AiStintPlan][];
    pitCounts: [string, number][];
    raceStarted: boolean;
  };
  sessionBriefings: {
    byEntryId: Record<string, EntrySessionBriefing>;
    sessionType: WeekendSessionType;
    classByEntry: [string, string][];
    fleetCarByEntry: [string, string][];
    staff: StaffMemberPayload[];
  };
  sessionLog: {
    activeId: string | null;
    events: SimEvent[];
  };
}

export interface DevCheckpointFile {
  version: number;
  savedAt: string;
  bindingSource: string;
  sim: Record<string, unknown>;
  host: DevCheckpointHostOverlay;
}

export function devCheckpointPath(repoRoot: string): string {
  return path.join(repoRoot, DEV_CHECKPOINT_REL);
}

export function writeDevCheckpoint(
  repoRoot: string,
  payload: DevCheckpointFile,
): string {
  const abs = devCheckpointPath(repoRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(payload, null, 2) + "\n");
  return abs;
}

export function readDevCheckpoint(repoRoot: string): DevCheckpointFile | null {
  const abs = devCheckpointPath(repoRoot);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8")) as DevCheckpointFile;
  } catch {
    return null;
  }
}

export function readDevCheckpointFile(filePath: string): DevCheckpointFile | null {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8")) as DevCheckpointFile;
  } catch {
    return null;
  }
}
