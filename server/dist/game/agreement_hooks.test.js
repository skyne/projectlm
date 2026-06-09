"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const agreement_hooks_1 = require("./agreement_hooks");
(0, node_test_1.describe)("agreement_hooks", () => {
    (0, node_test_1.it)("counts private test credits from joint testing agreements", () => {
        const agreements = [
            {
                id: "a1",
                kind: "joint_testing",
                partnerTeam: "Toyota Racing",
                signedRound: 1,
                expiresAtRound: 5,
                terms: { testDays: 2 },
                stubPending: true,
            },
            {
                id: "a2",
                kind: "joint_testing",
                partnerTeam: "Porsche",
                signedRound: 1,
                expiresAtRound: 0,
                terms: { testDays: 3 },
            },
        ];
        const stubs = (0, agreement_hooks_1.agreementGameplayFromActive)(agreements, 2);
        strict_1.default.equal(stubs.privateTestDayCredits, 2);
        strict_1.default.deepEqual(stubs.sharedPartCatalogIds, []);
    });
    (0, node_test_1.it)("applies joint-testing XP bonus from active agreements", () => {
        const meta = {
            currentRound: 2,
            activeAgreements: [
                {
                    id: "jt",
                    kind: "joint_testing",
                    partnerTeam: "Toyota Racing",
                    signedRound: 1,
                    expiresAtRound: 5,
                    terms: {},
                },
            ],
        };
        strict_1.default.equal((0, agreement_hooks_1.privateTestXpMultiplier)(meta), 1.25);
    });
    (0, node_test_1.it)("emits stub notes for pending gameplay hooks", () => {
        const notes = (0, agreement_hooks_1.notifyNewAgreementStubs)([
            {
                id: "x",
                kind: "tech_share",
                partnerTeam: "Ferrari",
                signedRound: 1,
                expiresAtRound: 4,
                terms: {},
                stubPending: true,
                stubNote: "R&D hook pending",
            },
        ]);
        strict_1.default.equal(notes.length, 1);
        strict_1.default.match(notes[0], /R&D hook pending/);
    });
});
