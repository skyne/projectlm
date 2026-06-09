import * as fs from "fs";
import * as path from "path";
import type {
  CarBuildPayload,
  EngineBuildPayload,
  FleetCarPayload,
  MetaStatePayload,
  TrackSetupPresetPayload,
} from "../ws_protocol";
import { mergeBuildWithTrackPreset, resolveCarTrackPreset } from "./weekend_setup";
import { defaultBuildForClass, loadGameCatalog, parseEngineFromTemplate, defaultWheelPackageForClass, defaultSuspensionForClass } from "./catalog";
import { LEGAL_KEY_BY_SLOT } from "./class_rules";
import { validateEngineBuild } from "./engine_model";
import { loadCarPlatforms } from "./car_marketplace";
import { activeFleetCar } from "./fleet";
import {
  loadAssemblyRules,
  validateAssemblyCompatibility,
} from "./part_compatibility";
import { sanitizeCarConfigFile } from "./class_legality";
import {
  resolveWheelSetup,
  resolveSuspensionSetup,
  clampSuspensionSetup,
  validateSuspensionSetup,
  validateWheelSetup,
} from "./chassis_setup";

const PLAYER_CAR_REL = "configs/runtime/player_car.txt";

function parseTemplateSuspension(repoRoot: string, templatePath: string): string[] {
  const abs = path.join(repoRoot, templatePath);
  if (!fs.existsSync(abs)) return [];
  const suspensionKeys = new Set([
    "front_spring_stiffness",
    "rear_spring_stiffness",
    "ride_height",
    "front_ride_height_m",
    "rear_ride_height_m",
    "front_arb_stiffness",
    "rear_arb_stiffness",
    "front_damper_bump",
    "front_damper_rebound",
    "rear_damper_bump",
    "rear_damper_rebound",
  ]);
  const lines: string[] = [];
  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const key = trimmed.split("=")[0]?.trim();
    if (key && suspensionKeys.has(key)) lines.push(trimmed);
  }
  return lines;
}

function engineToConfigLines(engine: EngineBuildPayload): string[] {
  const lines = [
    `engine_layout=${engine.engine_layout}`,
    `fuel_type=${engine.fuel_type}`,
    `cylinders=${engine.cylinders}`,
    `bore=${engine.bore}`,
    `stroke=${engine.stroke}`,
    `max_rpm=${engine.max_rpm}`,
    `peak_torque_nm=${engine.peak_torque_nm}`,
    `peak_torque_rpm=${engine.peak_torque_rpm}`,
    `base_vibration=${engine.base_vibration}`,
  ];
  if (engine.aspiration) lines.push(`aspiration=${engine.aspiration}`);
  if (engine.drivetrain) lines.push(`drivetrain=${engine.drivetrain}`);
  if (engine.energy_converter) lines.push(`energy_converter=${engine.energy_converter}`);
  if (engine.buffer_size != null) lines.push(`buffer_size=${engine.buffer_size}`);
  if (engine.generator_kw) lines.push(`generator_kw=${engine.generator_kw}`);
  if (engine.power_target != null && engine.power_target > 0) {
    lines.push(`power_target=${engine.power_target}`);
  }
  return lines;
}

function resolveEngine(
  repoRoot: string,
  classId: string,
  build: CarBuildPayload,
  platformTemplatePath?: string,
): EngineBuildPayload | null {
  if (build.engine) return build.engine;
  const templatePath =
    platformTemplatePath || loadClassTemplatePath(repoRoot, classId);
  return parseEngineFromTemplate(repoRoot, templatePath);
}

function loadClassTemplatePath(repoRoot: string, classId: string): string {
  const catalog = loadGameCatalog(repoRoot);
  return catalog.classes.find((c) => c.id === classId)?.templateCarPath ?? "";
}

