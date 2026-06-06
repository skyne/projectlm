import * as fs from "fs";
import * as path from "path";

/** legal_* lists parsed from class_rules.txt */
export interface ClassLegalParts {
  legalCooling: string[];
}

const LEGAL_COOLING_BY_CLASS: Record<string, string[]> = {
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

function pickLegalCooling(classId: string, current: string): string {
  const legal = LEGAL_COOLING_BY_CLASS[classId];
  if (!legal?.length) return current;
  if (legal.includes(current)) return current;
  if (legal.includes("EnduranceHeavyDuty")) return "EnduranceHeavyDuty";
  return legal[0];
}

/** Rewrite a car config text file so class-regulated slots are legal. */
export function sanitizeCarConfigFile(
  repoRoot: string,
  relPath: string,
  classId: string,
): boolean {
  const abs = path.join(repoRoot, relPath);
  if (!fs.existsSync(abs)) return false;

  const lines = fs.readFileSync(abs, "utf8").split("\n");
  let changed = false;
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("cooling_pack=")) return line;
    const current = trimmed.slice("cooling_pack=".length).trim();
    const fixed = pickLegalCooling(classId, current);
    if (fixed === current) return line;
    changed = true;
    return `cooling_pack=${fixed}`;
  });

  if (changed) fs.writeFileSync(abs, out.join("\n") + "\n");
  return changed;
}
