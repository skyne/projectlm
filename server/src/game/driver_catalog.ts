import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { FleetCarPayload } from "../ws_protocol";

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
  /** Stable roster identity — required for player team drivers after migration. */
  id?: string;
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
      if (d) map.get(key)!.push(ensureCatalogDriverId(d));
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

export function generateDriverId(): string {
  return randomUUID();
}

function slugDriverPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Deterministic id for real-world / catalog drivers (WEC grid, legends). */
export function stableCatalogDriverId(name: string, nationality: string): string {
  return `catalog-${slugDriverPart(name)}-${nationality.trim().toUpperCase()}`;
}

/** Assign a stable catalog id, or keep an existing roster id (custom drivers). */
export function ensureCatalogDriverId(
  driver: DriverProfilePayload,
): DriverProfilePayload {
  const existing = driver.id?.trim();
  if (existing) return { ...driver, id: existing };
  return {
    ...driver,
    id: stableCatalogDriverId(driver.name, driver.nationality),
  };
}

export interface DriverContractContext {
  playerTeamName: string;
  playerRoster?: DriverProfilePayload[];
  rosterOverrides?: Record<string, DriverProfilePayload[]>;
}

/** Resolve which team holds each driver id (player roster wins over overrides over catalog). */
export function buildDriverContractMap(
  repoRoot: string,
  ctx: DriverContractContext,
): Map<string, string> {
  const contracts = new Map<string, string>();
  const playerKey = ctx.playerTeamName.trim().toLowerCase();

  const catalog = loadLeMansDriverCatalog(repoRoot);
  for (const [key, roster] of catalog) {
    const team = key.slice(0, key.lastIndexOf("#"));
    if (team.toLowerCase() === playerKey) continue;
    for (const d of roster) {
      const id = ensureCatalogDriverId(d).id!;
      if (!contracts.has(id)) contracts.set(id, team);
    }
  }

  for (const [key, roster] of Object.entries(ctx.rosterOverrides ?? {})) {
    const team = key.slice(0, key.lastIndexOf("#"));
    for (const d of roster) {
      contracts.set(ensureCatalogDriverId(d).id!, team);
    }
  }

  for (const d of ctx.playerRoster ?? []) {
    const id = d.id?.trim();
    if (id) contracts.set(id, ctx.playerTeamName);
  }

  return contracts;
}

export function driverContractTeam(
  driverId: string,
  contracts: Map<string, string>,
): string | undefined {
  return contracts.get(driverId.trim());
}

export function isDriverOnTeam(
  driverId: string,
  teamName: string,
  contracts: Map<string, string>,
): boolean {
  const holder = driverContractTeam(driverId, contracts);
  return holder?.toLowerCase() === teamName.trim().toLowerCase();
}

/** Filter a team entry roster to drivers contracted to that team. */
export function filterRosterByContract(
  roster: DriverProfilePayload[],
  teamName: string,
  contracts: Map<string, string>,
): DriverProfilePayload[] {
  return roster.filter((d) => {
    const id = ensureCatalogDriverId(d).id!;
    const holder = contracts.get(id);
    return !holder || holder.toLowerCase() === teamName.trim().toLowerCase();
  });
}

export function ensureDriverIds(
  roster: DriverProfilePayload[],
): DriverProfilePayload[] {
  return roster.map((d) => ({
    ...d,
    id: d.id?.trim() || generateDriverId(),
  }));
}

/** Championship / dedup key — prefers stable roster id over name+nat. */
export function driverStandingKey(profile: DriverProfilePayload): string {
  const id = profile.id?.trim();
  if (id) return id;
  return `${profile.name.trim().toLowerCase()}|${profile.nationality.trim().toUpperCase()}`;
}

const rosterIdSet = (roster: DriverProfilePayload[]): Set<string> =>
  new Set(
    roster
      .map((d) => d.id?.trim())
      .filter((id): id is string => Boolean(id)),
  );

