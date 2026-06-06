import type {
  CarBuildPayload,
  FleetCarPayload,
  MetaStatePayload,
  TrackSetupPresetPayload,
} from "../ws/protocol";
import {
  resolveSuspensionSetup,
  type SuspensionSetup,
} from "./chassisSetup";

/** Client mirror of server track defaults (keep in sync with weekend_setup.ts). */
const TRACK_DEFAULTS: Record<string, Partial<TrackSetupPresetPayload>> = {
  lemans_la_sarthe: {
    wingBaseline: -0.05,
    ductAirflow: 0.92,
    rearRideHeightMm: 42,
    frontRideHeightMm: 38,
    notes: "Low drag — Mulsanne; slightly raked rear",
  },
  spa: {
    wingBaseline: 0.05,
    frontArbStiffness: 1.05,
    rearArbStiffness: 0.95,
    notes: "High DF — Eau Rouge / Pouhon",
  },
  monza: {
    wingBaseline: -0.08,
    ductAirflow: 0.88,
    notes: "Minimum drag profile",
  },
  fuji: {
    wingBaseline: 0.03,
    frontDamperBump: 9,
    notes: "Medium-high speed corners — stable platform",
  },
  bahrain: {
    rearRideHeightMm: 40,
    frontSpringNm: 130000,
    rearSpringNm: 155000,
    notes: "Tyre thermal management — rear-biased spring",
  },
};

const TRACK_NAMES: Record<string, string> = {
  lemans_la_sarthe: "Le Mans",
  spa: "Spa-Francorchamps",
  monza: "Monza",
  fuji: "Fuji",
  bahrain: "Bahrain",
};

export function defaultTrackPreset(trackId: string): TrackSetupPresetPayload {
  return {
    trackId,
    label: TRACK_NAMES[trackId] ?? trackId,
    ...(TRACK_DEFAULTS[trackId] ?? {}),
  };
}

export function resolveTrackPreset(
  trackId: string,
  saved?: TrackSetupPresetPayload | null,
): TrackSetupPresetPayload {
  if (saved && saved.trackId === trackId) {
    return { ...defaultTrackPreset(trackId), ...saved, trackId };
  }
  return defaultTrackPreset(trackId);
}

export function resolveCarTrackPreset(
  car: FleetCarPayload,
  trackId: string,
  meta: MetaStatePayload,
): TrackSetupPresetPayload {
  const saved =
    car.trackSetupPresets?.[trackId] ?? meta.trackSetupPresets?.[trackId] ?? null;
  return resolveTrackPreset(trackId, saved);
}

/** Client mirror of server mergeBuildWithTrackPreset. */
export function mergeBuildWithTrackPreset(
  build: CarBuildPayload,
  preset?: TrackSetupPresetPayload | null,
): CarBuildPayload {
  if (!preset) return build;
  return {
    ...build,
    ...(preset.ductAirflow != null ? { duct_airflow: preset.ductAirflow } : {}),
    ...(preset.frontRideHeightMm != null
      ? { front_ride_height_mm: preset.frontRideHeightMm }
      : {}),
    ...(preset.rearRideHeightMm != null
      ? { rear_ride_height_mm: preset.rearRideHeightMm }
      : {}),
    ...(preset.frontSpringNm != null
      ? { front_spring_nm: preset.frontSpringNm }
      : {}),
    ...(preset.rearSpringNm != null
      ? { rear_spring_nm: preset.rearSpringNm }
      : {}),
    ...(preset.frontArbStiffness != null
      ? { front_arb_stiffness: preset.frontArbStiffness }
      : {}),
    ...(preset.rearArbStiffness != null
      ? { rear_arb_stiffness: preset.rearArbStiffness }
      : {}),
    ...(preset.frontDamperBump != null
      ? { front_damper_bump: preset.frontDamperBump }
      : {}),
    ...(preset.frontDamperRebound != null
      ? { front_damper_rebound: preset.frontDamperRebound }
      : {}),
    ...(preset.rearDamperBump != null
      ? { rear_damper_bump: preset.rearDamperBump }
      : {}),
    ...(preset.rearDamperRebound != null
      ? { rear_damper_rebound: preset.rearDamperRebound }
      : {}),
    ...(preset.frontCamberDeg != null
      ? { front_camber_deg: preset.frontCamberDeg }
      : {}),
    ...(preset.rearCamberDeg != null
      ? { rear_camber_deg: preset.rearCamberDeg }
      : {}),
    ...(preset.frontToeDeg != null ? { front_toe_deg: preset.frontToeDeg } : {}),
    ...(preset.rearToeDeg != null ? { rear_toe_deg: preset.rearToeDeg } : {}),
    ...(preset.finalDriveRatio != null
      ? { final_drive_ratio: preset.finalDriveRatio }
      : {}),
    ...(preset.wingBaseline != null
      ? { starting_wing_delta: preset.wingBaseline }
      : {}),
    ...(preset.brakeBiasBaseline != null
      ? { starting_brake_bias: preset.brakeBiasBaseline }
      : {}),
  };
}

export type SessionSetupFieldKey = keyof Omit<
  TrackSetupPresetPayload,
  "trackId" | "label" | "notes"
>;

