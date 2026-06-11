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
import {
  migrateDriverAssignments,
} from "./driver_catalog";
import { normalizeCarBuild } from "./chassis_setup";
import type { CarPlatform } from "./car_marketplace";
import { STARTING_BUDGET } from "./economy";
import { defaultFacilities } from "./facilities";
import {
  EXP_COPY_UNIT_MULTIPLIER,
  EXP_MANUFACTURER_UNIT_MULTIPLIER,
  EXP_PRIVATEER_PROGRAMME_FEE,
  EXP_PRIVATEER_UNIT_MULTIPLIER,
  experimentalRulesPayload,
  fleetEntryMode,
  isExperimentalCar,
  maxExperimentalCopies,
  minExperimentalCopies,
  newExperimentalProgramId,
} from "./experimental_entry";
import type { FleetEntryMode } from "../ws_protocol";

export const MAX_CARS_PER_PURCHASE = 6;

export interface ClassProgram {
  classId: string;
  entryMode: FleetEntryMode;
  affiliation: FleetCarPayload["affiliation"];
  acquisition: FleetCarPayload["acquisition"];
  platformId?: string;
  experimentalProgramId?: string;
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
  entryMode: FleetEntryMode = "homologated",
): ClassProgram | null {
  const inClass = fleet.filter(
    (c) => c.classId === classId && fleetEntryMode(c) === entryMode,
  );
  if (inClass.length === 0) return null;

  const ref = inClass[0];
  let platform: CarPlatform | null = null;
  if (ref.platformId && repoRoot) {
    platform = platformById(repoRoot, ref.platformId);
  }

  const baseLabel = classProgramLabel(ref, platform);
  const label =
    entryMode === "experimental" ? `${baseLabel} · EXP` : baseLabel;

  return {
    classId,
    entryMode,
    affiliation: ref.affiliation,
    acquisition: ref.acquisition,
    platformId: ref.platformId,
    experimentalProgramId: ref.experimentalProgramId,
    carCount: inClass.length,
    label,
  };
}

export function payloadMatchesClassProgram(
  program: ClassProgram,
  payload: BuyCarPayload,
): boolean {
  const mode = payload.entryMode ?? "homologated";
  if (program.entryMode !== mode) return false;
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
  return fleet.find(
    (c) => c.classId === classId && fleetEntryMode(c) === "homologated",
  );
}

export function referenceCarForProgramme(
  fleet: FleetCarPayload[],
  classId: string,
  entryMode: FleetEntryMode,
): FleetCarPayload | undefined {
  return fleet.find(
    (c) => c.classId === classId && fleetEntryMode(c) === entryMode,
  );
}

export function programmeGroupKey(car: FleetCarPayload): string {
  const mode = fleetEntryMode(car);
  if (mode === "experimental") {
    return `${car.classId}:experimental:${car.experimentalProgramId ?? car.id}`;
  }
  return `${car.classId}:homologated`;
}

export function sameFleetProgramme(
  a: FleetCarPayload,
  b: FleetCarPayload,
): boolean {
  return programmeGroupKey(a) === programmeGroupKey(b);
}

