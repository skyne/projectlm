import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActiveAgreement } from "./negotiations";
import {
  agreementGameplayFromActive,
  notifyNewAgreementStubs,
} from "./agreement_hooks";

describe("agreement_hooks", () => {
  it("counts private test credits from joint testing agreements", () => {
    const agreements: ActiveAgreement[] = [
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
    const stubs = agreementGameplayFromActive(agreements, 2);
    assert.equal(stubs.privateTestDayCredits, 2);
    assert.deepEqual(stubs.sharedPartCatalogIds, []);
  });

  it("emits stub notes for pending gameplay hooks", () => {
    const notes = notifyNewAgreementStubs([
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
    assert.equal(notes.length, 1);
    assert.match(notes[0]!, /R&D hook pending/);
  });
});
