import type {
  CarSessionBriefing,
  MetaStatePayload,
  TrackSetupPresetPayload,
  WeekendSessionType,
} from "../ws/protocol";
import { resolveBriefingDefaults } from "./briefingTacticsClient";

export const BRIEFING_LABELS: Record<string, string> = {
  long_stint: "Long stint",
  setup_hunt: "Find best setup",
  quali_sim: "Quali simulation",
  shake_down: "Shake down",
  tyre_test: "Tyre test",
  fuel_calibration: "Fuel calibration",
  weather_scout: "Weather scout",
  pole_attack: "Go for pole",
  front_row: "Front row",
  best_effort: "Best effort",
  no_teammate_fight: "Best effort — don't fight teammate",
  teammate_support: "Support teammate",
  single_flyer: "Single flying lap",
  race_prep: "Race prep",
  traffic_tow: "Traffic tow",
  hammer_time: "Hammer time",
  conserve: "Conserve fuel & car",
  hold_position: "Hold position / gaps",
  attack: "Attack / undercut",
  defend: "Defend position",
  one_stop: "One-stop strategy",
  two_stop: "Two-stop strategy",
  damage_limit: "Bring it home",
  lift_and_coast: "Lift & coast",
  points_protect: "Points protection",
};

export function briefingLabel(id: string): string {
  return BRIEFING_LABELS[id] ?? id;
}

export function briefingIdsForSession(sessionType: WeekendSessionType): string[] {
  if (sessionType === "practice") {
    return [
      "long_stint",
      "setup_hunt",
      "quali_sim",
      "shake_down",
      "tyre_test",
      "fuel_calibration",
      "weather_scout",
    ];
  }
  if (sessionType === "qualifying") {
    return [
      "pole_attack",
      "front_row",
      "best_effort",
      "no_teammate_fight",
      "teammate_support",
      "single_flyer",
      "race_prep",
      "traffic_tow",
    ];
  }
  return [
    "hammer_time",
    "conserve",
    "hold_position",
    "attack",
    "defend",
    "one_stop",
    "two_stop",
    "damage_limit",
    "lift_and_coast",
    "points_protect",
  ];
}

export function defaultBriefingForSession(sessionType: WeekendSessionType): string {
  if (sessionType === "practice") return "setup_hunt";
  if (sessionType === "qualifying") return "best_effort";
  return "hold_position";
}

export type ChassisBias = "quali" | "race" | "stable";

export function chassisBiasForBriefing(briefingId: string): ChassisBias | undefined {
  if (
    briefingId === "quali_sim" ||
    briefingId === "pole_attack" ||
    briefingId === "single_flyer" ||
    briefingId === "front_row"
  ) {
    return "quali";
  }
  if (briefingId === "race_prep" || briefingId === "one_stop" || briefingId === "two_stop") {
    return "race";
  }
  if (briefingId === "shake_down" || briefingId === "long_stint") {
    return "stable";
  }
  return undefined;
}

export function applyChassisBiasChip(
  preset: TrackSetupPresetPayload,
  bias: ChassisBias,
): TrackSetupPresetPayload {
  const wing = preset.wingBaseline ?? 0;
  const biasVal = preset.brakeBiasBaseline ?? 0.58;
  if (bias === "quali") {
    return {
      ...preset,
      wingBaseline: Math.max(-0.12, wing - 0.03),
      brakeBiasBaseline: Math.max(0.52, biasVal - 0.01),
    };
  }
  if (bias === "race") {
    return {
      ...preset,
      wingBaseline: Math.min(0.12, wing + 0.03),
      brakeBiasBaseline: Math.min(0.62, biasVal + 0.01),
    };
  }
  return { ...preset };
}

export function initCarBriefings(
  meta: MetaStatePayload,
  trackId: string,
  sessionType: WeekendSessionType,
): Map<string, CarSessionBriefing> {
  const map = new Map<string, CarSessionBriefing>();
  const saved = meta.briefingDefaults?.[trackId]?.[sessionType];
  for (const car of meta.fleet ?? []) {
    const briefingId =
      saved?.[car.id] ?? defaultBriefingForSession(sessionType);
    map.set(car.id, { carId: car.id, briefingId });
  }
  return map;
}

export function briefingPreviewText(
  briefingId: string,
  sessionType: WeekendSessionType,
  classId: string,
): string {
  return resolveBriefingDefaults(briefingId, sessionType, classId);
}

export function carsSharingClass(
  fleet: MetaStatePayload["fleet"],
  classId: string,
): number {
  return (fleet ?? []).filter((c) => c.classId === classId).length;
}