export interface SessionSetupFieldDef {
  key: SessionSetupFieldKey;
  label: string;
  section: "aero" | "chassis" | "alignment";
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

export const SESSION_SETUP_FIELDS: SessionSetupFieldDef[] = [
  {
    key: "wingBaseline",
    label: "Wing angle",
    section: "aero",
    min: -0.12,
    max: 0.12,
    step: 0.01,
    format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`,
  },
  {
    key: "brakeBiasBaseline",
    label: "Brake bias",
    section: "aero",
    min: 0.4,
    max: 0.6,
    step: 0.01,
    format: (v) => `${(v * 100).toFixed(0)}% front`,
  },
  {
    key: "ductAirflow",
    label: "Cooling airflow",
    section: "aero",
    min: 0.5,
    max: 1,
    step: 0.01,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "frontRideHeightMm",
    label: "Front ride height",
    section: "chassis",
    min: 28,
    max: 70,
    step: 1,
    format: (v) => `${Math.round(v)} mm`,
  },
  {
    key: "rearRideHeightMm",
    label: "Rear ride height",
    section: "chassis",
    min: 28,
    max: 70,
    step: 1,
    format: (v) => `${Math.round(v)} mm`,
  },
  {
    key: "frontSpringNm",
    label: "Front spring",
    section: "chassis",
    min: 80000,
    max: 220000,
    step: 1000,
    format: (v) => `${Math.round(v / 1000)}k N/m`,
  },
  {
    key: "rearSpringNm",
    label: "Rear spring",
    section: "chassis",
    min: 80000,
    max: 220000,
    step: 1000,
    format: (v) => `${Math.round(v / 1000)}k N/m`,
  },
  {
    key: "frontArbStiffness",
    label: "Front ARB",
    section: "chassis",
    min: 0.7,
    max: 1.3,
    step: 0.05,
    format: (v) => `×${v.toFixed(2)}`,
  },
  {
    key: "rearArbStiffness",
    label: "Rear ARB",
    section: "chassis",
    min: 0.7,
    max: 1.3,
    step: 0.05,
    format: (v) => `×${v.toFixed(2)}`,
  },
  {
    key: "frontCamberDeg",
    label: "Front camber",
    section: "alignment",
    min: -4,
    max: 0,
    step: 0.1,
    format: (v) => `${v.toFixed(1)}°`,
  },
  {
    key: "rearCamberDeg",
    label: "Rear camber",
    section: "alignment",
    min: -4,
    max: 0,
    step: 0.1,
    format: (v) => `${v.toFixed(1)}°`,
  },
  {
    key: "finalDriveRatio",
    label: "Final drive",
    section: "alignment",
    min: 3,
    max: 4.2,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
];

function suspensionToPresetFields(
  setup: SuspensionSetup,
): Partial<TrackSetupPresetPayload> {
  return {
    frontRideHeightMm: setup.frontRideHeightMm,
    rearRideHeightMm: setup.rearRideHeightMm,
    frontSpringNm: setup.frontSpringNm,
    rearSpringNm: setup.rearSpringNm,
    frontArbStiffness: setup.frontArbStiffness,
    rearArbStiffness: setup.rearArbStiffness,
    frontDamperBump: setup.frontDamperBump,
    frontDamperRebound: setup.frontDamperRebound,
    rearDamperBump: setup.rearDamperBump,
    rearDamperRebound: setup.rearDamperRebound,
  };
}

/** Effective slider values for a car at session start (garage build + saved/track preset). */
export function resolveSessionSetupValues(
  build: CarBuildPayload,
  trackId: string,
  savedPreset: TrackSetupPresetPayload | null | undefined,
  suspensionParts?: import("../ws/protocol").PartOptionPayload[],
  classId?: string,
): TrackSetupPresetPayload {
  const merged = mergeBuildWithTrackPreset(build, savedPreset);
  const suspension = resolveSuspensionSetup(merged, suspensionParts, classId);

  return {
    trackId,
    label: savedPreset?.label,
    notes: savedPreset?.notes ?? defaultTrackPreset(trackId).notes,
    wingBaseline: merged.starting_wing_delta ?? 0,
    brakeBiasBaseline: merged.starting_brake_bias ?? 0.52,
    ductAirflow: merged.duct_airflow ?? 1,
    ...suspensionToPresetFields(suspension),
    frontCamberDeg: merged.front_camber_deg ?? -2.5,
    rearCamberDeg: merged.rear_camber_deg ?? -1.8,
    frontToeDeg: merged.front_toe_deg ?? 0,
    rearToeDeg: merged.rear_toe_deg ?? 0.1,
    finalDriveRatio: merged.final_drive_ratio ?? 3.5,
  };
}

export function presetFromSessionValues(
  trackId: string,
  values: TrackSetupPresetPayload,
): TrackSetupPresetPayload {
  const out: TrackSetupPresetPayload = { trackId, notes: values.notes };
  for (const def of SESSION_SETUP_FIELDS) {
    const v = values[def.key];
    if (typeof v === "number" && Number.isFinite(v)) {
      (out as unknown as Record<string, unknown>)[def.key] = v;
    }
  }
  return out;
}

export function trackDefaultSessionValues(
  build: CarBuildPayload,
  trackId: string,
  suspensionParts?: import("../ws/protocol").PartOptionPayload[],
  classId?: string,
): TrackSetupPresetPayload {
  return resolveSessionSetupValues(
    build,
    trackId,
    defaultTrackPreset(trackId),
    suspensionParts,
    classId,
  );
}

/** Tyre compound grip from configs/part_catalog.txt */
export function tireGripForCompound(compound: string): number {
  switch (compound) {
    case "Soft":
      return 1.16;
    case "Hard":
      return 1.0;
    default:
      return 1.08;
  }
}
