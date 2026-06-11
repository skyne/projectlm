"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PART_PROJECT_YIELD = exports.PART_PROJECT_BUDGET_COST = exports.PART_PROJECT_RD_COST = void 0;
exports.validatePartProject = validatePartProject;
exports.applyPartProject = applyPartProject;
const part_instances_1 = require("./part_instances");
const facilities_1 = require("./facilities");
exports.PART_PROJECT_RD_COST = 12;
exports.PART_PROJECT_BUDGET_COST = 75000;
exports.PART_PROJECT_YIELD = 0.08;
function validatePartProject(part, facilities, rdPoints, budget, focus) {
    if (!part)
        return "Part not found";
    if (!(0, facilities_1.canDevelopCategory)(facilities, part.category)) {
        return `Missing facility for ${part.category} development`;
    }
    if (rdPoints < exports.PART_PROJECT_RD_COST)
        return "Not enough R&D points";
    if (budget < exports.PART_PROJECT_BUDGET_COST)
        return "Not enough budget";
    if (focus === "performance" && part.performanceMaturity >= 0.99) {
        return "Performance already at catalog ceiling";
    }
    if (focus === "reliability" && part.reliabilityMaturity >= 0.99) {
        return "Reliability already maxed";
    }
    if (focus === "understanding" && part.partUnderstanding >= 0.99) {
        return "Part understanding already maxed";
    }
    return null;
}
function applyPartProject(part, focus, engineerSkill = 75) {
    const skillMult = 0.85 + (engineerSkill / 100) * 0.3;
    const yieldAmt = exports.PART_PROJECT_YIELD * skillMult;
    return (0, part_instances_1.advancePartFocus)(part, focus, yieldAmt);
}
