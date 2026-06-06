/**
 * Per-track climate model — biome + monthly curves resolved into sim WeatherProfile.
 * Research-informed weights (not historical replay); tuned for WEC calendar months.
 */
import type { WeatherProfile } from "../weather_model";
import { trackDisplayName } from "./track_catalog";

export type BiomeId =
  | "mediterranean"
  | "maritime_temperate"
  | "humid_subtropical"
  | "continental"
  | "arid";

export interface TrackClimate {
  trackId: string;
  biome: BiomeId;
  /** Jan–Dec wetness tendency 0–1 */
  monthlyRainWeight: readonly number[];
  /** Typical ambient °C by month */
  monthlyBaseTempC: readonly number[];
  /** Spa-style unpredictability 0–1 */
  volatility: number;
  baseWetnessBias: number;
  dryRateFactor: number;
  wetRateFactor: number;
}

export interface ResolvedTrackWeather {
  trackId: string;
  month: number;
  biome: BiomeId;
  label: string;
  rainWeight: number;
  profile: WeatherProfile;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function clampMonth(month: number): number {
  if (!Number.isFinite(month)) return 6;
  return Math.min(12, Math.max(1, Math.round(month)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared monthly temp curve templates (°C) — northern hemisphere unless noted. */
const TEMP_MEDITERRANEAN = [11, 12, 15, 18, 23, 28, 31, 30, 26, 20, 15, 12];
const TEMP_MARITIME = [6, 7, 10, 13, 16, 19, 21, 21, 18, 14, 9, 6];
const TEMP_HUMID_SUBTROP = [12, 13, 16, 19, 23, 26, 28, 29, 27, 22, 17, 13];
const TEMP_ARID = [18, 20, 24, 29, 34, 38, 40, 39, 35, 29, 23, 19];
/** São Paulo — southern hemisphere: peak warmth Jan–Feb, cool dry Jul. */
const TEMP_SAO_PAULO = [26, 26, 25, 22, 19, 17, 16, 18, 20, 22, 24, 25];

export const TRACK_CLIMATE: Record<string, TrackClimate> = {
  paul_ricard: {
    trackId: "paul_ricard",
    biome: "mediterranean",
    monthlyRainWeight: [0.35, 0.3, 0.28, 0.32, 0.25, 0.15, 0.08, 0.1, 0.2, 0.35, 0.4, 0.38],
    monthlyBaseTempC: TEMP_MEDITERRANEAN,
    volatility: 0.35,
    baseWetnessBias: 0.03,
    dryRateFactor: 1.0,
    wetRateFactor: 1.0,
  },
  imola: {
    trackId: "imola",
    biome: "mediterranean",
    monthlyRainWeight: [0.3, 0.32, 0.38, 0.42, 0.4, 0.28, 0.18, 0.2, 0.35, 0.45, 0.48, 0.35],
    monthlyBaseTempC: [8, 10, 14, 18, 23, 27, 30, 29, 25, 19, 13, 9],
    volatility: 0.42,
    baseWetnessBias: 0.04,
    dryRateFactor: 1.0,
    wetRateFactor: 1.05,
  },
  spa: {
    trackId: "spa",
    biome: "maritime_temperate",
    monthlyRainWeight: [0.55, 0.5, 0.52, 0.58, 0.72, 0.65, 0.55, 0.52, 0.58, 0.62, 0.65, 0.58],
    monthlyBaseTempC: TEMP_MARITIME,
    volatility: 0.88,
    baseWetnessBias: 0.06,
    dryRateFactor: 0.85,
    wetRateFactor: 1.15,
  },
  lemans_la_sarthe: {
    trackId: "lemans_la_sarthe",
    biome: "maritime_temperate",
    monthlyRainWeight: [0.45, 0.4, 0.42, 0.45, 0.5, 0.58, 0.48, 0.45, 0.5, 0.52, 0.48, 0.45],
    monthlyBaseTempC: TEMP_MARITIME,
    volatility: 0.55,
    baseWetnessBias: 0.05,
    dryRateFactor: 0.9,
    wetRateFactor: 1.1,
  },
  sao_paulo: {
    trackId: "sao_paulo",
    biome: "humid_subtropical",
    /** Jul = index 6 is drier (winter dry season). */
    monthlyRainWeight: [0.55, 0.5, 0.48, 0.42, 0.35, 0.3, 0.22, 0.28, 0.38, 0.45, 0.5, 0.52],
    monthlyBaseTempC: TEMP_SAO_PAULO,
    volatility: 0.5,
    baseWetnessBias: 0.05,
    dryRateFactor: 1.05,
    wetRateFactor: 1.2,
  },
  cota: {
    trackId: "cota",
    biome: "humid_subtropical",
    monthlyRainWeight: [0.35, 0.38, 0.45, 0.5, 0.55, 0.45, 0.35, 0.32, 0.48, 0.42, 0.38, 0.35],
    monthlyBaseTempC: [14, 16, 20, 24, 27, 30, 32, 32, 29, 24, 18, 14],
    volatility: 0.48,
    baseWetnessBias: 0.04,
    dryRateFactor: 1.0,
    wetRateFactor: 1.15,
  },
  fuji: {
    trackId: "fuji",
    biome: "humid_subtropical",
    /** Typhoon season peak Sep–Oct. */
    monthlyRainWeight: [0.25, 0.3, 0.38, 0.45, 0.5, 0.62, 0.68, 0.72, 0.82, 0.88, 0.75, 0.4],
    monthlyBaseTempC: [6, 7, 11, 16, 20, 23, 26, 27, 24, 18, 12, 8],
    volatility: 0.62,
    baseWetnessBias: 0.05,
    dryRateFactor: 0.95,
    wetRateFactor: 1.25,
  },
  losail: {
    trackId: "losail",
    biome: "arid",
    monthlyRainWeight: [0.12, 0.1, 0.08, 0.05, 0.03, 0.02, 0.02, 0.02, 0.03, 0.08, 0.12, 0.15],
    monthlyBaseTempC: TEMP_ARID,
    volatility: 0.18,
    baseWetnessBias: 0.01,
    dryRateFactor: 1.3,
    wetRateFactor: 0.85,
  },
  bahrain: {
    trackId: "bahrain",
    biome: "arid",
    monthlyRainWeight: [0.15, 0.12, 0.1, 0.06, 0.03, 0.02, 0.02, 0.02, 0.02, 0.04, 0.08, 0.12],
    monthlyBaseTempC: TEMP_ARID,
    volatility: 0.15,
    baseWetnessBias: 0.01,
    dryRateFactor: 1.35,
    wetRateFactor: 0.8,
  },
};

const DEFAULT_CLIMATE: TrackClimate = {
  trackId: "default",
  biome: "continental",
  monthlyRainWeight: [0.35, 0.32, 0.38, 0.4, 0.45, 0.42, 0.35, 0.35, 0.4, 0.42, 0.4, 0.38],
  monthlyBaseTempC: TEMP_MARITIME,
  volatility: 0.45,
  baseWetnessBias: 0.04,
  dryRateFactor: 1.0,
  wetRateFactor: 1.0,
};

export function climateForTrack(trackId: string): TrackClimate {
  return TRACK_CLIMATE[trackId] ?? { ...DEFAULT_CLIMATE, trackId };
}

export function monthName(month: number): string {
  return MONTH_NAMES[clampMonth(month) - 1] ?? "June";
}

export function buildClimateLabel(
  trackId: string,
  month: number,
  rainWeight: number,
  biome: BiomeId,
): string {
  const place = trackDisplayName(trackId);
  const when = monthName(month);
  if (biome === "arid") {
    if (rainWeight <= 0.08) return `${when} at ${place} — desert dry`;
    return `${when} at ${place} — mostly dry, rare showers`;
  }
  if (rainWeight >= 0.75) return `${when} at ${place} — rain likely`;
  if (rainWeight >= 0.55) return `${when} at ${place} — changeable, showers possible`;
  if (rainWeight >= 0.35) return `${when} at ${place} — mixed skies`;
  return `${when} at ${place} — predominantly dry`;
}

export function resolveTrackWeather(
  trackId: string,
  month: number,
  rngSeed = 0,
): ResolvedTrackWeather {
  const climate = climateForTrack(trackId);
  const m = clampMonth(month);
  const idx = m - 1;
  const rainWeight = climate.monthlyRainWeight[idx] ?? 0.4;
  const baseTemp = climate.monthlyBaseTempC[idx] ?? 20;

  const rnd = mulberry32(rngSeed || 1);
  const jitter = 0.88 + rnd() * 0.24;
  const tempJitter = (rnd() - 0.5) * 4;

  const rainChancePerHour = Math.min(
    0.92,
    lerp(0.02, 0.78, rainWeight) * (0.75 + climate.volatility * 0.35) * jitter,
  );
  const baseWetness = Math.min(
    0.35,
    climate.baseWetnessBias + rainWeight * 0.18 + (rnd() - 0.5) * 0.02,
  );
  const maxRainIntensity = Math.min(0.98, lerp(0.45, 0.95, rainWeight + climate.volatility * 0.15));

  const profile: WeatherProfile = {
    baseTempC: baseTemp + tempJitter,
    tempDriftPerHour: lerp(-0.4, -2.2, rainWeight) * (climate.biome === "arid" ? 1.4 : 1),
    baseWetness,
    rainChancePerHour,
    maxRainIntensity,
    wetRatePerSecond: 0.0015 * climate.wetRateFactor * (0.8 + rainWeight * 0.8),
    dryRatePerSecond: 0.00008 * climate.dryRateFactor * (1.1 - rainWeight * 0.35),
  };

  return {
    trackId,
    month: m,
    biome: climate.biome,
    rainWeight,
    label: buildClimateLabel(trackId, m, rainWeight, climate.biome),
    profile,
  };
}

export function formatWeatherConfigLines(
  resolved: ResolvedTrackWeather,
  rngSeed: number,
): string[] {
  const p = resolved.profile;
  return [
    "weather_resolved=1",
    `weather_track_id=${resolved.trackId}`,
    `weather_month=${resolved.month}`,
    `weather_biome=${resolved.biome}`,
    `weather_label=${resolved.label}`,
    `weather_rain_weight=${resolved.rainWeight.toFixed(3)}`,
    `rng_seed=${rngSeed}`,
    `ambient_temp_c=${p.baseTempC.toFixed(2)}`,
    `weather_base_temp_c=${p.baseTempC.toFixed(2)}`,
    `weather_temp_drift=${p.tempDriftPerHour.toFixed(4)}`,
    `weather_base_wetness=${p.baseWetness.toFixed(4)}`,
    `weather_rain_chance=${p.rainChancePerHour.toFixed(4)}`,
    `weather_max_rain=${p.maxRainIntensity.toFixed(4)}`,
    `weather_wet_rate=${p.wetRatePerSecond.toFixed(6)}`,
    `weather_dry_rate=${p.dryRatePerSecond.toFixed(6)}`,
  ];
}
