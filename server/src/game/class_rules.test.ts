import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { loadGameCatalog } from "./catalog";
import { auditClassPartMinimums, loadParsedClassRules } from "./class_rules";

const repoRoot = path.resolve(process.cwd(), "..");
describe("class part minimums", () => {
  it("every class has at least three options per garage slot", () => {
    const catalog = loadGameCatalog(repoRoot);
    const rules = loadParsedClassRules(repoRoot);
    const failures = auditClassPartMinimums(rules, catalog.partsBySlot, 3);
    assert.equal(
      failures.length,
      0,
      `Classes missing part variety:\n${failures.join("\n")}`,
    );
  });
});