export function sanitizeAssignedDriverIds(
  driverIds: string[] | undefined,
  roster: DriverProfilePayload[],
): string[] {
  if (!driverIds?.length) return [];
  const valid = rosterIdSet(roster);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of driverIds) {
    const trimmed = id.trim();
    if (!trimmed || !valid.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Each driver id may appear on at most one car; each car needs ≥1 when fleet non-empty. */
export function validateExclusiveDriverAssignments(
  fleet: FleetCarPayload[],
  roster: DriverProfilePayload[],
): string | null {
  if (!fleet.length) return null;
  const valid = rosterIdSet(roster);
  const claimed = new Map<string, string>();
  for (const car of fleet) {
    const ids = sanitizeAssignedDriverIds(car.assignedDriverIds, roster);
    if (ids.length < 1) {
      return `Car #${car.carNumber} must have at least one assigned driver`;
    }
    for (const driverId of ids) {
      if (!valid.has(driverId)) {
        return `Car #${car.carNumber} references an unknown driver`;
      }
      const otherCar = claimed.get(driverId);
      if (otherCar && otherCar !== car.id) {
        const driver = roster.find((d) => d.id === driverId);
        return `${driver?.name ?? "A driver"} cannot be assigned to more than one car`;
      }
      claimed.set(driverId, car.id);
    }
  }
  return null;
}

/** Default exclusive assignments: single car gets full pool; multi-car uses round-robin. */
export function defaultDriverAssignments(
  roster: DriverProfilePayload[],
  fleet: FleetCarPayload[],
): Record<string, string[]> {
  const withIds = ensureDriverIds(roster);
  const driverIds = withIds.map((d) => d.id!);
  const out: Record<string, string[]> = {};
  if (!fleet.length || !driverIds.length) return out;

  if (fleet.length === 1) {
    out[fleet[0].id] = [...driverIds];
    return out;
  }

  for (const car of fleet) out[car.id] = [];
  let carIdx = 0;
  for (const driverId of driverIds) {
    out[fleet[carIdx].id].push(driverId);
    carIdx = (carIdx + 1) % fleet.length;
  }
  return out;
}

/** Assign roster drivers not yet on any car to new fleet entries (round-robin). */
export function assignUnassignedDriversToCars(
  roster: DriverProfilePayload[],
  fleet: FleetCarPayload[],
  targetCarIds: string[],
): Record<string, string[]> {
  const withIds = ensureDriverIds(roster);
  const claimed = new Set<string>();
  for (const car of fleet) {
    for (const id of car.assignedDriverIds ?? []) claimed.add(id);
  }
  const unassigned = withIds.map((d) => d.id!).filter((id) => !claimed.has(id));
  const updates: Record<string, string[]> = {};
  let carIdx = 0;
  for (const driverId of unassigned) {
    const carId = targetCarIds[carIdx % targetCarIds.length];
    updates[carId] = [...(updates[carId] ?? []), driverId];
    carIdx += 1;
  }
  return updates;
}

type LegacyFleetCar = FleetCarPayload & { assignedDriverIndices?: number[] };

/** Migrate index-based assignments and assign stable driver ids. */
export function migrateDriverAssignments(
  roster: DriverProfilePayload[],
  fleet: FleetCarPayload[],
): { roster: DriverProfilePayload[]; fleet: FleetCarPayload[] } {
  const withIds = ensureDriverIds(roster);
  const idByIndex = withIds.map((d) => d.id!);

  let migratedFleet: FleetCarPayload[] = fleet.map((car) => {
    const legacy = car as LegacyFleetCar;
    let assignedDriverIds = sanitizeAssignedDriverIds(
      car.assignedDriverIds,
      withIds,
    );
    if (!assignedDriverIds.length && legacy.assignedDriverIndices?.length) {
      assignedDriverIds = sanitizeAssignedDriverIds(
        legacy.assignedDriverIndices
          .filter((i) => i >= 0 && i < idByIndex.length)
          .map((i) => idByIndex[i]),
        withIds,
      );
    }
    const { assignedDriverIndices: _legacy, ...rest } = legacy;
    return { ...rest, assignedDriverIds };
  });

  const overlap = (): boolean => {
    const seen = new Set<string>();
    for (const car of migratedFleet) {
      for (const id of car.assignedDriverIds ?? []) {
        if (seen.has(id)) return true;
        seen.add(id);
      }
    }
    return false;
  };

  if (overlap() || migratedFleet.some((c) => !(c.assignedDriverIds?.length))) {
    const defaults = defaultDriverAssignments(withIds, migratedFleet);
    migratedFleet = migratedFleet.map((car) => ({
      ...car,
      assignedDriverIds: defaults[car.id] ?? [],
    }));
  }

  return { roster: withIds, fleet: migratedFleet };
}

/** Resolve the driver line-up for a fleet car from team roster + per-car assignments. */
export function resolveCarDriverRoster(
  teamRoster: DriverProfilePayload[],
  assignedDriverIds?: string[],
): DriverProfilePayload[] {
  if (assignedDriverIds !== undefined) {
    const byId = new Map(
      ensureDriverIds(teamRoster)
        .filter((d) => d.id)
        .map((d) => [d.id!, d]),
    );
    return sanitizeAssignedDriverIds(assignedDriverIds, teamRoster).flatMap(
      (id) => {
        const driver = byId.get(id);
        return driver ? [{ ...driver }] : [];
      },
    );
  }
  return teamRoster.map((d) => ({ ...d }));
}

export type SessionEntryRosters = Record<string, DriverProfilePayload[]>;

export function sessionEntryKey(teamName: string, carNumber: string): string {
  return `${teamName}#${carNumber}`;
}

/** Build full entry→roster map (catalog + contracts + player fleet). */
export function buildSessionEntryRosters(
  repoRoot: string,
  options: {
    playerTeamName?: string;
    playerRoster?: DriverProfilePayload[];
    playerEntries?: Array<{
      teamName: string;
      carNumber: string;
      roster: DriverProfilePayload[];
    }>;
    rosterOverrides?: Record<string, DriverProfilePayload[]>;
  },
): SessionEntryRosters {
  const lemans = loadLeMansDriverCatalog(repoRoot);
  const overrides = options.rosterOverrides ?? {};
  const contracts = buildDriverContractMap(repoRoot, {
    playerTeamName: options.playerTeamName ?? "",
    playerRoster:
      options.playerRoster ??
      options.playerEntries?.flatMap((e) => e.roster) ??
      [],
    rosterOverrides: overrides,
  });
  const rosters: SessionEntryRosters = {};

  for (const [key, roster] of lemans) {
    const comma = key.lastIndexOf("#");
    const team = key.slice(0, comma);
    const merged = overrides[key]?.length
      ? overrides[key]!.map((d) => ({ ...d }))
      : roster.map((d) => ({ ...d }));
    const filtered = filterRosterByContract(merged, team, contracts);
    if (filtered.length) {
      rosters[key] = filtered.map((d) => ({ ...d }));
    }
  }

  for (const entry of options.playerEntries ?? []) {
    if (!entry.roster.length) continue;
    rosters[sessionEntryKey(entry.teamName, entry.carNumber)] = entry.roster.map(
      (d) => ({ ...d }),
    );
  }

  return rosters;
}

/** Keep only rosters for entries that actually started the session. */
export function rostersForCompetingEntries(
  entries: Array<{ teamName: string; carNumber: string }>,
  allRosters: SessionEntryRosters,
): SessionEntryRosters {
  const out: SessionEntryRosters = {};
  for (const entry of entries) {
    const key = sessionEntryKey(entry.teamName, entry.carNumber);
    const roster = allRosters[key];
    if (roster?.length) out[key] = roster.map((d) => ({ ...d }));
  }
  return out;
}

export function exportRuntimeDrivers(
  repoRoot: string,
  options: {
    playerTeamName?: string;
    playerRoster?: DriverProfilePayload[];
    playerEntries?: Array<{
      teamName: string;
      carNumber: string;
      roster: DriverProfilePayload[];
    }>;
    rosterOverrides?: Record<string, DriverProfilePayload[]>;
  },
  prebuiltRosters?: SessionEntryRosters,
  relPath = "configs/runtime/drivers.txt",
): string {
  const rel = relPath;
  const abs = path.join(repoRoot, rel);
  const rosters = prebuiltRosters ?? buildSessionEntryRosters(repoRoot, options);
  const lines = [
    "# Runtime driver roster — generated by server",
    "# Merges 2026 Le Mans entry list with player custom drivers",
    "",
  ];

  for (const key of Object.keys(rosters).sort()) {
    const roster = rosters[key]!;
    const comma = key.lastIndexOf("#");
    lines.push(`entry=${key.slice(0, comma)},${key.slice(comma + 1)}`);
    for (const d of roster) lines.push(driverToLine(d));
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
    id: generateDriverId(),
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
      id: generateDriverId(),
      name: `${teamName} Ace`,
      nationality: "GB",
      tier: "Gold",
      dryPace: 84, wetPace: 78, consistency: 82, overtaking: 80, defending: 78,
      trafficManagement: 80, rollingStart: 78, standingStart: 76, setupFeedback: 74,
      tireManagement: 80, fuelSaving: 76, composure: 82, nightPace: 78, rainRadar: 72,
      stamina: 80, maxStintHours: 3.0,
    },
    {
      id: generateDriverId(),
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
