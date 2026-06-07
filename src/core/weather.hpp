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
  /** Air / ambient temperature (°C). */
  double ambientTempC = 22.0;
  /** Asphalt surface temperature (°C). */
  double trackTempC = 22.0;
  double rainIntensity = 0.0;
  double trackGripEvolution = 1.0;
  double windSpeedMs = 3.0;
  /** Wind direction in degrees (0 = north, 90 = east). */
  double windDirectionDeg = 270.0;
  /** Horizontal visibility (km). */
  double visibilityKm = 10.0;
  WeatherPhase phase = WeatherPhase::Dry;
  double forecastRainInSeconds = -1.0;
  /** Sim time when the active shower should end; -1 if none. */
  double rainEpisodeEndTime = -1.0;
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
  double baseWindSpeedMs = 4.0;
  double baseVisibilityKm = 10.0;
  /** Dry-sun offset: track runs this many °C above air at equilibrium. */
  double trackSolarGainC = 10.0;
};

struct WeatherForecastStep {
  double offsetMinutes = 0.0;
  WeatherPhase phase = WeatherPhase::Dry;
  double trackWetness = 0.0;
  double rainIntensity = 0.0;
  double ambientTempC = 22.0;
  double trackTempC = 22.0;
  double windSpeedMs = 3.0;
  double windDirectionDeg = 270.0;
  double visibilityKm = 10.0;
};

WeatherProfile WeatherProfileForId(const std::string &profileId);

void InitWeatherState(WeatherState &weather, const std::string &profileId,
                      double configuredWetness, double configuredTempC);

void InitWeatherStateFromProfile(WeatherState &weather,
                                 const WeatherProfile &profile,
                                 const std::string &profileId,
                                 double configuredWetness, double configuredTempC,
                                 std::mt19937 *rng = nullptr);

void TickWeatherState(WeatherState &weather, const WeatherProfile &profile,
                      double elapsedRaceTime, double deltaTime,
                      std::mt19937 &rng);

void AdvanceWeatherDeterministic(WeatherState &weather,
                                 const WeatherProfile &profile,
                                 double elapsedRaceTime, double deltaTime);

std::vector<WeatherForecastStep>
BuildWeatherForecast(const WeatherState &start, const WeatherProfile &profile,
                     double elapsedRaceTime, int steps = 12,
                     double stepMinutes = 10.0);

const char *WeatherPhaseName(WeatherPhase phase);

double CompoundCrossoverGrip(ETireCompound compound, ETyreTread tread,
                             double trackWetness, double ambientTempC,
                             double trackTempC = 22.0);

double WeatherTireGripScale(const WeatherState &weather, ETireCompound compound,
                            ETyreTread tread);

#endif
