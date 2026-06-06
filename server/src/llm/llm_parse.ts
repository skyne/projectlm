export function extractTaggedLine(text: string, tag: string): {
  cleanText: string;
  value?: string;
} {
  const re = new RegExp(`\\n${tag}:\\s*(.+?)\\s*$`, "ims");
  const match = text.match(re);
  if (!match) return { cleanText: text.trim() };
  return {
    cleanText: text.slice(0, match.index).trim(),
    value: match[1].trim(),
  };
}

export function parseJsonBlock<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
