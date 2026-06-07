#include "weather.hpp"
#include <algorithm>
#include <cmath>

namespace {

double SolarGainForPhase(WeatherPhase phase, const WeatherProfile &profile) {
  switch (phase) {
  case WeatherPhase::Dry:
    return profile.trackSolarGainC;
  case WeatherPhase::Cloudy:
    return profile.trackSolarGainC * 0.35;
  case WeatherPhase::Drying:
    return profile.trackSolarGainC * 0.55;
  default:
    return 0.0;
  }
}

double TrackTempEquilibrium(const WeatherState &weather,
                            const WeatherProfile &profile) {
  const double solar = SolarGainForPhase(weather.phase, profile);
  const double rainCool = weather.rainIntensity * 6.0 + weather.trackWetness * 3.0;
  const double windCool = weather.windSpeedMs * 0.15;
  return weather.ambientTempC + solar - rainCool - windCool;
}

double PhaseVisibilityFactor(WeatherPhase phase) {
  switch (phase) {
  case WeatherPhase::HeavyRain:
    return 0.35;
  case WeatherPhase::LightRain:
    return 0.55;
  case WeatherPhase::Drying:
    return 0.75;
  case WeatherPhase::Cloudy:
    return 0.82;
  default:
    return 1.0;
  }
}

void UpdateVisibility(WeatherState &weather, const WeatherProfile &profile) {
  weather.visibilityKm = std::clamp(
      profile.baseVisibilityKm * (1.0 - weather.rainIntensity * 0.65) *
          PhaseVisibilityFactor(weather.phase),
      0.4, 15.0);
}

double TrackSurfaceGripFactor(double trackTempC) {
  if (trackTempC < 15.0)
    return std::clamp(0.92 + (trackTempC - 15.0) * 0.004, 0.88, 1.0);
  if (trackTempC > 55.0)
    return std::clamp(1.0 - (trackTempC - 55.0) * 0.004, 0.88, 1.0);
  const double delta = std::abs(trackTempC - 40.0);
  if (delta <= 5.0)
    return 1.02;
  if (delta <= 15.0)
    return 1.02 - (delta - 5.0) * 0.0015;
  return 0.98;
}

void ResolveWeatherPhase(WeatherState &weather) {
  if (weather.phase == WeatherPhase::Drying)
    return;
  if (weather.trackWetness >= 0.55)
    weather.phase = WeatherPhase::HeavyRain;
  else if (weather.trackWetness >= 0.25 || weather.rainIntensity >= 0.1)
    weather.phase = WeatherPhase::LightRain;
  else if (weather.trackWetness >= 0.08)
    weather.phase = WeatherPhase::Cloudy;
  else
    weather.phase = WeatherPhase::Dry;
}

} // namespace

