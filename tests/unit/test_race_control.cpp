#include <catch_amalgamated.hpp>
#include "race.hpp"
#include "race_control.hpp"

TEST_CASE("FCY flag phase sync", "[unit][race_control]") {
  SessionRaceControl rc;
  rc.flagPhase = FlagPhase::FCY;
  SyncRaceControlFlags(rc);
  REQUIRE(rc.fcyActive);
  REQUIRE_FALSE(rc.scActive);
}

TEST_CASE("SC flag phase sync", "[unit][race_control]") {
  SessionRaceControl rc;
  rc.flagPhase = FlagPhase::SC;
  SyncRaceControlFlags(rc);
  REQUIRE(rc.scActive);
  REQUIRE_FALSE(rc.fcyActive);
}

TEST_CASE("Slow zone does not activate FCY or SC booleans", "[unit][race_control]") {
  SessionRaceControl rc;
  rc.flagPhase = FlagPhase::SlowZone;
  SyncRaceControlFlags(rc);
  REQUIRE_FALSE(rc.fcyActive);
  REQUIRE_FALSE(rc.scActive);
}

TEST_CASE("Race control name helpers round-trip key states", "[unit][race_control]") {
  REQUIRE(std::string(FlagPhaseName(FlagPhase::FCY)) == "fcy");
  REQUIRE(std::string(TrackStatusName(TrackStatus::Stranded)) == "stranded");
  REQUIRE(std::string(PendingPenaltyName(PendingPenalty::DriveThrough)) ==
          "drive_through");
  REQUIRE(std::string(HazardKindName(HazardKind::Oil)) == "oil");
}
