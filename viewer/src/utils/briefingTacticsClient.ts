/** Lightweight client mirror of server briefing preview strings. */
import type { WeekendSessionType } from "../ws/protocol";

const PREVIEW: Record<string, Record<string, string>> = {
  practice: {
    long_stint: "hard · normal · full tank",
    setup_hunt: "medium · setup pits · ~35L",
    quali_sim: "soft · push · minimal fuel",
    shake_down: "medium · normal · stable trim",
    tyre_test: "soft · rotate compounds",
    fuel_calibration: "medium · full tank · steady pace",
    weather_scout: "medium · weather tyre swaps",
  },
  qualifying: {
    pole_attack: "soft · push · deploy · ~15L",
    front_row: "soft · push · 2 runs",
    best_effort: "soft · push",
    no_teammate_fight: "soft · yield within strategist gap",
    teammate_support: "medium · support priority",
    single_flyer: "soft · one attack run",
    race_prep: "medium · long runs",
    traffic_tow: "soft · tow on out-lap",
  },
  race: {
    hammer_time: "soft · push · deploy · early pits",
    conserve: "medium · conserve · harvest hybrid",
    hold_position: "medium · hold gaps",
    attack: "soft · undercut bias",
    defend: "medium · protect gap behind",
    one_stop: "hard · long stints",
    two_stop: "soft · short stints",
    damage_limit: "conserve · minimal risk",
    lift_and_coast: "hard · extreme fuel save",
    points_protect: "hold position · safe gaps",
  },
};

export function resolveBriefingDefaults(
  briefingId: string,
  sessionType: WeekendSessionType,
  _classId: string,
): string {
  return (
    PREVIEW[sessionType]?.[briefingId] ??
    `${briefingId} · PitBot will follow team orders`
  );
}
