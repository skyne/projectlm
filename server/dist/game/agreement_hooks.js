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
    return (meta.activeAgreements ?? []).filter((agr) => currentRound <= agr.expiresAtRound &&
        !(agr.kind === "joint_testing" && agr.fulfilledAtRound));
}
function activeJointTestingPartners(meta, currentRound = meta.currentRound) {
    const seen = new Set();
    const partners = [];
    for (const agr of activeAgreements(meta, currentRound)) {
        if (agr.kind !== "joint_testing" || agr.fulfilledAtRound)
            continue;
        const teams = agr.partnerTeams?.length
            ? agr.partnerTeams
            : agr.terms.partnerTeams?.length
                ? agr.terms.partnerTeams
                : agr.partnerTeam
                    ? [agr.partnerTeam]
                    : [];
        for (const team of teams) {
            const key = team.trim().toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            partners.push(team);
        }
    }
    return partners;
}
/** +25% driver/staff XP per joint-testing partner on track (max +50%). */
function privateTestXpMultiplier(meta, currentRound = meta.currentRound, partnerTeams) {
    let partners = activeJointTestingPartners(meta, currentRound);
    if (partnerTeams?.length) {
        const keys = new Set(partnerTeams.map((name) => name.trim().toLowerCase()));
        partners = partners.filter((name) => keys.has(name.trim().toLowerCase()));
    }
    const bonus = Math.min(exports.JOINT_TESTING_XP_BONUS_CAP, partners.length * exports.JOINT_TESTING_XP_BONUS_PER_PARTNER);
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
