import type {
  BuyCarPayload,
  CarBuildPayload,
  EngineBuildPayload,
  FleetCarPayload,
  MetaStatePayload,
  PartOptionPayload,
} from "../ws_protocol";
import {
  buildFromPlatform,
  loadCarPlatforms,
  MANUFACTURER_HYPERCAR_MIN_CARS,
  manufacturerBuildCost,
  platformById,
  privateerSlotCost,
} from "./car_marketplace";
import {
  defaultBuildForClass,
  defaultWheelPackageForClass,
  defaultSuspensionForClass,
  loadGameCatalog,
} from "./catalog";
import { allDriverIndices } from "./driver_catalog";
import { normalizeCarBuild } from "./chassis_setup";
import type { CarPlatform } from "./car_marketplace";
import { STARTING_BUDGET } from "./economy";

export const MAX_CARS_PER_PURCHASE = 6;

export interface ClassProgram {
  classId: string;
  affiliation: FleetCarPayload["affiliation"];
  acquisition: FleetCarPayload["acquisition"];
  platformId?: string;
  carCount: number;
  label: string;
}

export function normalizeQuantity(quantity?: number): number {
  const q = Math.floor(quantity ?? 1);
  return Math.max(1, Math.min(MAX_CARS_PER_PURCHASE, q));
}

export function classProgramLabel(
  car: FleetCarPayload,
  platform?: CarPlatform | null,
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
  repoRoot?: string,
): ClassProgram | null {
  const inClass = fleet.filter((c) => c.classId === classId);
  if (inClass.length === 0) return null;

  const ref = inClass[0];
  let platform: CarPlatform | null = null;
  if (ref.platformId && repoRoot) {
    platform = platformById(repoRoot, ref.platformId);
  }

  return {
    classId,
    affiliation: ref.affiliation,
    acquisition: ref.acquisition,
    platformId: ref.platformId,
    carCount: inClass.length,
    label: classProgramLabel(ref, platform),
  };
}

export function payloadMatchesClassProgram(
  program: ClassProgram,
  payload: BuyCarPayload,
): boolean {
  if (program.affiliation !== payload.affiliation) return false;
  if (program.acquisition !== payload.acquisition) return false;
  if (program.acquisition === "privateer") {
    return program.platformId === payload.platformId;
  }
  return payload.acquisition === "build";
}

export function cloneCarBuild(build: CarBuildPayload): CarBuildPayload {
  return structuredClone(build);
}

/** Compare builds ignoring display name — same programme must share one spec. */
export function buildSpecKey(build: CarBuildPayload): string {
  return JSON.stringify({ ...build, carName: "" });
}

export function referenceCarForClass(
  fleet: FleetCarPayload[],
  classId: string,
): FleetCarPayload | undefined {
  return fleet.find((c) => c.classId === classId);
}

/** Force sibling entries in each class to match the first car's build. */
export function alignProgrammeBuilds(fleet: FleetCarPayload[]): boolean {
  let changed = false;
  const byClass = new Map<string, FleetCarPayload[]>();
  for (const car of fleet) {
    const list = byClass.get(car.classId) ?? [];
    list.push(car);
    byClass.set(car.classId, list);
  }

  for (const cars of byClass.values()) {
    if (cars.length < 2) continue;
    const refKey = buildSpecKey(cars[0].build);
    for (let i = 1; i < cars.length; i++) {
      if (buildSpecKey(cars[i].build) !== refKey) {
        cars[i].build = cloneCarBuild(cars[0].build);
        changed = true;
      }
    }
  }

  return changed;
}

