"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeCarConfigFile = sanitizeCarConfigFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const LEGAL_COOLING_BY_CLASS = {
    Hypercar: [
        "SprintSlimline",
        "EnduranceHeavyDuty",
        "DuctedRacing",
        "MaxFlowEndurance",
        "Custom",
    ],
    LMGT3: ["SprintSlimline", "EnduranceHeavyDuty", "DuctedRacing", "Custom"],
    LMP2: ["EnduranceHeavyDuty", "DuctedRacing", "MaxFlowEndurance", "Custom"],
};
function pickLegalCooling(classId, current) {
    const legal = LEGAL_COOLING_BY_CLASS[classId];
    if (!legal?.length)
        return current;
    if (legal.includes(current))
        return current;
    if (legal.includes("EnduranceHeavyDuty"))
        return "EnduranceHeavyDuty";
    return legal[0];
}
/** Rewrite a car config text file so class-regulated slots are legal. */
function sanitizeCarConfigFile(repoRoot, relPath, classId) {
    const abs = path.join(repoRoot, relPath);
    if (!fs.existsSync(abs))
        return false;
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    let changed = false;
    const out = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("cooling_pack="))
            return line;
        const current = trimmed.slice("cooling_pack=".length).trim();
        const fixed = pickLegalCooling(classId, current);
        if (fixed === current)
            return line;
        changed = true;
        return `cooling_pack=${fixed}`;
    });
    if (changed)
        fs.writeFileSync(abs, out.join("\n") + "\n");
    return changed;
}
