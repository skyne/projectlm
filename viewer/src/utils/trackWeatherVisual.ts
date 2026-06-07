import type { RaceControlPayload, WeatherContextPayload } from "../ws/protocol";

export type TrackTimePhase = "summer" | "winter" | "neutral";

export function resolveTrackTimePhase(month?: number): TrackTimePhase {
  if (month == null) return "neutral";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 11 || month <= 2) return "winter";
  return "neutral";
}

export interface TrackWeatherVisual {
  rain: number;
  wet: number;
  overlayOpacity: number;
  rainActive: boolean;
  wetActive: boolean;
  asphaltSheen: number;
}

export function resolveTrackWeatherVisual(
  raceControl?: RaceControlPayload,
): TrackWeatherVisual {
  const rain = Math.max(0, Math.min(1, raceControl?.rainIntensity ?? 0));
  const wet = Math.max(0, Math.min(1, raceControl?.trackWetness ?? 0));
  return {
    rain,
    wet,
    // Kept for tests; live map tints use --track-rain / --track-wet directly.
    overlayOpacity: Math.min(0.28, rain * 0.14 + wet * 0.1),
    rainActive: rain > 0.08,
    wetActive: wet > 0.25,
    asphaltSheen: wet,
  };
}

export function applyTrackTimePhase(
  host: HTMLElement,
  weather?: WeatherContextPayload,
): void {
  host.dataset.timePhase = resolveTrackTimePhase(weather?.month);
}

interface WeatherDomState {
  rain: number;
  wet: number;
  overlayOpacity: number;
  rainActive: boolean;
  wetActive: boolean;
}

const hostWeatherState = new WeakMap<HTMLElement, WeatherDomState>();

/** Skip DOM writes when rain/wet visuals are unchanged (avoids per-tick style recalc). */
export function applyTrackWeatherVisual(
  host: HTMLElement,
  raceControl?: RaceControlPayload,
): void {
  const v = resolveTrackWeatherVisual(raceControl);
  const prev = hostWeatherState.get(host);
  if (
    prev &&
    prev.rainActive === v.rainActive &&
    prev.wetActive === v.wetActive &&
    Math.abs(prev.rain - v.rain) < 0.002 &&
    Math.abs(prev.wet - v.wet) < 0.002 &&
    Math.abs(prev.overlayOpacity - v.overlayOpacity) < 0.002
  ) {
    return;
  }
  hostWeatherState.set(host, { ...v });
  host.style.setProperty("--track-rain", String(v.rain));
  host.style.setProperty("--track-wet", String(v.wet));
  host.style.setProperty("--weather-overlay-opacity", String(v.overlayOpacity));
  host.classList.toggle("track-map-rain", v.rainActive);
  host.classList.toggle("track-map-wet", v.wetActive);
}
