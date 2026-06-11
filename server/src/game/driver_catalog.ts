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

export type DriverGender = "female" | "male";

/** `custom` = player-built bronze driver; `signed` = WEC / market contract. */
export type DriverOrigin = "custom" | "signed";

export interface DriverProfilePayload {
  /** Stable roster identity — required for player team drivers after migration. */
  id?: string;
  /** Player-built vs signed-from-market. Inferred from id when omitted. */
  origin?: DriverOrigin;
  name: string;
  nationality: string;
  gender?: DriverGender;
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
  adaptability?: number;
  /** Saved per-stat floors — custom drivers may only increase after first save. */
  statBaseline?: Record<string, number>;
}

/** Legacy fallback — use computeBronzeDriverPointPool for custom drivers. */
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
  {
    key: "adaptability",
    label: "Adaptability",
    short: "ADP",
    description: "Tolerance for compromise setups — wider comfort band before pace drops.",
    min: 45,
    max: 94,
    costPerPoint: 1.5,
  },
];

const BASELINE: Record<string, number> = {
  dryPace: 68, wetPace: 64, consistency: 68, overtaking: 66, defending: 66,
  trafficManagement: 66, rollingStart: 64, standingStart: 64, setupFeedback: 60,
  tireManagement: 66, fuelSaving: 64, composure: 68, nightPace: 64, rainRadar: 60, stamina: 68,
  adaptability: 66,
};

const FIRST_NAMES = ["Alex", "Marco", "Elena", "Luca", "Sofia", "Kai", "Nina", "Oliver", "Yuki", "Ines", "Ravi", "Clara", "Finn", "Marta", "Noah"];
const LAST_NAMES = ["Voss", "Reeves", "Okonkwo", "Bianchi", "Kowalski", "Santos", "Chen", "Müller", "Dupont", "Alvarez", "Nakamura", "Petrov", "Garcia", "Webb", "Tanaka"];
const NATIONS = ["GB", "FR", "DE", "IT", "US", "BR", "JP", "ES", "NL", "AU", "CH", "SE", "DK", "PT", "PL"];

function trim(s: string): string {
  return s.trim();
}

const ADAPTABILITY_BY_LICENSE_TIER: Record<
  string,
  { mean: number; spread: number }
> = {
  platinum: { mean: 88, spread: 6 },
  gold: { mean: 78, spread: 7 },
  silver: { mean: 68, spread: 6 },
  bronze: { mean: 58, spread: 5 },
};

function hashDriverVarianceKey(...parts: string[]): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    for (const c of part) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h;
}

/** FIA license tier ballpark + deterministic per-driver variance (45–94). */
export function seedAdaptabilityForTier(
  tier: string,
  varianceKey: string,
  min = 45,
  max = 94,
): number {
  const band = ADAPTABILITY_BY_LICENSE_TIER[tier.trim().toLowerCase()] ?? {
    mean: 66,
    spread: 6,
  };
  const h = hashDriverVarianceKey(varianceKey);
  const unit = (h % 10000) / 10000;
  const delta = (unit - 0.5) * 2 * band.spread;
  return Math.round(Math.min(max, Math.max(min, band.mean + delta)));
}

function isValidAdaptability(value: number): boolean {
  return value >= 45 && value <= 94;
}

function parseDriverLine(value: string): DriverProfilePayload | null {
  const parts = value.split("|").map(trim);
  if (parts.length < 18) return null;
  const nums = parts.slice(3).map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const name = parts[0]!;
  const nationality = parts[1]!;
  const tier = parts[2]!;
  let adaptability: number | undefined;
  let maxStintHours: number;
  if (nums.length >= 17) {
    adaptability = nums[15];
    maxStintHours = nums[16]!;
  } else {
    maxStintHours = nums[15] ?? 2.5;
  }
  if (
    adaptability === undefined ||
    !isValidAdaptability(adaptability)
  ) {
    adaptability = seedAdaptabilityForTier(tier, `${name}|${nationality}`);
  }
  return {
    name,
    nationality,
    tier,
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
    adaptability,
    maxStintHours,
  };
}

