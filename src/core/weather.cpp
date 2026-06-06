#include "weather.hpp"
#include <algorithm>
#include <cmath>

static void ResolveWeatherPhase(WeatherState &weather) {
  if (weather.trackWetness >= 0.55)
    weather.phase = WeatherPhase::HeavyRain;
  else if (weather.trackWetness >= 0.25 || weather.rainIntensity >= 0.1)
    weather.phase = WeatherPhase::LightRain;
  else if (weather.trackWetness >= 0.08 && weather.phase != WeatherPhase::Drying)
    weather.phase = WeatherPhase::Cloudy;
  else if (weather.trackWetness < 0.08 && weather.phase != WeatherPhase::Drying)
    weather.phase = WeatherPhase::Dry;
}

void AdvanceWeatherDeterministic(WeatherState &weather,
                                 const WeatherProfile &profile,
                                 double elapsedRaceTime, double deltaTime) {
  weather.ambientTempC += (profile.tempDriftPerHour / 3600.0) * deltaTime;

  const bool hadScheduledRain = weather.forecastRainInSeconds > 0.0;
  if (weather.forecastRainInSeconds > 0.0)
    weather.forecastRainInSeconds -= deltaTime;

  if (hadScheduledRain && weather.forecastRainInSeconds <= 0.0 &&
      (weather.phase == WeatherPhase::Dry ||
       weather.phase == WeatherPhase::Cloudy)) {
    weather.phase = WeatherPhase::LightRain;
    weather.rainIntensity = std::max(weather.rainIntensity, 0.2);
    weather.forecastRainInSeconds = -1.0;
  }

  if (weather.phase == WeatherPhase::LightRain ||
      weather.phase == WeatherPhase::HeavyRain) {
    weather.rainIntensity = std::min(
        profile.maxRainIntensity,
        weather.rainIntensity + profile.wetRatePerSecond * deltaTime * 4.0);
    weather.trackWetness = std::min(
        1.0, weather.trackWetness + profile.wetRatePerSecond * deltaTime *
                                        (1.0 + weather.rainIntensity));
    if (weather.trackWetness >= 0.55)
      weather.phase = WeatherPhase::HeavyRain;
  } else if (weather.phase == WeatherPhase::Drying ||
             (weather.trackWetness > profile.baseWetness + 0.02 &&
              weather.rainIntensity < 0.08)) {
    weather.phase = WeatherPhase::Drying;
    weather.rainIntensity =
        std::max(0.0, weather.rainIntensity - profile.dryRatePerSecond * deltaTime * 3.0);
    weather.trackWetness =
        std::max(profile.baseWetness,
                 weather.trackWetness - profile.dryRatePerSecond * deltaTime *
                                            (1.2 + elapsedRaceTime / 7200.0));
    if (weather.trackWetness <= profile.baseWetness + 0.03 &&
        weather.rainIntensity <= 0.05) {
      weather.phase =
          weather.trackWetness > 0.08 ? WeatherPhase::Cloudy : WeatherPhase::Dry;
    }
  } else if (weather.trackWetness > profile.baseWetness) {
    weather.trackWetness =
        std::max(profile.baseWetness,
                 weather.trackWetness - profile.dryRatePerSecond * deltaTime);
  }

  weather.trackGripEvolution =
      1.0 + std::min(0.06, elapsedRaceTime / 7200.0 * 0.06);

  ResolveWeatherPhase(weather);
}

WeatherProfile WeatherProfileForId(const std::string &profileId) {
  WeatherProfile profile;
  if (profileId == "hot_dry") {
    profile.baseTempC = 32.0;
    profile.tempDriftPerHour = -2.0;
    profile.baseWetness = 0.0;
    profile.rainChancePerHour = 0.02;
    return profile;
  }
  if (profileId == "overcast") {
    profile.baseTempC = 18.0;
    profile.tempDriftPerHour = -0.5;
    profile.baseWetness = 0.08;
    profile.rainChancePerHour = 0.25;
    profile.maxRainIntensity = 0.55;
    return profile;
  }
  if (profileId == "changeable") {
    profile.baseTempC = 21.0;
    profile.tempDriftPerHour = -1.2;
    profile.baseWetness = 0.05;
    profile.rainChancePerHour = 0.45;
    profile.maxRainIntensity = 0.75;
    profile.wetRatePerSecond = 0.0025;
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
    return profile;
  }
  profile.baseTempC = 24.0;
  profile.tempDriftPerHour = -1.0;
  profile.baseWetness = 0.0;
  profile.rainChancePerHour = 0.05;
  return profile;
}

void InitWeatherStateFromProfile(WeatherState &weather,
                                 const WeatherProfile &profile,
                                 const std::string &profileId,
                                 double configuredWetness, double configuredTempC) {
  weather.profileId = profileId;
  weather.trackWetness =
      configuredWetness > 0.0 ? configuredWetness : profile.baseWetness;
  weather.ambientTempC =
      configuredTempC > 0.0 ? configuredTempC : profile.baseTempC;
  weather.rainIntensity = weather.trackWetness * profile.maxRainIntensity;
  weather.trackGripEvolution = 1.0;
  weather.forecastRainInSeconds = -1.0;

  if (weather.trackWetness >= 0.55)
    weather.phase = WeatherPhase::HeavyRain;
  else if (weather.trackWetness >= 0.25)
    weather.phase = WeatherPhase::LightRain;
  else if (weather.trackWetness >= 0.08)
    weather.phase = WeatherPhase::Cloudy;
  else
    weather.phase = WeatherPhase::Dry;
}

void InitWeatherState(WeatherState &weather, const std::string &profileId,
                      double configuredWetness, double configuredTempC) {
  InitWeatherStateFromProfile(weather, WeatherProfileForId(profileId), profileId,
                              configuredWetness, configuredTempC);
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
    } else if (weather.trackWetness <= profile.baseWetness + 0.001 &&
               unit(rng) < rainRollChance * 0.5 &&
               weather.forecastRainInSeconds < 0.0) {
      weather.forecastRainInSeconds = 120.0 + unit(rng) * 900.0;
    }
  }

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

double CompoundCrossoverGrip(ETireCompound compound, bool wetTyres,
                             double trackWetness, double ambientTempC) {
  const double wet = std::clamp(trackWetness, 0.0, 1.0);
  const double tempDelta = ambientTempC - 26.0;

  if (wetTyres) {
    const double dryPenalty = wet < 0.2 ? 0.78 : 1.0;
    const double wetBonus = 0.95 + wet * 0.25;
    return dryPenalty * wetBonus;
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

  switch (compound) {
  case ETireCompound::Soft:
    return std::clamp(1.04 - std::abs(tempDelta) * 0.012, 0.88, 1.06);
  case ETireCompound::Medium:
    return std::clamp(1.0 - std::abs(tempDelta) * 0.008, 0.9, 1.02);
  default:
    return std::clamp(0.93 + ambientTempC * 0.002, 0.88, 1.0);
  }
}

double WeatherTireGripScale(const WeatherState &weather, ETireCompound compound,
                            bool wetTyres) {
  const double crossover =
      CompoundCrossoverGrip(compound, wetTyres, weather.trackWetness,
                            weather.ambientTempC);
  const double wetPenalty = 1.0 - weather.trackWetness * 0.22;
  const double tempPenalty =
      weather.ambientTempC > 34.0
          ? 1.0 - std::min(0.1, (weather.ambientTempC - 34.0) * 0.005)
          : 1.0;
  return crossover * wetPenalty * tempPenalty * weather.trackGripEvolution;
}
