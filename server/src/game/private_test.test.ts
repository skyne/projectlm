import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeJointTestingPartners,
  agreementPartnerTeams,
  canStartPrivateTest,
  clampPrivateTestDurationHours,
  consolidateJointTestingAgreements,
  fulfillJointTestingAgreement,
  isRaceWeekendInProgress,
  jointTestSessionPlan,
  pendingJointTestingBundles,
  pendingJointTestingPartnerGroups,
  pickJointAgreementForGroupAndTrack,
  resolveTestHoursPerDay,
  validateJointTestingSelection,
  validatePrivateTestPayload,
} from "./private_test";
import type { CarBuildPayload, MetaStatePayload } from "../ws_protocol";

const minimalBuild = {
  carName: "Car 7",
  chassis_type: "lmp2",
  front_aero_type: "lmp2_front",
  rear_aero_type: "lmp2_rear",
  cooling_pack: "lmp2_cooling",
  wheel_package: "lmp2_wheels",
  suspension_layout: "lmp2_suspension",
  fuel_system: "lmp2_fuel",
  brake_system: "lmp2_brakes",
  transmission: "lmp2_gearbox",
  hybrid_system: "none",
} as CarBuildPayload;

function baseMeta(overrides: Partial<MetaStatePayload> = {}): MetaStatePayload {
  return {
    teamName: "Test Team",
    budget: 1_000_000,
    rdPoints: 0,
    playerEntryId: "entry-1",
    staff: [],
    sponsors: [],
    unlockedParts: [],
    calendar: [
      {
        round: 1,
        trackId: "spa",
        format: "6h",
        eventType: "race",
        completed: false,
        championshipPoints: 0,
      },
    ],
    currentRound: 1,
    setupComplete: true,
    fleet: [
      {
        id: "car-1",
        carNumber: "7",
        classId: "Hypercar",
        carConfigPath: "configs/car.txt",
        affiliation: "privateer",
        acquisition: "privateer",
        assignedDriverIds: ["d1"],
        build: minimalBuild,
      },
    ],
    driverRoster: [
      {
        id: "d1",
        name: "Driver One",
        nationality: "GB",
        tier: "Gold",
        dryPace: 80,
        wetPace: 78,
        consistency: 80,
        overtaking: 76,
        defending: 76,
        trafficManagement: 76,
        rollingStart: 74,
        standingStart: 74,
        setupFeedback: 70,
        tireManagement: 76,
        fuelSaving: 74,
        composure: 78,
        nightPace: 74,
        rainRadar: 70,
        stamina: 78,
        maxStintHours: 2.5,
      },
    ],
    seasonYear: 2026,
    ...overrides,
  };
}

