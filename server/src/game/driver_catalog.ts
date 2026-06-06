import * as fs from "fs";
import * as path from "path";

export interface DriverStatDef {
  key: string;
  label: string;
  short: string;
  description: string;
  min: number;
  max: number;
  costPerPoint: number;
}

export interface DriverProfilePayload {
  name: string;
  nationality: string;
  tier: string;
  dryPace: number;
  wetPace: number;
  consistency: number;
  overtaking: number;
  defending: number;
  trafficManagement: number;
  rollingStart: number;
  standingStart: number;
  setupFeedback: number;
  tireManagement: number;
  fuelSaving: number;
  composure: number;
  nightPace: number;
  rainRadar: number;
  stamina: number;
  maxStintHours: number;
}

export const DRIVER_POINT_POOL = 750;

export const DRIVER_STAT_DEFS: DriverStatDef[] = [
  { key: "dryPace", label: "Dry Pace", short: "DRY", description: "Single-lap and race pace on a dry track.", min: 55, max: 98, costPerPoint: 2 },
  { key: "wetPace", label: "Wet Pace", short: "WET", description: "Speed and confidence when the track is damp or fully wet.", min: 50, max: 96, costPerPoint: 2 },
  { key: "consistency", label: "Consistency", short: "CON", description: "Lap-to-lap repeatability; fewer unforced errors.", min: 50, max: 98, costPerPoint: 2 },
  { key: "overtaking", label: "Overtaking", short: "OVT", description: "Ability to pass multiclass traffic and rivals cleanly.", min: 50, max: 96, costPerPoint: 1.5 },
  { key: "defending", label: "Defending", short: "DEF", description: "Holding position under attack without cracking.", min: 50, max: 96, costPerPoint: 1.5 },
  { key: "trafficManagement", label: "Traffic", short: "TRF", description: "Finding gaps and managing blue-flag situations.", min: 50, max: 94, costPerPoint: 1 },
  { key: "rollingStart", label: "Rolling Start", short: "RLS", description: "Safety-car restarts and rolling formation pace.", min: 50, max: 94, costPerPoint: 1 },
  { key: "standingStart", label: "Standing Start", short: "STD", description: "Launch off the line at the 24h start and pit-exit restarts.", min: 50, max: 94, costPerPoint: 1 },
  { key: "setupFeedback", label: "Setup Feedback", short: "SET", description: "Quality of engineering notes after setup changes.", min: 45, max: 92, costPerPoint: 1 },
  { key: "tireManagement", label: "Tire Management", short: "TIR", description: "Wear control and stint length on one set.", min: 50, max: 96, costPerPoint: 1.5 },
  { key: "fuelSaving", label: "Fuel Saving", short: "FUL", description: "Economy driving without losing too much lap time.", min: 50, max: 92, costPerPoint: 1 },
  { key: "composure", label: "Composure", short: "CMP", description: "Resistance to pressure, mistakes when being hunted.", min: 50, max: 98, costPerPoint: 2 },
  { key: "nightPace", label: "Night Pace", short: "NGT", description: "Performance through the dark hours at La Sarthe.", min: 50, max: 94, costPerPoint: 1 },
  { key: "rainRadar", label: "Rain Radar", short: "RNM", description: "Anticipating weather and adapting before rivals.", min: 45, max: 90, costPerPoint: 1 },
  { key: "stamina", label: "Stamina", short: "STM", description: "Fatigue resistance deep into a stint.", min: 50, max: 96, costPerPoint: 1.5 },
];

const BASELINE: Record<string, number> = {
  dryPace: 68, wetPace: 64, consistency: 68, overtaking: 66, defending: 66,
  trafficManagement: 66, rollingStart: 64, standingStart: 64, setupFeedback: 60,
  tireManagement: 66, fuelSaving: 64, composure: 68, nightPace: 64, rainRadar: 60, stamina: 68,
};

