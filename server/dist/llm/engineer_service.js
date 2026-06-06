"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineerService = void 0;
const ollama_client_1 = require("./ollama_client");
const engineer_commands_1 = require("./engineer_commands");
const telemetry_summary_1 = require("./telemetry_summary");
const SYSTEM_PROMPT = `You are a WEC endurance race engineer advising the pit wall.
Use the telemetry JSON. Be concise (2-4 sentences). Focus on fuel, tyres, driver stint, engine/coolant, gap strategy, and car setup when driver feedback or handling suggests it.
If you recommend an action the player can apply, end your reply with a single line:
SUGGESTED_COMMAND: <command>

${engineer_commands_1.ENGINEER_COMMAND_HELP}

Do not invent keys outside the list above. If no command is needed, omit SUGGESTED_COMMAND.`;
function extractSuggestedCommand(text) {
    const match = text.match(/\nSUGGESTED_COMMAND:\s*(.+)\s*$/i);
    if (!match)
        return { cleanText: text.trim() };
    const suggestedCommand = match[1].trim();
    const cleanText = text.slice(0, match.index).trim();
    return { cleanText, suggestedCommand };
}
function setupHintFromFeedback(summary) {
    const fb = (summary.setupFeedback ?? "").toLowerCase();
    if (!fb)
        return null;
    if (fb.includes("understeer") || fb.includes("push") || fb.includes("planted")) {
        return { reason: "understeer", wing: 0.05, frontArb: -0.05 };
    }
    if (fb.includes("oversteer") || fb.includes("nervous") || fb.includes("rotation")) {
        return { reason: "oversteer", wing: -0.05, rearArb: -0.05 };
    }
    if (fb.includes("straight") || fb.includes("mulsanne") || fb.includes("top speed")) {
        return { reason: "straight", wing: -0.05 };
    }
    if (fb.includes("brak") && fb.includes("stable")) {
        return { reason: "braking", brakeBias: 0.02 };
    }
    return null;
}
function buildSetupPitCommand(summary, hint, fuelLiters) {
    const parts = [
        "pit",
        `fuel=${fuelLiters}`,
        "compound=medium",
        "tires=",
    ];
    if (hint.wing != null)
        parts.push(`wing=${hint.wing}`);
    if (hint.brakeBias != null)
        parts.push(`brake_bias=${hint.brakeBias}`);
    if (hint.frontArb != null)
        parts.push(`front_arb=${hint.frontArb}`);
    if (hint.rearArb != null)
        parts.push(`rear_arb=${hint.rearArb}`);
    if (hint.frontRideHeight != null) {
        parts.push(`front_ride_height=${hint.frontRideHeight}`);
    }
    if (hint.rearRideHeight != null) {
        parts.push(`rear_ride_height=${hint.rearRideHeight}`);
    }
    return parts.join("|");
}
function fallbackAdvice(summary, engineerSkill, question) {
    const lines = [];
    let suggestedCommand;
    if (summary.retired) {
        lines.push("Car is retired — no live strategy available.");
    }
    else if (summary.inPit) {
        lines.push("Car is in the pit lane. Confirm fuel, tyre, and any setup changes before release.");
        const hint = setupHintFromFeedback(summary);
        if (hint) {
            lines.push(`Driver reports ${hint.reason} — consider aero or balance tweak while in the box.`);
            suggestedCommand = (0, engineer_commands_1.validateEngineerCommand)(buildSetupPitCommand(summary, hint, 0), engineerSkill);
        }
    }
    else {
        if (summary.fuelPercent <= 12) {
            lines.push(`Fuel critical at ${summary.fuelLiters.toFixed(0)}L (${summary.fuelPercent.toFixed(0)}% of tank). Box this lap.`);
            suggestedCommand = `pit|fuel=${Math.max(0, Math.round(summary.fuelTankLiters - summary.fuelLiters))}|compound=medium|tires=all`;
        }
        else if (summary.fuelPercent <= 28) {
            lines.push(`Fuel getting low (${summary.fuelLiters.toFixed(0)}L). Plan a stop within the next few laps.`);
        }
        if (summary.maxTireWear >= 0.72) {
            lines.push(`Tyre wear peaked at ${(summary.maxTireWear * 100).toFixed(0)}% — schedule a compound change.`);
            if (!suggestedCommand) {
                suggestedCommand = `pit|fuel=${Math.max(0, Math.round(summary.fuelTankLiters * 0.5 - summary.fuelLiters))}|compound=hard|tires=all`;
            }
        }
        if (summary.driverStamina <= 35) {
            lines.push(`${summary.driverName} stamina is low — consider a driver swap at the next stop.`);
        }
        if (summary.engineHealth <= 80 || summary.coolantTempC >= 98) {
            lines.push("Powertrain stress is elevated — switch to conserve mode and monitor temps.");
            if (!suggestedCommand)
                suggestedCommand = "driver_mode=conserve";
        }
        const setupHint = setupHintFromFeedback(summary);
        if (setupHint && !suggestedCommand) {
            lines.push(`${summary.driverName} flagged handling (${setupHint.reason}) — plan a setup change at the next stop.`);
            if (summary.fuelPercent <= 35) {
                suggestedCommand = (0, engineer_commands_1.validateEngineerCommand)(buildSetupPitCommand(summary, setupHint, Math.max(0, Math.round(summary.fuelTankLiters * 0.4 - summary.fuelLiters))), engineerSkill);
            }
            else {
                const parts = ["setup"];
                if (setupHint.wing != null)
                    parts.push(`wing=${setupHint.wing}`);
                if (setupHint.brakeBias != null)
                    parts.push(`brake_bias=${setupHint.brakeBias}`);
                if (setupHint.frontArb != null)
                    parts.push(`front_arb=${setupHint.frontArb}`);
                if (setupHint.rearArb != null)
                    parts.push(`rear_arb=${setupHint.rearArb}`);
                if (parts.length > 1) {
                    suggestedCommand = (0, engineer_commands_1.validateEngineerCommand)(parts.join("|"), engineerSkill);
                }
            }
        }
        if (!lines.length) {
            lines.push(`Stint looks stable on lap ${summary.lap}. Wing ${summary.wingAngle.toFixed(2)}, bias ${summary.brakeBias.toFixed(2)} — hold ${summary.driverMode} mode.`);
        }
    }
    if (question?.trim()) {
        lines.push(`(Offline engineer — could not reach Ollama for: "${question.trim()}")`);
    }
    return {
        entryId: summary.entryId,
        text: lines.join(" "),
        suggestedCommand: (0, engineer_commands_1.validateEngineerCommand)(suggestedCommand ?? "", engineerSkill),
        offline: true,
        model: "heuristic-fallback",
    };
}
class EngineerService {
    async getStatus() {
        const online = await (0, ollama_client_1.ollamaAvailable)();
        return {
            online,
            model: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
        };
    }
    async advise(options) {
        const engineerSkill = options.engineerSkill ?? 75;
        const summary = (0, telemetry_summary_1.summarizeTelemetry)(options.snap, options.raceTimeSec ?? 0);
        const online = await (0, ollama_client_1.ollamaAvailable)();
        if (!online) {
            return fallbackAdvice(summary, engineerSkill, options.question);
        }
        const skillNote = engineerSkill >= 85
            ? "Senior engineer — precise suspension deltas allowed."
            : engineerSkill >= 72
                ? "Experienced engineer — moderate setup range."
                : "Junior engineer — prefer aero/brake; small deltas only.";
        const userParts = [
            options.trackName ? `Track: ${options.trackName}` : "",
            options.trackPresetNotes
                ? `Weekend setup sheet notes: ${options.trackPresetNotes}`
                : "",
            `Engineer skill: ${engineerSkill}/100 (${skillNote})`,
            `Telemetry:\n${(0, telemetry_summary_1.summaryForPrompt)(summary)}`,
            options.question?.trim() ? `Team question: ${options.question.trim()}` : "",
        ].filter(Boolean);
        try {
            const result = await (0, ollama_client_1.ollamaChat)(SYSTEM_PROMPT, userParts.join("\n\n"));
            const { cleanText, suggestedCommand } = extractSuggestedCommand(result.text);
            return {
                entryId: summary.entryId,
                text: cleanText,
                suggestedCommand: (0, engineer_commands_1.validateEngineerCommand)(suggestedCommand ?? "", engineerSkill),
                offline: false,
                model: result.model,
                latencyMs: result.latencyMs,
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const fallback = fallbackAdvice(summary, engineerSkill, options.question);
            fallback.text = `${fallback.text} (LLM error: ${msg})`;
            return fallback;
        }
    }
}
exports.EngineerService = EngineerService;
