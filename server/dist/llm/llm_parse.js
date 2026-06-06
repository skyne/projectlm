"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTaggedLine = extractTaggedLine;
exports.parseJsonBlock = parseJsonBlock;
function extractTaggedLine(text, tag) {
    const re = new RegExp(`\\n${tag}:\\s*(.+?)\\s*$`, "ims");
    const match = text.match(re);
    if (!match)
        return { cleanText: text.trim() };
    return {
        cleanText: text.slice(0, match.index).trim(),
        value: match[1].trim(),
    };
}
function parseJsonBlock(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fenced?.[1]?.trim() ?? text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start)
        return null;
    try {
        return JSON.parse(raw.slice(start, end + 1));
    }
    catch {
        return null;
    }
}
