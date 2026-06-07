/** Validate and skill-gate engineer-suggested race commands. */

const DRIVER_MODE = /^driver_mode=(push|normal|conserve)$/i;
const HYBRID_STRATEGY = /^hybrid_strategy=(balanced|deploy|harvest|hold)$/i;
const CANCEL_PIT = /^cancel_pit$/i;
const PIT_OR_SETUP = /^(pit|setup)\|/i;

const SETUP_KEYS = new Set([
  "fuel",
  "compound",
  "tyre_tread",
  "tire_tread",
  "intermediate_tyres",
  "intermediate_tires",
  "wet_tyres",
  "wet_tires",
  "tires",
  "repairs",
  "driver_change",
  "driver_index",
  "driver",
  "wing",
  "brake_bias",
  "ride_height",
  "front_ride_height",
  "rear_ride_height",
  "front_spring",
  "rear_spring",
  "front_arb",
  "rear_arb",
  "front_damper_bump",
  "front_damper_rebound",
  "rear_damper_bump",
  "rear_damper_rebound",
]);

export const ENGINEER_COMMAND_HELP = `Valid commands (setup changes apply in pit only):
- driver_mode=push | driver_mode=normal | driver_mode=conserve
- hybrid_strategy=balanced | hybrid_strategy=deploy | hybrid_strategy=harvest | hybrid_strategy=hold
- cancel_pit
- pit|fuel=<liters>|compound=soft|medium|hard|tyre_tread=slick|intermediate|wet|tires=FL,FR,RL,RR|wing=<delta>|brake_bias=<delta>|front_ride_height=<m>|rear_ride_height=<m>|front_spring=<N/m>|rear_spring=<N/m>|front_arb=<mult>|rear_arb=<mult>|front_damper_bump=<clicks>|front_damper_rebound=<clicks>|rear_damper_bump=<clicks>|rear_damper_rebound=<clicks>
- tyre_tread=slick|intermediate|wet (grid only, before green flag; legacy: wet_tyres / intermediate_tyres)
- setup|wing=<delta>|brake_bias=<delta>|front_ride_height=<m>|rear_ride_height=<m>|... (same setup keys, pit lane only)

Typical deltas: wing ±0.05, brake_bias ±0.02, ride_height ±0.002 m (2 mm), spring ±5000 N/m, ARB ±0.05, damper ±1 click.
Combine pit services with setup using one pit| command when boxing.`;

function parseSegments(command: string): { verb: string; pairs: Map<string, string> } | null {
  const trimmed = command.trim();
  if (!PIT_OR_SETUP.test(trimmed)) return null;
  const parts = trimmed.split("|");
  const verb = parts[0]?.toLowerCase() ?? "";
  if (verb !== "pit" && verb !== "setup") return null;
  const pairs = new Map<string, string>();
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq <= 0) continue;
    const key = parts[i].slice(0, eq).trim().toLowerCase();
    const val = parts[i].slice(eq + 1).trim();
    if (!SETUP_KEYS.has(key)) return null;
    pairs.set(key, val);
  }
  return { verb, pairs };
}

function skillScale(skill: number): number {
  return Math.min(1, Math.max(0.45, (skill - 50) / 50));
}

function clampNum(v: number, maxAbs: number, step: number): number {
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, v));
  if (step <= 0) return clamped;
  return Math.round(clamped / step) * step;
}

function clampSetupPairs(pairs: Map<string, string>, skill: number): Map<string, string> {
  const scale = skillScale(skill);
  const out = new Map(pairs);

  const num = (key: string, fallback = 0) => {
    const raw = out.get(key);
    if (raw == null) return fallback;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : fallback;
  };

  if (out.has("wing")) {
    const v = clampNum(num("wing"), 0.05 * scale, 0.01);
    if (Math.abs(v) < 0.005) out.delete("wing");
    else out.set("wing", String(v));
  }
  if (out.has("brake_bias")) {
    const v = clampNum(num("brake_bias"), 0.04 * scale, 0.01);
    if (Math.abs(v) < 0.005) out.delete("brake_bias");
    else out.set("brake_bias", String(v));
  }
  for (const key of ["front_ride_height", "rear_ride_height", "ride_height"] as const) {
    if (!out.has(key)) continue;
    const v = clampNum(num(key), 0.004 * scale, 0.001);
    if (Math.abs(v) < 0.0005) out.delete(key);
    else out.set(key, String(v));
  }
  for (const key of ["front_spring", "rear_spring"] as const) {
    if (!out.has(key)) continue;
    const v = clampNum(num(key), 8000 * scale, 1000);
    if (Math.abs(v) < 500) out.delete(key);
    else out.set(key, String(Math.round(v)));
  }
  for (const key of ["front_arb", "rear_arb"] as const) {
    if (!out.has(key)) continue;
    const v = clampNum(num(key), 0.08 * scale, 0.01);
    if (Math.abs(v) < 0.005) out.delete(key);
    else out.set(key, String(v));
  }
  for (const key of [
    "front_damper_bump",
    "front_damper_rebound",
    "rear_damper_bump",
    "rear_damper_rebound",
  ] as const) {
    if (!out.has(key)) continue;
    const maxClick = Math.max(1, Math.round(2 * scale));
    const v = clampNum(num(key), maxClick, 1);
    if (v === 0) out.delete(key);
    else out.set(key, String(Math.round(v)));
  }

  // Low-skill engineers stick to aero + brake unless skill >= 72
  if (skill < 72) {
    for (const key of [
      "front_ride_height",
      "rear_ride_height",
      "ride_height",
      "front_spring",
      "rear_spring",
      "front_arb",
      "rear_arb",
      "front_damper_bump",
      "front_damper_rebound",
      "rear_damper_bump",
      "rear_damper_rebound",
    ]) {
      out.delete(key);
    }
  }

  return out;
}

function serializeCommand(verb: string, pairs: Map<string, string>): string {
  const segments = [verb];
  for (const [key, val] of pairs) {
    segments.push(`${key}=${val}`);
  }
  return segments.join("|");
}

export function validateEngineerCommand(
  command: string,
  engineerSkill = 75,
): string | undefined {
  const c = command.trim();
  if (!c) return undefined;
  if (DRIVER_MODE.test(c)) return c.toLowerCase();
  if (HYBRID_STRATEGY.test(c)) return c.toLowerCase();
  if (CANCEL_PIT.test(c)) return "cancel_pit";

  const parsed = parseSegments(c);
  if (!parsed) return undefined;

  const clamped = clampSetupPairs(parsed.pairs, engineerSkill);
  if (clamped.size === 0) return undefined;

  return serializeCommand(parsed.verb, clamped);
}
