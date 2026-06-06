import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CarBuildPayload } from "../ws_protocol";
import type { FleetCarPayload, MetaStatePayload } from "../ws_protocol";
import {
  defaultTrackPreset,
  mergeBuildWithTrackPreset,
  resolveCarTrackPreset,
  resolveTrackPreset,
  validateTrackPreset,
} from "./weekend_setup";

const baseBuild = (): CarBuildPayload => ({
  carName: "Test",
  chassis_type: "MonocoqueHypercar",
  front_aero_type: "HypercarFrontWing",
  rear_aero_type: "HypercarRearWing",
  cooling_pack: "HypercarCooling",
  wheel_package: "HypercarWheels",
  suspension_layout: "DoubleWishboneHypercar",
  fuel_system: "HypercarFuel",
  brake_system: "CarbonCeramic",
  transmission: "HypercarGearbox",
  hybrid_system: "HypercarHybrid",
  front_ride_height_mm: 40,
  rear_ride_height_mm: 42,
});

describe("weekend_setup", () => {
  it("defaultTrackPreset includes track notes for Le Mans", () => {
    const preset = defaultTrackPreset("lemans_la_sarthe");
    assert.equal(preset.trackId, "lemans_la_sarthe");
    assert.ok(preset.notes?.includes("Mulsanne"));
    assert.equal(preset.wingBaseline, -0.05);
  });

  it("mergeBuildWithTrackPreset overlays weekend sheet onto garage build", () => {
    const merged = mergeBuildWithTrackPreset(baseBuild(), {
      trackId: "spa",
      wingBaseline: 0.05,
      frontRideHeightMm: 36,
      frontCamberDeg: -2.8,
    });
    assert.equal(merged.starting_wing_delta, 0.05);
    assert.equal(merged.front_ride_height_mm, 36);
    assert.equal(merged.front_camber_deg, -2.8);
    assert.equal(merged.rear_ride_height_mm, 42);
  });

  it("resolveTrackPreset merges saved preset over defaults", () => {
    const resolved = resolveTrackPreset("monza", {
      trackId: "monza",
      wingBaseline: -0.04,
    });
    assert.equal(resolved.wingBaseline, -0.04);
    assert.ok(resolved.notes?.includes("drag"));
  });

  it("resolveCarTrackPreset prefers per-car preset over legacy meta preset", () => {
    const car: FleetCarPayload = {
      id: "car-1",
      carNumber: "7",
      classId: "Hypercar",
      affiliation: "manufacturer",
      acquisition: "build",
      build: baseBuild(),
      carConfigPath: "configs/runtime/fleet/car_7.txt",
      trackSetupPresets: {
        spa: { trackId: "spa", wingBaseline: -0.02 },
      },
    };
    const meta = {
      trackSetupPresets: { spa: { trackId: "spa", wingBaseline: 0.08 } },
    } as unknown as MetaStatePayload;
    const resolved = resolveCarTrackPreset(car, "spa", meta);
    assert.equal(resolved.wingBaseline, -0.02);
  });

  it("validateTrackPreset rejects out-of-range values", () => {
    assert.equal(
      validateTrackPreset({ trackId: "x", wingBaseline: 0.2 }),
      "Wing baseline must be within ±0.12",
    );
    assert.equal(
      validateTrackPreset({ trackId: "x", finalDriveRatio: 5 }),
      "Final drive must be 3.0–4.2",
    );
    assert.equal(validateTrackPreset({ trackId: "x", wingBaseline: -0.05 }), null);
  });
});