export function validateCarBuild(
  repoRoot: string,
  classId: string,
  build: CarBuildPayload,
  unlockedParts: string[],
): string | null {
  const catalog = loadGameCatalog(repoRoot);
  const classInfo = catalog.classes.find((c) => c.id === classId);
  if (!classInfo) return "Unknown class";

  const legal: Record<string, Set<string>> = {};
  for (const [slot, parts] of Object.entries(classInfo.legalParts)) {
    const key = LEGAL_KEY_BY_SLOT[slot as keyof typeof LEGAL_KEY_BY_SLOT];
    if (key && parts?.length) legal[key] = new Set(parts);
  }

  const checks: Array<[string, string, string]> = [
    ["legal_chassis", build.chassis_type, "chassis"],
    ["legal_front_aero", build.front_aero_type, "front_aero"],
    ["legal_rear_aero", build.rear_aero_type, "rear_aero"],
    ["legal_diffuser", build.diffuser_type ?? "StockFloor", "diffuser"],
    ["legal_exhaust", build.exhaust_type ?? "TwinOutletSide", "exhaust"],
    [
      "legal_cooling",
      build.cooling_pack === "Custom" || build.cooling ? "Custom" : build.cooling_pack,
      "cooling",
    ],
    ["legal_wheel_package", build.wheel_package, "wheel_package"],
    ["legal_suspension", build.front_suspension_layout ?? build.suspension_layout, "suspension"],
    ["legal_suspension", build.rear_suspension_layout ?? build.suspension_layout, "suspension"],
    ["legal_fuel_system", build.fuel_system, "fuel_system"],
    ["legal_brakes", build.brake_system, "brake"],
    ["legal_transmission", build.transmission, "transmission"],
    ["legal_hybrid", build.hybrid_system, "hybrid"],
  ];

  for (const [ruleKey, partType, prefix] of checks) {
    const allowed = legal[ruleKey];
    if (allowed && !allowed.has(partType)) {
      return `${partType} is not legal in ${classId}`;
    }
    const fullId = `${prefix}.${partType}`;
    const rdLocked =
      (prefix === "brake" &&
        partType === "CarbonCeramic" &&
        !unlockedParts.includes("brake.CarbonCeramic"));
    if (rdLocked) return `${partType} requires R&D unlock`;
  }

  const assemblyErr = validateAssemblyCompatibility(
    build,
    loadAssemblyRules(repoRoot),
  );
  if (assemblyErr) return assemblyErr;

  const wheelErr = validateWheelSetup(
    resolveWheelSetup(build, classId),
    classId,
  );
  if (wheelErr) return wheelErr;

  const legalSusp = legal["legal_suspension"];
  const suspErr = validateSuspensionSetup(
    build,
    legalSusp ? legalSusp : undefined,
    classId,
    catalog.partsBySlot.suspension,
  );
  if (suspErr) return suspErr;

  const engine = resolveEngine(repoRoot, classId, build);
  if (!engine) return "Engine configuration is required";
  const engineErr = validateEngineBuild(engine);
  if (engineErr) return engineErr;

  return null;
}

function defaultWheelPackage(classId: string): string {
  return defaultWheelPackageForClass(classId);
}

function defaultSuspensionLayout(classId: string): string {
  return defaultSuspensionForClass(classId);
}

