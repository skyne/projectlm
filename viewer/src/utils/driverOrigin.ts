import type {
  DriverProfilePayload,
  DriverStatDefPayload,
  GameCatalogPayload,
} from "../ws/protocol";

export function wecCatalogIdSet(
  catalog: GameCatalogPayload | null,
): ReadonlySet<string> {
  return new Set(catalog?.wecCatalogDriverIds ?? []);
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

export function isCustomDriver(
  driver: DriverProfilePayload,
  catalog?: GameCatalogPayload | null,
): boolean {
  return !isSignedDriver(driver, wecCatalogIdSet(catalog ?? null));
}

/** Custom driver still in create mode — no saved stat baseline yet. */
export function isDraftCustomDriver(
  driver: DriverProfilePayload,
  catalog?: GameCatalogPayload | null,
): boolean {
  return isCustomDriver(driver, catalog) && !driver.statBaseline;
}

export function stableCatalogDriverId(name: string, nationality: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `catalog-${slug}-${nationality.trim().toUpperCase()}`;
}

export function customDriverPointPool(catalog: GameCatalogPayload | null): number {
  return catalog?.driverPointPool ?? 7;
}

export function normalizeRosterDriver(
  driver: DriverProfilePayload,
  catalog: GameCatalogPayload | null,
): DriverProfilePayload {
  const catalogIds = wecCatalogIdSet(catalog);
  if (!isSignedDriver(driver, catalogIds)) {
    return driver.origin === "custom"
      ? { ...driver, tier: "Bronze" }
      : driver;
  }
  const stableId = stableCatalogDriverId(driver.name, driver.nationality);
  const gender =
    catalog?.wecDriverGenders?.[stableId] ?? driver.gender ?? "male";
  return {
    ...driver,
    id: stableId,
    origin: "signed",
    gender,
  };
}

export interface DriverPointBudget {
  cost: number;
  pool: number;
  spare: number;
  signed: boolean;
  custom: boolean;
  draft: boolean;
}

export function driverPointBudget(
  driver: DriverProfilePayload,
  defs: DriverStatDefPayload[],
  catalog: GameCatalogPayload | null,
  pointCost: (d: DriverProfilePayload, defs: DriverStatDefPayload[]) => number,
): DriverPointBudget {
  const catalogIds = wecCatalogIdSet(catalog);
  const signed = isSignedDriver(driver, catalogIds);
  const custom = !signed;
  const draft = custom && !driver.statBaseline;
  const cost = pointCost(
    custom ? { ...driver, tier: "Bronze" } : driver,
    defs,
  );
  if (signed) {
    return { cost, pool: cost, spare: 0, signed: true, custom: false, draft: false };
  }
  const pool = customDriverPointPool(catalog);
  return {
    cost,
    pool,
    spare: Math.max(0, pool - cost),
    signed: false,
    custom: true,
    draft,
  };
}

export function statFloorValue(
  driver: DriverProfilePayload,
  statKey: string,
  defMin: number,
  catalog?: GameCatalogPayload | null,
): number {
  if (isDraftCustomDriver(driver, catalog)) return defMin;
  const floor = driver.statBaseline?.[statKey];
  return typeof floor === "number" ? floor : defMin;
}

export function customBronzeTemplate(
  catalog: GameCatalogPayload | null,
): DriverProfilePayload {
  if (catalog?.customDriverTemplate) {
    return { ...catalog.customDriverTemplate, tier: "Bronze" };
  }
  return {
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
    adaptability: 66,
    maxStintHours: 2.5,
  };
}

export function createCustomBronzeDriver(
  catalog: GameCatalogPayload | null,
  options?: {
    name?: string;
    nationality?: string;
    gender?: DriverProfilePayload["gender"];
  },
): DriverProfilePayload {
  const template = customBronzeTemplate(catalog);
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const first = ["Alex", "Marco", "Elena", "Luca", "Sofia", "Kai", "Nina", "Oliver"];
  const last = ["Voss", "Reeves", "Bianchi", "Kowalski", "Santos", "Chen", "Dupont"];
  const nats = ["GB", "FR", "DE", "IT", "US", "BR", "JP", "ES", "NL", "AU"];
  return {
    ...template,
    id: crypto.randomUUID(),
    origin: "custom",
    tier: "Bronze",
    name: options?.name ?? `${pick(first)} ${pick(last)}`,
    nationality: options?.nationality ?? pick(nats),
    gender: options?.gender ?? (Math.random() < 0.28 ? "female" : "male"),
  };
}
