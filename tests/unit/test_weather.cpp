#include "weather.hpp"
#include <catch_amalgamated.hpp>
#include <random>

TEST_CASE("CompoundCrossoverGrip favors wet tyres on a wet track", "[unit][weather]") {
  const double wetGrip =
      CompoundCrossoverGrip(ETireCompound::Medium, true, 0.6, 18.0);
  const double dryGrip =
      CompoundCrossoverGrip(ETireCompound::Medium, false, 0.6, 18.0);
  REQUIRE(wetGrip > dryGrip);
}

TEST_CASE("CompoundCrossoverGrip favors slicks on a dry track", "[unit][weather]") {
  const double slickGrip =
      CompoundCrossoverGrip(ETireCompound::Soft, false, 0.05, 24.0);
  const double wetTyreGrip =
      CompoundCrossoverGrip(ETireCompound::Soft, true, 0.05, 24.0);
  REQUIRE(slickGrip > wetTyreGrip);
}

TEST_CASE("TickWeatherState can build wetness under changeable profile",
          "[unit][weather]") {
  WeatherState weather;
  InitWeatherState(weather, "changeable", 0.05, 21.0);
  weather.phase = WeatherPhase::LightRain;
  weather.rainIntensity = 0.35;
  const WeatherProfile profile = WeatherProfileForId("changeable");
  std::mt19937 rng(4242);

  for (int i = 0; i < 6000; ++i)
    TickWeatherState(weather, profile, i * 0.1, 0.1, rng);

  REQUIRE(weather.trackWetness > 0.15);
  REQUIRE(weather.trackGripEvolution > 1.0);
}

TEST_CASE("Scheduled rain starts when forecast countdown reaches zero",
          "[unit][weather]") {
  WeatherState weather;
  InitWeatherState(weather, "changeable", 0.05, 21.0);
  weather.phase = WeatherPhase::Dry;
  weather.forecastRainInSeconds = 600.0;
  const WeatherProfile profile = WeatherProfileForId("changeable");

  AdvanceWeatherDeterministic(weather, profile, 600.0, 600.0);

  REQUIRE((weather.phase == WeatherPhase::LightRain ||
           weather.phase == WeatherPhase::HeavyRain));
  REQUIRE(weather.rainIntensity >= 0.2);
  REQUIRE(weather.forecastRainInSeconds < 0.0);
}

TEST_CASE("BuildWeatherForecast shows rain at scheduled offset",
          "[unit][weather]") {
  WeatherState weather;
  InitWeatherState(weather, "changeable", 0.05, 21.0);
  weather.phase = WeatherPhase::Dry;
  weather.forecastRainInSeconds = 600.0;
  const WeatherProfile profile = WeatherProfileForId("changeable");

  const std::vector<WeatherForecastStep> forecast =
      BuildWeatherForecast(weather, profile, 0.0, 12, 10.0);

  REQUIRE(forecast.size() >= 2);
  REQUIRE(forecast[0].phase == WeatherPhase::Dry);
  REQUIRE((forecast[1].phase == WeatherPhase::LightRain ||
           forecast[1].phase == WeatherPhase::HeavyRain));
  REQUIRE(forecast[1].rainIntensity >= 0.2);
}

TEST_CASE("Changeable profile keeps base wetness eligible for forecast",
          "[unit][weather]") {
  WeatherState weather;
  InitWeatherState(weather, "changeable", 0.0, 21.0);
  const WeatherProfile profile = WeatherProfileForId("changeable");

  REQUIRE(weather.trackWetness == Catch::Approx(profile.baseWetness));
  REQUIRE(weather.trackWetness <= profile.baseWetness + 0.001);
}
