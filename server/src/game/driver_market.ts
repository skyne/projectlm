import {
  buildDriverContractMap,
  computeDriverPointCost,
  ensureCatalogDriverId,
  generateRandomDriver,
  inferTier,
  loadLeMansDriverCatalog,
  type DriverProfilePayload,
} from "./driver_catalog";

export type DriverMarketSource = "wec_active" | "wec_retired" | "prospect";

export interface DriverMarketListing {
  id: string;
  source: DriverMarketSource;
  driver: DriverProfilePayload;
  /** WEC grid driver — team they are currently under contract with */
  contractedTeam?: string;
  signingFee: number;
  salaryPerRace: number;
  tagline: string;
}

export const DRIVER_MARKET_REFRESH_COST = 50_000;
export const MAX_DRIVER_ROSTER = 12;
const MARKET_WEC_SLOTS = 14;
const MARKET_RETIRED_SLOTS = 6;
const MARKET_PROSPECT_SLOTS = 6;

interface RetiredLegend {
  driver: DriverProfilePayload;
  tagline: string;
}

const RETIRED_WEC_LEGENDS: RetiredLegend[] = [
  {
    tagline: "9× Le Mans winner · WEC legend",
    driver: {
      name: "Tom Kristensen", nationality: "DK", tier: "Platinum",
      dryPace: 92, wetPace: 88, consistency: 95, overtaking: 88, defending: 86,
      trafficManagement: 90, rollingStart: 88, standingStart: 86, setupFeedback: 84,
      tireManagement: 88, fuelSaving: 86, composure: 94, nightPace: 90, rainRadar: 86,
      stamina: 88, maxStintHours: 3.5,
    },
  },
  {
    tagline: "3× Le Mans winner · former WEC champion",
    driver: {
      name: "Allan McNish", nationality: "GB", tier: "Platinum",
      dryPace: 91, wetPace: 90, consistency: 92, overtaking: 90, defending: 88,
      trafficManagement: 92, rollingStart: 88, standingStart: 86, setupFeedback: 88,
      tireManagement: 90, fuelSaving: 88, composure: 90, nightPace: 88, rainRadar: 90,
      stamina: 86, maxStintHours: 3,
    },
  },
  {
    tagline: "Audi era icon · now available as endurance consultant-driver",
    driver: {
      name: "André Lotterer", nationality: "DE", tier: "Platinum",
      dryPace: 90, wetPace: 86, consistency: 90, overtaking: 88, defending: 86,
      trafficManagement: 88, rollingStart: 86, standingStart: 84, setupFeedback: 86,
      tireManagement: 88, fuelSaving: 84, composure: 88, nightPace: 86, rainRadar: 82,
      stamina: 84, maxStintHours: 3,
    },
  },
  {
    tagline: "Porsche factory pedigree · retired from full-season WEC",
    driver: {
      name: "Timo Bernhard", nationality: "DE", tier: "Platinum",
      dryPace: 90, wetPace: 88, consistency: 91, overtaking: 86, defending: 88,
      trafficManagement: 88, rollingStart: 86, standingStart: 84, setupFeedback: 84,
      tireManagement: 90, fuelSaving: 88, composure: 90, nightPace: 88, rainRadar: 86,
      stamina: 86, maxStintHours: 3,
    },
  },
  {
    tagline: "LMP1 hybrid specialist · endurance race engineer favourite",
    driver: {
      name: "Anthony Davidson", nationality: "GB", tier: "Gold",
      dryPace: 88, wetPace: 90, consistency: 90, overtaking: 84, defending: 86,
      trafficManagement: 90, rollingStart: 84, standingStart: 82, setupFeedback: 92,
      tireManagement: 88, fuelSaving: 86, composure: 88, nightPace: 86, rainRadar: 92,
      stamina: 82, maxStintHours: 2.5,
    },
  },
  {
    tagline: "Former Toyota factory driver · night-stint specialist",
    driver: {
      name: "Kazuki Nakajima", nationality: "JP", tier: "Gold",
      dryPace: 88, wetPace: 84, consistency: 88, overtaking: 82, defending: 84,
      trafficManagement: 86, rollingStart: 84, standingStart: 82, setupFeedback: 80,
      tireManagement: 86, fuelSaving: 84, composure: 86, nightPace: 90, rainRadar: 78,
      stamina: 88, maxStintHours: 3.5,
    },
  },
  {
    tagline: "Corvette factory ace · GT prototype crossover experience",
    driver: {
      name: "Antonio García", nationality: "ES", tier: "Gold",
      dryPace: 87, wetPace: 86, consistency: 88, overtaking: 86, defending: 88,
      trafficManagement: 88, rollingStart: 84, standingStart: 82, setupFeedback: 82,
      tireManagement: 88, fuelSaving: 86, composure: 88, nightPace: 84, rainRadar: 84,
      stamina: 84, maxStintHours: 3,
    },
  },
  {
    tagline: "Peugeot hypercar development driver · recently stepped back",
    driver: {
      name: "Loïc Duval", nationality: "FR", tier: "Gold",
      dryPace: 87, wetPace: 88, consistency: 86, overtaking: 84, defending: 82,
      trafficManagement: 86, rollingStart: 84, standingStart: 82, setupFeedback: 84,
      tireManagement: 84, fuelSaving: 82, composure: 84, nightPace: 82, rainRadar: 88,
      stamina: 80, maxStintHours: 2.5,
    },
  },
  {
    tagline: "Audi Sport programme · now mentoring privateer programmes",
    driver: {
      name: "Oliver Jarvis", nationality: "GB", tier: "Gold",
      dryPace: 86, wetPace: 84, consistency: 86, overtaking: 82, defending: 84,
      trafficManagement: 86, rollingStart: 82, standingStart: 80, setupFeedback: 82,
      tireManagement: 86, fuelSaving: 84, composure: 84, nightPace: 84, rainRadar: 80,
      stamina: 86, maxStintHours: 3,
    },
  },
  {
    tagline: "Ferrari AF Corse factory · endurance tyre whisperer",
    driver: {
      name: "Davide Rigon", nationality: "IT", tier: "Gold",
      dryPace: 86, wetPace: 82, consistency: 86, overtaking: 80, defending: 82,
      trafficManagement: 84, rollingStart: 80, standingStart: 78, setupFeedback: 80,
      tireManagement: 90, fuelSaving: 88, composure: 84, nightPace: 82, rainRadar: 78,
      stamina: 88, maxStintHours: 3.5,
    },
  },
  {
    tagline: "Rebellion Racing LMP1 · prototype traffic veteran",
    driver: {
      name: "Bruno Senna", nationality: "BR", tier: "Gold",
      dryPace: 86, wetPace: 84, consistency: 84, overtaking: 86, defending: 84,
      trafficManagement: 88, rollingStart: 82, standingStart: 80, setupFeedback: 78,
      tireManagement: 84, fuelSaving: 82, composure: 82, nightPace: 80, rainRadar: 76,
      stamina: 82, maxStintHours: 2.5,
    },
  },
  {
    tagline: "GTE era factory driver · solid bronze-tier mentor",
    driver: {
      name: "Richard Lietz", nationality: "DE", tier: "Silver",
      dryPace: 82, wetPace: 80, consistency: 84, overtaking: 78, defending: 80,
      trafficManagement: 82, rollingStart: 78, standingStart: 76, setupFeedback: 76,
      tireManagement: 84, fuelSaving: 82, composure: 82, nightPace: 78, rainRadar: 74,
      stamina: 84, maxStintHours: 3,
    },
  },
];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function tierMultiplier(tier: string): number {
  switch (tier) {
    case "Platinum":
      return 2.4;
    case "Gold":
      return 1.5;
    case "Silver":
      return 1.0;
    default:
      return 0.75;
  }
}