export function nextFleetCarId(fleet: FleetCarPayload[]): string {
  let max = 0;
  for (const car of fleet) {
    const match = /^car-(\d+)$/.exec(car.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `car-${max + 1}`;
}

export function nextCarNumber(fleet: FleetCarPayload[]): string {
  if (fleet.length === 0) return "1";
  const max = Math.max(...fleet.map((c) => parseInt(c.carNumber, 10) || 0));
  return String(max + 1);
}

export function fleetCarConfigPath(carId: string): string {
  return `configs/runtime/fleet/${carId}.txt`;
}

function rawToEngine(raw: Record<string, string>): EngineBuildPayload | undefined {
  if (!raw.engine_layout) return undefined;
  return {
    engine_layout: raw.engine_layout,
    fuel_type: raw.fuel_type ?? "Gasoline",
    cylinders: parseInt(raw.cylinders ?? "6", 10),
    bore: parseFloat(raw.bore ?? "0.096"),
    stroke: parseFloat(raw.stroke ?? "0.080"),
    max_rpm: parseInt(raw.max_rpm ?? "8000", 10),
    peak_torque_nm: parseFloat(raw.peak_torque_nm ?? "500"),
    peak_torque_rpm: parseInt(raw.peak_torque_rpm ?? "6500", 10),
    base_vibration: parseFloat(raw.base_vibration ?? "1.0"),
    aspiration: raw.aspiration,
    drivetrain: raw.drivetrain,
    generator_kw: raw.generator_kw ? parseFloat(raw.generator_kw) : undefined,
  };
}

function inferClassId(chassis: string): string {
  if (chassis.startsWith("GT3") || chassis === "GT3Spaceframe") return "LMGT3";
  if (chassis === "Oreca07") return "LMP2";
  return "Hypercar";
}

function rawToBuild(
  raw: Record<string, string>,
  carName: string,
  partsBySlot?: Record<string, PartOptionPayload[]>,
): CarBuildPayload {
  const classId = inferClassId(raw.chassis_type ?? "LMDhDallara");
  const build: CarBuildPayload = {
    carName,
    chassis_type: raw.chassis_type ?? "LMDhDallara",
    front_aero_type: raw.front_aero_type ?? "LowDragNose",
    rear_aero_type: raw.rear_aero_type ?? "StandardWing",
    cooling_pack: raw.cooling_pack ?? "EnduranceHeavyDuty",
    wheel_package:
      raw.wheel_package ?? defaultWheelPackageForClass(classId),
    suspension_layout:
      raw.suspension_layout ?? defaultSuspensionForClass(classId),
    front_suspension_layout: raw.front_suspension_layout,
    rear_suspension_layout: raw.rear_suspension_layout,
    front_wheel_diameter_in: raw.front_wheel_diameter_in
      ? parseFloat(raw.front_wheel_diameter_in)
      : undefined,
    rear_wheel_diameter_in: raw.rear_wheel_diameter_in
      ? parseFloat(raw.rear_wheel_diameter_in)
      : undefined,
    front_tire_width_mm: raw.front_tire_width_mm
      ? parseFloat(raw.front_tire_width_mm)
      : undefined,
    rear_tire_width_mm: raw.rear_tire_width_mm
      ? parseFloat(raw.rear_tire_width_mm)
      : undefined,
    front_ride_height_mm: raw.front_ride_height_mm
      ? parseFloat(raw.front_ride_height_mm)
      : raw.front_ride_height_m
        ? parseFloat(raw.front_ride_height_m) * 1000
        : undefined,
    rear_ride_height_mm: raw.rear_ride_height_mm
      ? parseFloat(raw.rear_ride_height_mm)
      : raw.rear_ride_height_m
        ? parseFloat(raw.rear_ride_height_m) * 1000
        : undefined,
    front_spring_nm: raw.front_spring_nm
      ? parseFloat(raw.front_spring_nm)
      : raw.front_spring_stiffness
        ? parseFloat(raw.front_spring_stiffness)
        : undefined,
    rear_spring_nm: raw.rear_spring_nm
      ? parseFloat(raw.rear_spring_nm)
      : raw.rear_spring_stiffness
        ? parseFloat(raw.rear_spring_stiffness)
        : undefined,
    front_arb_stiffness: raw.front_arb_stiffness
      ? parseFloat(raw.front_arb_stiffness)
      : undefined,
    rear_arb_stiffness: raw.rear_arb_stiffness
      ? parseFloat(raw.rear_arb_stiffness)
      : undefined,
    front_damper_bump: raw.front_damper_bump
      ? parseInt(raw.front_damper_bump, 10)
      : undefined,
    front_damper_rebound: raw.front_damper_rebound
      ? parseInt(raw.front_damper_rebound, 10)
      : undefined,
    rear_damper_bump: raw.rear_damper_bump
      ? parseInt(raw.rear_damper_bump, 10)
      : undefined,
    rear_damper_rebound: raw.rear_damper_rebound
      ? parseInt(raw.rear_damper_rebound, 10)
      : undefined,
    fuel_system: raw.fuel_system ?? "StandardTank",
    brake_system: raw.brake_system ?? "StandardCaliper",
    transmission: raw.transmission ?? "SixSpeedSequential",
    hybrid_system: raw.hybrid_system ?? "None",
  };
  const engine = rawToEngine(raw);
  if (engine) build.engine = engine;
  if (
    raw.engine_radiator_size ||
    raw.oil_cooler_size ||
    raw.charge_air_cooler_size ||
    raw.gearbox_cooler_size
  ) {
    build.cooling = {
      engine_radiator: raw.engine_radiator_size
        ? parseFloat(raw.engine_radiator_size)
        : undefined,
      oil_cooler: raw.oil_cooler_size
        ? parseFloat(raw.oil_cooler_size)
        : undefined,
      charge_air_cooler: raw.charge_air_cooler_size
        ? parseFloat(raw.charge_air_cooler_size)
        : undefined,
      gearbox_cooler: raw.gearbox_cooler_size
        ? parseFloat(raw.gearbox_cooler_size)
        : undefined,
    };
  }
  if (raw.duct_airflow) {
    build.duct_airflow = parseFloat(raw.duct_airflow);
  }
  return normalizeCarBuild(build, classId, partsBySlot);
}

export function buyCarUnitCost(
  repoRoot: string,
  payload: BuyCarPayload,
): number | null {
  if (payload.acquisition === "privateer") {
    if (!payload.platformId) return null;
    const platform = platformById(repoRoot, payload.platformId);
    if (!platform || platform.classId !== payload.classId) return null;
    return platform.privateerCost;
  }
  if (payload.affiliation !== "manufacturer") return null;
  return manufacturerBuildCost(payload.classId);
}

export function buyCarCost(
  repoRoot: string,
  payload: BuyCarPayload,
): number | null {
  const unit = buyCarUnitCost(repoRoot, payload);
  if (unit === null) return null;
  return unit * normalizeQuantity(payload.quantity);
}

export function createFleetCar(
  repoRoot: string,
  teamName: string,
  payload: BuyCarPayload,
  fleet: FleetCarPayload[],
): FleetCarPayload | null {
  if (buyCarUnitCost(repoRoot, payload) === null) return null;

  const id = nextFleetCarId(fleet);
  const carNumber = payload.carNumber ?? nextCarNumber(fleet);

  let build: CarBuildPayload;
  let manufacturerId: string | undefined;
  let platformId: string | undefined;

  if (payload.acquisition === "privateer" && payload.platformId) {
    const platform = platformById(repoRoot, payload.platformId);
    if (!platform) return null;
    const catalog = loadGameCatalog(repoRoot);
    const raw = buildFromPlatform(repoRoot, platform, teamName);
    build = rawToBuild(
      raw,
      raw.carName ?? `${teamName} ${platform.displayName}`,
      catalog.partsBySlot,
    );
    manufacturerId = platform.manufacturerId;
    platformId = platform.id;
  } else {
    const existing = referenceCarForClass(fleet, payload.classId);
    if (existing?.build) {
      build = cloneCarBuild(existing.build);
      manufacturerId =
        existing.manufacturerId ??
        teamName.toLowerCase().replace(/\s+/g, "_").slice(0, 24);
    } else {
      const catalog = loadGameCatalog(repoRoot);
      const raw = defaultBuildForClass(repoRoot, payload.classId);
      if (!raw) return null;
      build = rawToBuild(
        raw,
        raw.carName ?? `${teamName} ${payload.classId}`,
        catalog.partsBySlot,
      );
      manufacturerId = teamName.toLowerCase().replace(/\s+/g, "_").slice(0, 24);
    }
  }

  return {
    id,
    carNumber,
    classId: payload.classId,
    affiliation: payload.affiliation,
    acquisition: payload.acquisition,
    manufacturerId,
    platformId,
    build,
    carConfigPath: fleetCarConfigPath(id),
  };
}

export function migrateLegacyMeta(state: MetaStatePayload): MetaStatePayload {
  const withSponsors = { ...state, sponsors: state.sponsors ?? [] };

  if (withSponsors.fleet && withSponsors.fleet.length > 0) {
    const teamRoster = withSponsors.driverRoster ?? [];
    const fleet = withSponsors.fleet.map((car) => {
      if (car.assignedDriverIndices !== undefined) return car;
      return {
        ...car,
        assignedDriverIndices:
          teamRoster.length > 0
            ? allDriverIndices(teamRoster.length)
            : undefined,
      };
    });
    return {
      ...withSponsors,
      activeCarId: withSponsors.activeCarId ?? fleet[0].id,
      fleet,
    };
  }

  if (!withSponsors.carBuild && !withSponsors.setupComplete) {
    return { ...withSponsors, fleet: [], activeCarId: "" };
  }

  const classId = withSponsors.playerClassId ?? "Hypercar";
  const build = withSponsors.carBuild ?? {
    carName: `${withSponsors.teamName} ${classId}`,
    chassis_type: classId === "LMGT3" ? "GT3Spaceframe" : classId === "LMP2" ? "Oreca07" : "LMDhDallara",
    front_aero_type: "LowDragNose",
    rear_aero_type: classId === "LMGT3" ? "HighDownforceWing" : "StandardWing",
    cooling_pack: "EnduranceHeavyDuty",
    wheel_package: defaultWheelPackageForClass(classId),
    suspension_layout: defaultSuspensionForClass(classId),
    fuel_system: classId === "Hypercar" ? "LeMans110L" : "StandardTank",
    brake_system: classId === "Hypercar" ? "BremboHypercar" : "StandardCaliper",
    transmission: classId === "LMGT3" ? "XtracP529" : classId === "Hypercar" ? "XtracP1359" : "SixSpeedSequential",
    hybrid_system: classId === "Hypercar" ? "LMDh50kW" : "None",
  };

  const car: FleetCarPayload = {
    id: "car-1",
    carNumber: "1",
    classId,
    affiliation: "manufacturer",
    acquisition: "build",
    build,
    carConfigPath: fleetCarConfigPath("car-1"),
  };

  return {
    ...withSponsors,
    fleet: [car],
    activeCarId: "car-1",
    playerCarId: "car-1",
    playerEntryId: withSponsors.playerEntryId || "entry-1",
  };
}

export function activeFleetCar(state: MetaStatePayload): FleetCarPayload | null {
  if (!state.fleet?.length) return null;
  return (
    state.fleet.find((c) => c.id === state.activeCarId) ?? state.fleet[0]
  );
}

export function manufacturerHypercarCount(fleet: FleetCarPayload[]): number {
  return fleet.filter(
    (c) => c.classId === "Hypercar" && c.affiliation === "manufacturer",
  ).length;
}

export function validateFleetRegulations(
  fleet: FleetCarPayload[],
): string | null {
  if (fleet.length === 0) {
    return "Your team needs at least one car before racing";
  }

  const mfgHypercars = manufacturerHypercarCount(fleet);
  if (mfgHypercars > 0 && mfgHypercars < MANUFACTURER_HYPERCAR_MIN_CARS) {
    return `As a Hypercar manufacturer you must enter at least ${MANUFACTURER_HYPERCAR_MIN_CARS} Hypercars (you have ${mfgHypercars})`;
  }

  const byClass = new Map<string, FleetCarPayload[]>();
  for (const car of fleet) {
    const list = byClass.get(car.classId) ?? [];
    list.push(car);
    byClass.set(car.classId, list);
  }
  for (const [classId, cars] of byClass) {
    if (cars.length < 2) continue;
    const refKey = buildSpecKey(cars[0].build);
    for (const car of cars.slice(1)) {
      if (buildSpecKey(car.build) !== refKey) {
        return `Your ${classId} entries must share the same design — #${car.carNumber} does not match #${cars[0].carNumber}`;
      }
    }
  }

  const numbers = new Set<string>();
  for (const car of fleet) {
    if (numbers.has(car.carNumber)) {
      return `Duplicate car number #${car.carNumber}`;
    }
    numbers.add(car.carNumber);
  }

  return null;
}

export function validateBuyCar(
  repoRoot: string,
  state: MetaStatePayload,
  payload: BuyCarPayload,
): string | null {
  if (!payload.classId) return "Class is required";

  const catalogClasses = ["Hypercar", "LMP2", "LMGT3"];
  if (!catalogClasses.includes(payload.classId)) return "Unknown class";

  if (payload.affiliation === "privateer" && payload.acquisition !== "privateer") {
    return "Privateer entries must acquire an existing platform";
  }
  if (payload.affiliation === "manufacturer" && payload.acquisition === "privateer") {
    return "Manufacturers build their own cars, they cannot buy a privateer slot";
  }

  if (payload.acquisition === "privateer") {
    if (!payload.platformId) return "Select a platform to run as privateer";
    const platform = platformById(repoRoot, payload.platformId);
    if (!platform) return "Unknown platform";
    if (platform.classId !== payload.classId) {
      return `${platform.displayName} is not eligible for ${payload.classId}`;
    }
  }

  const fleet = state.fleet ?? [];
  const existing = getClassProgram(fleet, payload.classId, repoRoot);
  if (existing && !payloadMatchesClassProgram(existing, payload)) {
    return `You already have a ${existing.label} programme in ${payload.classId}. Sell those cars before switching platform or build type.`;
  }

  const cost = buyCarCost(repoRoot, payload);
  if (cost === null) return "Invalid car purchase";
  if (state.budget < cost) {
    return `Insufficient budget (need $${cost.toLocaleString()} for ${normalizeQuantity(payload.quantity)} car(s))`;
  }

  return null;
}

export function createFleetCars(
  repoRoot: string,
  teamName: string,
  payload: BuyCarPayload,
  fleet: FleetCarPayload[],
): FleetCarPayload[] {
  const qty = normalizeQuantity(payload.quantity);
  const cars: FleetCarPayload[] = [];
  let working = [...fleet];

  for (let i = 0; i < qty; i++) {
    const car = createFleetCar(repoRoot, teamName, payload, working);
    if (!car) break;
    cars.push(car);
    working = [...working, car];
  }

  return cars;
}

export function fleetRulesPayload() {
  return {
    startingBudget: STARTING_BUDGET,
    manufacturerHypercarMinCars: MANUFACTURER_HYPERCAR_MIN_CARS,
    oneCarTypePerClass: true,
    maxCarsPerPurchase: MAX_CARS_PER_PURCHASE,
    costs: {
      manufacturerBuild: {
        Hypercar: manufacturerBuildCost("Hypercar"),
        LMP2: manufacturerBuildCost("LMP2"),
        LMGT3: manufacturerBuildCost("LMGT3"),
      },
      privateerSlot: {
        Hypercar: privateerSlotCost("Hypercar"),
        LMP2: privateerSlotCost("LMP2"),
        LMGT3: privateerSlotCost("LMGT3"),
      },
    },
  };
}
