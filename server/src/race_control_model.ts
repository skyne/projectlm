/** Shared race-control constants and types — mirrors race_control_common.hpp. */

export type FlagPhase =
  | "green"
  | "slow_zone"
  | "fcy"
  | "sc"
  | "sc_in_lap"
  | "red_flag";

export type TrackStatus = "racing" | "stranded" | "recovering" | "cleared";

export type PendingPenalty = "none" | "drive_through" | "stop_go" | "black";

export type HazardKind = "oil" | "coolant" | "debris" | "fuel" | "fire";

export interface SurfaceHazardSummary {
  sectorIndex: number;
  kind: HazardKind | string;
  gripMultiplier: number;
}

export interface MockRaceControlState {
  flagPhase: FlagPhase;
  sectorFlags: number[];
  fcyActive: boolean;
  scActive: boolean;
  scLapsRemaining: number;
  activeIncidentEntryId: string;
  whiteFlagActive: boolean;
  redFlagActive: boolean;
  redFlagSecondsRemaining: number;
  surfaceHazards: SurfaceHazardSummary[];
}

/** Mock stranded lifecycle — simplified from C++ marshal + tow timers. */
export const MOCK_MARSHAL_RESPONSE_SEC = 15;
export const MOCK_TOW_DURATION_SEC = 90;
export const MOCK_STRANDED_STOP_SEC = 3;

export const FLAG_PHASES: readonly FlagPhase[] = [
  "green",
  "slow_zone",
  "fcy",
  "sc",
  "sc_in_lap",
  "red_flag",
];

export const TRACK_STATUSES: readonly TrackStatus[] = [
  "racing",
  "stranded",
  "recovering",
  "cleared",
];

export const PENDING_PENALTIES: readonly PendingPenalty[] = [
  "none",
  "drive_through",
  "stop_go",
  "black",
];

export function defaultMockRaceControlState(): MockRaceControlState {
  return {
    flagPhase: "green",
    sectorFlags: [],
    fcyActive: false,
    scActive: false,
    scLapsRemaining: 0,
    activeIncidentEntryId: "",
    whiteFlagActive: false,
    redFlagActive: false,
    redFlagSecondsRemaining: 0,
    surfaceHazards: [],
  };
}

export function countTrackObstructions(
  trackStatuses: Iterable<TrackStatus | string | undefined>,
): number {
  let n = 0;
  for (const st of trackStatuses) {
    if (st === "stranded" || st === "recovering") n++;
  }
  return n;
}
