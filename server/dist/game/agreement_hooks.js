"use strict";
/**
 * Gameplay hooks for partnership and regulatory agreements.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOINT_TESTING_XP_BONUS_CAP = exports.JOINT_TESTING_XP_BONUS_PER_PARTNER = void 0;
exports.activeJointTestingPartners = activeJointTestingPartners;
exports.privateTestXpMultiplier = privateTestXpMultiplier;
exports.privateTestBonusHint = privateTestBonusHint;
exports.agreementGameplayFromActive = agreementGameplayFromActive;
exports.notifyNewAgreementStubs = notifyNewAgreementStubs;
const negotiation_deals_1 = require("./negotiation_deals");
exports.JOINT_TESTING_XP_BONUS_PER_PARTNER = 0.25;
exports.JOINT_TESTING_XP_BONUS_CAP = 0.5;
function activeAgreements(meta, currentRound = meta.currentRound) {
    return (meta.activeAgreements ?? []).filter((agr) => currentRound <= agr.expiresAtRound);
}
function activeJointTestingPartners(meta, currentRound = meta.currentRound) {
    return activeAgreements(meta, currentRound)
        .filter((agr) => agr.kind === "joint_testing" && agr.partnerTeam)
        .map((agr) => agr.partnerTeam);
}
/** +25% driver/staff XP per active joint-testing partner (max +50%). */
function privateTestXpMultiplier(meta, currentRound = meta.currentRound) {
    const partners = activeJointTestingPartners(meta, currentRound).length;
    const bonus = Math.min(exports.JOINT_TESTING_XP_BONUS_CAP, partners * exports.JOINT_TESTING_XP_BONUS_PER_PARTNER);
    return 1 + bonus;
}
function privateTestBonusHint(meta) {
    const partners = activeJointTestingPartners(meta);
    if (!partners.length)
        return null;
    const pct = Math.round(Math.min(exports.JOINT_TESTING_XP_BONUS_CAP, partners.length * exports.JOINT_TESTING_XP_BONUS_PER_PARTNER) * 100);
    return `Joint testing +${pct}% XP (${partners.join(", ")})`;
}
/** Derive gameplay bonuses from active agreements (read-only). */
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
/** Log stub intent when new agreements still lack gameplay hooks. */
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
