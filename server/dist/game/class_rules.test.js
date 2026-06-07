"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_path_1 = __importDefault(require("node:path"));
const catalog_1 = require("./catalog");
const class_rules_1 = require("./class_rules");
const repoRoot = node_path_1.default.resolve(process.cwd(), "..");
(0, node_test_1.describe)("class part minimums", () => {
    (0, node_test_1.it)("every class has at least three options per garage slot", () => {
        const catalog = (0, catalog_1.loadGameCatalog)(repoRoot);
        const rules = (0, class_rules_1.loadParsedClassRules)(repoRoot);
        const failures = (0, class_rules_1.auditClassPartMinimums)(rules, catalog.partsBySlot, 3);
        strict_1.default.equal(failures.length, 0, `Classes missing part variety:\n${failures.join("\n")}`);
    });
});
