import type { TrackSetupPresetPayload } from "../ws/protocol";

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