void AdvanceWeatherDeterministic(WeatherState &weather,
                                 const WeatherProfile &profile,
                                 double elapsedRaceTime, double deltaTime) {
  weather.ambientTempC += (profile.tempDriftPerHour / 3600.0) * deltaTime;

  const double dryBoost =
      1.0 + 0.04 * std::max(0.0, weather.trackTempC - weather.ambientTempC) +
      0.06 * weather.windSpeedMs;
  const double effectiveDryRate = profile.dryRatePerSecond * dryBoost;

  const bool hadScheduledRain = weather.forecastRainInSeconds > 0.0;
  if (weather.forecastRainInSeconds > 0.0)
    weather.forecastRainInSeconds -= deltaTime;

  if (hadScheduledRain && weather.forecastRainInSeconds <= 0.0 &&
      (weather.phase == WeatherPhase::Dry ||
       weather.phase == WeatherPhase::Cloudy)) {
    weather.phase = WeatherPhase::LightRain;
    weather.rainIntensity = std::max(weather.rainIntensity, 0.2);
    weather.forecastRainInSeconds = -1.0;
    if (weather.rainEpisodeEndTime < 0.0)
      weather.rainEpisodeEndTime = elapsedRaceTime + 2400.0;
  }

  if (weather.phase == WeatherPhase::LightRain ||
      weather.phase == WeatherPhase::HeavyRain) {
    if (weather.rainEpisodeEndTime > 0.0 &&
        elapsedRaceTime >= weather.rainEpisodeEndTime) {
      weather.phase = WeatherPhase::Drying;
      weather.rainEpisodeEndTime = -1.0;
    } else {
      weather.rainIntensity = std::min(
          profile.maxRainIntensity,
          weather.rainIntensity + profile.wetRatePerSecond * deltaTime * 2.5);
      weather.trackWetness = std::min(
          1.0, weather.trackWetness + profile.wetRatePerSecond * deltaTime *
                                          (0.35 + weather.rainIntensity * 0.65));
      if (weather.trackWetness >= 0.55)
        weather.phase = WeatherPhase::HeavyRain;
    }
  }

  if (weather.phase == WeatherPhase::Drying ||
      (weather.trackWetness > profile.baseWetness + 0.02 &&
       weather.rainIntensity < 0.08)) {
    weather.phase = WeatherPhase::Drying;
    weather.rainIntensity = std::max(
        0.0, weather.rainIntensity - effectiveDryRate * deltaTime * 5.0);
    weather.trackWetness =
        std::max(profile.baseWetness,
                 weather.trackWetness - effectiveDryRate * deltaTime *
                                            (2.5 + elapsedRaceTime / 5400.0));
    if (weather.trackWetness <= profile.baseWetness + 0.03 &&
        weather.rainIntensity <= 0.05) {
      weather.phase =
          weather.trackWetness > 0.08 ? WeatherPhase::Cloudy : WeatherPhase::Dry;
    }
  } else if (weather.trackWetness > profile.baseWetness) {
    weather.trackWetness =
        std::max(profile.baseWetness,
                 weather.trackWetness - effectiveDryRate * deltaTime);
  }

  weather.trackGripEvolution =
      1.0 + std::min(0.06, elapsedRaceTime / 7200.0 * 0.06);

  const double trackTarget = TrackTempEquilibrium(weather, profile);
  const double trackRate = 0.0025 + weather.windSpeedMs * 0.00015;
  weather.trackTempC +=
      (trackTarget - weather.trackTempC) * trackRate * deltaTime;

  UpdateVisibility(weather, profile);
  ResolveWeatherPhase(weather);
}

WeatherProfile WeatherProfileForId(const std::string &profileId) {
  WeatherProfile profile;
  if (profileId == "hot_dry") {
    profile.baseTempC = 32.0;
    profile.tempDriftPerHour = -2.0;
    profile.baseWetness = 0.0;
    profile.rainChancePerHour = 0.02;
    profile.baseWindSpeedMs = 3.5;
    profile.baseVisibilityKm = 12.0;
    profile.trackSolarGainC = 14.0;
    return profile;
  }
  if (profileId == "overcast") {
    profile.baseTempC = 18.0;
    profile.tempDriftPerHour = -0.5;
    profile.baseWetness = 0.08;
    profile.rainChancePerHour = 0.25;
    profile.maxRainIntensity = 0.55;
    profile.baseWindSpeedMs = 6.0;
    profile.baseVisibilityKm = 7.0;
    profile.trackSolarGainC = 5.0;
    return profile;
  }
  if (profileId == "changeable") {
    profile.baseTempC = 21.0;
    profile.tempDriftPerHour = -1.2;
    profile.baseWetness = 0.05;
    profile.rainChancePerHour = 0.45;
    profile.maxRainIntensity = 0.75;
    profile.wetRatePerSecond = 0.0025;
    profile.baseWindSpeedMs = 5.5;
    profile.baseVisibilityKm = 9.0;
    profile.trackSolarGainC = 10.0;
    return profile;
  }
  if (profileId == "wet") {
    profile.baseTempC = 16.0;
    profile.tempDriftPerHour = 0.0;
    profile.baseWetness = 0.55;
    profile.rainChancePerHour = 0.8;
    profile.maxRainIntensity = 0.95;
    profile.wetRatePerSecond = 0.004;
    profile.dryRatePerSecond = 0.00002;
    profile.baseWindSpeedMs = 8.0;
    profile.baseVisibilityKm = 4.5;
    profile.trackSolarGainC = 3.0;
    return profile;
  }
  profile.baseTempC = 24.0;
  profile.tempDriftPerHour = -1.0;
  profile.baseWetness = 0.0;
  profile.rainChancePerHour = 0.05;
  profile.baseWindSpeedMs = 4.0;
  profile.baseVisibilityKm = 10.0;
  profile.trackSolarGainC = 10.0;
  return profile;
}

