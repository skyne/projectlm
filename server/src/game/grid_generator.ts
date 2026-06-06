import * as fs from "fs";
import * as path from "path";
import { loadClassRules, sanitizeCarConfigText } from "./class_legality";

export interface GridValidationIssue {
  entryLine: string;
  carConfigPath: string;
  classId: string;
  fixes: string[];
}

export function validateAndFixGrid(
  repoRoot: string,
  entriesPath: string,
): GridValidationIssue[] {
  const rules = loadClassRules(repoRoot);
  const absEntries = path.isAbsolute(entriesPath)
    ? entriesPath
    : path.join(repoRoot, entriesPath);
  const issues: GridValidationIssue[] = [];

  for (const line of fs.readFileSync(absEntries, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("entry=")) continue;
    const parts = trimmed.slice("entry=".length).split(",");
    if (parts.length < 4) continue;
    const carConfigRel = parts[1]?.trim() ?? "";
    const classId = parts[2]?.trim() ?? "";
    const carAbs = path.isAbsolute(carConfigRel)
      ? carConfigRel
      : path.join(repoRoot, carConfigRel);
    if (!fs.existsSync(carAbs)) continue;

    const original = fs.readFileSync(carAbs, "utf8");
    const { text, fixes } = sanitizeCarConfigText(original, classId, rules);
    if (fixes.length === 0) continue;

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