function sourceMultiplier(source: DriverMarketSource): number {
  switch (source) {
    case "wec_active":
      return 1.75;
    case "wec_retired":
      return 1.25;
    default:
      return 0.7;
  }
}

export function computeDriverSigningFee(
  driver: DriverProfilePayload,
  source: DriverMarketSource,
): { signingFee: number; salaryPerRace: number } {
  const points = computeDriverPointCost(driver);
  const base = 40_000 + points * 650;
  const signingFee = Math.round(
    base * tierMultiplier(driver.tier) * sourceMultiplier(source),
  );
  const salaryPerRace = Math.round(signingFee * 0.06);
  return { signingFee, salaryPerRace };
}

function normalizeDriver(driver: DriverProfilePayload): DriverProfilePayload {
  return ensureCatalogDriverId({
    ...driver,
    tier: inferTier(driver),
  });
}

function rosterIdSet(roster: DriverProfilePayload[]): Set<string> {
  return new Set(
    roster
      .map((d) => d.id?.trim())
      .filter((id): id is string => Boolean(id)),
  );
}

/** Validate that a market signing does not violate global driver contracts. */
export function validateDriverMarketSigning(
  listing: DriverMarketListing,
  signingTeam: string,
  roster: DriverProfilePayload[],
  repoRoot: string,
  rosterOverrides?: Record<string, DriverProfilePayload[]>,
): string | null {
  const driver = normalizeDriver(listing.driver);
  const driverId = driver.id!;
  if (roster.some((d) => d.id === driverId)) {
    return `${driver.name} is already on your roster`;
  }
  const contracts = buildDriverContractMap(repoRoot, {
    playerTeamName: signingTeam,
    playerRoster: roster,
    rosterOverrides,
  });
  const holder = contracts.get(driverId);
  if (listing.source === "wec_active") return null;
  if (holder && holder.toLowerCase() !== signingTeam.trim().toLowerCase()) {
    return `${driver.name} is under contract with ${holder}`;
  }
  return null;
}