/** Force sibling entries in each programme to match the first car's build. */
export function alignProgrammeBuilds(fleet: FleetCarPayload[]): boolean {
  let changed = false;
  const groups = new Map<string, FleetCarPayload[]>();
  for (const car of fleet) {
    const key = programmeGroupKey(car);
    const list = groups.get(key) ?? [];
    list.push(car);
    groups.set(key, list);
  }

  for (const cars of groups.values()) {
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
    energy_converter: raw.energy_converter,
    buffer_size: raw.buffer_size ? parseFloat(raw.buffer_size) : undefined,
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
    diffuser_type: raw.diffuser_type ?? "StockFloor",
    exhaust_type: raw.exhaust_type ?? "TwinOutletSide",
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
  fleet: FleetCarPayload[] = [],
): number | null {
  const entryMode = payload.entryMode ?? "homologated";
  const inProgramme = getClassProgram(
    fleet,
    payload.classId,
    repoRoot,
    entryMode,
  );

  if (payload.acquisition === "privateer") {
    if (!payload.platformId) return null;
    const platform = platformById(repoRoot, payload.platformId);
    if (!platform || platform.classId !== payload.classId) return null;
    if (entryMode === "homologated") return platform.privateerCost;
    const base = Math.round(platform.privateerCost * EXP_PRIVATEER_UNIT_MULTIPLIER);
    if (!inProgramme) return base + EXP_PRIVATEER_PROGRAMME_FEE;
    return Math.round(base * EXP_COPY_UNIT_MULTIPLIER);
  }
  if (payload.affiliation !== "manufacturer") return null;
  const homologated = manufacturerBuildCost(payload.classId);
  if (entryMode === "homologated") return homologated;
  if (!inProgramme) {
    return Math.round(homologated * EXP_MANUFACTURER_UNIT_MULTIPLIER);
  }
  return Math.round(homologated * EXP_COPY_UNIT_MULTIPLIER);
}

export function buyCarCost(
  repoRoot: string,
  payload: BuyCarPayload,
  fleet: FleetCarPayload[] = [],
): number | null {
  const qty = normalizeQuantity(payload.quantity);
  const entryMode = payload.entryMode ?? "homologated";
  if (entryMode === "experimental" && payload.acquisition === "privateer") {
    const hasProgramme = !!getClassProgram(
      fleet,
      payload.classId,
      repoRoot,
      "experimental",
    );
    let total = 0;
    for (let i = 0; i < qty; i++) {
      const treatAsExisting = hasProgramme || i > 0;
      const unit = buyCarUnitCost(
        repoRoot,
        payload,
        treatAsExisting ? fleetWithExperimentalStub(fleet, payload.classId) : fleet,
      );
      if (unit === null) return null;
      total += unit;
    }
    return total;
  }
  const unit = buyCarUnitCost(repoRoot, payload, fleet);
  if (unit === null) return null;
  return unit * qty;
}

function fleetWithExperimentalStub(
  fleet: FleetCarPayload[],
  classId: string,
): FleetCarPayload[] {
  if (
    fleet.some(
      (c) => c.classId === classId && fleetEntryMode(c) === "experimental",
    )
  ) {
    return fleet;
  }
  const hom = fleet.find((c) => c.classId === classId);
  const build = hom?.build ?? {
    carName: "preview",
    chassis_type: "LMDhDallara",
    front_aero_type: "LowDragNose",
    rear_aero_type: "StandardWing",
    cooling_pack: "EnduranceHeavyDuty",
    wheel_package: "Hypercar18Standard",
    suspension_layout: "PushrodDoubleWishbone",
    fuel_system: "LeMans110L",
    brake_system: "BremboHypercar",
    transmission: "XtracP1359",
    hybrid_system: "LMDh50kW",
  };
  return [
    ...fleet,
    {
      id: "preview-exp",
      carNumber: "0",
      classId,
      affiliation: "manufacturer",
      acquisition: "build",
      entryMode: "experimental",
      experimentalProgramId: "preview",
      build,
      carConfigPath: "",
    },
  ];
}

export function createFleetCar(
  repoRoot: string,
  teamName: string,
  payload: BuyCarPayload,
  fleet: FleetCarPayload[],
): FleetCarPayload | null {
  if (buyCarUnitCost(repoRoot, payload, fleet) === null) return null;

  const entryMode = payload.entryMode ?? "homologated";
  const id = nextFleetCarId(fleet);
  const carNumber = payload.carNumber ?? nextCarNumber(fleet);

  let build: CarBuildPayload;
  let manufacturerId: string | undefined;
  let platformId: string | undefined;
  let experimentalProgramId: string | undefined;

  const existingProgramme = referenceCarForProgramme(
    fleet,
    payload.classId,
    entryMode,
  );
  if (entryMode === "experimental") {
    experimentalProgramId =
      existingProgramme?.experimentalProgramId ??
      newExperimentalProgramId(payload.classId);
  }

  if (payload.acquisition === "privateer" && payload.platformId) {
    const platform = platformById(repoRoot, payload.platformId);
    if (!platform) return null;
    const catalog = loadGameCatalog(repoRoot);
    if (existingProgramme?.build) {
      build = cloneCarBuild(existingProgramme.build);
      manufacturerId = existingProgramme.manufacturerId ?? platform.manufacturerId;
      platformId = existingProgramme.platformId ?? platform.id;
    } else {
      const raw = buildFromPlatform(repoRoot, platform, teamName);
      build = rawToBuild(
        raw,
        raw.carName ?? `${teamName} ${platform.displayName}`,
        catalog.partsBySlot,
      );
      manufacturerId = platform.manufacturerId;
      platformId = platform.id;
    }
  } else if (existingProgramme?.build) {
    build = cloneCarBuild(existingProgramme.build);
    manufacturerId =
      existingProgramme.manufacturerId ??
      teamName.toLowerCase().replace(/\s+/g, "_").slice(0, 24);
    platformId = existingProgramme.platformId;
  } else {
    const catalog = loadGameCatalog(repoRoot);
    const raw = defaultBuildForClass(repoRoot, payload.classId);
    if (!raw) return null;
    build = rawToBuild(
      raw,
      raw.carName ?? `${teamName} ${payload.classId}${entryMode === "experimental" ? " EXP" : ""}`,
      catalog.partsBySlot,
    );
    manufacturerId = teamName.toLowerCase().replace(/\s+/g, "_").slice(0, 24);
  }

  if (entryMode === "experimental") {
    build.carName = build.carName.includes("EXP")
      ? build.carName
      : `${build.carName} EXP`;
  }

  return {
    id,
    carNumber,
    classId: payload.classId,
    affiliation: payload.affiliation,
    acquisition: payload.acquisition,
    entryMode: entryMode === "homologated" ? undefined : entryMode,
    experimentalProgramId,
    manufacturerId,
    platformId,
    build,
    carConfigPath: fleetCarConfigPath(id),
  };
}

export function migrateLegacyMeta(state: MetaStatePayload): MetaStatePayload {
  const withSponsors = {
    ...state,
    sponsors: state.sponsors ?? [],
    facilities: state.facilities ?? defaultFacilities(),
    partInstances: state.partInstances ?? [],
    offWeekTrainingUsed: state.offWeekTrainingUsed ?? 0,
  };
  const roster = withSponsors.driverRoster ?? [];

  if (withSponsors.fleet && withSponsors.fleet.length > 0) {
    const { roster: migratedRoster, fleet } = migrateDriverAssignments(
      roster,
      withSponsors.fleet,
    );
    return {
      ...withSponsors,
      driverRoster: migratedRoster,
      activeCarId: withSponsors.activeCarId ?? fleet[0].id,
      fleet: fleet.map((c) => ({ ...c, entryMode: c.entryMode ?? undefined })),
    };
  }

  if (withSponsors.setupComplete !== true) {
    return {
      ...withSponsors,
      setupComplete: false,
      fleet: [],
      activeCarId: "",
      playerCarId: "",
      carBuild: null,
      carBuildGuidePending: false,
    };
  }

  const classId = withSponsors.playerClassId ?? "Hypercar";
  const build = withSponsors.carBuild ?? {
    carName: `${withSponsors.teamName} ${classId}`,
    chassis_type: classId === "LMGT3" ? "GT3Spaceframe" : classId === "LMP2" ? "Oreca07" : "LMDhDallara",
    front_aero_type: "LowDragNose",
    rear_aero_type: classId === "LMGT3" ? "HighDownforceWing" : "StandardWing",
    diffuser_type: "StockFloor",
    exhaust_type: "TwinOutletSide",
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
    (c) =>
      c.classId === "Hypercar" &&
      c.affiliation === "manufacturer" &&
      fleetEntryMode(c) === "homologated",
  ).length;
}

/** Hypercar mfg EXP allowed only after the mandatory homologated pair exists. */
export function hypercarManufacturerExpEligible(fleet: FleetCarPayload[]): boolean {
  return manufacturerHypercarCount(fleet) >= MANUFACTURER_HYPERCAR_MIN_CARS;
}

/** Established HC manufacturer adding a third mule on top of the homologated pair. */
export function hypercarMfgExpExceptionPath(
  fleet: FleetCarPayload[],
  affiliation: FleetCarPayload["affiliation"],
): boolean {
  return (
    affiliation === "manufacturer" && hypercarManufacturerExpEligible(fleet)
  );
}

function experimentalHypercarLimits(
  fleet: FleetCarPayload[],
  affiliation: FleetCarPayload["affiliation"],
): { min: number; max: number } {
  const exception = hypercarMfgExpExceptionPath(fleet, affiliation);
  return {
    min: minExperimentalCopies(affiliation, "Hypercar", {
      hypercarMfgException: exception,
    }),
    max: maxExperimentalCopies(affiliation, "Hypercar", {
      hypercarMfgException: exception,
    }),
  };
}

export function validateFleetRegulations(
  fleet: FleetCarPayload[],
): string | null {
  if (fleet.length === 0) {
    return "Your team needs at least one car before racing";
  }

  const mfgHypercars = manufacturerHypercarCount(fleet);
  const hasExpHypercarMfg = fleet.some(
    (c) =>
      c.classId === "Hypercar" &&
      c.affiliation === "manufacturer" &&
      isExperimentalCar(c),
  );
  if (
    mfgHypercars > 0 &&
    mfgHypercars < MANUFACTURER_HYPERCAR_MIN_CARS &&
    hasExpHypercarMfg
  ) {
    return `Complete your homologated Hypercar programme (${MANUFACTURER_HYPERCAR_MIN_CARS} cars) before adding experimental entries`;
  }
  if (mfgHypercars > 0 && mfgHypercars < MANUFACTURER_HYPERCAR_MIN_CARS) {
    return `As a Hypercar manufacturer you must enter at least ${MANUFACTURER_HYPERCAR_MIN_CARS} homologated Hypercars (you have ${mfgHypercars})`;
  }

  const groups = new Map<string, FleetCarPayload[]>();
  for (const car of fleet) {
    const key = programmeGroupKey(car);
    const list = groups.get(key) ?? [];
    list.push(car);
    groups.set(key, list);
  }

  for (const [key, cars] of groups) {
    if (cars.length < 2) continue;
    const refKey = buildSpecKey(cars[0].build);
    for (const car of cars.slice(1)) {
      if (buildSpecKey(car.build) !== refKey) {
        const label = key.includes(":experimental:")
          ? `${cars[0].classId} EXP`
          : cars[0].classId;
        return `Your ${label} entries must share the same design — #${car.carNumber} does not match #${cars[0].carNumber}`;
      }
    }
  }

  const byClass = new Map<string, FleetCarPayload[]>();
  for (const car of fleet) {
    const list = byClass.get(car.classId) ?? [];
    list.push(car);
    byClass.set(car.classId, list);
  }

  for (const [classId, cars] of byClass) {
    const homologated = cars.filter((c) => fleetEntryMode(c) === "homologated");
    const experimental = cars.filter(isExperimentalCar);
    const expProgramIds = new Set(
      experimental.map((c) => c.experimentalProgramId).filter(Boolean),
    );
    if (expProgramIds.size > 1) {
      return `Only one experimental design is allowed in ${classId}`;
    }
    if (experimental.length > 0) {
      const affiliation = experimental[0].affiliation;
      if (
        classId === "Hypercar" &&
        affiliation === "manufacturer" &&
        mfgHypercars > 0 &&
        mfgHypercars < MANUFACTURER_HYPERCAR_MIN_CARS
      ) {
        return `Complete your homologated Hypercar programme (${MANUFACTURER_HYPERCAR_MIN_CARS} cars) before adding experimental entries`;
      }

      const { min, max } =
        classId === "Hypercar"
          ? experimentalHypercarLimits(fleet, affiliation)
          : {
              min: 1,
              max: maxExperimentalCopies(affiliation, classId),
            };
      if (experimental.length < min) {
        return `Experimental ${classId} programmes require at least ${min} entries`;
      }
      if (experimental.length > max) {
        return `At most ${max} experimental ${classId} entries allowed`;
      }
      if (homologated.length > 0) {
        const homKey = buildSpecKey(homologated[0].build);
        const expKey = buildSpecKey(experimental[0].build);
        if (homKey === expKey) {
          return `Experimental ${classId} must use a different design than your homologated entries`;
        }
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
  const entryMode = payload.entryMode ?? "homologated";
  const homologated = getClassProgram(fleet, payload.classId, repoRoot, "homologated");
  const experimental = getClassProgram(fleet, payload.classId, repoRoot, "experimental");
  const existing = getClassProgram(fleet, payload.classId, repoRoot, entryMode);

  if (existing && !payloadMatchesClassProgram(existing, payload)) {
    return `You already have a ${existing.label} programme in ${payload.classId}. Sell those cars before switching platform or build type.`;
  }

  if (entryMode === "experimental") {
    const homMfgHypercars = manufacturerHypercarCount(fleet);
    if (
      payload.classId === "Hypercar" &&
      payload.affiliation === "manufacturer" &&
      homMfgHypercars > 0 &&
      homMfgHypercars < MANUFACTURER_HYPERCAR_MIN_CARS
    ) {
      return `Complete your homologated Hypercar programme (${MANUFACTURER_HYPERCAR_MIN_CARS} cars) before adding experimental entries`;
    }

    const limits =
      payload.classId === "Hypercar"
        ? experimentalHypercarLimits(fleet, payload.affiliation)
        : {
            min: 1,
            max: maxExperimentalCopies(payload.affiliation, payload.classId),
          };
    const nextCount =
      (experimental?.carCount ?? 0) + normalizeQuantity(payload.quantity);
    if (nextCount > limits.max) {
      return `At most ${limits.max} experimental ${payload.classId} entries allowed`;
    }
    if (!experimental && nextCount < limits.min) {
      return `Experimental ${payload.classId} programmes require at least ${limits.min} cars`;
    }
    if (
      payload.affiliation === "privateer" &&
      !experimental &&
      state.budget < EXP_PRIVATEER_PROGRAMME_FEE
    ) {
      return `Experimental privateer programmes require at least $${EXP_PRIVATEER_PROGRAMME_FEE.toLocaleString()} for the development slot`;
    }
  } else if (homologated && experimental) {
    // both programmes allowed in same class
  }

  const cost = buyCarCost(repoRoot, payload, fleet);
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
    experimental: experimentalRulesPayload(),
  };
}
