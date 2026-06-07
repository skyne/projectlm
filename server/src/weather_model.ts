export type WeatherPhase = "Dry" | "Cloudy" | "LightRain" | "HeavyRain" | "Drying";

export interface WeatherProfile {
  baseTempC: number;
  tempDriftPerHour: number;
  baseWetness: number;
  rainChancePerHour: number;
  maxRainIntensity: number;
  wetRatePerSecond: number;
  dryRatePerSecond: number;
}

export interface WeatherState {
  trackWetness: number;
  ambientTempC: number;
  rainIntensity: number;
  trackGripEvolution: number;
  phase: WeatherPhase;
  forecastRainInSeconds: number;
  /** Sim time when the active shower should end; -1 if none. */
  rainEpisodeEndTime: number;
  profileId: string;
}

function defaultRainEpisodeDuration(profile: WeatherProfile, random: () => number): number {
  const minSec = profile.maxRainIntensity > 0.72 ? 1800 : 900;
  const spanSec = profile.maxRainIntensity > 0.72 ? 5400 : 2700;
  return minSec + random() * spanSec;
}

export interface WeatherForecastStep {
  offsetMinutes: number;
  phase: string;
  trackWetness: number;
  rainIntensity: number;
  ambientTempC: number;
}

export function weatherProfileForId(profileId: string): WeatherProfile {
  if (profileId === "hot_dry") {
    return {
      baseTempC: 32,
      tempDriftPerHour: -2,
      baseWetness: 0,
      rainChancePerHour: 0.02,
      maxRainIntensity: 0.85,
      wetRatePerSecond: 0.0015,
      dryRatePerSecond: 0.00008,
    };
  }
  if (profileId === "overcast") {
    return {
      baseTempC: 18,
      tempDriftPerHour: -0.5,
      baseWetness: 0.08,
      rainChancePerHour: 0.25,
      maxRainIntensity: 0.55,
      wetRatePerSecond: 0.0015,
      dryRatePerSecond: 0.00008,
    };
  }
  if (profileId === "changeable") {
    return {
      baseTempC: 21,
      tempDriftPerHour: -1.2,
      baseWetness: 0.05,
      rainChancePerHour: 0.45,
      maxRainIntensity: 0.75,
      wetRatePerSecond: 0.0025,
      dryRatePerSecond: 0.00008,
    };
  }
  if (profileId === "wet") {
    return {
      baseTempC: 16,
      tempDriftPerHour: 0,
      baseWetness: 0.55,
      rainChancePerHour: 0.8,
      maxRainIntensity: 0.95,
      wetRatePerSecond: 0.004,
      dryRatePerSecond: 0.00002,
    };
  }
  return {
    baseTempC: 24,
    tempDriftPerHour: -1,
    baseWetness: 0,
    rainChancePerHour: 0.05,
    maxRainIntensity: 0.85,
    wetRatePerSecond: 0.0015,
    dryRatePerSecond: 0.00008,
  };
}

function resolveWeatherPhase(weather: WeatherState): void {
  if (weather.phase === "Drying") return;
  if (weather.trackWetness >= 0.55) weather.phase = "HeavyRain";
  else if (weather.trackWetness >= 0.25 || weather.rainIntensity >= 0.1) {
    weather.phase = "LightRain";
  } else if (weather.trackWetness >= 0.08) {
    weather.phase = "Cloudy";
  } else {
    weather.phase = "Dry";
  }
}

export function advanceWeatherDeterministic(
  weather: WeatherState,
  profile: WeatherProfile,
  elapsedRaceTime: number,
  deltaTime: number,
): void {
  weather.ambientTempC += (profile.tempDriftPerHour / 3600) * deltaTime;

  const hadScheduledRain = weather.forecastRainInSeconds > 0;
  if (weather.forecastRainInSeconds > 0) {
    weather.forecastRainInSeconds -= deltaTime;
  }

  if (
    hadScheduledRain &&
    weather.forecastRainInSeconds <= 0 &&
    (weather.phase === "Dry" || weather.phase === "Cloudy")
  ) {
    weather.phase = "LightRain";
    weather.rainIntensity = Math.max(weather.rainIntensity, 0.2);
    weather.forecastRainInSeconds = -1;
    if (weather.rainEpisodeEndTime < 0) {
      weather.rainEpisodeEndTime = elapsedRaceTime + 2400;
    }
  }

  if (weather.phase === "LightRain" || weather.phase === "HeavyRain") {
    if (weather.rainEpisodeEndTime > 0 && elapsedRaceTime >= weather.rainEpisodeEndTime) {
      weather.phase = "Drying";
      weather.rainEpisodeEndTime = -1;
    } else {
      weather.rainIntensity = Math.min(
        profile.maxRainIntensity,
        weather.rainIntensity + profile.wetRatePerSecond * deltaTime * 2.5,
      );
      weather.trackWetness = Math.min(
        1,
        weather.trackWetness +
          profile.wetRatePerSecond * deltaTime * (0.35 + weather.rainIntensity * 0.65),
      );
      if (weather.trackWetness >= 0.55) weather.phase = "HeavyRain";
    }
  }

  if (
    weather.phase === "Drying" ||
    (weather.trackWetness > profile.baseWetness + 0.02 && weather.rainIntensity < 0.08)
  ) {
    weather.phase = "Drying";
    weather.rainIntensity = Math.max(
      0,
      weather.rainIntensity - profile.dryRatePerSecond * deltaTime * 5,
    );
    weather.trackWetness = Math.max(
      profile.baseWetness,
      weather.trackWetness -
        profile.dryRatePerSecond * deltaTime * (2.5 + elapsedRaceTime / 5400),
    );
    if (weather.trackWetness <= profile.baseWetness + 0.03 && weather.rainIntensity <= 0.05) {
      weather.phase = weather.trackWetness > 0.08 ? "Cloudy" : "Dry";
    }
  } else if (weather.trackWetness > profile.baseWetness) {
    weather.trackWetness = Math.max(
      profile.baseWetness,
      weather.trackWetness - profile.dryRatePerSecond * deltaTime,
    );
  }

  weather.trackGripEvolution = 1 + Math.min(0.06, (elapsedRaceTime / 7200) * 0.06);
  resolveWeatherPhase(weather);
}

