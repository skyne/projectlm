import type { CarBuildPayload } from "../ws_protocol";
import { validateCarBuild } from "../game/car_builder";
import { ollamaAvailable, ollamaChat } from "./ollama_client";
import { parseJsonBlock } from "./llm_parse";
import {
  BUILD_PART_FIELDS,
  compactCatalogForGarage,
  normalizeGarageChanges,
  resolvePartTypeForField,
} from "./garage_parts";

export interface GarageAdvice {
  text: string;
  suggestedChanges?: Partial<CarBuildPayload>;
  offline: boolean;
  model?: string;
  latencyMs?: number;
}

const GARAGE_SYSTEM = `You are a WEC car development engineer helping design a legal race car.
Analyze the build JSON, performance summary, and available parts. Suggest 1-2 focused changes.
Use exact partType IDs from the catalog (the token before the parenthesis).

You may also suggest numeric suspension tuning in the changes block:
front_ride_height_mm, rear_ride_height_mm, front_spring_nm, rear_spring_nm,
front_arb_stiffness, rear_arb_stiffness, front_camber_deg, rear_camber_deg,
front_toe_deg, rear_toe_deg, final_drive_ratio (3.0–4.2).

End with a JSON block:

\`\`\`json
{
  "changes": {
    "rear_aero_type": "ExactPartTypeId",
    "front_spring_nm": 145000
  },
  "rationale": "one sentence"
}
\`\`\`

Valid change keys: chassis_type, front_aero_type, rear_aero_type, cooling_pack, wheel_package, suspension_layout, fuel_system, brake_system, transmission, hybrid_system, plus the numeric suspension keys above.
Skip [R&D LOCKED] parts. Empty changes {} if no change needed.`;

function sanitizeChanges(
  repoRoot: string,
  classId: string,
  build: CarBuildPayload,
  unlockedParts: string[],
  raw: Record<string, unknown> | undefined,
): Partial<CarBuildPayload> | undefined {
  const normalized = normalizeGarageChanges(repoRoot, raw, unlockedParts);
  if (!Object.keys(normalized).length) return undefined;

  const merged = { ...build, ...normalized };
  const err = validateCarBuild(repoRoot, classId, merged, unlockedParts);
  if (err) return undefined;
  return normalized;
}

function suggestFallbackChange(
  repoRoot: string,
  classId: string,
  build: CarBuildPayload,
  compiled: Record<string, number> | undefined,
  unlockedParts: string[],
): Partial<CarBuildPayload> | undefined {
  const catalog = compactCatalogForGarage(repoRoot, classId, unlockedParts);

  if (
    compiled?.downforceCl &&
    compiled?.dragCd &&
    compiled.dragCd / compiled.downforceCl > 0.45
  ) {
    const options = (catalog.rear_aero ?? [])
      .map((line) => line.split(" ")[0])
      .filter((id) => id && id !== build.rear_aero_type);
    for (const candidate of options) {
      const resolved = resolvePartTypeForField(
        repoRoot,
        "rear_aero_type",
        candidate,
        unlockedParts,
      );
      if (!resolved || resolved === build.rear_aero_type) continue;
      const changes = sanitizeChanges(
        repoRoot,
        classId,
        build,
        unlockedParts,
        { rear_aero_type: resolved },
      );
      if (changes) return changes;
    }
  }

  if (compiled?.massKg && compiled.massKg > 1100) {
    const options = (catalog.chassis ?? [])
      .map((line) => line.split(" ")[0])
      .filter((id) => id && id !== build.chassis_type);
    for (const candidate of options) {
      const resolved = resolvePartTypeForField(
        repoRoot,
        "chassis_type",
        candidate,
        unlockedParts,
      );
      if (!resolved || resolved === build.chassis_type) continue;
      const changes = sanitizeChanges(
        repoRoot,
        classId,
        build,
        unlockedParts,
        { chassis_type: resolved },
      );
      if (changes) return changes;
    }
  }

  return undefined;
}

