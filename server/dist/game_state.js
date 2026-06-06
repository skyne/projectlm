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
exports.GameStateStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SAVE_REL = "data/game_save.json";
function savePath(repoRoot) {
    return path.join(repoRoot, SAVE_REL);
}
class GameStateStore {
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
    }
    load(defaults) {
        const abs = savePath(this.repoRoot);
        if (!fs.existsSync(abs))
            return structuredClone(defaults);
        try {
            const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
            return {
                ...defaults,
                ...parsed,
                setupComplete: parsed.setupComplete ?? true,
            };
        }
        catch {
            return structuredClone(defaults);
        }
    }
    save(state) {
        const abs = savePath(this.repoRoot);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, JSON.stringify(state, null, 2) + "\n");
    }
    delete() {
        const abs = savePath(this.repoRoot);
        if (fs.existsSync(abs))
            fs.unlinkSync(abs);
    }
}
exports.GameStateStore = GameStateStore;