export function tickWeatherState(
  weather: WeatherState,
  profile: WeatherProfile,
  elapsedRaceTime: number,
  deltaTime: number,
  random: () => number,
): { forecastScheduled: boolean; rainStarted: boolean; dryingStarted: boolean } {
  const prevPhase = weather.phase;
  const prevForecast = weather.forecastRainInSeconds;
  const rainRollChance = (profile.rainChancePerHour / 3600) * deltaTime;

  if (weather.phase === "Dry" || weather.phase === "Cloudy") {
    if (random() < rainRollChance) {
      weather.phase = "LightRain";
      weather.rainIntensity = Math.max(weather.rainIntensity, 0.2);
      weather.forecastRainInSeconds = -1;
      weather.rainEpisodeEndTime =
        elapsedRaceTime + defaultRainEpisodeDuration(profile, random);
    } else if (
      weather.trackWetness <= profile.baseWetness + 0.001 &&
      random() < rainRollChance * 0.5 &&
      weather.forecastRainInSeconds < 0
    ) {
      weather.forecastRainInSeconds = 120 + random() * 900;
    }
  }

  advanceWeatherDeterministic(weather, profile, elapsedRaceTime, deltaTime);

  const wasRaining = prevPhase === "LightRain" || prevPhase === "HeavyRain";
  const isRaining = weather.phase === "LightRain" || weather.phase === "HeavyRain";

  return {
    forecastScheduled: prevForecast < 0 && weather.forecastRainInSeconds > 0,
    rainStarted: !wasRaining && isRaining,
    dryingStarted: wasRaining && !isRaining && weather.phase === "Drying",
  };
}

export function initWeatherState(
  profileId: string,
  configuredWetness: number,
  configuredTempC: number,
): WeatherState {
  const profile = weatherProfileForId(profileId);
  const trackWetness = configuredWetness > 0 ? configuredWetness : profile.baseWetness;
  const ambientTempC = configuredTempC > 0 ? configuredTempC : profile.baseTempC;
  let phase: WeatherPhase = "Dry";
  if (trackWetness >= 0.55) phase = "HeavyRain";
  else if (trackWetness >= 0.25) phase = "LightRain";
  else if (trackWetness >= 0.08) phase = "Cloudy";

  return {
    trackWetness,
    ambientTempC,
    rainIntensity: trackWetness * profile.maxRainIntensity,
    trackGripEvolution: 1,
    phase,
    forecastRainInSeconds: -1,
    rainEpisodeEndTime: -1,
    profileId,
  };
}

export function buildWeatherForecast(
  start: WeatherState,
  profile: WeatherProfile,
  elapsedRaceTime: number,
  steps = 12,
  stepMinutes = 10,
): WeatherForecastStep[] {
  const sim: WeatherState = { ...start };
  const forecast: WeatherForecastStep[] = [];

  const push = (offsetMinutes: number) => {
    forecast.push({
      offsetMinutes,
      phase: sim.phase,
      trackWetness: sim.trackWetness,
      rainIntensity: sim.rainIntensity,
      ambientTempC: sim.ambientTempC,
    });
  };

  push(0);
  const stepSeconds = stepMinutes * 60;
  let simTime = elapsedRaceTime;

  for (let i = 0; i < steps; i++) {
    simTime += stepSeconds;
    advanceWeatherDeterministic(sim, profile, simTime, stepSeconds);
    push((i + 1) * stepMinutes);
  }

  return forecast;
}
