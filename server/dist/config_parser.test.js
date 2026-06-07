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
const config_parser_1 = require("./config_parser");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const weekend_sessions_1 = require("./game/weekend_sessions");
const grid_generator_1 = require("./game/grid_generator");
(0, node_test_1.describe)("config_parser entry lines", () => {
    (0, node_test_1.it)("parses legacy 5-field lines with grid-derived entry id", () => {
        const parsed = (0, config_parser_1.parseEntryFields)("entry=Toyota Racing,configs/car.txt,Hypercar,3,7");
        strict_1.default.ok(parsed);
        strict_1.default.equal(parsed.entryId, (0, config_parser_1.legacyEntryIdFromGrid)(3));
        strict_1.default.equal(parsed.carNumber, "7");
    });
    (0, node_test_1.it)("parses explicit entry_id and survives duplicate class grids", () => {
        const hyper = (0, config_parser_1.formatEntryLine)({
            teamName: "Team A",
            carConfigPath: "configs/a.txt",
            classId: "Hypercar",
            grid: 1,
            carNumber: "20",
            entryId: "entry-9",
        });
        const gt3 = (0, config_parser_1.formatEntryLine)({
            teamName: "Team B",
            carConfigPath: "configs/b.txt",
            classId: "LMGT3",
            grid: 1,
            carNumber: "20",
            entryId: "entry-34",
        });
        const h = (0, config_parser_1.parseEntryFields)(hyper);
        const g = (0, config_parser_1.parseEntryFields)(gt3);
        strict_1.default.ok(h && g);
        strict_1.default.equal(h.grid, 1);
        strict_1.default.equal(g.grid, 1);
        strict_1.default.notEqual(h.entryId, g.entryId);
        strict_1.default.equal(h.carNumber, "20");
        strict_1.default.equal(g.carNumber, "20");
    });
    (0, node_test_1.it)("round-trips applyQualifyingGrid through writeEntriesFile", () => {
        const entries = [
            {
                entryId: "entry-9",
                teamName: "BMW",
                carConfigPath: "configs/h.txt",
                classId: "Hypercar",
                grid: 9,
                carNumber: "20",
                isPlayer: false,
            },
            {
                entryId: "entry-34",
                teamName: "GT Team",
                carConfigPath: "configs/g.txt",
                classId: "LMGT3",
                grid: 34,
                carNumber: "20",
                isPlayer: false,
            },
        ];
        const reordered = (0, weekend_sessions_1.applyQualifyingGrid)(entries, [
            { entryId: "entry-9", classId: "Hypercar", bestLapTime: 98.0 },
            { entryId: "entry-34", classId: "LMGT3", bestLapTime: 104.0 },
        ]);
        strict_1.default.equal(reordered.find((e) => e.entryId === "entry-9")?.grid, 1);
        strict_1.default.equal(reordered.find((e) => e.entryId === "entry-34")?.grid, 1);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plm-entries-"));
        const rel = "entries_test.txt";
        (0, grid_generator_1.writeEntriesFile)(dir, rel, reordered);
        const parsed = (0, config_parser_1.parseEntries)(dir, rel);
        strict_1.default.equal(parsed.length, 2);
        const ids = parsed.map((e) => e.entryId).sort();
        strict_1.default.deepEqual(ids, ["entry-34", "entry-9"]);
    });
});