function driverGenderKey(name: string, nationality: string): string {
  return `${name.trim().toLowerCase()}|${nationality.trim().toUpperCase()}`;
}

/** Optional gender overrides — default male when absent. */
export function loadWecDriverGenderMap(
  repoRoot: string,
): Map<string, DriverGender> {
  const file = path.join(repoRoot, "configs/drivers/wec_driver_gender.txt");
  const map = new Map<string, DriverGender>();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = trim(line);
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [name, nat, gender] = trimmed.split("|").map(trim);
    if (!name || !nat) continue;
    if (gender === "female" || gender === "male") {
      map.set(driverGenderKey(name, nat), gender);
    }
  }
  return map;
}

export function applyDriverGender(
  driver: DriverProfilePayload,
  genderMap: Map<string, DriverGender>,
): DriverProfilePayload {
  const mapped = genderMap.get(driverGenderKey(driver.name, driver.nationality));
  if (mapped) return { ...driver, gender: mapped };
  if (driver.gender === "female" || driver.gender === "male") return driver;
  return { ...driver, gender: "male" };
}

export function loadLeMansDriverCatalog(repoRoot: string): Map<string, DriverProfilePayload[]> {
  const file = path.join(repoRoot, "configs/drivers/lemans2026_drivers.txt");
  const map = new Map<string, DriverProfilePayload[]>();
  if (!fs.existsSync(file)) return map;
  const genderMap = loadWecDriverGenderMap(repoRoot);

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
      if (d) {
        const withGender = applyDriverGender(d, genderMap);
        map.get(key)!.push(
          ensureCatalogDriverId({ ...withGender, origin: "signed" }),
        );
      }
    }
  }
  return map;
}

/** Best (highest point-cost) line per unique WEC catalog driver. */
export function buildWecCatalogDriverIndex(
  repoRoot: string,
): Map<string, DriverProfilePayload> {
  const index = new Map<string, DriverProfilePayload>();
  for (const roster of loadLeMansDriverCatalog(repoRoot).values()) {
    for (const driver of roster) {
      const id = driver.id!;
      const existing = index.get(id);
      if (
        !existing ||
        computeDriverPointCost(driver) > computeDriverPointCost(existing)
      ) {
        index.set(id, { ...driver, origin: "signed" });
      }
    }
  }
  return index;
}

export function listWecCatalogDriverIds(repoRoot: string): string[] {
  return [...buildWecCatalogDriverIndex(repoRoot).keys()].sort();
}

export interface FreeAgentEntry {
  driver: DriverProfilePayload;
  series: string;
  tagline: string;
}

function parseFreeAgentLine(
  value: string,
): { driver: DriverProfilePayload; series: string; tagline: string } | null {
  const parts = value.split("|").map(trim);
  if (parts.length < 22) return null;
  const name = parts[0]!;
  const nationality = parts[1]!;
  const tier = parts[2]!;
  const series = parts[3]!;
  const tagline = parts[4]!;
  const nums = parts.slice(5).map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  let adaptability: number | undefined;
  let maxStintHours: number;
  if (nums.length >= 17) {
    adaptability = nums[15];
    maxStintHours = nums[16]!;
  } else {
    maxStintHours = nums[15] ?? 2.5;
  }
  if (adaptability === undefined || !isValidAdaptability(adaptability)) {
    adaptability = seedAdaptabilityForTier(tier, `${name}|${nationality}`);
  }
  const driver: DriverProfilePayload = {
    name,
    nationality,
    tier,
    dryPace: nums[0]!,
    wetPace: nums[1]!,
    consistency: nums[2]!,
    overtaking: nums[3]!,
    defending: nums[4]!,
    trafficManagement: nums[5]!,
    rollingStart: nums[6]!,
    standingStart: nums[7]!,
    setupFeedback: nums[8]!,
    tireManagement: nums[9]!,
    fuelSaving: nums[10]!,
    composure: nums[11]!,
    nightPace: nums[12]!,
    rainRadar: nums[13]!,
    stamina: nums[14]!,
    adaptability,
    maxStintHours,
  };
  return { driver, series, tagline };
}

