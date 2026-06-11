/** Central in-game help copy (HX) — served via game_catalog. */

export interface GlossaryEntry {
  key: string;
  label: string;
  short: string;
  long: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    key: "driver.dryPace",
    label: "Dry Pace",
    short: "Race pace on a dry track.",
    long: "How fast the driver is in the dry. Affects lap time and overtaking on clear weekends.",
  },
  {
    key: "driver.wetPace",
    label: "Wet Pace",
    short: "Pace in rain or on a damp track.",
    long: "Confidence and speed when grip is low. Critical at changing weather events.",
  },
  {
    key: "driver.consistency",
    label: "Consistency",
    short: "Lap-to-lap repeatability.",
    long: "Reduces random pace swings and unforced mistakes over a stint.",
  },
  {
    key: "driver.setupFeedback",
    label: "Setup Feedback",
    short: "Quality of engineering notes after setup changes.",
    long: "Higher skill means clearer radio messages and better engineer suggestions — not wider setup tolerance.",
  },
  {
    key: "driver.adaptability",
    label: "Adaptability",
    short: "Tolerance for compromise setups.",
    long: "Flexible drivers accept a wider setup window before pace drops — important with multi-driver endurance rosters.",
  },
  {
    key: "driver.stamina",
    label: "Stamina",
    short: "Fatigue resistance in long stints.",
    long: "How well pace holds deep into a stint. Pair with max stint rules and driver swaps.",
  },
  {
    key: "driver.tireManagement",
    label: "Tire Management",
    short: "Wear control on one set.",
    long: "Extends stint length and keeps tyre temperatures in the window.",
  },
  {
    key: "staff.skill",
    label: "Skill",
    short: "Overall crew competence.",
    long: "Engineers improve setup range and R&D. Mechanics shorten pit stops. Strategists sharpen briefings.",
  },
  {
    key: "perf.grip",
    label: "Grip",
    short: "Combined mechanical and tyre grip multiplier.",
    long: "Higher grip improves cornering and traction. Trade-offs often come from aero and suspension.",
  },
  {
    key: "perf.downforce",
    label: "Downforce (Cl)",
    short: "Aero load coefficient — higher helps corners.",
    long: "More downforce usually costs straight-line speed (drag).",
  },
  {
    key: "perf.drag",
    label: "Drag (Cd)",
    short: "Aero drag coefficient — lower is faster on straights.",
    long: "Low drag helps Le Mans; high-downforce tracks want the opposite balance.",
  },
  {
    key: "setup.wingBaseline",
    label: "Wing angle",
    short: "Aero balance trim.",
    long: "More wing = downforce and corner speed; less wing = top speed on straights.",
  },
  {
    key: "setup.brakeBiasBaseline",
    label: "Brake bias",
    short: "Front/rear brake balance.",
    long: "More front bias can stabilize turn-in; more rear can help traction but risks lockups.",
  },
  {
    key: "rd.focus.performance",
    label: "R&D: Performance",
    short: "Push part stats toward catalog ceiling.",
    long: "Develop an owned part's raw pace. In-house parts start below supplier max.",
  },
  {
    key: "rd.focus.reliability",
    label: "R&D: Reliability",
    short: "Harden the part against failure and wear.",
    long: "Trade development time away from pace for fewer DNFs and slower degradation.",
  },
  {
    key: "rd.focus.understanding",
    label: "R&D: Understanding",
    short: "Learn how the part behaves.",
    long: "Tightens setup suggestion windows and improves priors on new tracks — transfers when other parts change.",
  },
];

export function glossaryByKey(): Map<string, GlossaryEntry> {
  return new Map(GLOSSARY.map((e) => [e.key, e]));
}