const FIRST_NAMES = ["Alex", "Marco", "Elena", "Luca", "Sofia", "Kai", "Nina", "Oliver", "Yuki", "Ines", "Ravi", "Clara", "Finn", "Marta", "Noah"];
const LAST_NAMES = ["Voss", "Reeves", "Okonkwo", "Bianchi", "Kowalski", "Santos", "Chen", "Müller", "Dupont", "Alvarez", "Nakamura", "Petrov", "Garcia", "Webb", "Tanaka"];
const NATIONS = ["GB", "FR", "DE", "IT", "US", "BR", "JP", "ES", "NL", "AU", "CH", "SE", "DK", "PT", "PL"];

function trim(s: string): string {
  return s.trim();
}

function parseDriverLine(value: string): DriverProfilePayload | null {
  const parts = value.split("|").map(trim);
  if (parts.length < 18) return null;
  const nums = parts.slice(3).map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return {
    name: parts[0],
    nationality: parts[1],
    tier: parts[2],
    dryPace: nums[0],
    wetPace: nums[1],
    consistency: nums[2],
    overtaking: nums[3],
    defending: nums[4],
    trafficManagement: nums[5],
    rollingStart: nums[6],
    standingStart: nums[7],
    setupFeedback: nums[8],
    tireManagement: nums[9],
    fuelSaving: nums[10],
    composure: nums[11],
    nightPace: nums[12],
    rainRadar: nums[13],
    stamina: nums[14],
    maxStintHours: nums[15] ?? 2.5,
  };
}

export function loadLeMansDriverCatalog(repoRoot: string): Map<string, DriverProfilePayload[]> {
  const file = path.join(repoRoot, "configs/drivers/lemans2026_drivers.txt");
  const map = new Map<string, DriverProfilePayload[]>();
  if (!fs.existsSync(file)) return map;

  let key = "";
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = trim(line);
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trim(trimmed.slice(0, eq));
    const v = trim(trimmed.slice(eq + 1));
    if (k === "entry") {
      const [team, num] = v.split(",").map(trim);
      key = `${team}#${num}`;
      map.set(key, []);
    } else if (k === "driver" && key) {
      const d = parseDriverLine(v);
      if (d) map.get(key)!.push(d);
    }
  }
  return map;
}

function driverToLine(d: DriverProfilePayload): string {
  return `driver=${[
    d.name, d.nationality, d.tier,
    d.dryPace, d.wetPace, d.consistency, d.overtaking, d.defending,
    d.trafficManagement, d.rollingStart, d.standingStart, d.setupFeedback,
    d.tireManagement, d.fuelSaving, d.composure, d.nightPace, d.rainRadar,
    d.stamina, d.maxStintHours,
  ].join("|")}`;
}

export function allDriverIndices(rosterLength: number): number[] {
  return Array.from({ length: rosterLength }, (_, i) => i);
}

export function sanitizeAssignedIndices(
  indices: number[] | undefined,
  rosterLength: number,
): number[] {
  if (!indices?.length || rosterLength <= 0) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const i of indices) {
    if (i >= 0 && i < rosterLength && !seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}

/** Resolve the driver line-up for a fleet car from team roster + per-car assignments. */
export function resolveCarDriverRoster(
  teamRoster: DriverProfilePayload[],
  assignedIndices?: number[],
): DriverProfilePayload[] {
  if (assignedIndices !== undefined) {
    return sanitizeAssignedIndices(assignedIndices, teamRoster.length).map(
      (i) => ({ ...teamRoster[i] }),
    );
  }
  return teamRoster.map((d) => ({ ...d }));
}

export function exportRuntimeDrivers(
  repoRoot: string,
  options: {
    playerEntries?: Array<{
      teamName: string;
      carNumber: string;
      roster: DriverProfilePayload[];
    }>;
  },
): string {
  const rel = "configs/runtime/drivers.txt";
  const abs = path.join(repoRoot, rel);
  const lemans = loadLeMansDriverCatalog(repoRoot);
  const lines = [
    "# Runtime driver roster — generated by server",
    "# Merges 2026 Le Mans entry list with player custom drivers",
    "",
  ];

  for (const [key, roster] of lemans) {
    const comma = key.lastIndexOf("#");
    const team = key.slice(0, comma);
    const num = key.slice(comma + 1);
    lines.push(`entry=${team},${num}`);
    for (const d of roster) lines.push(driverToLine(d));
    lines.push("");
  }

  for (const entry of options.playerEntries ?? []) {
    if (!entry.roster.length) continue;
    lines.push(`entry=${entry.teamName},${entry.carNumber}`);
    for (const d of entry.roster) lines.push(driverToLine(d));
    lines.push("");
  }

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, lines.join("\n"));
  return rel;
}