export function buildDriverMarket(
  repoRoot: string,
  options: {
    seed: number;
    playerTeamName: string;
    existingRoster?: DriverProfilePayload[];
    rosterOverrides?: Record<string, DriverProfilePayload[]>;
  },
): DriverMarketListing[] {
  const rnd = seeded(options.seed);
  const contracts = buildDriverContractMap(repoRoot, {
    playerTeamName: options.playerTeamName,
    playerRoster: options.existingRoster,
    rosterOverrides: options.rosterOverrides,
  });
  const takenIds = rosterIdSet(options.existingRoster ?? []);
  const listings: DriverMarketListing[] = [];

  const lemans = loadLeMansDriverCatalog(repoRoot);
  const wecPool: Array<{ team: string; driver: DriverProfilePayload }> = [];
  for (const [key, roster] of lemans) {
    const comma = key.lastIndexOf("#");
    const team = key.slice(0, comma);
    if (team.toLowerCase() === options.playerTeamName.trim().toLowerCase()) {
      continue;
    }
    for (const driver of roster) {
      const normalized = normalizeDriver(driver);
      const driverId = normalized.id!;
      if (takenIds.has(driverId)) continue;
      const holder = contracts.get(driverId);
      if (holder && holder.toLowerCase() !== team.toLowerCase()) continue;
      wecPool.push({ team, driver: normalized });
    }
  }

  for (const entry of shuffle(wecPool, rnd).slice(0, MARKET_WEC_SLOTS)) {
    const id = `wec-${slugId(entry.team)}-${slugId(entry.driver.name)}`;
    const fees = computeDriverSigningFee(entry.driver, "wec_active");
    listings.push({
      id,
      source: "wec_active",
      driver: { ...entry.driver },
      contractedTeam: entry.team,
      ...fees,
      tagline: `Under contract with ${entry.team} — buyout required`,
    });
    takenIds.add(entry.driver.id!);
  }

  for (const legend of shuffle(RETIRED_WEC_LEGENDS, rnd).slice(0, MARKET_RETIRED_SLOTS)) {
    const driver = normalizeDriver({ ...legend.driver });
    const driverId = driver.id!;
    if (takenIds.has(driverId)) continue;
    const holder = contracts.get(driverId);
    if (
      holder &&
      holder.toLowerCase() !== options.playerTeamName.trim().toLowerCase()
    ) {
      continue;
    }
    const fees = computeDriverSigningFee(driver, "wec_retired");
    listings.push({
      id: `retired-${slugId(driver.name)}`,
      source: "wec_retired",
      driver,
      ...fees,
      tagline: legend.tagline,
    });
    takenIds.add(driverId);
  }

  for (let i = 0; i < MARKET_PROSPECT_SLOTS; i++) {
    const seed = (options.seed + i * 7919) >>> 0;
    let driver = normalizeDriver(generateRandomDriver(seed));
    let attempts = 0;
    while (takenIds.has(driver.id!) && attempts < 8) {
      driver = normalizeDriver(generateRandomDriver(seed + attempts * 997));
      attempts++;
    }
    if (takenIds.has(driver.id!)) continue;
    const holder = contracts.get(driver.id!);
    if (
      holder &&
      holder.toLowerCase() !== options.playerTeamName.trim().toLowerCase()
    ) {
      continue;
    }
    const fees = computeDriverSigningFee(driver, "prospect");
    listings.push({
      id: `prospect-${slugId(driver.name)}-${seed.toString(36)}`,
      source: "prospect",
      driver,
      ...fees,
      tagline: "Free agent · scouting report from driver market",
    });
    takenIds.add(driver.id!);
  }

  return listings.sort((a, b) => b.signingFee - a.signingFee);
}

/** Static sample for team creation wizard and catalog — no buyout teams. */
export function buildDriverMarketPreview(repoRoot: string): DriverMarketListing[] {
  return buildDriverMarket(repoRoot, {
    seed: 20260605,
    playerTeamName: "",
    existingRoster: [],
  }).slice(0, 18);
}

export function marketSeedForRound(
  teamName: string,
  round: number,
  refreshCount: number,
): number {
  let hash = round * 2654435761;
  for (let i = 0; i < teamName.length; i++) {
    hash = (hash * 31 + teamName.charCodeAt(i)) >>> 0;
  }
  return (hash + refreshCount * 9749) >>> 0;
}

export function findMarketListing(
  market: DriverMarketListing[] | undefined,
  listingId: string,
): DriverMarketListing | null {
  return market?.find((l) => l.id === listingId) ?? null;
}

export function sourceLabel(source: DriverMarketSource): string {
  switch (source) {
    case "wec_active":
      return "WEC grid";
    case "wec_retired":
      return "Retired legend";
    default:
      return "Prospect";
  }
}
