import * as fs from "fs";
import * as path from "path";

export interface ClassRuleRow {
  id: string;
  legalCooling: string[];
  legalChassis: string[];
  legalFrontAero: string[];
  legalRearAero: string[];
  legalBrakes: string[];
  legalTransmission: string[];
  legalHybrid: string[];
}

const COOLING_ALIASES: Record<string, string> = {
  MaxFlowEndurance: "EnduranceHeavyDuty",
  DuctedRacing: "EnduranceHeavyDuty",
};

export function loadClassRules(repoRoot: string): Map<string, ClassRuleRow> {
  const rules = new Map<string, ClassRuleRow>();
  const abs = path.join(repoRoot, "configs/class_rules.txt");
  if (!fs.existsSync(abs)) return rules;

  let current: ClassRuleRow | null = null;
  for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key === "class") {
      if (current) rules.set(current.id, current);
      current = {
        id: value,
        legalCooling: [],
        legalChassis: [],
        legalFrontAero: [],
        legalRearAero: [],
        legalBrakes: [],
        legalTransmission: [],
        legalHybrid: [],
      };
      continue;
    }
    if (!current) continue;
    const list = value.split(",").map((v) => v.trim()).filter(Boolean);
    if (key === "legal_cooling") current.legalCooling = list;
    else if (key === "legal_chassis") current.legalChassis = list;
    else if (key === "legal_front_aero") current.legalFrontAero = list;
    else if (key === "legal_rear_aero") current.legalRearAero = list;
    else if (key === "legal_brakes") current.legalBrakes = list;
    else if (key === "legal_transmission") current.legalTransmission = list;
    else if (key === "legal_hybrid") current.legalHybrid = list;
  }
  if (current) rules.set(current.id, current);
  return rules;
}

function normalizeCooling(value: string): string {
  return COOLING_ALIASES[value] ?? value;
}

function fixField(
  key: string,
  val: string,
  field: string,
  legal: string[],
  alias: (v: string) => string = (v) => v,
): { line: string; fix?: string } | null {
  if (key !== field || legal.length === 0) return null;
  const normalized = alias(val);
  if (legal.includes(normalized)) {
    if (normalized !== val) return { line: `${field}=${normalized}`, fix: `${field}: ${val} -> ${normalized}` };
    return { line: `${field}=${val}` };
  }
  const fallback = legal[0];
  return { line: `${field}=${fallback}`, fix: `${field}: ${val} -> ${fallback}` };
}

export function sanitizeCarConfigText(
  configText: string,
  classId: string,
  rules: Map<string, ClassRuleRow>,
): { text: string; fixes: string[] } {
  const rule = rules.get(classId);
  if (!rule) return { text: configText, fixes: [] };

  const fixes: string[] = [];
  const lines = configText.split("\n").map((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return rawLine;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();

    const attempts = [
      fixField(key, val, "cooling_pack", rule.legalCooling, normalizeCooling),
      fixField(key, val, "chassis_type", rule.legalChassis),
      fixField(key, val, "front_aero_type", rule.legalFrontAero),
      fixField(key, val, "rear_aero_type", rule.legalRearAero),
      fixField(key, val, "brake_system", rule.legalBrakes),
      fixField(key, val, "transmission", rule.legalTransmission),
      fixField(key, val, "hybrid_system", rule.legalHybrid),
    ];
    for (const attempt of attempts) {
      if (!attempt) continue;
      if (attempt.fix) {
        fixes.push(attempt.fix);
        return attempt.line;
      }
      return attempt.line;
    }
    return rawLine;
  });
  return { text: lines.join("\n"), fixes };
}
