#include "pit_stop.hpp"
#include "commands.hpp"
#include "part_damage.hpp"
#include "simulation.hpp"
#include <catch_amalgamated.hpp>

namespace {

PitStopState QueuedPit() {
  PitStopState pit;
  pit.pendingEnter = true;
  return pit;
}

} // namespace

TEST_CASE("ShouldEnterPitLane only at start-finish or lap end", "[unit][pit_stop]") {
  const PitStopState pit = QueuedPit();

  REQUIRE_FALSE(ShouldEnterPitLane(pit, 0.5, false, 5, 0.985, false));
  REQUIRE(ShouldEnterPitLane(pit, 0.99, false, 5, 0.985, false));
  REQUIRE(ShouldEnterPitLane(pit, 0.01, false, 5, 0.985, false));
  REQUIRE(ShouldEnterPitLane(pit, 0.5, true, 5, 0.985, false));
}

TEST_CASE("ShouldEnterPitLane blocks opening-lap mid-track entry", "[unit][pit_stop]") {
  const PitStopState pit = QueuedPit();
  REQUIRE_FALSE(ShouldEnterPitLane(pit, 0.99, false, 1, 0.985, false));
  REQUIRE(ShouldEnterPitLane(pit, 0.0, true, 1, 0.985, false));
}

TEST_CASE("ShouldEnterPitLane blocks mid-track entry under red flag",
          "[unit][pit_stop]") {
  const PitStopState pit = QueuedPit();
  REQUIRE_FALSE(ShouldEnterPitLane(pit, 0.5, false, 5, 0.985, true));
  REQUIRE(ShouldEnterPitLane(pit, 0.99, false, 5, 0.985, true));
}

TEST_CASE("SanitizeRedFlagEmergencyPlan keeps deflated tyre only",
          "[unit][pit_stop]") {
  CarConfig car;
  car.fuelTankCapacity = 100.0;
  SimulationState state;
  InitPartDamageState(state.partDamage);
  state.fuelRemaining = 80.0;
  ApplyTyrePuncture(state, 0, true);
  CarRaceControlState rc;

  PitStopPlan plan;
  plan.fuelLiters = 40.0;
  plan.tiresToChange = {"FL", "FR", "RL", "RR"};
  plan.changeDriver = true;
  SanitizeRedFlagEmergencyPlan(plan, car, state, rc);

  REQUIRE(plan.fuelLiters == 0.0);
  REQUIRE(plan.tiresToChange.size() == 1);
  REQUIRE(plan.tiresToChange.front() == "FL");
  REQUIRE_FALSE(plan.changeDriver);
}

TEST_CASE("SanitizeRedFlagEmergencyPlan allows low fuel top-up",
          "[unit][pit_stop]") {
  CarConfig car;
  car.fuelTankCapacity = 100.0;
  SimulationState state;
  InitPartDamageState(state.partDamage);
  state.fuelRemaining = 10.0;
  CarRaceControlState rc;

  PitStopPlan plan;
  plan.fuelLiters = 90.0;
  SanitizeRedFlagEmergencyPlan(plan, car, state, rc);

  REQUIRE(plan.fuelLiters == 15.0);
}

TEST_CASE("ParseSimCommand accepts pit rebuild flag", "[unit][pit_stop]") {
  const SimCommand cmd =
      ParseSimCommand("pit|fuel=40|compound=medium|tires=FL,FR|rebuild=true");
  REQUIRE(cmd.type == SimCommandType::PitRequest);
  REQUIRE(cmd.pit.garageRebuild);
}

TEST_CASE("PitPlanHasActiveService treats garage rebuild as active work",
          "[unit][pit_stop]") {
  PitStopPlan plan;
  plan.garageRebuild = true;
  REQUIRE(PitPlanHasActiveService(plan));
}

TEST_CASE("SanitizeRedFlagEmergencyPlan strips garage rebuild",
          "[unit][pit_stop]") {
  CarConfig car;
  SimulationState state;
  InitPartDamageState(state.partDamage);
  CarRaceControlState rc;

  PitStopPlan plan;
  plan.garageRebuild = true;
  SanitizeRedFlagEmergencyPlan(plan, car, state, rc);
  REQUIRE_FALSE(plan.garageRebuild);
}
