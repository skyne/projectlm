import type { RaceControlPayload } from "../ws/protocol";

export interface ForecastStep {
  offsetMinutes: number;
  phase: string;
  trackWetness: number;
  rainIntensity: number;
  ambientTempC: number;
  trackTempC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  visibilityKm: number;
}

/** Client-side projection of track weather for the next ~2 hours. */
export function projectWeatherForecast(
  rc: RaceControlPayload | undefined,
  steps = 12,
  stepMinutes = 10,
): ForecastStep[] {
  if (!rc) return [];

  let wetness = rc.trackWetness;
  let rain = rc.rainIntensity ?? 0;
  let phase = rc.weatherPhase ?? (wetness > 0.35 ? "LightRain" : wetness > 0.08 ? "Cloudy" : "Dry");
  let temp = rc.ambientTempC;
  let trackTemp = rc.trackTempC ?? temp + 8;
  let wind = rc.windSpeedMs ?? 4;
  let windDir = rc.windDirectionDeg ?? 270;
  let visibility = rc.visibilityKm ?? 10;
  let rainInSec = rc.forecastRainInSeconds ?? -1;

  const out: ForecastStep[] = [
    {
      offsetMinutes: 0,
      phase,
      trackWetness: wetness,
      rainIntensity: rain,
      ambientTempC: temp,
      trackTempC: trackTemp,
      windSpeedMs: wind,
      windDirectionDeg: windDir,
      visibilityKm: visibility,
    },
  ];

  for (let i = 1; i <= steps; i++) {
    temp -= 0.015 * stepMinutes;
    trackTemp += (temp + 8 - trackTemp) * 0.08 * stepMinutes;
    wind = Math.min(14, Math.max(1, wind + (Math.sin(i * 0.7) * 0.15)));
    visibility = Math.max(0.5, visibility - rain * 0.08 * stepMinutes);

    const prevRainInSec = rainInSec;
    if (rainInSec > 0) {
      rainInSec -= stepMinutes * 60;
    }

    if (
      (phase === "Dry" || phase === "Cloudy") &&
      prevRainInSec > 0 &&
      rainInSec <= 0
    ) {
      phase = "LightRain";
      rain = Math.max(rain, 0.15);
    }

    if (phase === "LightRain" || phase === "HeavyRain") {
      rain = Math.min(0.95, rain + 0.035 * stepMinutes);
      wetness = Math.min(1, wetness + 0.022 * stepMinutes * (1 + rain));
      phase = wetness >= 0.55 ? "HeavyRain" : "LightRain";
      trackTemp = Math.max(temp - 2, trackTemp - 0.12 * stepMinutes);
      visibility = Math.max(0.5, visibility - 0.25 * stepMinutes);
    } else if (phase === "Drying") {
      rain = Math.max(0, rain - 0.025 * stepMinutes);
      wetness = Math.max(0.02, wetness - 0.012 * stepMinutes);
      if (wetness <= 0.08 && rain <= 0.05) phase = wetness > 0.04 ? "Cloudy" : "Dry";
    } else if (wetness > 0.12 && rain < 0.08 && phase !== "Dry") {
      phase = "Drying";
    } else if (wetness <= 0.08 && rain < 0.05) {
      phase = wetness > 0.04 ? "Cloudy" : "Dry";
    }

    out.push({
      offsetMinutes: i * stepMinutes,
      phase,
      trackWetness: wetness,
      rainIntensity: rain,
      ambientTempC: temp,
      trackTempC: trackTemp,
      windSpeedMs: wind,
      windDirectionDeg: windDir,
      visibilityKm: visibility,
    });
  }

  return out;
}

/** Per-segment wetness for map overlay — varies like passing rain cells. */
export function segmentWetness(
  baseWetness: number,
  rainIntensity: number,
  segmentIndex: number,
  segmentCount: number,
  raceTime: number,
): number {
  if (segmentCount <= 0) return baseWetness;
  const t = segmentIndex / segmentCount;
  const drift = raceTime * 0.00025;
  const cell =
    (Math.sin(t * Math.PI * 5 + drift) +
      Math.sin(t * Math.PI * 11 - drift * 1.7) +
      2) /
    4;
  const localized = baseWetness * 0.55 + cell * rainIntensity * 0.65 + baseWetness * 0.25;
  return Math.min(1, Math.max(0, localized));
}