/** 2025 Le Mans / ELMS / IMSA pool — excludes anyone already on the 2026 WEC catalog. */
export function loadFreeAgentDrivers(repoRoot: string): FreeAgentEntry[] {
  const file = path.join(repoRoot, "configs/drivers/free_agents_2025.txt");
  const catalogIds = new Set(listWecCatalogDriverIds(repoRoot));
  const genderMap = loadWecDriverGenderMap(repoRoot);
  const out: FreeAgentEntry[] = [];
  const seenIds = new Set<string>();
  if (!fs.existsSync(file)) return out;

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = trim(line);
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0 || trim(trimmed.slice(0, eq)) !== "driver") continue;
    const parsed = parseFreeAgentLine(trim(trimmed.slice(eq + 1)));
    if (!parsed) continue;
    const withGender = applyDriverGender(parsed.driver, genderMap);
    const driver = ensureCatalogDriverId(withGender);
    const id = driver.id!;
    if (catalogIds.has(id) || seenIds.has(id)) continue;
    seenIds.add(id);
    out.push({ driver, series: parsed.series, tagline: parsed.tagline });
  }
  return out;
}

export function lookupWecCatalogDriver(
  driver: DriverProfilePayload,
  index: Map<string, DriverProfilePayload>,
): DriverProfilePayload | null {
  const stableId = stableCatalogDriverId(driver.name, driver.nationality);
  return index.get(stableId) ?? index.get(driver.id?.trim() ?? "") ?? null;
}

function driverToLine(d: DriverProfilePayload): string {
  return `driver=${[
    d.name, d.nationality, d.tier,
    d.dryPace, d.wetPace, d.consistency, d.overtaking, d.defending,
    d.trafficManagement, d.rollingStart, d.standingStart, d.setupFeedback,
    d.tireManagement, d.fuelSaving, d.composure, d.nightPace, d.rainRadar,
    d.stamina, d.adaptability ?? 66, d.maxStintHours,
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

/** At most `maxPerCar` drivers may be assigned to one entry. */
export function validateMaxDriversPerCar(
  fleet: FleetCarPayload[],
  roster: DriverProfilePayload[],
  maxPerCar: number,
): string | null {
  if (!fleet.length || maxPerCar < 1) return null;
  for (const car of fleet) {
    const ids = sanitizeAssignedDriverIds(car.assignedDriverIds, roster);
    if (ids.length > maxPerCar) {
      return `Car #${car.carNumber} cannot have more than ${maxPerCar} assigned drivers`;
    }
  }
  return null;
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

export function withDriverStatDefaults(
  driver: DriverProfilePayload,
): DriverProfilePayload {
  const adaptability = driver.adaptability;
  const validAdaptability =
    typeof adaptability === "number" &&
    adaptability >= 45 &&
    adaptability <= 94
      ? adaptability
      : (BASELINE.adaptability ?? 66);
  const stint = driver.maxStintHours;
  const validStint =
    typeof stint === "number" && stint >= 1 && stint <= 5 ? stint : 2.5;
  return {
    ...driver,
    adaptability: validAdaptability,
    maxStintHours: validStint,
  };
}

export function isSignedDriver(
  driver: DriverProfilePayload,
  catalogIds?: ReadonlySet<string>,
): boolean {
  if (driver.origin === "custom") return false;
  if (driver.origin === "signed") return true;
  const id = driver.id?.trim() ?? "";
  if (id.startsWith("catalog-")) return true;
  if (catalogIds?.size) {
    const stableId = stableCatalogDriverId(driver.name, driver.nationality);
    if (catalogIds.has(stableId) || catalogIds.has(id)) return true;
  }
  return false;
}

