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
exports.validateAndFixGrid = validateAndFixGrid;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const class_legality_1 = require("./class_legality");
function validateAndFixGrid(repoRoot, entriesPath) {
    const rules = (0, class_legality_1.loadClassRules)(repoRoot);
    const absEntries = path.isAbsolute(entriesPath)
        ? entriesPath
        : path.join(repoRoot, entriesPath);
    const issues = [];
    for (const line of fs.readFileSync(absEntries, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("entry="))
            continue;
        const parts = trimmed.slice("entry=".length).split(",");
        if (parts.length < 4)
            continue;
        const carConfigRel = parts[1]?.trim() ?? "";
        const classId = parts[2]?.trim() ?? "";
        const carAbs = path.isAbsolute(carConfigRel)
            ? carConfigRel
            : path.join(repoRoot, carConfigRel);
        if (!fs.existsSync(carAbs))
            continue;
        const original = fs.readFileSync(carAbs, "utf8");
        const { text, fixes } = (0, class_legality_1.sanitizeCarConfigText)(original, classId, rules);
        if (fixes.length === 0)
            continue;
        fs.writeFileSync(carAbs, text, "utf8");
        issues.push({
            entryLine: trimmed,
            carConfigPath: carConfigRel,
            classId,
            fixes,
        });
    }
    return issues;
}
