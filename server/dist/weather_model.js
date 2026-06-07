"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weatherProfileForId = weatherProfileForId;
exports.advanceWeatherDeterministic = advanceWeatherDeterministic;
exports.tickWeatherState = tickWeatherState;
exports.initWeatherStateFromProfile = initWeatherStateFromProfile;
exports.initWeatherState = initWeatherState;
exports.buildWeatherForecast = buildWeatherForecast;
function defaultRainEpisodeDuration(profile, random) {
    const minSec = profile.maxRainIntensity > 0.72 ? 1800 : 900;
    const spanSec = profile.maxRainIntensity > 0.72 ? 5400 : 2700;
    return minSec + random() * spanSec;
}
function solarGainForPhase(phase, profile) {
    if (phase === "Dry")
        return profile.trackSolarGainC;
    if (phase === "Cloudy")
        return profile.trackSolarGainC * 0.35;
    if (phase === "Drying")
        return profile.trackSolarGainC * 0.55;
    return 0;
}
function trackTempEquilibrium(weather, profile) {
    const solar = solarGainForPhase(weather.phase, profile);
    const rainCool = weather.rainIntensity * 6 + weather.trackWetness * 3;
    const windCool = weather.windSpeedMs * 0.15;
    return weather.ambientTempC + solar - rainCool - windCool;
}
function phaseVisibilityFactor(phase) {
    if (phase === "HeavyRain")
        return 0.35;
    if (phase === "LightRain")
        return 0.55;
    if (phase === "Drying")
        return 0.75;
    if (phase === "Cloudy")
        return 0.82;
    return 1;
}
function updateVisibility(weather, profile) {
    weather.visibilityKm = Math.min(15, Math.max(0.4, profile.baseVisibilityKm *
        (1 - weather.rainIntensity * 0.65) *
        phaseVisibilityFactor(weather.phase)));
}
function weatherProfileForId(profileId) {
    const defaults = {
        maxRainIntensity: 0.85,
        wetRatePerSecond: 0.0015,
        dryRatePerSecond: 0.00008,
        baseWindSpeedMs: 4,
        baseVisibilityKm: 10,
        trackSolarGainC: 10,
    };
    if (profileId === "hot_dry") {
        return {
            baseTempC: 32,
            tempDriftPerHour: -2,
            baseWetness: 0,
            rainChancePerHour: 0.02,
            ...defaults,
            baseWindSpeedMs: 3.5,
            baseVisibilityKm: 12,
            trackSolarGainC: 14,
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
            baseWindSpeedMs: 6,
            baseVisibilityKm: 7,
            trackSolarGainC: 5,
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
            baseWindSpeedMs: 5.5,
            baseVisibilityKm: 9,
            trackSolarGainC: 10,
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
            baseWindSpeedMs: 8,
            baseVisibilityKm: 4.5,
            trackSolarGainC: 3,
        };
    }
    return {
        baseTempC: 24,
        tempDriftPerHour: -1,
        baseWetness: 0,
        rainChancePerHour: 0.05,
        ...defaults,
    };
}
function resolveWeatherPhase(weather) {
    if (weather.phase === "Drying")
        return;
    if (weather.trackWetness >= 0.55)
        weather.phase = "HeavyRain";
    else if (weather.trackWetness >= 0.25 || weather.rainIntensity >= 0.1) {
        weather.phase = "LightRain";
    }
    else if (weather.trackWetness >= 0.08) {
        weather.phase = "Cloudy";
    }
    else {
        weather.phase = "Dry";
    }
}
function advanceWeatherDeterministic(weather, profile, elapsedRaceTime, deltaTime) {
    weather.ambientTempC += (profile.tempDriftPerHour / 3600) * deltaTime;
    const dryBoost = 1 +
        0.04 * Math.max(0, weather.trackTempC - weather.ambientTempC) +
        0.06 * weather.windSpeedMs;
    const effectiveDryRate = profile.dryRatePerSecond * dryBoost;
    const hadScheduledRain = weather.forecastRainInSeconds > 0;
    if (weather.forecastRainInSeconds > 0) {
        weather.forecastRainInSeconds -= deltaTime;
    }
    if (hadScheduledRain &&
        weather.forecastRainInSeconds <= 0 &&
        (weather.phase === "Dry" || weather.phase === "Cloudy")) {
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
        }
        else {
            weather.rainIntensity = Math.min(profile.maxRainIntensity, weather.rainIntensity + profile.wetRatePerSecond * deltaTime * 2.5);
            weather.trackWetness = Math.min(1, weather.trackWetness +
                profile.wetRatePerSecond * deltaTime * (0.35 + weather.rainIntensity * 0.65));
            if (weather.trackWetness >= 0.55)
                weather.phase = "HeavyRain";
        }
    }
    if (weather.phase === "Drying" ||
        (weather.trackWetness > profile.baseWetness + 0.02 && weather.rainIntensity < 0.08)) {
        weather.phase = "Drying";
        weather.rainIntensity = Math.max(0, weather.rainIntensity - effectiveDryRate * deltaTime * 5);
        weather.trackWetness = Math.max(profile.baseWetness, weather.trackWetness -
            effectiveDryRate * deltaTime * (2.5 + elapsedRaceTime / 5400));
        if (weather.trackWetness <= profile.baseWetness + 0.03 && weather.rainIntensity <= 0.05) {
            weather.phase = weather.trackWetness > 0.08 ? "Cloudy" : "Dry";
        }
    }
    else if (weather.trackWetness > profile.baseWetness) {
        weather.trackWetness = Math.max(profile.baseWetness, weather.trackWetness - effectiveDryRate * deltaTime);
    }
    weather.trackGripEvolution = 1 + Math.min(0.06, (elapsedRaceTime / 7200) * 0.06);
    const trackTarget = trackTempEquilibrium(weather, profile);
    const trackRate = 0.0025 + weather.windSpeedMs * 0.00015;
    weather.trackTempC += (trackTarget - weather.trackTempC) * trackRate * deltaTime;
    updateVisibility(weather, profile);
    resolveWeatherPhase(weather);
}
function tickWeatherState(weather, profile, elapsedRaceTime, deltaTime, random) {
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
        }
        else if (weather.trackWetness <= profile.baseWetness + 0.001 &&
            random() < rainRollChance * 0.5 &&
            weather.forecastRainInSeconds < 0) {
            weather.forecastRainInSeconds = 120 + random() * 900;
        }
    }
    const windMin = profile.baseWindSpeedMs * 0.4;
    const windMax = profile.baseWindSpeedMs * 2.5;
    weather.windSpeedMs = Math.min(windMax, Math.max(windMin, weather.windSpeedMs + (random() - 0.5) * 0.08 * deltaTime * 60));
    if (weather.phase === "LightRain" || weather.phase === "HeavyRain") {
        weather.windSpeedMs = Math.min(windMax, weather.windSpeedMs + profile.baseWindSpeedMs * 0.002 * deltaTime);
    }
    weather.windDirectionDeg =
        (weather.windDirectionDeg + (random() - 0.5) * 2 * deltaTime + 360) % 360;
    advanceWeatherDeterministic(weather, profile, elapsedRaceTime, deltaTime);
    const wasRaining = prevPhase === "LightRain" || prevPhase === "HeavyRain";
    const isRaining = weather.phase === "LightRain" || weather.phase === "HeavyRain";
    return {
        forecastScheduled: prevForecast < 0 && weather.forecastRainInSeconds > 0,
        rainStarted: !wasRaining && isRaining,
        dryingStarted: wasRaining && !isRaining && weather.phase === "Drying",
    };
}
function initWeatherStateFromProfile(profile, profileId, configuredWetness, configuredTempC, random) {
    const trackWetness = configuredWetness > 0 ? configuredWetness : profile.baseWetness;
    const ambientTempC = configuredTempC > 0 ? configuredTempC : profile.baseTempC;
    let phase = "Dry";
    if (trackWetness >= 0.55)
        phase = "HeavyRain";
    else if (trackWetness >= 0.25)
        phase = "LightRain";
    else if (trackWetness >= 0.08)
        phase = "Cloudy";
    const rnd = random ?? (() => 0.5);
    const windScale = 0.75 + rnd() * 0.5;
    const windDirectionDeg = rnd() * 360;
    const weather = {
        trackWetness,
        ambientTempC,
        trackTempC: ambientTempC,
        rainIntensity: trackWetness * profile.maxRainIntensity,
        trackGripEvolution: 1,
        windSpeedMs: profile.baseWindSpeedMs * windScale,
        windDirectionDeg,
        visibilityKm: profile.baseVisibilityKm,
        phase,
        forecastRainInSeconds: -1,
        rainEpisodeEndTime: -1,
        profileId,
    };
    weather.trackTempC = trackTempEquilibrium(weather, profile);
    updateVisibility(weather, profile);
    return weather;
}
function initWeatherState(profileId, configuredWetness, configuredTempC, random) {
    return initWeatherStateFromProfile(weatherProfileForId(profileId), profileId, configuredWetness, configuredTempC, random);
}
function buildWeatherForecast(start, profile, elapsedRaceTime, steps = 12, stepMinutes = 10) {
    const sim = { ...start };
    const forecast = [];
    const push = (offsetMinutes) => {
        forecast.push({
            offsetMinutes,
            phase: sim.phase,
            trackWetness: sim.trackWetness,
            rainIntensity: sim.rainIntensity,
            ambientTempC: sim.ambientTempC,
            trackTempC: sim.trackTempC,
            windSpeedMs: sim.windSpeedMs,
            windDirectionDeg: sim.windDirectionDeg,
            visibilityKm: sim.visibilityKm,
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
