"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineerService = void 0;
const ollama_client_1 = require("./ollama_client");
const telemetry_summary_1 = require("./telemetry_summary");
const SYSTEM_PROMPT = `You are a WEC endurance race engineer advising the pit wall.
Use the telemetry JSON. Be concise (2-4 sentences). Focus on fuel, tyres, driver stint, engine/coolant, and gap strategy.
If you recommend an action the player can apply, end your reply with a single line:
SUGGESTED_COMMAND: <command>

Valid commands only:
- driver_mode=push | driver_mode=normal | driver_mode=conserve
- pit|fuel=<liters>|compound=soft|medium|hard|tires=all
- pit|fuel=<liters>|compound=medium|tires= | driver_change=true
- cancel_pit

Do not invent parts or setup values outside these commands. If no command is needed, omit SUGGESTED_COMMAND.`;
function extractSuggestedCommand(text) {
    const match = text.match(/\nSUGGESTED_COMMAND:\s*(.+)\s*$/i);
    if (!match)
        return { cleanText: text.trim() };
    const suggestedCommand = match[1].trim();
    const cleanText = text.slice(0, match.index).trim();
    return { cleanText, suggestedCommand };
}
function validateSuggestedCommand(command) {
    const c = command.trim();
    if (!c)
        return undefined;
    if (/^driver_mode=(push|normal|conserve)$/i.test(c))
        return c.toLowerCase();
    if (/^cancel_pit$/i.test(c))
        return "cancel_pit";
    if (/^pit\|/i.test(c))
        return c;
    return undefined;
}
function fallbackAdvice(summary, question) {
    const lines = [];
    let suggestedCommand;
    if (summary.retired) {
        lines.push("Car is retired — no live strategy available.");
    }
    else if (summary.inPit) {
        lines.push("Car is in the pit lane. Monitor stop time and confirm fuel/tyre plan before release.");
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
        if (!lines.length) {
            lines.push(`Stint looks stable on lap ${summary.lap}. Hold ${summary.driverMode} mode and watch tyre wear (${(summary.maxTireWear * 100).toFixed(0)}%).`);
        }
    }
    if (question?.trim()) {
        lines.push(`(Offline engineer — could not reach Ollama for: "${question.trim()}")`);
    }
    return {
        entryId: summary.entryId,
        text: lines.join(" "),
        suggestedCommand: validateSuggestedCommand(suggestedCommand ?? ""),
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
        const summary = (0, telemetry_summary_1.summarizeTelemetry)(options.snap, options.raceTimeSec ?? 0);
        const online = await (0, ollama_client_1.ollamaAvailable)();
        if (!online) {
            return fallbackAdvice(summary, options.question);
        }
        const userParts = [
            options.trackName ? `Track: ${options.trackName}` : "",
            `Telemetry:\n${(0, telemetry_summary_1.summaryForPrompt)(summary)}`,
            options.question?.trim() ? `Team question: ${options.question.trim()}` : "",
        ].filter(Boolean);
        try {
            const result = await (0, ollama_client_1.ollamaChat)(SYSTEM_PROMPT, userParts.join("\n\n"));
            const { cleanText, suggestedCommand } = extractSuggestedCommand(result.text);
            return {
                entryId: summary.entryId,
                text: cleanText,
                suggestedCommand: validateSuggestedCommand(suggestedCommand ?? ""),
                offline: false,
                model: result.model,
                latencyMs: result.latencyMs,
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const fallback = fallbackAdvice(summary, options.question);
            fallback.text = `${fallback.text} (LLM error: ${msg})`;
            return fallback;
        }
    }
}
exports.EngineerService = EngineerService;
