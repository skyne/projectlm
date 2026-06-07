#include "weather.hpp"
#include <catch_amalgamated.hpp>
#include <random>

TEST_CASE("CompoundCrossoverGrip favors wet tyres on a wet track", "[unit][weather]") {
  const double wetGrip =
      CompoundCrossoverGrip(ETireCompound::Medium, ETyreTread::Wet, 0.6, 18.0);
  const double dryGrip =
      CompoundCrossoverGrip(ETireCompound::Medium, ETyreTread::Slick, 0.6, 18.0);
  REQUIRE(wetGrip > dryGrip);
}

TEST_CASE("CompoundCrossoverGrip favors slicks on a dry track", "[unit][weather]") {
  const double slickGrip =
      CompoundCrossoverGrip(ETireCompound::Soft, ETyreTread::Slick, 0.05, 24.0);
  const double wetTyreGrip =
      CompoundCrossoverGrip(ETireCompound::Soft, ETyreTread::Wet, 0.05, 24.0);
  REQUIRE(slickGrip > wetTyreGrip);
}

TEST_CASE("CompoundCrossoverGrip peaks intermediate in damp conditions",
          "[unit][weather]") {
  const double interGrip =
      CompoundCrossoverGrip(ETireCompound::Medium, ETyreTread::Intermediate, 0.3,
                            20.0);
  const double slickGrip =
      CompoundCrossoverGrip(ETireCompound::Medium, ETyreTread::Slick, 0.3, 20.0);
  const double wetGrip =
      CompoundCrossoverGrip(ETireCompound::Medium, ETyreTread::Wet, 0.3, 20.0);
  REQUIRE(interGrip > slickGrip);
  REQUIRE(interGrip > wetGrip);
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

TEST_CASE("Rain episode ends and drying phase is preserved", "[unit][weather]") {
  WeatherState weather;
  InitWeatherState(weather, "changeable", 0.05, 21.0);
  weather.phase = WeatherPhase::LightRain;
  weather.rainIntensity = 0.45;
  weather.trackWetness = 0.35;
  weather.rainEpisodeEndTime = 100.0;
  const WeatherProfile profile = WeatherProfileForId("changeable");

  AdvanceWeatherDeterministic(weather, profile, 120.0, 20.0);

  REQUIRE(weather.phase == WeatherPhase::Drying);
  REQUIRE(weather.rainEpisodeEndTime < 0.0);
}

TEST_CASE("Dry phase track temp exceeds air temp", "[unit][weather]") {
  WeatherState weather;
  InitWeatherState(weather, "hot_dry", 0.0, 32.0);
  const WeatherProfile profile = WeatherProfileForId("hot_dry");

  for (int i = 0; i < 360; ++i)
    AdvanceWeatherDeterministic(weather, profile, i * 10.0, 10.0);

  REQUIRE(weather.trackTempC > weather.ambientTempC);
  REQUIRE(weather.visibilityKm >= 8.0);
}

TEST_CASE("CompoundCrossoverGrip favors warm track on dry slicks",
          "[unit][weather]") {
  const double warm =
      CompoundCrossoverGrip(ETireCompound::Medium, ETyreTread::Slick, 0.05,
                            24.0, 42.0);
  const double cold =
      CompoundCrossoverGrip(ETireCompound::Medium, ETyreTread::Slick, 0.05,
                            24.0, 10.0);
  REQUIRE(warm > cold);
}

TEST_CASE("Heavy rain reduces visibility", "[unit][weather]") {
  WeatherState weather;
  InitWeatherState(weather, "wet", 0.4, 16.0);
  weather.phase = WeatherPhase::HeavyRain;
  weather.rainIntensity = 0.85;
  const WeatherProfile profile = WeatherProfileForId("wet");
  const double visBefore = weather.visibilityKm;

  AdvanceWeatherDeterministic(weather, profile, 600.0, 600.0);

  REQUIRE(weather.visibilityKm < visBefore);
}
