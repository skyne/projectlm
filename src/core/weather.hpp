#ifndef WEATHER_HPP
#define WEATHER_HPP

#include "car_parts.hpp"
#include <random>
#include <string>

enum class WeatherPhase {
  Dry,
  Cloudy,
  LightRain,
  HeavyRain,
  Drying
};

struct WeatherState {
  double trackWetness = 0.0;
  double ambientTempC = 22.0;
  double rainIntensity = 0.0;
  double trackGripEvolution = 1.0;
  WeatherPhase phase = WeatherPhase::Dry;
  double forecastRainInSeconds = -1.0;
  std::string profileId = "dry";
};

struct WeatherProfile {
  double baseTempC = 22.0;
  double tempDriftPerHour = -1.5;
  double baseWetness = 0.0;
  double rainChancePerHour = 0.0;
  double maxRainIntensity = 0.85;
  double wetRatePerSecond = 0.0015;
  double dryRatePerSecond = 0.00008;
};

WeatherProfile WeatherProfileForId(const std::string &profileId);

void InitWeatherState(WeatherState &weather, const std::string &profileId,
                      double configuredWetness, double configuredTempC);

void TickWeatherState(WeatherState &weather, const WeatherProfile &profile,
                      double elapsedRaceTime, double deltaTime,
                      std::mt19937 &rng);

const char *WeatherPhaseName(WeatherPhase phase);

double CompoundCrossoverGrip(ETireCompound compound, bool wetTyres,
                             double trackWetness, double ambientTempC);

double WeatherTireGripScale(const WeatherState &weather, ETireCompound compound,
                            bool wetTyres);

#endif
