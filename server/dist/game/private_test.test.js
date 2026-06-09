"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const private_test_1 = require("./private_test");
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
};
function baseMeta(overrides = {}) {
    return {
        teamName: "Test Team",
        budget: 1000000,
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
(0, node_test_1.describe)("private_test", () => {
    (0, node_test_1.it)("clamps duration hours", () => {
        strict_1.default.equal((0, private_test_1.clampPrivateTestDurationHours)(0.2), 1);
        strict_1.default.equal((0, private_test_1.clampPrivateTestDurationHours)(4.6), 5);
        strict_1.default.equal((0, private_test_1.clampPrivateTestDurationHours)(100), 72);
    });
    (0, node_test_1.it)("blocks during active race weekend", () => {
        const meta = baseMeta({
            weekendProgress: { round: 1, completedSessions: ["practice"] },
        });
        strict_1.default.equal((0, private_test_1.isRaceWeekendInProgress)(meta), true);
        strict_1.default.equal((0, private_test_1.canStartPrivateTest)(meta), false);
    });
    (0, node_test_1.it)("allows private test before weekend starts", () => {
        const meta = baseMeta();
        strict_1.default.equal((0, private_test_1.canStartPrivateTest)(meta), true);
    });
    (0, node_test_1.it)("validates solo payload", () => {
        const meta = baseMeta();
        const result = (0, private_test_1.validatePrivateTestPayload)(meta, {
            trackId: "spa",
            carIds: ["car-1"],
            driverAssignments: { "car-1": ["d1"] },
            durationHours: 4,
        });
        strict_1.default.ok("payload" in result);
        if ("payload" in result) {
            strict_1.default.equal(result.payload.durationHours, 4);
        }
    });
    (0, node_test_1.it)("dedupes legacy rows when a bundled agreement already exists", () => {
        const consolidated = (0, private_test_1.consolidateJointTestingAgreements)([
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
        strict_1.default.equal(consolidated.length, 1);
        strict_1.default.equal(consolidated[0]?.id, "agr-neg-inter-joint_testing-peugeot-totalenergies-team-wrt-bundle-2");
    });
    (0, node_test_1.it)("consolidates legacy per-team rows into bundled agreements", () => {
        const consolidated = (0, private_test_1.consolidateJointTestingAgreements)([
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
        strict_1.default.equal(consolidated.length, 1);
        strict_1.default.deepEqual((0, private_test_1.agreementPartnerTeams)(consolidated[0]), [
            "Peugeot TotalEnergies",
            "Team WRT",
        ]);
    });
    (0, node_test_1.it)("requires the full partner set for bundled agreements", () => {
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
        strict_1.default.equal((0, private_test_1.validateJointTestingSelection)(meta, "agr-bundle-1", ["Peugeot TotalEnergies"]), "This agreement requires all partners together: Peugeot TotalEnergies + Team WRT");
        const ok = (0, private_test_1.validatePrivateTestPayload)(meta, {
            trackId: "cota",
            carIds: ["car-1"],
            driverAssignments: { "car-1": ["d1"] },
            durationHours: 16,
            jointAgreementId: "agr-bundle-1",
        });
        strict_1.default.ok("payload" in ok);
        if ("payload" in ok) {
            strict_1.default.deepEqual(ok.payload.jointPartnerTeams, [
                "Peugeot TotalEnergies",
                "Team WRT",
            ]);
        }
        const wrongTrack = (0, private_test_1.validatePrivateTestPayload)(meta, {
            trackId: "spa",
            carIds: ["car-1"],
            driverAssignments: { "car-1": ["d1"] },
            durationHours: 16,
            jointAgreementId: "agr-bundle-1",
        });
        strict_1.default.ok("error" in wrongTrack);
        if ("error" in wrongTrack) {
            strict_1.default.match(wrongTrack.error, /contract is for/i);
        }
        const correctedDuration = (0, private_test_1.validatePrivateTestPayload)(meta, {
            trackId: "cota",
            carIds: ["car-1"],
            driverAssignments: { "car-1": ["d1"] },
            durationHours: 8,
            jointAgreementId: "agr-bundle-1",
        });
        strict_1.default.ok("payload" in correctedDuration);
        if ("payload" in correctedDuration) {
            strict_1.default.equal(correctedDuration.payload.durationHours, 48);
        }
    });
    (0, node_test_1.it)("defaults legacy agreements to 24 h per day", () => {
        strict_1.default.equal((0, private_test_1.resolveTestHoursPerDay)({}), 24);
        const plan = (0, private_test_1.jointTestSessionPlan)({
            id: "agr-legacy",
            kind: "joint_testing",
            partnerTeam: "Team A",
            signedRound: 1,
            expiresAtRound: 8,
            terms: { testDays: 2 },
        });
        strict_1.default.equal(plan.mode, "continuous");
        strict_1.default.equal(plan.sessions.length, 1);
        strict_1.default.equal(plan.sessions[0]?.durationHours, 48);
    });
    (0, node_test_1.it)("builds per-day session plans when hours per day are below 24", () => {
        const plan = (0, private_test_1.jointTestSessionPlan)({
            id: "agr-partial",
            kind: "joint_testing",
            partnerTeam: "Team A",
            signedRound: 1,
            expiresAtRound: 8,
            terms: { testDays: 2, testHoursPerDay: 8 },
        });
        strict_1.default.equal(plan.mode, "per_day");
        strict_1.default.equal(plan.sessions.length, 2);
        strict_1.default.deepEqual(plan.sessions.map((slot) => slot.durationHours), [8, 8]);
    });
    (0, node_test_1.it)("groups pending bundles with the same partners", () => {
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
        const groups = (0, private_test_1.pendingJointTestingPartnerGroups)(meta);
        strict_1.default.equal(groups.length, 1);
        strict_1.default.equal(groups[0]?.agreements.length, 2);
        strict_1.default.equal((0, private_test_1.pickJointAgreementForGroupAndTrack)(groups[0], "cota")?.id, "agr-bundle-a");
    });
    (0, node_test_1.it)("fulfills one bundled agreement per joint session", () => {
        const agreements = [
            {
                id: "agr-bundle-a",
                kind: "joint_testing",
                partnerTeam: "Peugeot TotalEnergies",
                partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
                signedRound: 2,
                expiresAtRound: 8,
                terms: {
                    agreementSubtype: "joint_testing",
                    partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
                    testDays: 2,
                },
            },
            {
                id: "agr-bundle-b",
                kind: "joint_testing",
                partnerTeam: "Peugeot TotalEnergies",
                partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
                signedRound: 4,
                expiresAtRound: 10,
                terms: {
                    agreementSubtype: "joint_testing",
                    partnerTeams: ["Peugeot TotalEnergies", "Team WRT"],
                    testDays: 2,
                },
            },
        ];
        const meta = baseMeta({ activeAgreements: agreements, currentRound: 3 });
        strict_1.default.equal((0, private_test_1.pendingJointTestingBundles)(meta).length, 2);
        const after = (0, private_test_1.fulfillJointTestingAgreement)(agreements, "agr-bundle-a", 3);
        const metaAfter = baseMeta({ activeAgreements: after, currentRound: 3 });
        strict_1.default.equal((0, private_test_1.pendingJointTestingBundles)(metaAfter).length, 1);
        strict_1.default.equal((0, private_test_1.pendingJointTestingBundles)(metaAfter)[0]?.id, "agr-bundle-b");
        strict_1.default.deepEqual((0, private_test_1.activeJointTestingPartners)(metaAfter), [
            "Peugeot TotalEnergies",
            "Team WRT",
        ]);
    });
});