void InitWeatherStateFromProfile(WeatherState &weather,
                                 const WeatherProfile &profile,
                                 const std::string &profileId,
                                 double configuredWetness, double configuredTempC,
                                 std::mt19937 *rng) {
  weather.profileId = profileId;
  weather.trackWetness =
      configuredWetness > 0.0 ? configuredWetness : profile.baseWetness;
  weather.ambientTempC =
      configuredTempC > 0.0 ? configuredTempC : profile.baseTempC;
  weather.rainIntensity = weather.trackWetness * profile.maxRainIntensity;
  weather.trackGripEvolution = 1.0;
  weather.forecastRainInSeconds = -1.0;
  weather.rainEpisodeEndTime = -1.0;

  if (weather.trackWetness >= 0.55)
    weather.phase = WeatherPhase::HeavyRain;
  else if (weather.trackWetness >= 0.25)
    weather.phase = WeatherPhase::LightRain;
  else if (weather.trackWetness >= 0.08)
    weather.phase = WeatherPhase::Cloudy;
  else
    weather.phase = WeatherPhase::Dry;

  double windScale = 1.0;
  double windDir = 270.0;
  if (rng != nullptr) {
    std::uniform_real_distribution<double> unit(0.0, 1.0);
    windScale = 0.75 + unit(*rng) * 0.5;
    windDir = unit(*rng) * 360.0;
  }
  weather.windSpeedMs = profile.baseWindSpeedMs * windScale;
  weather.windDirectionDeg = windDir;
  weather.trackTempC = TrackTempEquilibrium(weather, profile);
  UpdateVisibility(weather, profile);
}

void InitWeatherState(WeatherState &weather, const std::string &profileId,
                      double configuredWetness, double configuredTempC) {
  InitWeatherStateFromProfile(weather, WeatherProfileForId(profileId), profileId,
                              configuredWetness, configuredTempC, nullptr);
}

void TickWeatherState(WeatherState &weather, const WeatherProfile &profile,
                      double elapsedRaceTime, double deltaTime,
                      std::mt19937 &rng) {
  const double rainRollChance = (profile.rainChancePerHour / 3600.0) * deltaTime;
  std::uniform_real_distribution<double> unit(0.0, 1.0);

  if (weather.phase == WeatherPhase::Dry || weather.phase == WeatherPhase::Cloudy) {
    if (unit(rng) < rainRollChance) {
      weather.phase = WeatherPhase::LightRain;
      weather.rainIntensity = std::max(weather.rainIntensity, 0.2);
      weather.forecastRainInSeconds = -1.0;
      const double minSec = profile.maxRainIntensity > 0.72 ? 1800.0 : 900.0;
      const double spanSec = profile.maxRainIntensity > 0.72 ? 5400.0 : 2700.0;
      weather.rainEpisodeEndTime = elapsedRaceTime + minSec + unit(rng) * spanSec;
    } else if (weather.trackWetness <= profile.baseWetness + 0.001 &&
               unit(rng) < rainRollChance * 0.5 &&
               weather.forecastRainInSeconds < 0.0) {
      weather.forecastRainInSeconds = 120.0 + unit(rng) * 900.0;
    }
  }

  const double windMin = profile.baseWindSpeedMs * 0.4;
  const double windMax = profile.baseWindSpeedMs * 2.5;
  weather.windSpeedMs = std::clamp(
      weather.windSpeedMs + (unit(rng) - 0.5) * 0.08 * deltaTime * 60.0,
      windMin, windMax);
  if (weather.phase == WeatherPhase::LightRain ||
      weather.phase == WeatherPhase::HeavyRain) {
    weather.windSpeedMs = std::min(
        windMax, weather.windSpeedMs + profile.baseWindSpeedMs * 0.002 * deltaTime);
  }
  weather.windDirectionDeg =
      std::fmod(weather.windDirectionDeg + (unit(rng) - 0.5) * 2.0 * deltaTime +
                    360.0,
                360.0);

  AdvanceWeatherDeterministic(weather, profile, elapsedRaceTime, deltaTime);
}