function writeCarConfigFile(
  repoRoot: string,
  relPath: string,
  teamName: string,
  classId: string,
  build: CarBuildPayload,
  platformTemplatePath?: string,
  startingTireCompound = "Medium",
): string {
  const engine = resolveEngine(repoRoot, classId, build, platformTemplatePath);
  if (!engine) throw new Error("Engine configuration is required");

  const catalog = loadGameCatalog(repoRoot);
  const suspension = clampSuspensionSetup(
    resolveSuspensionSetup(build, catalog.partsBySlot.suspension, classId),
    build,
    catalog.partsBySlot.suspension,
    classId,
  );
  const avgRideHeightM =
    (suspension.frontRideHeightMm + suspension.rearRideHeightMm) / 2 / 1000;

  const abs = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const lines = [
    `# ${teamName} — ${classId}`,
    `car_name=${build.carName}`,
    ...engineToConfigLines(engine),
    `chassis_type=${build.chassis_type}`,
    `front_aero_type=${build.front_aero_type}`,
    `rear_aero_type=${build.rear_aero_type}`,
    `diffuser_type=${build.diffuser_type ?? "StockFloor"}`,
    `exhaust_type=${build.exhaust_type ?? "TwinOutletSide"}`,
    `cooling_pack=${build.cooling_pack}`,
    ...(build.cooling
      ? [
          `engine_radiator_size=${build.cooling.engine_radiator ?? 0.65}`,
          `oil_cooler_size=${build.cooling.oil_cooler ?? 0.55}`,
          `charge_air_cooler_size=${build.cooling.charge_air_cooler ?? 0.5}`,
          `gearbox_cooler_size=${build.cooling.gearbox_cooler ?? 0.4}`,
        ]
      : []),
    ...(build.duct_airflow != null ? [`duct_airflow=${build.duct_airflow}`] : []),
    `wheel_package=${build.wheel_package}`,
    `suspension_layout=${build.front_suspension_layout ?? build.suspension_layout}`,
    ...(build.front_suspension_layout
      ? [`front_suspension_layout=${build.front_suspension_layout}`]
      : []),
    ...(build.rear_suspension_layout
      ? [`rear_suspension_layout=${build.rear_suspension_layout}`]
      : []),
    ...(build.front_wheel_diameter_in != null
      ? [`front_wheel_diameter_in=${build.front_wheel_diameter_in}`]
      : []),
    ...(build.rear_wheel_diameter_in != null
      ? [`rear_wheel_diameter_in=${build.rear_wheel_diameter_in}`]
      : []),
    ...(build.front_tire_width_mm != null
      ? [`front_tire_width_mm=${build.front_tire_width_mm}`]
      : []),
    ...(build.rear_tire_width_mm != null
      ? [`rear_tire_width_mm=${build.rear_tire_width_mm}`]
      : []),
    `front_ride_height_m=${(suspension.frontRideHeightMm / 1000).toFixed(4)}`,
    `rear_ride_height_m=${(suspension.rearRideHeightMm / 1000).toFixed(4)}`,
    `ride_height=${avgRideHeightM.toFixed(4)}`,
    `front_spring_stiffness=${suspension.frontSpringNm}`,
    `rear_spring_stiffness=${suspension.rearSpringNm}`,
    `front_arb_stiffness=${suspension.frontArbStiffness.toFixed(2)}`,
    `rear_arb_stiffness=${suspension.rearArbStiffness.toFixed(2)}`,
    `front_damper_bump=${suspension.frontDamperBump}`,
    `front_damper_rebound=${suspension.frontDamperRebound}`,
    `rear_damper_bump=${suspension.rearDamperBump}`,
    `rear_damper_rebound=${suspension.rearDamperRebound}`,
    ...(build.front_camber_deg != null
      ? [`front_camber_deg=${build.front_camber_deg.toFixed(2)}`]
      : []),
    ...(build.rear_camber_deg != null
      ? [`rear_camber_deg=${build.rear_camber_deg.toFixed(2)}`]
      : []),
    ...(build.front_toe_deg != null
      ? [`front_toe_deg=${build.front_toe_deg.toFixed(3)}`]
      : []),
    ...(build.rear_toe_deg != null
      ? [`rear_toe_deg=${build.rear_toe_deg.toFixed(3)}`]
      : []),
    ...(build.final_drive_ratio != null
      ? [`final_drive_ratio=${build.final_drive_ratio.toFixed(3)}`]
      : []),
    ...(build.starting_wing_delta != null
      ? [`starting_wing_delta=${build.starting_wing_delta.toFixed(3)}`]
      : []),
    ...(build.starting_brake_bias != null
      ? [`starting_brake_bias=${build.starting_brake_bias.toFixed(3)}`]
      : []),
    `starting_tire_compound=${startingTireCompound}`,
    `fuel_system=${build.fuel_system}`,
    `brake_system=${build.brake_system}`,
    `transmission=${build.transmission}`,
    `hybrid_system=${build.hybrid_system}`,
  ];

  fs.writeFileSync(abs, lines.join("\n") + "\n");
  sanitizeCarConfigFile(repoRoot, relPath, classId);
  return relPath;
}

export function writeFleetCarConfig(
  repoRoot: string,
  teamName: string,
  car: FleetCarPayload,
  platformTemplatePath?: string,
  startingTireCompound = "Medium",
): string {
  return writeCarConfigFile(
    repoRoot,
    car.carConfigPath,
    teamName,
    car.classId,
    car.build,
    platformTemplatePath,
    startingTireCompound,
  );
}

export function writeAllFleetConfigs(
  repoRoot: string,
  meta: MetaStatePayload,
  platforms?: Map<string, string>,
  trackId?: string,
): void {
  const compound = meta.weekendTireCompound ?? "Medium";
  for (const car of meta.fleet ?? []) {
    const platformPath = car.platformId
      ? platforms?.get(car.platformId)
      : undefined;
    const trackPreset = trackId
      ? resolveCarTrackPreset(car, trackId, meta)
      : null;
    const build = mergeBuildWithTrackPreset(car.build, trackPreset);
    writeFleetCarConfig(
      repoRoot,
      meta.teamName,
      { ...car, build },
      platformPath,
      compound,
    );
  }
}

export function writePlayerCarConfig(
  repoRoot: string,
  meta: MetaStatePayload,
): string {
  const active = activeFleetCar(meta);
  if (active) {
    const platformPath = active.platformId
      ? (loadCarPlatforms(repoRoot).find((p) => p.id === active.platformId)
          ?.templatePath ?? undefined)
      : undefined;
    writeFleetCarConfig(
      repoRoot,
      meta.teamName,
      active,
      platformPath,
      meta.weekendTireCompound ?? "Medium",
    );
    return active.carConfigPath;
  }

  const classId = meta.playerClassId ?? "Hypercar";
  const build =
    meta.carBuild ??
    (defaultBuildForClass(repoRoot, classId) as CarBuildPayload | null);
  if (!build) throw new Error("No car build available");

  return writeCarConfigFile(
    repoRoot,
    PLAYER_CAR_REL,
    meta.teamName,
    classId,
    build,
    undefined,
    meta.weekendTireCompound ?? "Medium",
  );
}

export function playerCarPath(): string {
  return PLAYER_CAR_REL;
}
