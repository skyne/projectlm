#include <catch_amalgamated.hpp>
#include "../helpers/race_control_fixture.hpp"
#include "car_entity.hpp"
#include "race.hpp"
#include "telemetry.hpp"

namespace {

void TickCar(Car &car, RaceSession &session, double dt, double raceTime,
             TelemetryLog &telemetry) {
  car.tick(session.track, session.corridor, session.physics, dt, raceTime,
           &telemetry, nullptr, session.weather, false, 3600.0, false);
}

} // namespace

TEST_CASE("Frenet tick keeps lateral offset inside corridor bounds",
          "[unit][frenet]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  session.physics.useFrenetDynamics = true;
  Car &car = session.cars.front();
  TelemetryLog telemetry;
  car.state().currentDistance = 400.0;
  car.state().currentSpeed = 45.0;
  car.state().lateralOffsetM = 4.5;
  car.state().headingError = 0.12;

  for (int i = 0; i < 200; ++i)
    TickCar(car, session, 0.05, i * 0.05, telemetry);

  const double maxN =
      session.corridor.maxLateralN(car.state().currentDistance);
  REQUIRE(std::abs(car.state().lateralOffsetM) <= maxN + 0.01);
}

TEST_CASE("Frenet tick advances distance along lap", "[unit][frenet]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  session.physics.useFrenetDynamics = true;
  Car &car = session.cars.front();
  TelemetryLog telemetry;
  car.state().currentDistance = 100.0;
  car.state().currentSpeed = 55.0;
  car.state().lateralOffsetM = 0.0;
  car.state().headingError = 0.0;

  const double start = car.state().currentDistance;
  for (int i = 0; i < 40; ++i)
    TickCar(car, session, 0.1, i * 0.1, telemetry);

  REQUIRE(car.state().currentDistance > start + 1.0);
  REQUIRE(std::isfinite(car.state().currentDistance));
}

TEST_CASE("Frenet flag gates metre-state integration", "[unit][frenet]") {
  RaceSession session = MakeMinimalRaceSession();
  AddTestCar(session, "entry-1", "Team A");
  Car &car = session.cars.front();
  TelemetryLog telemetry;

  session.physics.useFrenetDynamics = false;
  car.state().lateralOffsetM = 0.0;
  car.state().currentSpeed = 40.0;
  TickCar(car, session, 0.1, 0.1, telemetry);
  REQUIRE(car.state().lateralOffsetM == Catch::Approx(0.0).margin(1e-6));

  session.physics.useFrenetDynamics = true;
  car.state().lateralOffsetM = 3.0;
  car.state().headingError = 0.05;
  TickCar(car, session, 0.1, 0.2, telemetry);
  REQUIRE(std::isfinite(car.state().lateralOffsetM));
  REQUIRE(std::isfinite(car.state().headingError));
}
