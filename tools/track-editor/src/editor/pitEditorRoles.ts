import type { PitLanePointRole, PolylineNodeType } from "@server/game/track_json";

export const PIT_ROLE_COLORS: Record<PitLanePointRole, string> = {
  entry: "#3ecf6e",
  box: "#f0c040",
  exit: "#e85d5d",
  waypoint: "#c8a45a",
};

export const PIT_ROLE_LABELS: Record<PitLanePointRole, string> = {
  entry: "Entry",
  box: "Pit box",
  exit: "Exit / merge",
  waypoint: "Waypoint",
};

export const START_FINISH_NODE_COLOR = "#f0f0f0";
export const START_FINISH_NODE_STROKE = "#1a1a1a";

export const NODE_TYPE_COLORS: Record<PolylineNodeType, string> = {
  join: "#3ecf6e",
  normal: "#8eb4ff",
  turn_start: "#b47aff",
  turn_mid: "#ffb347",
  turn_end: "#ff7ab8",
  box: "#f0c040",
};

export const NODE_TYPE_LABELS: Record<PolylineNodeType, string> = {
  join: "Join (track split/merge)",
  normal: "Normal (straight checkpoint)",
  turn_start: "Turn start",
  turn_mid: "Turn mid (knee / direction change)",
  turn_end: "Turn end",
  box: "Pit box",
};

export const LAYOUT_NODE_TYPES: PolylineNodeType[] = [
  "normal",
  "turn_start",
  "turn_mid",
  "turn_end",
];
export const PIT_NODE_TYPES: PolylineNodeType[] = [
  "join",
  "normal",
  "turn_start",
  "turn_mid",
  "turn_end",
  "box",
];

/** @deprecated use NODE_TYPE_COLORS */
export const PIT_NODE_TYPE_COLORS = NODE_TYPE_COLORS;
/** @deprecated use NODE_TYPE_LABELS */
export const PIT_NODE_TYPE_LABELS = NODE_TYPE_LABELS;
