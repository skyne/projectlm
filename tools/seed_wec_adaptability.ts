/**
 * Inserts adaptability (FIA license tier + per-driver variance) into
 * configs/drivers/lemans2026_drivers.txt before max_stint_hours.
 */
import * as fs from "fs";
import * as path from "path";
import { seedAdaptabilityForTier } from "../server/src/game/driver_catalog";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(REPO, "configs/drivers/lemans2026_drivers.txt");

function trim(s: string): string {
  return s.trim();
}

function rewriteDriverLine(value: string): string | null {
  const parts = value.split("|").map(trim);
  if (parts.length < 18) return null;
  const [name, nationality, tier, ...nums] = parts;
  const numeric = nums.map((n) => Number(n));
  if (numeric.some((n) => Number.isNaN(n))) return null;

  let dryThroughStamina: number[];
  let maxStint: number;
  if (numeric.length >= 17) {
    dryThroughStamina = numeric.slice(0, 15);
    maxStint = numeric[16]!;
  } else {
    dryThroughStamina = numeric.slice(0, 15);
    maxStint = numeric[15] ?? 2.5;
  }

  const adaptability = seedAdaptabilityForTier(tier, `${name}|${nationality}`);
  return [
    name,
    nationality,
    tier,
    ...dryThroughStamina,
    adaptability,
    maxStint,
  ].join("|");
}

function main(): void {
  const lines = fs.readFileSync(FILE, "utf8").split("\n");
  let updated = 0;
  const out = lines.map((line) => {
    const trimmed = trim(line);
    if (!trimmed.startsWith("driver=")) return line;
    const value = trimmed.slice("driver=".length);
    const rewritten = rewriteDriverLine(value);
    if (!rewritten) {
      console.warn("skip:", trimmed);
      return line;
    }
    updated++;
    return `driver=${rewritten}`;
  });

  const header = `# Format: driver=name|nat|tier|dry|wet|consistency|overtaking|defending|traffic|rolling|standing|setup|tire|fuel|composure|night|rain|stamina|adaptability|max_stint_hours`;
  const withHeader = out.map((line, i) => {
    if (i === 1 && line.startsWith("# Format:")) return header;
    return line;
  });

  fs.writeFileSync(FILE, withHeader.join("\n"));
  console.log(`Updated ${updated} driver lines in ${FILE}`);
}

main();
