import type {
  CarPlatformPayload,
  FleetCarPayload,
  GameCatalogPayload,
} from "../ws/protocol";

export interface ClassProgramView {
  classId: string;
  affiliation: FleetCarPayload["affiliation"];
  acquisition: FleetCarPayload["acquisition"];
  platformId?: string;
  carCount: number;
  label: string;
}

export function classProgrammeLabel(
  car: FleetCarPayload,
  platform?: CarPlatformPayload,
): string {
  if (car.affiliation === "manufacturer" && car.acquisition === "build") {
    return `${car.classId} Manufacturer`;
  }
  if (car.acquisition === "privateer" && platform) {
    return `${car.classId} Privateer · ${platform.displayName}`;
  }
  if (car.affiliation === "privateer") {
    return `${car.classId} Privateer`;
  }
  return `${car.classId} Manufacturer`;
}

export function getClassProgram(
  fleet: FleetCarPayload[],
  classId: string,
  catalog: GameCatalogPayload | null,
): ClassProgramView | null {
  const inClass = fleet.filter((c) => c.classId === classId);
  if (inClass.length === 0) return null;

  const ref = inClass[0];
  const platform = ref.platformId
    ? catalog?.carPlatforms?.find((p) => p.id === ref.platformId)
    : undefined;

  return {
    classId,
    affiliation: ref.affiliation,
    acquisition: ref.acquisition,
    platformId: ref.platformId,
    carCount: inClass.length,
    label: classProgrammeLabel(ref, platform),
  };
}

/** Per-class programme summary, e.g. "Hypercar Manufacturer · LMGT3 Privateer". */
export function teamProgrammeSummary(
  fleet: FleetCarPayload[],
  catalog: GameCatalogPayload | null,
): string {
  const classIds = [...new Set(fleet.map((c) => c.classId))].sort();
  if (classIds.length === 0) return "—";

  return classIds
    .map((classId) => {
      const program = getClassProgram(fleet, classId, catalog);
      if (!program) return classId;
      return program.affiliation === "manufacturer"
        ? `${classId} Manufacturer`
        : `${classId} Privateer`;
    })
    .join(" · ");
}

export function isHypercarManufacturer(fleet: FleetCarPayload[]): boolean {
  return fleet.some(
    (c) => c.classId === "Hypercar" && c.affiliation === "manufacturer",
  );
}

export function groupFleetByClass(
  fleet: FleetCarPayload[],
): Map<string, FleetCarPayload[]> {
  const groups = new Map<string, FleetCarPayload[]>();
  for (const car of fleet) {
    const list = groups.get(car.classId) ?? [];
    list.push(car);
    groups.set(car.classId, list);
  }
  return groups;
}

export function unitCostForBuy(
  catalog: GameCatalogPayload,
  classId: string,
  affiliation: FleetCarPayload["affiliation"],
  platformId: string,
): number {
  if (affiliation === "manufacturer") {
    return catalog.fleetRules.costs.manufacturerBuild[classId] ?? 0;
  }
  const platform = catalog.carPlatforms?.find((p) => p.id === platformId);
  return (
    platform?.privateerCost ??
    catalog.fleetRules.costs.privateerSlot[classId] ??
    0
  );
}

export function defaultQuantity(
  classId: string,
  affiliation: FleetCarPayload["affiliation"],
  mfgHypercarMin: number,
): number {
  if (classId === "Hypercar" && affiliation === "manufacturer") {
    return mfgHypercarMin;
  }
  return 1;
}

export function hypercarMfgWarning(
  classId: string,
  affiliation: FleetCarPayload["affiliation"],
  quantity: number,
  mfgMin: number,
): string | null {
  if (classId !== "Hypercar" || affiliation !== "manufacturer") return null;
  if (quantity >= mfgMin) return null;
  return `Building your own Hypercar makes you a Hypercar manufacturer — you must enter at least ${mfgMin}. Consider ordering ${mfgMin} now.`;
}

export function affiliationHintForClass(
  classId: string,
  affiliation: FleetCarPayload["affiliation"],
  mfgMin: number,
): string {
  if (classId === "Hypercar" && affiliation === "manufacturer") {
    return `Building your own Hypercar makes your team a Hypercar manufacturer (minimum ${mfgMin} entries). You can still run other classes as a privateer.`;
  }
  if (affiliation === "manufacturer") {
    return `${classId} manufacturer programme — independent from your other class entries.`;
  }
  return `${classId} privateer programme — buy a customer platform for this class only.`;
}