function fallbackGarageAdvice(
  repoRoot: string,
  classId: string,
  build: CarBuildPayload,
  compiled?: Record<string, number>,
  question?: string,
  unlockedParts: string[] = [],
  trackHint?: string,
): GarageAdvice {
  const lines: string[] = [];
  const suggestedChanges = suggestFallbackChange(
    repoRoot,
    classId,
    build,
    compiled,
    unlockedParts,
  );

  if (suggestedChanges) {
    const keys = Object.entries(suggestedChanges)
      .map(([k, v]) => `${k.replace(/_type|_system|_layout|_pack/g, "")} → ${v}`)
      .join(", ");
    lines.push(`Suggested development change: ${keys}.`);
  } else if (compiled?.downforceCl && compiled?.dragCd && compiled.dragCd / compiled.downforceCl > 0.45) {
    lines.push("Aero looks drag-heavy — try a lower-drag rear aero package for tracks with long straights.");
  } else if (compiled?.massKg && compiled.massKg > 1100) {
    lines.push("Mass is high for class — a lighter chassis or wheel package would help lap time and tyre life.");
  } else if (compiled?.coolingCapacity && compiled.coolingCapacity < 0.85) {
    lines.push("Cooling margin is tight — upgrade cooling pack before endurance races.");
  } else {
    lines.push(
      `Current ${classId} build "${build.carName}" looks balanced. Run a test session before major changes.`,
    );
  }

  const hint = (trackHint ?? "").toLowerCase();
  if (hint.includes("monza") || hint.includes("lemans") || hint.includes("mulsanne")) {
    lines.push(
      "Low-drag track — consider softer rear ARB and lower wing baseline on the weekend sheet; stiffer front springs help straight-line stability.",
    );
  } else if (hint.includes("spa") || hint.includes("fuji")) {
    lines.push(
      "High-speed corners — add front ARB stiffness and a touch more rear ride height for rotation without snap oversteer.",
    );
  } else if (hint.includes("bahrain")) {
    lines.push(
      "Tyre thermal track — rear-biased spring rates and moderate camber (-2.5° front / -1.8° rear) help manage rear deg.",
    );
  }

  if (question?.trim()) {
    lines.push(`(Offline — re: "${question.trim()}")`);
  }

  return {
    text: lines.join(" "),
    suggestedChanges,
    offline: true,
    model: "heuristic-fallback",
  };
}

export class GarageEngineerService {
  async advise(options: {
    repoRoot: string;
    classId: string;
    build: CarBuildPayload;
    unlockedParts: string[];
    compiled?: Record<string, number>;
    trackHint?: string;
    question?: string;
  }): Promise<GarageAdvice> {
    const catalog = compactCatalogForGarage(
      options.repoRoot,
      options.classId,
      options.unlockedParts,
    );
    const online = await ollamaAvailable();

    if (!online) {
      return fallbackGarageAdvice(
        options.repoRoot,
        options.classId,
        options.build,
        options.compiled,
        options.question,
        options.unlockedParts,
        options.trackHint,
      );
    }

    const userParts = [
      options.trackHint ? `Track focus: ${options.trackHint}` : "",
      `Current build:\n${JSON.stringify(options.build, null, 2)}`,
      options.compiled
        ? `Compiled stats:\n${JSON.stringify(options.compiled, null, 2)}`
        : "",
      `Available parts (use partType id before parenthesis):\n${JSON.stringify(catalog, null, 2)}`,
      options.question?.trim() ? `Question: ${options.question.trim()}` : "",
    ].filter(Boolean);

    const started = Date.now();
    try {
      const result = await ollamaChat(GARAGE_SYSTEM, userParts.join("\n\n"), {
        timeoutMs: 45_000,
      });
      const parsed = parseJsonBlock<{
        changes?: Record<string, string>;
        rationale?: string;
      }>(result.text);

      let rawChanges: Record<string, unknown> | undefined = parsed?.changes;
      if (!rawChanges && parsed) {
        rawChanges = {};
        for (const key of BUILD_PART_FIELDS) {
          if (typeof (parsed as Record<string, unknown>)[key] === "string") {
            rawChanges[key] = (parsed as Record<string, unknown>)[key];
          }
        }
        if (!Object.keys(rawChanges).length) rawChanges = undefined;
      }

      let suggestedChanges = sanitizeChanges(
        options.repoRoot,
        options.classId,
        options.build,
        options.unlockedParts,
        rawChanges,
      );

      let text =
        parsed?.rationale?.trim() ||
        result.text.replace(/```[\s\S]*?```/g, "").trim().slice(0, 600);

      if (!suggestedChanges && rawChanges) {
        text += " (Suggested parts could not be validated — try picking manually from the advice.)";
      }

      if (!suggestedChanges) {
        suggestedChanges = suggestFallbackChange(
          options.repoRoot,
          options.classId,
          options.build,
          options.compiled,
          options.unlockedParts,
        );
      }

      return {
        text,
        suggestedChanges,
        offline: false,
        model: result.model,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const fb = fallbackGarageAdvice(
        options.repoRoot,
        options.classId,
        options.build,
        options.compiled,
        options.question,
        options.unlockedParts,
        options.trackHint,
      );
      fb.text = `${fb.text} (LLM error: ${err instanceof Error ? err.message : String(err)})`;
      return fb;
    }
  }
}
