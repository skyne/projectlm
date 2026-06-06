export interface OllamaChatOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export interface OllamaChatResult {
  text: string;
  model: string;
  latencyMs: number;
}

const DEFAULT_BASE = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

export async function ollamaAvailable(
  baseUrl = DEFAULT_BASE,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaChat(
  system: string,
  user: string,
  options: OllamaChatOptions = {},
): Promise<OllamaChatResult> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE;
  const model = options.model ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const started = Date.now();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        options: {
          temperature: 0.35,
          num_predict: 320,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const text = data.message?.content?.trim() ?? "";
    if (!text) throw new Error("Empty Ollama response");

    return {
      text,
      model,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