export function computeDriverPointCost(driver: DriverProfilePayload): number {
  let cost = 0;
  for (const def of DRIVER_STAT_DEFS) {
    const value = driver[def.key as keyof DriverProfilePayload] as number;
    const base = BASELINE[def.key] ?? 66;
    const delta = Math.max(0, value - base);
    cost += delta * def.costPerPoint;
  }
  const tierBonus = driver.tier === "Platinum" ? 80 : driver.tier === "Gold" ? 40 : 0;
  return Math.round(cost + tierBonus);
}

export function inferTier(driver: DriverProfilePayload): string {
  const avg = (driver.dryPace + driver.wetPace + driver.consistency) / 3;
  if (avg >= 90) return "Platinum";
  if (avg >= 82) return "Gold";
  if (avg >= 74) return "Silver";
  return "Bronze";
}

export function validateDriverStats(driver: DriverProfilePayload): string | null {
  if (!driver.name.trim()) return "Driver name required";
  for (const def of DRIVER_STAT_DEFS) {
    const v = driver[def.key as keyof DriverProfilePayload] as number;
    if (v < def.min || v > def.max) return `${def.label} must be ${def.min}–${def.max}`;
  }
  return null;
}

export function validateCustomDriver(driver: DriverProfilePayload): string | null {
  const err = validateDriverStats(driver);
  if (err) return err;
  const cost = computeDriverPointCost(driver);
  if (cost > DRIVER_POINT_POOL) return `Exceeds point pool (${cost}/${DRIVER_POINT_POOL})`;
  return null;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateRandomDriver(seed = Date.now()): DriverProfilePayload {
  const rnd = seeded(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const jitter = (base: number, spread: number) =>
    Math.round(Math.min(96, Math.max(55, base + (rnd() - 0.5) * spread)));

  const driver: DriverProfilePayload = {
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    nationality: pick(NATIONS),
    tier: "Silver",
    dryPace: jitter(76, 18),
    wetPace: jitter(72, 16),
    consistency: jitter(74, 16),
    overtaking: jitter(72, 14),
    defending: jitter(70, 14),
    trafficManagement: jitter(72, 12),
    rollingStart: jitter(70, 12),
    standingStart: jitter(70, 12),
    setupFeedback: jitter(66, 14),
    tireManagement: jitter(72, 12),
    fuelSaving: jitter(68, 12),
    composure: jitter(72, 16),
    nightPace: jitter(70, 12),
    rainRadar: jitter(66, 12),
    stamina: jitter(74, 14),
    maxStintHours: rnd() > 0.7 ? 3.0 : 2.5,
  };
  driver.tier = inferTier(driver);
  return driver;
}

export function defaultPlayerRoster(teamName: string): DriverProfilePayload[] {
  return [
    {
      name: `${teamName} Ace`,
      nationality: "GB",
      tier: "Gold",
      dryPace: 84, wetPace: 78, consistency: 82, overtaking: 80, defending: 78,
      trafficManagement: 80, rollingStart: 78, standingStart: 76, setupFeedback: 74,
      tireManagement: 80, fuelSaving: 76, composure: 82, nightPace: 78, rainRadar: 72,
      stamina: 80, maxStintHours: 3.0,
    },
    {
      name: `${teamName} Endurance`,
      nationality: "FR",
      tier: "Silver",
      dryPace: 78, wetPace: 74, consistency: 80, overtaking: 72, defending: 76,
      trafficManagement: 78, rollingStart: 74, standingStart: 72, setupFeedback: 70,
      tireManagement: 82, fuelSaving: 80, composure: 78, nightPace: 76, rainRadar: 70,
      stamina: 84, maxStintHours: 3.5,
    },
  ];
}
