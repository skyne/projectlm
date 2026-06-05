#include "car_parts.hpp"
#include "config_loader.hpp"
#include "part_compatibility.hpp"
#include "../helpers/paths.hpp"
#include <catch_amalgamated.hpp>

TEST_CASE("ValidatePartCompatibility accepts default hypercar build",
          "[unit][compat]") {
  PartCatalog catalog;
  AssemblyConfig assembly;
  CarConfig car;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));
  REQUIRE(LoadAssemblyConfig(ConfigPath("physics_config.txt"), assembly));
  REQUIRE(LoadCarConfig(ConfigPath("car_config.txt"), car));

  const auto rules = LoadPartCompatibility(ConfigPath("part_compatibility.txt"));
  REQUIRE_FALSE(rules.empty());
  REQUIRE(ValidatePartCompatibility(car, rules));
}

TEST_CASE("WinglessGroundEffect requires LowDragNose front",
          "[unit][compat]") {
  CarConfig car;
  car.rearAeroChoice = ERearAero::WinglessGroundEffect;
  car.frontAeroChoice = EFrontAero::HighDownforceSplitter;

  CompatibilityRule rule;
  rule.ifSlot = "rear_aero";
  rule.ifPart = "WinglessGroundEffect";
  rule.kind = CompatibilityRule::Kind::Requires;
  rule.otherSlot = "front_aero";
  rule.otherPart = "LowDragNose";

  std::string error;
  REQUIRE_FALSE(ValidatePartCompatibility(car, {rule}, &error));
  REQUIRE(error.find("LowDragNose") != std::string::npos);
}

TEST_CASE("CarbonCeramic brakes require CarbonMonocoque chassis",
          "[unit][compat]") {
  CarConfig car;
  car.brakeSystemChoice = EBrakeSystem::CarbonCeramic;
  car.chassisChoice = EChassis::Spaceframe;

  const auto rules = LoadPartCompatibility(ConfigPath("part_compatibility.txt"));
  std::string error;
  REQUIRE_FALSE(ValidatePartCompatibility(car, rules, &error));
  REQUIRE(error.find("CarbonMonocoque") != std::string::npos);
}

TEST_CASE("GetAttachmentPoint returns catalog socket ids", "[unit][compat]") {
  PartCatalog catalog;
  REQUIRE(LoadPartCatalog(ConfigPath("part_catalog.txt"), catalog));

  REQUIRE(GetAttachmentPoint(catalog, "chassis", "CarbonMonocoque") ==
          "chassis.mount.base");
  REQUIRE(GetAttachmentPoint(catalog, "rear_aero", "WinglessGroundEffect") ==
          "chassis.mount.rear_floor");
}