export function extractDriverStatBaseline(
  driver: DriverProfilePayload,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of DRIVER_STAT_DEFS) {
    out[def.key] = driver[def.key as keyof DriverProfilePayload] as number;
  }
  return out;
}

/** Lock signed WEC stats; stamp custom baselines on save. */
export function normalizePlayerRosterDriver(
  driver: DriverProfilePayload,
  catalogIndex: Map<string, DriverProfilePayload>,
  catalogIds: ReadonlySet<string>,
  customPointPool: number,
): DriverProfilePayload | { error: string } {
  if (isSignedDriver(driver, catalogIds)) {
    const canon = lookupWecCatalogDriver(driver, catalogIndex);
    if (!canon) {
      const statErr = validateDriverStats(withDriverStatDefaults(driver));
      if (statErr) return { error: `Unknown signed driver: ${driver.name}` };
      return {
        ...withDriverStatDefaults(driver),
        id: stableCatalogDriverId(driver.name, driver.nationality),
        origin: "signed",
      };
    }
    return {
      ...canon,
      id: stableCatalogDriverId(driver.name, driver.nationality),
      origin: "signed",
    };
  }

  const err = validateCustomDriverWithBaseline(driver, customPointPool);
  if (err) return { error: err };
  const normalized = withDriverStatDefaults({
    ...driver,
    tier: "Bronze",
    origin: "custom",
  });
  return {
    ...normalized,
    statBaseline: extractDriverStatBaseline(normalized),
  };
}

export function isCustomDriver(
  driver: DriverProfilePayload,
  catalogIds?: ReadonlySet<string>,
): boolean {
  return !isSignedDriver(driver, catalogIds);
}

export function listUniqueBronzeCatalogDrivers(
  repoRoot: string,
): DriverProfilePayload[] {
  const seen = new Set<string>();
  const out: DriverProfilePayload[] = [];
  for (const roster of loadLeMansDriverCatalog(repoRoot).values()) {
    for (const raw of roster) {
      if (raw.tier.toLowerCase() !== "bronze") continue;
      const driver = withDriverStatDefaults(ensureCatalogDriverId(raw));
      if (seen.has(driver.id!)) continue;
      seen.add(driver.id!);
      out.push(driver);
    }
  }
  return out;
}

function fallbackBronzeTemplate(): DriverProfilePayload {
  return withDriverStatDefaults({
    name: "Bronze Template",
    nationality: "GB",
    tier: "Bronze",
    dryPace: 70,
    wetPace: 64,
    consistency: 68,
    overtaking: 66,
    defending: 64,
    trafficManagement: 66,
    rollingStart: 64,
    standingStart: 62,
    setupFeedback: 58,
    tireManagement: 64,
    fuelSaving: 62,
    composure: 66,
    nightPace: 62,
    rainRadar: 58,
    stamina: 70,
    maxStintHours: 2.5,
  });
}

/** Average point cost of unique Bronze drivers in the WEC roster preset. */
export function computeBronzeDriverPointPool(repoRoot: string): number {
  const bronze = listUniqueBronzeCatalogDrivers(repoRoot);
  if (!bronze.length) {
    return computeDriverPointCost(
      withDriverStatDefaults({ ...fallbackBronzeTemplate(), tier: "Bronze" }),
    );
  }
  const costs = bronze.map((d) =>
    computeDriverPointCost({ ...d, tier: "Bronze" }),
  );
  return Math.round(costs.reduce((sum, c) => sum + c, 0) / costs.length);
}

