import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MetaStatePayload } from "../ws_protocol";
import { migrateLegacyMeta } from "./fleet";
import { normalizeSetupState } from "../meta_state";

function base(partial: Partial<MetaStatePayload>): MetaStatePayload {
  return {
    teamName: "Test",
    budget: 500_000_000,
    rdPoints: 100,
    playerEntryId: "entry-1",
    seasonYear: 2026,
    currentRound: 0,
    staff: [],
    unlockedParts: [],
    calendar: [],
    setupComplete: false,
    fleet: [],
    activeCarId: "",
    driverRoster: [],
    ...partial,
  };
}

describe("migrateLegacyMeta", () => {
  it("does not fabricate a car when setup is incomplete", () => {
    const migrated = migrateLegacyMeta(
      base({
        setupComplete: false,
        carBuild: {
          carName: "Ghost Car",
          chassis_type: "LMDhDallara",
          front_aero_type: "LowDragNose",
          rear_aero_type: "StandardWing",
          cooling_pack: "EnduranceHeavyDuty",
          wheel_package: "Hypercar18",
          suspension_layout: "LMDhDoubleWishbone",
          fuel_system: "LeMans110L",
          brake_system: "BremboHypercar",
          transmission: "XtracP1359",
          hybrid_system: "LMDh50kW",
        },
      }),
    );

    assert.equal(migrated.fleet?.length ?? 0, 0);
    assert.equal(migrated.setupComplete, false);
  });

  it("repairs saves marked complete without core career data", () => {
    const repaired = normalizeSetupState(
      base({
        setupComplete: true,
        fleet: [
          {
            id: "car-1",
            carNumber: "1",
            classId: "Hypercar",
            affiliation: "manufacturer",
            acquisition: "build",
            build: {
              carName: "Solo Car",
              chassis_type: "LMDhDallara",
              front_aero_type: "LowDragNose",
              rear_aero_type: "StandardWing",
              cooling_pack: "EnduranceHeavyDuty",
              wheel_package: "Hypercar18",
              suspension_layout: "LMDhDoubleWishbone",
              fuel_system: "LeMans110L",
              brake_system: "BremboHypercar",
              transmission: "XtracP1359",
              hybrid_system: "LMDh50kW",
            },
            carConfigPath: "configs/runtime/fleet/car-1.txt",
          },
        ],
        activeCarId: "car-1",
        driverRoster: [],
      }),
    );

    assert.equal(repaired.setupComplete, false);
    assert.equal(repaired.fleet?.length ?? 0, 0);
  });
});
