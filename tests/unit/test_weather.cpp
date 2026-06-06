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
  const WeatherProfile profile = WeatherProfileForId("changeable");
  std::mt19937 rng(4242);

  for (int i = 0; i < 36000; ++i)
    TickWeatherState(weather, profile, i * 0.1, 0.1, rng);

  REQUIRE(weather.trackWetness > 0.15);
  REQUIRE(weather.trackGripEvolution > 1.0);
}
