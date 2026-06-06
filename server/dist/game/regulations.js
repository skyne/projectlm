"use strict";
/** Season regulation sets — BoP file paths per championship phase (server-side). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGULATION_SETS = void 0;
exports.regulationForRound = regulationForRound;
const BASE = "configs/class_rules.txt";
exports.REGULATION_SETS = [
    { id: "season_start", label: "Season opener", classRulesPath: BASE },
    {
        id: "mid_season",
        label: "Mid-season BoP",
        classRulesPath: "configs/class_rules_midseason.txt",
    },
];
function regulationForRound(round) {
    if (round >= 5)
        return exports.REGULATION_SETS[1] ?? exports.REGULATION_SETS[0];
    return exports.REGULATION_SETS[0];
}
