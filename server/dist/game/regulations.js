"use strict";
/** Season regulation sets — BoP file paths per championship phase (server-side). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULE_CHANGE_PROPOSALS = exports.REGULATION_SETS = exports.REGULATORY_ENTITY_ID = void 0;
exports.ruleProposalById = ruleProposalById;
exports.regulationForRound = regulationForRound;
exports.defaultRegulatoryState = defaultRegulatoryState;
exports.effectivePowerCapDelta = effectivePowerCapDelta;
exports.REGULATORY_ENTITY_ID = "acr";
const BASE = "configs/class_rules.txt";
exports.REGULATION_SETS = [
    { id: "season_start", label: "Season opener", classRulesPath: BASE },
    {
        id: "mid_season",
        label: "Mid-season BoP",
        classRulesPath: "configs/class_rules_midseason.txt",
    },
];
exports.RULE_CHANGE_PROPOSALS = [
    {
        id: "bop_hypercar_relief",
        label: "Hypercar power cap relief",
        description: "Request a temporary +2% power cap for Hypercar (stub — runtime BoP hook pending).",
        kind: "exception",
        petitionFee: 400000,
        targetClassId: "Hypercar",
        powerCapDelta: 0.02,
    },
    {
        id: "vote_lmp2_weight_shift",
        label: "LMP2 minimum weight adjustment",
        description: "Initiate a grid vote on LMP2 weight regulations for next season.",
        kind: "rule_vote",
        petitionFee: 150000,
        targetClassId: "LMP2",
    },
    {
        id: "vote_gt3_bop_review",
        label: "LMGT3 BoP review",
        description: "Call a championship vote to review LMGT3 balance of performance.",
        kind: "rule_vote",
        petitionFee: 120000,
        targetClassId: "LMGT3",
    },
];
function ruleProposalById(id) {
    return exports.RULE_CHANGE_PROPOSALS.find((p) => p.id === id);
}
function regulationForRound(round) {
    if (round >= 5)
        return exports.REGULATION_SETS[1] ?? exports.REGULATION_SETS[0];
    return exports.REGULATION_SETS[0];
}
function defaultRegulatoryState(currentRound) {
    const reg = regulationForRound(currentRound);
    return {
        activeRegulationId: reg.id,
        pendingVotes: [],
        grantedExceptions: [],
    };
}
/** Stub — merge granted exceptions into runtime regulation deltas when sim bridge supports it. */
function effectivePowerCapDelta(regulatory, classId, currentRound) {
    let delta = 0;
    for (const exc of regulatory?.grantedExceptions ?? []) {
        if (exc.classId !== classId)
            continue;
        if (currentRound > exc.expiresAtRound)
            continue;
        delta += exc.powerCapDelta;
    }
    return delta;
}
