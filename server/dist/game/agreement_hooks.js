"use strict";
/**
 * Gameplay hooks for partnership and regulatory agreements.
 * Stubs until private-test calendar, tech-share R&D, and runtime BoP exist.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agreementGameplayFromActive = agreementGameplayFromActive;
exports.notifyNewAgreementStubs = notifyNewAgreementStubs;
const negotiation_deals_1 = require("./negotiation_deals");
/** Derive stub gameplay bonuses from active agreements (read-only). */
function agreementGameplayFromActive(agreements, currentRound) {
    let privateTestDayCredits = 0;
    const sharedPartCatalogIds = [];
    for (const agr of agreements) {
        if (currentRound > agr.expiresAtRound)
            continue;
        switch (agr.kind) {
            case "joint_testing":
                privateTestDayCredits += agr.terms.testDays ?? 1;
                break;
            case "tech_share":
                if (agr.terms.techSharePartIds?.length) {
                    sharedPartCatalogIds.push(...agr.terms.techSharePartIds);
                }
                break;
            default:
                break;
        }
    }
    return { privateTestDayCredits, sharedPartCatalogIds };
}
/** Log stub intent when new agreements land — wire calendar/R&D/BoP here later. */
function notifyNewAgreementStubs(agreements) {
    const notes = [];
    for (const agr of agreements) {
        if (!agr.stubPending)
            continue;
        const note = agr.stubNote ?? (0, negotiation_deals_1.describeActiveAgreement)(agr);
        notes.push(`[agreements-stub] ${agr.kind}: ${note}`);
    }
    return notes;
}
