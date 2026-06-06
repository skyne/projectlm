"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GarageEngineerService = void 0;
const car_builder_1 = require("../game/car_builder");
const ollama_client_1 = require("./ollama_client");
const llm_parse_1 = require("./llm_parse");
const garage_parts_1 = require("./garage_parts");
const GARAGE_SYSTEM = `You are a WEC car development engineer helping design a legal race car.
Analyze the build JSON, performance summary, and available parts. Suggest 1-2 focused changes.
Use exact partType IDs from the catalog (the token before the parenthesis).

End with a JSON block:

\`\`\`json
{
  "changes": {
    "rear_aero_type": "ExactPartTypeId",
    "brake_system": "ExactPartTypeId"
  },
  "rationale": "one sentence"
}
\`\`\`

Valid change keys: chassis_type, front_aero_type, rear_aero_type, cooling_pack, wheel_package, suspension_layout, fuel_system, brake_system, transmission, hybrid_system.
Skip [R&D LOCKED] parts. Empty changes {} if no change needed.`;
function sanitizeChanges(repoRoot, classId, build, unlockedParts, raw) {
    const normalized = (0, garage_parts_1.normalizeGarageChanges)(repoRoot, raw, unlockedParts);
    if (!Object.keys(normalized).length)
        return undefined;
    const merged = { ...build, ...normalized };
    const err = (0, car_builder_1.validateCarBuild)(repoRoot, classId, merged, unlockedParts);
    if (err)
        return undefined;
    return normalized;
}
function suggestFallbackChange(repoRoot, classId, build, compiled, unlockedParts) {
    const catalog = (0, garage_parts_1.compactCatalogForGarage)(repoRoot, classId, unlockedParts);
    if (compiled?.downforceCl &&
        compiled?.dragCd &&
        compiled.dragCd / compiled.downforceCl > 0.45) {
        const options = (catalog.rear_aero ?? [])
            .map((line) => line.split(" ")[0])
            .filter((id) => id && id !== build.rear_aero_type);
        for (const candidate of options) {
            const resolved = (0, garage_parts_1.resolvePartTypeForField)(repoRoot, "rear_aero_type", candidate, unlockedParts);
            if (!resolved || resolved === build.rear_aero_type)
                continue;
            const changes = sanitizeChanges(repoRoot, classId, build, unlockedParts, { rear_aero_type: resolved });
            if (changes)
                return changes;
        }
    }
    if (compiled?.massKg && compiled.massKg > 1100) {
        const options = (catalog.chassis ?? [])
            .map((line) => line.split(" ")[0])
            .filter((id) => id && id !== build.chassis_type);
        for (const candidate of options) {
            const resolved = (0, garage_parts_1.resolvePartTypeForField)(repoRoot, "chassis_type", candidate, unlockedParts);
            if (!resolved || resolved === build.chassis_type)
                continue;
            const changes = sanitizeChanges(repoRoot, classId, build, unlockedParts, { chassis_type: resolved });
            if (changes)
                return changes;
        }
    }
    return undefined;
}
function fallbackGarageAdvice(repoRoot, classId, build, compiled, question, unlockedParts = []) {
    const lines = [];
    const suggestedChanges = suggestFallbackChange(repoRoot, classId, build, compiled, unlockedParts);
    if (suggestedChanges) {
        const keys = Object.entries(suggestedChanges)
            .map(([k, v]) => `${k.replace(/_type|_system|_layout|_pack/g, "")} → ${v}`)
            .join(", ");
        lines.push(`Suggested development change: ${keys}.`);
    }
    else if (compiled?.downforceCl && compiled?.dragCd && compiled.dragCd / compiled.downforceCl > 0.45) {
        lines.push("Aero looks drag-heavy — try a lower-drag rear aero package for tracks with long straights.");
    }
    else if (compiled?.massKg && compiled.massKg > 1100) {
        lines.push("Mass is high for class — a lighter chassis or wheel package would help lap time and tyre life.");
    }
    else if (compiled?.coolingCapacity && compiled.coolingCapacity < 0.85) {
        lines.push("Cooling margin is tight — upgrade cooling pack before endurance races.");
    }
    else {
        lines.push(`Current ${classId} build "${build.carName}" looks balanced. Run a test session before major changes.`);
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
class GarageEngineerService {
    async advise(options) {
        const catalog = (0, garage_parts_1.compactCatalogForGarage)(options.repoRoot, options.classId, options.unlockedParts);
        const online = await (0, ollama_client_1.ollamaAvailable)();
        if (!online) {
            return fallbackGarageAdvice(options.repoRoot, options.classId, options.build, options.compiled, options.question, options.unlockedParts);
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
            const result = await (0, ollama_client_1.ollamaChat)(GARAGE_SYSTEM, userParts.join("\n\n"), {
                timeoutMs: 45000,
            });
            const parsed = (0, llm_parse_1.parseJsonBlock)(result.text);
            let rawChanges = parsed?.changes;
            if (!rawChanges && parsed) {
                rawChanges = {};
                for (const key of garage_parts_1.BUILD_PART_FIELDS) {
                    if (typeof parsed[key] === "string") {
                        rawChanges[key] = parsed[key];
                    }
                }
                if (!Object.keys(rawChanges).length)
                    rawChanges = undefined;
            }
            let suggestedChanges = sanitizeChanges(options.repoRoot, options.classId, options.build, options.unlockedParts, rawChanges);
            let text = parsed?.rationale?.trim() ||
                result.text.replace(/```[\s\S]*?```/g, "").trim().slice(0, 600);
            if (!suggestedChanges && rawChanges) {
                text += " (Suggested parts could not be validated — try picking manually from the advice.)";
            }
            if (!suggestedChanges) {
                suggestedChanges = suggestFallbackChange(options.repoRoot, options.classId, options.build, options.compiled, options.unlockedParts);
            }
            return {
                text,
                suggestedChanges,
                offline: false,
                model: result.model,
                latencyMs: Date.now() - started,
            };
        }
        catch (err) {
            const fb = fallbackGarageAdvice(options.repoRoot, options.classId, options.build, options.compiled, options.question, options.unlockedParts);
            fb.text = `${fb.text} (LLM error: ${err instanceof Error ? err.message : String(err)})`;
            return fb;
        }
    }
}
exports.GarageEngineerService = GarageEngineerService;
