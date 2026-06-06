import * as fs from "fs";
import * as path from "path";
import { defaultBuildForClass } from "./catalog";

export interface CarPlatform {
  id: string;
  displayName: string;
  manufacturerId: string;
  manufacturerName: string;
  classId: string;
  templatePath: string;
  privateerCost: number;
  description: string;
}

const CLASS_BY_CHASSIS: Record<string, string> = {
  LMHMonocoque: "Hypercar",
  LMHInHouse: "Hypercar",
  LMHDallaraBuilt: "Hypercar",
  LMHMultimaticBuilt: "Hypercar",
  LMDhDallara: "Hypercar",
  LMDhOreca: "Hypercar",
  LMDhMultimatic: "Hypercar",
  LMDhLigier: "Hypercar",
  Oreca07: "LMP2",
  GT3Spaceframe: "LMGT3",
  GT3Oreca: "LMGT3",
  GT3PrattMiller: "LMGT3",
  GT3McLaren: "LMGT3",
  GT3Multimatic: "LMGT3",
};

const PRIVATEER_COST: Record<string, number> = {
  Hypercar: 1_500_000,
  LMP2: 350_000,
  LMGT3: 400_000,
};

const MANUFACTURER_BUILD_COST: Record<string, number> = {
  Hypercar: 3_000_000,
  LMP2: 600_000,
  LMGT3: 800_000,
};

const MANUFACTURER_NAMES: Record<string, string> = {
  ferrari: "Ferrari",
  toyota: "Toyota",
  peugeot: "Peugeot",
  cadillac: "Cadillac",
  bmw: "BMW",
  genesis: "Genesis",
  alpine: "Alpine",
  aston_martin: "Aston Martin",
  porsche: "Porsche",
  lamborghini: "Lamborghini",
  acura: "Acura",
  mercedes: "Mercedes-AMG",
  mclaren: "McLaren",
  lexus: "Lexus",
  ford: "Ford",
  corvette: "Corvette",
  oreca: "Oreca",
};

function humanizeManufacturer(id: string): string {
  return (
    MANUFACTURER_NAMES[id] ??
    id
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function inferClassFromConfig(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "chassis_type" && CLASS_BY_CHASSIS[val]) {
      return CLASS_BY_CHASSIS[val];
    }
  }
  return "Hypercar";
}

function manufacturerIdFromFilename(filename: string): string {
  const base = filename.replace(/\.txt$/, "");
  const parts = base.split("_");
  if (parts.length >= 2 && parts[1] === "martin") {
    return "aston_martin";
  }
  return parts[0] ?? base;
}

export function loadCarPlatforms(repoRoot: string): CarPlatform[] {
  const dir = path.join(repoRoot, "configs/cars/lemans2026");
  if (!fs.existsSync(dir)) return [];

  const platforms: CarPlatform[] = [];
  for (const filename of fs.readdirSync(dir).sort()) {
    if (!filename.endsWith(".txt")) continue;
    const relPath = `configs/cars/lemans2026/${filename}`;
    const abs = path.join(repoRoot, relPath);
    const lines = fs.readFileSync(abs, "utf8").split("\n");

    let displayName = filename.replace(/\.txt$/, "");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("car_name=")) {
        displayName = trimmed.slice("car_name=".length).trim();
        break;
      }
    }

    const manufacturerId = manufacturerIdFromFilename(filename);
    const classId = inferClassFromConfig(lines);
    const id = filename.replace(/\.txt$/, "");

    platforms.push({
      id,
      displayName,
      manufacturerId,
      manufacturerName: humanizeManufacturer(manufacturerId),
      classId,
      templatePath: relPath,
      privateerCost: PRIVATEER_COST[classId] ?? 500_000,
      description: `${humanizeManufacturer(manufacturerId)} ${classId} platform — privateer entry`,
    });
  }
  return platforms;
}

export function platformById(
  repoRoot: string,
  platformId: string,
): CarPlatform | null {
  return loadCarPlatforms(repoRoot).find((p) => p.id === platformId) ?? null;
}

export function buildFromPlatform(
  repoRoot: string,
  platform: CarPlatform,
  teamName: string,
): Record<string, string> {
  const abs = path.join(repoRoot, platform.templatePath);
  if (!fs.existsSync(abs)) {
    return defaultBuildForClass(repoRoot, platform.classId) ?? { carName: platform.displayName };
  }

  const build: Record<string, string> = { carName: platform.displayName };
  const fields = new Set([
    "car_name",
    "chassis_type",
    "front_aero_type",
    "rear_aero_type",
    "cooling_pack",
    "wheel_package",
    "suspension_layout",
    "fuel_system",
    "brake_system",
    "transmission",
    "hybrid_system",
    "engine_layout",
    "fuel_type",
    "cylinders",
    "bore",
    "stroke",
    "max_rpm",
    "peak_torque_nm",
    "peak_torque_rpm",
    "base_vibration",
  ]);

  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "car_name") build.carName = `${teamName} ${val}`;
    else if (fields.has(key)) build[key] = val;
  }
  return build;
}

export function manufacturerBuildCost(classId: string): number {
  return MANUFACTURER_BUILD_COST[classId] ?? 1_000_000;
}

export function privateerSlotCost(classId: string): number {
  return PRIVATEER_COST[classId] ?? 500_000;
}

export const MANUFACTURER_HYPERCAR_MIN_CARS = 2;