describe("private_test", () => {
  it("clamps duration hours", () => {
    assert.equal(clampPrivateTestDurationHours(0.2), 1);
    assert.equal(clampPrivateTestDurationHours(4.6), 5);
    assert.equal(clampPrivateTestDurationHours(100), 72);
  });

  it("blocks during active race weekend", () => {
    const meta = baseMeta({
      weekendProgress: { round: 1, completedSessions: ["practice"] },
    });
    assert.equal(isRaceWeekendInProgress(meta), true);
    assert.equal(canStartPrivateTest(meta), false);
  });

  it("allows private test before weekend starts", () => {
    const meta = baseMeta();
    assert.equal(canStartPrivateTest(meta), true);
  });

  it("validates solo payload", () => {
    const meta = baseMeta();
    const result = validatePrivateTestPayload(meta, {
      trackId: "spa",
      carIds: ["car-1"],
      driverAssignments: { "car-1": ["d1"] },
      durationHours: 4,
    });
    assert.ok("payload" in result);
    if ("payload" in result) {
      assert.equal(result.payload.durationHours, 4);
    }
  });

  it("dedupes legacy rows when a bundled agreement already exists", () => {
    const consolidated = consolidateJointTestingAgreements([
      {
        id: "agr-neg-inter-joint_testing-peugeot-totalenergies-team-wrt-bundle-2",
        kind: "joint_testing",
        partnerTeam: "Peugeot TotalEnergies",
        partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
        signedRound: 2,
        expiresAtRound: 8,
        terms: {
          agreementSubtype: "joint_testing",
          partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
          sharedTrackId: "cota",
          testDays: 2,
        },
      },
      {
        id: "agr-neg-inter-joint_testing-peugeot-totalenergies-team-wrt-peugeot-totalenergies",
        kind: "joint_testing",
        partnerTeam: "Peugeot TotalEnergies",
        signedRound: 2,
        expiresAtRound: 8,
        terms: {
          agreementSubtype: "joint_testing",
          sharedTrackId: "cota",
          testDays: 2,
        },
      },
      {
        id: "agr-neg-inter-joint_testing-peugeot-totalenergies-team-wrt-team-wrt",
        kind: "joint_testing",
        partnerTeam: "Team WRT",
        signedRound: 2,
        expiresAtRound: 8,
        terms: {
          agreementSubtype: "joint_testing",
          sharedTrackId: "cota",
          testDays: 2,
        },
      },
    ]);

    assert.equal(consolidated.length, 1);
    assert.equal(
      consolidated[0]?.id,
      "agr-neg-inter-joint_testing-peugeot-totalenergies-team-wrt-bundle-2",
    );
  });

  it("consolidates legacy per-team rows into bundled agreements", () => {
    const consolidated = consolidateJointTestingAgreements([
      {
        id: "agr-neg-inter-joint_testing-peugeot-totalenergies-team-wrt-peugeot-totalenergies",
        kind: "joint_testing",
        partnerTeam: "Peugeot TotalEnergies",
        signedRound: 2,
        expiresAtRound: 8,
        terms: {
          agreementSubtype: "joint_testing",
          sharedTrackId: "cota",
          testDays: 2,
        },
      },
      {
        id: "agr-neg-inter-joint_testing-peugeot-totalenergies-team-wrt-team-wrt",
        kind: "joint_testing",
        partnerTeam: "Team WRT",
        signedRound: 2,
        expiresAtRound: 8,
        terms: {
          agreementSubtype: "joint_testing",
          sharedTrackId: "cota",
          testDays: 2,
        },
      },
    ]);

    assert.equal(consolidated.length, 1);
    assert.deepEqual(agreementPartnerTeams(consolidated[0]!), [
      "Peugeot TotalEnergies",
      "Team WRT",
    ]);
  });

  it("requires the full partner set for bundled agreements", () => {
    const meta = baseMeta({
      activeAgreements: [
        {
          id: "agr-bundle-1",
          kind: "joint_testing",
          partnerTeam: "Peugeot TotalEnergies",
          partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
          signedRound: 2,
          expiresAtRound: 8,
          terms: {
            agreementSubtype: "joint_testing",
            partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
            sharedTrackId: "cota",
            testDays: 2,
          },
        },
      ],
    });

    assert.equal(
      validateJointTestingSelection(meta, "agr-bundle-1", ["Peugeot TotalEnergies"]),
      "This agreement requires all partners together: Peugeot TotalEnergies + Team WRT",
    );

    const ok = validatePrivateTestPayload(meta, {
      trackId: "cota",
      carIds: ["car-1"],
      driverAssignments: { "car-1": ["d1"] },
      durationHours: 16,
      jointAgreementId: "agr-bundle-1",
    });
    assert.ok("payload" in ok);
    if ("payload" in ok) {
      assert.deepEqual(ok.payload.jointPartnerTeams, [
        "Peugeot TotalEnergies",
        "Team WRT",
      ]);
    }

    const wrongTrack = validatePrivateTestPayload(meta, {
      trackId: "spa",
      carIds: ["car-1"],
      driverAssignments: { "car-1": ["d1"] },
      durationHours: 16,
      jointAgreementId: "agr-bundle-1",
    });
    assert.ok("error" in wrongTrack);
    if ("error" in wrongTrack) {
      assert.match(wrongTrack.error, /contract is for/i);
    }

    const correctedDuration = validatePrivateTestPayload(meta, {
      trackId: "cota",
      carIds: ["car-1"],
      driverAssignments: { "car-1": ["d1"] },
      durationHours: 8,
      jointAgreementId: "agr-bundle-1",
    });
    assert.ok("payload" in correctedDuration);
    if ("payload" in correctedDuration) {
      assert.equal(correctedDuration.payload.durationHours, 48);
    }
  });

  it("defaults legacy agreements to 24 h per day", () => {
    assert.equal(resolveTestHoursPerDay({}), 24);
    const plan = jointTestSessionPlan({
      id: "agr-legacy",
      kind: "joint_testing",
      partnerTeam: "Team A",
      signedRound: 1,
      expiresAtRound: 8,
      terms: { testDays: 2 },
    });
    assert.equal(plan.mode, "continuous");
    assert.equal(plan.sessions.length, 1);
    assert.equal(plan.sessions[0]?.durationHours, 48);
  });

  it("builds per-day session plans when hours per day are below 24", () => {
    const plan = jointTestSessionPlan({
      id: "agr-partial",
      kind: "joint_testing",
      partnerTeam: "Team A",
      signedRound: 1,
      expiresAtRound: 8,
      terms: { testDays: 2, testHoursPerDay: 8 },
    });
    assert.equal(plan.mode, "per_day");
    assert.equal(plan.sessions.length, 2);
    assert.deepEqual(
      plan.sessions.map((slot) => slot.durationHours),
      [8, 8],
    );
  });

  it("groups pending bundles with the same partners", () => {
    const meta = baseMeta({
      activeAgreements: [
        {
          id: "agr-bundle-a",
          kind: "joint_testing",
          partnerTeam: "Peugeot TotalEnergies",
          partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
          signedRound: 0,
          expiresAtRound: 8,
          terms: {
            agreementSubtype: "joint_testing",
            partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
            sharedTrackId: "cota",
            testDays: 2,
          },
        },
        {
          id: "agr-bundle-b",
          kind: "joint_testing",
          partnerTeam: "Peugeot TotalEnergies",
          partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
          signedRound: 0,
          expiresAtRound: 10,
          terms: {
            agreementSubtype: "joint_testing",
            partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
            sharedTrackId: "cota",
            testDays: 2,
          },
        },
      ],
    });

    const groups = pendingJointTestingPartnerGroups(meta);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.agreements.length, 2);
    assert.equal(
      pickJointAgreementForGroupAndTrack(groups[0]!, "cota")?.id,
      "agr-bundle-a",
    );
  });

  it("fulfills one bundled agreement per joint session", () => {
    const agreements = [
      {
        id: "agr-bundle-a",
        kind: "joint_testing" as const,
        partnerTeam: "Peugeot TotalEnergies",
        partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
        signedRound: 2,
        expiresAtRound: 8,
        terms: {
          agreementSubtype: "joint_testing" as const,
          partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
          testDays: 2,
        },
      },
      {
        id: "agr-bundle-b",
        kind: "joint_testing" as const,
        partnerTeam: "Peugeot TotalEnergies",
        partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
        signedRound: 4,
        expiresAtRound: 10,
        terms: {
          agreementSubtype: "joint_testing" as const,
          partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
          testDays: 2,
        },
      },
    ];
    const meta = baseMeta({ activeAgreements: agreements, currentRound: 3 });
    assert.equal(pendingJointTestingBundles(meta).length, 2);

    const after = fulfillJointTestingAgreement(agreements, "agr-bundle-a", 3);
    const metaAfter = baseMeta({ activeAgreements: after, currentRound: 3 });
    assert.equal(pendingJointTestingBundles(metaAfter).length, 1);
    assert.equal(pendingJointTestingBundles(metaAfter)[0]?.id, "agr-bundle-b");
    assert.deepEqual(activeJointTestingPartners(metaAfter), [
      "Peugeot TotalEnergies",
      "Team WRT",
    ]);
  });
});
