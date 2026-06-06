import type { CarSnapshot } from "../ws_protocol";
import { ollamaAvailable, ollamaChat } from "./ollama_client";
import {
  summarizeTelemetry,
  summaryForPrompt,
  type TelemetrySummary,
} from "./telemetry_summary";

export interface EngineerAdvice {
  entryId: string;
  text: string;
  suggestedCommand?: string;
  offline: boolean;
  model?: string;
  latencyMs?: number;
}

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

function extractSuggestedCommand(text: string): {
  cleanText: string;
  suggestedCommand?: string;
} {
  const match = text.match(/\nSUGGESTED_COMMAND:\s*(.+)\s*$/i);
  if (!match) return { cleanText: text.trim() };
  const suggestedCommand = match[1].trim();
  const cleanText = text.slice(0, match.index).trim();
  return { cleanText, suggestedCommand };
}

function validateSuggestedCommand(command: string): string | undefined {
  const c = command.trim();
  if (!c) return undefined;
  if (/^driver_mode=(push|normal|conserve)$/i.test(c)) return c.toLowerCase();
  if (/^cancel_pit$/i.test(c)) return "cancel_pit";
  if (/^pit\|/i.test(c)) return c;
  return undefined;
}

function fallbackAdvice(summary: TelemetrySummary, question?: string): EngineerAdvice {
  const lines: string[] = [];
  let suggestedCommand: string | undefined;

  if (summary.retired) {
    lines.push("Car is retired — no live strategy available.");
  } else if (summary.inPit) {
    lines.push("Car is in the pit lane. Monitor stop time and confirm fuel/tyre plan before release.");
  } else {
    if (summary.fuelPercent <= 12) {
      lines.push(`Fuel critical at ${summary.fuelLiters.toFixed(0)}L (${summary.fuelPercent.toFixed(0)}% of tank). Box this lap.`);
      suggestedCommand = `pit|fuel=${Math.max(0, Math.round(summary.fuelTankLiters - summary.fuelLiters))}|compound=medium|tires=all`;
    } else if (summary.fuelPercent <= 28) {
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
      if (!suggestedCommand) suggestedCommand = "driver_mode=conserve";
    }

    if (!lines.length) {
      lines.push(
        `Stint looks stable on lap ${summary.lap}. Hold ${summary.driverMode} mode and watch tyre wear (${(summary.maxTireWear * 100).toFixed(0)}%).`,
      );
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

export class EngineerService {
  async getStatus(): Promise<{ online: boolean; model: string }> {
    const online = await ollamaAvailable();
    return {
      online,
      model: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
    };
  }

  async advise(options: {
    snap: CarSnapshot;
    raceTimeSec?: number;
    trackName?: string;
    question?: string;
  }): Promise<EngineerAdvice> {
    const summary = summarizeTelemetry(options.snap, options.raceTimeSec ?? 0);
    const online = await ollamaAvailable();

    if (!online) {
      return fallbackAdvice(summary, options.question);
    }

    const userParts = [
      options.trackName ? `Track: ${options.trackName}` : "",
      `Telemetry:\n${summaryForPrompt(summary)}`,
      options.question?.trim() ? `Team question: ${options.question.trim()}` : "",
    ].filter(Boolean);

    try {
      const result = await ollamaChat(SYSTEM_PROMPT, userParts.join("\n\n"));
      const { cleanText, suggestedCommand } = extractSuggestedCommand(result.text);
      return {
        entryId: summary.entryId,
        text: cleanText,
        suggestedCommand: validateSuggestedCommand(suggestedCommand ?? ""),
        offline: false,
        model: result.model,
        latencyMs: result.latencyMs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const fallback = fallbackAdvice(summary, options.question);
      fallback.text = `${fallback.text} (LLM error: ${msg})`;
      return fallback;
    }
  }
}
