import type {
  BuyCarPayload,
  CreateTeamPayload,
  DriverProfilePayload,
  GameCatalogPayload,
  StaffMemberPayload,
} from "./protocol.js";

const REQUIRED_STAFF_ROLES = ["engineer", "mechanic", "strategist"] as const;

export type TeamPresetId = "lmp2-privateer" | "lmgt3-privateer" | "hypercar-manufacturer";

export interface TeamPresetOptions {
  teamName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  classId?: string;
  platformId?: string;
  quantity?: number;
}

export function defaultDriverRoster(teamName: string): DriverProfilePayload[] {
  return [
    {
      name: `${teamName} Ace`,
      nationality: "GB",
      tier: "Gold",
      dryPace: 84,
      wetPace: 78,
      consistency: 82,
      overtaking: 80,
      defending: 78,
      trafficManagement: 80,
      rollingStart: 78,
      standingStart: 76,
      setupFeedback: 74,
      tireManagement: 80,
      fuelSaving: 76,
      composure: 82,
      nightPace: 78,
      rainRadar: 72,
      stamina: 80,
      maxStintHours: 3,
    },
    {
      name: `${teamName} Endurance`,
      nationality: "FR",
      tier: "Silver",
      dryPace: 78,
      wetPace: 74,
      consistency: 80,
      overtaking: 72,
      defending: 76,
      trafficManagement: 78,
      rollingStart: 74,
      standingStart: 72,
      setupFeedback: 70,
      tireManagement: 82,
      fuelSaving: 80,
      composure: 78,
      nightPace: 76,
      rainRadar: 70,
      stamina: 84,
      maxStintHours: 3.5,
    },
  ];
}

export function pickStaff(catalog: GameCatalogPayload): StaffMemberPayload[] {
  const staff: StaffMemberPayload[] = [];
  for (const role of REQUIRED_STAFF_ROLES) {
    const candidate = catalog.staffCandidates.find((s) => s.role === role);
    if (!candidate) {
      throw new Error(`No staff candidate for role: ${role}`);
    }
    staff.push({
      role: candidate.role,
      name: candidate.name,
      skill: candidate.skill,
    });
  }
  return staff;
}

function platformForClass(
  catalog: GameCatalogPayload,
  classId: string,
  platformId?: string,
): string {
  if (platformId) {
    const match = catalog.carPlatforms.find((p) => p.id === platformId);
    if (!match) throw new Error(`Unknown platform: ${platformId}`);
    if (match.classId !== classId) {
      throw new Error(`Platform ${platformId} is ${match.classId}, not ${classId}`);
    }
    return match.id;
  }

  const platform = catalog.carPlatforms.find((p) => p.classId === classId);
  if (!platform) throw new Error(`No platform available for class ${classId}`);
  return platform.id;
}

export function buildCreateTeamPayload(
  catalog: GameCatalogPayload,
  preset: TeamPresetId,
  options: TeamPresetOptions = {},
): CreateTeamPayload {
  const teamName = (options.teamName ?? "Cursor Racing").trim();
  const primaryColor = options.primaryColor ?? "#1e5eff";
  const secondaryColor = options.secondaryColor ?? "#f0f4ff";

  let firstCar: BuyCarPayload;

  switch (preset) {
    case "lmp2-privateer":
      firstCar = {
        classId: "LMP2",
        affiliation: "privateer",
        acquisition: "privateer",
        platformId: platformForClass(catalog, "LMP2", options.platformId),
        quantity: options.quantity ?? 1,
      };
      break;
    case "lmgt3-privateer":
      firstCar = {
        classId: "LMGT3",
        affiliation: "privateer",
        acquisition: "privateer",
        platformId: platformForClass(catalog, "LMGT3", options.platformId),
        quantity: options.quantity ?? 1,
      };
      break;
    case "hypercar-manufacturer":
      firstCar = {
        classId: "Hypercar",
        affiliation: "manufacturer",
        acquisition: "build",
        quantity: options.quantity ?? 2,
      };
      break;
    default:
      throw new Error(`Unknown preset: ${preset satisfies never}`);
  }

  return {
    teamName,
    primaryColor,
    secondaryColor,
    staff: pickStaff(catalog),
    firstCar,
    driverRoster: defaultDriverRoster(teamName),
  };
}

export function catalogSummary(catalog: GameCatalogPayload) {
  return {
    classes: catalog.classes.map((c) => ({
      id: c.id,
      displayName: c.displayName,
    })),
    platforms: catalog.carPlatforms.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      classId: p.classId,
      privateerCost: p.privateerCost,
    })),
    staffRoles: [...new Set(catalog.staffCandidates.map((s) => s.role))],
    startingBudget: catalog.fleetRules.startingBudget,
    driverPointPool: catalog.driverPointPool,
    presets: ["lmp2-privateer", "lmgt3-privateer", "hypercar-manufacturer"],
  };
}
