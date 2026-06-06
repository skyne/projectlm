"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ollamaAvailable = ollamaAvailable;
exports.ollamaChat = ollamaChat;
const DEFAULT_BASE = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
async function ollamaAvailable(baseUrl = DEFAULT_BASE, timeoutMs = 1500) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
    }
    catch {
        return false;
    }
}
async function ollamaChat(system, user, options = {}) {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE;
    const model = options.model ?? DEFAULT_MODEL;
    const timeoutMs = options.timeoutMs ?? 45000;
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
        const data = (await res.json());
        const text = data.message?.content?.trim() ?? "";
        if (!text)
            throw new Error("Empty Ollama response");
        return {
            text,
            model,
            latencyMs: Date.now() - started,
        };
    }
    finally {
        clearTimeout(timer);
    }
}