/** Mean stat line across unique Bronze WEC preset drivers — custom driver baseline. */
export function computeBronzeDriverTemplate(
  repoRoot: string,
): DriverProfilePayload {
  const bronze = listUniqueBronzeCatalogDrivers(repoRoot);
  const source = bronze.length ? bronze : [fallbackBronzeTemplate()];
  const n = source.length;
  const averaged: DriverProfilePayload = {
    name: "Bronze Template",
    nationality: "GB",
    tier: "Bronze",
    dryPace: 0,
    wetPace: 0,
    consistency: 0,
    overtaking: 0,
    defending: 0,
    trafficManagement: 0,
    rollingStart: 0,
    standingStart: 0,
    setupFeedback: 0,
    tireManagement: 0,
    fuelSaving: 0,
    composure: 0,
    nightPace: 0,
    rainRadar: 0,
    stamina: 0,
    maxStintHours: 0,
  };
  for (const def of DRIVER_STAT_DEFS) {
    const key = def.key as keyof DriverProfilePayload;
    const sum = source.reduce(
      (acc, d) => acc + (d[key] as number),
      0,
    );
    (averaged[key] as number) = Math.round(sum / n);
  }
  averaged.maxStintHours =
    Math.round(
      (source.reduce((acc, d) => acc + d.maxStintHours, 0) / n) * 10,
    ) / 10;
  return withDriverStatDefaults(averaged);
}

export function createCustomBronzeDriver(
  repoRoot: string,
  options?: {
    name?: string;
    nationality?: string;
    gender?: DriverGender;
    seed?: number;
  },
): DriverProfilePayload {
  const template = computeBronzeDriverTemplate(repoRoot);
  const rnd = options?.seed != null ? seeded(options.seed) : () => Math.random();
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  return {
    ...template,
    id: generateDriverId(),
    origin: "custom",
    tier: "Bronze",
    name: options?.name ?? `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    nationality: options?.nationality ?? pick(NATIONS),
    gender: options?.gender ?? (rnd() < 0.28 ? "female" : "male"),
  };
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

export function validateCustomDriver(
  driver: DriverProfilePayload,
  pointPool?: number,
  catalogIds?: ReadonlySet<string>,
): string | null {
  const normalized = withDriverStatDefaults(driver);
  if (isSignedDriver(driver, catalogIds)) {
    return validateDriverStats(normalized);
  }
  return validateCustomDriverWithBaseline(driver, pointPool ?? DRIVER_POINT_POOL);
}

export function validateCustomDriverWithBaseline(
  driver: DriverProfilePayload,
  pointPool: number,
): string | null {
  const normalized = withDriverStatDefaults(driver);
  const err = validateDriverStats(normalized);
  if (err) return err;
  if (driver.tier !== "Bronze") {
    return "Custom drivers must stay Bronze tier";
  }
  const pool = pointPool;
  const cost = computeDriverPointCost({ ...normalized, tier: "Bronze" });
  if (cost > pool) return `Exceeds point pool (${cost}/${pool})`;
  const baseline = driver.statBaseline;
  if (!baseline) return null;
  for (const def of DRIVER_STAT_DEFS) {
    const v = normalized[def.key as keyof DriverProfilePayload] as number;
    const floor = baseline[def.key];
    if (typeof floor === "number" && v < floor) {
      return `${def.label} cannot decrease below saved value (${floor})`;
    }
  }
  return null;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateRandomDriver(
  repoRoot: string,
  seed = Date.now(),
): DriverProfilePayload {
  const rnd = seeded(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  return createCustomBronzeDriver(repoRoot, {
    seed,
    gender: rnd() < 0.28 ? "female" : "male",
    nationality: pick(NATIONS),
  });
}

export function defaultPlayerRoster(
  repoRoot: string,
  teamName: string,
): DriverProfilePayload[] {
  return [
    createCustomBronzeDriver(repoRoot, {
      name: `${teamName} Ace`,
      nationality: "GB",
      gender: "female",
    }),
    createCustomBronzeDriver(repoRoot, {
      name: `${teamName} Endurance`,
      nationality: "FR",
      gender: "male",
    }),
  ];
}