std::vector<WeatherForecastStep>
BuildWeatherForecast(const WeatherState &start, const WeatherProfile &profile,
                     double elapsedRaceTime, int steps, double stepMinutes) {
  std::vector<WeatherForecastStep> forecast;
  forecast.reserve(static_cast<size_t>(steps) + 1);

  WeatherState sim = start;
  auto pushStep = [&](double offsetMinutes) {
    WeatherForecastStep step;
    step.offsetMinutes = offsetMinutes;
    step.phase = sim.phase;
    step.trackWetness = sim.trackWetness;
    step.rainIntensity = sim.rainIntensity;
    step.ambientTempC = sim.ambientTempC;
    step.trackTempC = sim.trackTempC;
    step.windSpeedMs = sim.windSpeedMs;
    step.windDirectionDeg = sim.windDirectionDeg;
    step.visibilityKm = sim.visibilityKm;
    forecast.push_back(step);
  };

  pushStep(0.0);
  const double stepSeconds = stepMinutes * 60.0;
  double simTime = elapsedRaceTime;

  for (int i = 0; i < steps; ++i) {
    simTime += stepSeconds;
    AdvanceWeatherDeterministic(sim, profile, simTime, stepSeconds);
    pushStep((i + 1) * stepMinutes);
  }

  return forecast;
}

const char *WeatherPhaseName(WeatherPhase phase) {
  switch (phase) {
  case WeatherPhase::Dry:
    return "Dry";
  case WeatherPhase::Cloudy:
    return "Cloudy";
  case WeatherPhase::LightRain:
    return "LightRain";
  case WeatherPhase::HeavyRain:
    return "HeavyRain";
  case WeatherPhase::Drying:
    return "Drying";
  }
  return "Dry";
}

double CompoundCrossoverGrip(ETireCompound compound, ETyreTread tread,
                             double trackWetness, double ambientTempC,
                             double trackTempC) {
  const double wet = std::clamp(trackWetness, 0.0, 1.0);
  const double tempDelta = ambientTempC - 26.0;

  if (tread == ETyreTread::Wet) {
    const double dryPenalty = wet < 0.2 ? 0.78 : 1.0;
    const double wetBonus =
        wet < 0.35 ? 0.88 + wet * 0.35 : 0.95 + wet * 0.25;
    return dryPenalty * wetBonus;
  }

  if (tread == ETyreTread::Intermediate) {
    if (wet < 0.1)
      return 0.84;
    if (wet < 0.22)
      return 0.92 + (wet - 0.1) * 0.8;
    if (wet < 0.5)
      return 1.02;
    if (wet < 0.65)
      return 1.02 - (wet - 0.5) * 0.9;
    return 0.72;
  }

  if (wet >= 0.45) {
    switch (compound) {
    case ETireCompound::Soft:
      return 0.58;
    case ETireCompound::Medium:
      return 0.64;
    default:
      return 0.68;
    }
  }

  if (wet >= 0.15) {
    switch (compound) {
    case ETireCompound::Soft:
      return 0.88;
    case ETireCompound::Medium:
      return 0.96;
    default:
      return 0.92;
    }
  }

  double grip = 0.0;
  switch (compound) {
  case ETireCompound::Soft:
    grip = std::clamp(1.04 - std::abs(tempDelta) * 0.012, 0.88, 1.06);
    break;
  case ETireCompound::Medium:
    grip = std::clamp(1.0 - std::abs(tempDelta) * 0.008, 0.9, 1.02);
    break;
  default:
    grip = std::clamp(0.93 + ambientTempC * 0.002, 0.88, 1.0);
    break;
  }
  return grip * TrackSurfaceGripFactor(trackTempC);
}

double WeatherTireGripScale(const WeatherState &weather, ETireCompound compound,
                            ETyreTread tread) {
  const double crossover =
      CompoundCrossoverGrip(compound, tread, weather.trackWetness,
                            weather.ambientTempC, weather.trackTempC);
  const double wetPenalty = 1.0 - weather.trackWetness * 0.22;
  const double tempPenalty =
      weather.ambientTempC > 34.0
          ? 1.0 - std::min(0.1, (weather.ambientTempC - 34.0) * 0.005)
          : 1.0;
  return crossover * wetPenalty * tempPenalty * weather.trackGripEvolution;
}
