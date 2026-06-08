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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const game_state_1 = require("./game_state");
function defaults() {
    return {
        teamName: "Defaults",
        budget: 500000000,
        rdPoints: 100,
        playerEntryId: "entry-1",
        seasonYear: 2026,
        currentRound: 0,
        staff: [],
        unlockedParts: [],
        calendar: [],
        setupComplete: false,
        fleet: [],
        activeCarId: "",
        driverRoster: [],
    };
}
(0, node_test_1.describe)("GameStateStore.load", () => {
    let repoRoot = "";
    let store;
    (0, node_test_1.beforeEach)(() => {
        repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plm-save-"));
        store = new game_state_1.GameStateStore(repoRoot);
    });
    (0, node_test_1.afterEach)(() => {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    });
    (0, node_test_1.it)("defaults setupComplete to false when the field is missing", () => {
        const saveDir = path.join(repoRoot, "data");
        fs.mkdirSync(saveDir, { recursive: true });
        fs.writeFileSync(path.join(saveDir, "game_save.json"), JSON.stringify({
            teamName: "Legacy Team",
            budget: 1000000,
            fleet: [],
        }));
        const loaded = store.load(defaults());
        strict_1.default.equal(loaded.setupComplete, false);
        strict_1.default.equal(loaded.teamName, "Legacy Team");
    });
    (0, node_test_1.it)("preserves explicit setupComplete true", () => {
        const saveDir = path.join(repoRoot, "data");
        fs.mkdirSync(saveDir, { recursive: true });
        fs.writeFileSync(path.join(saveDir, "game_save.json"), JSON.stringify({
            teamName: "Complete Team",
            setupComplete: true,
        }));
        const loaded = store.load(defaults());
        strict_1.default.equal(loaded.setupComplete, true);
    });
});
