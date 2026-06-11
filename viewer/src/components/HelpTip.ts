import type { GameCatalogPayload } from "../ws/protocol";
import { glossaryEntry } from "../utils/glossary";

/** Inline ? tooltip wired to game_catalog glossary (HX). */
export function mountHelpTip(
  anchor: HTMLElement,
  catalog: GameCatalogPayload | null | undefined,
  glossaryKey: string,
  label?: string,
): HTMLButtonElement {
  const entry = glossaryEntry(catalog, glossaryKey);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "help-tip-btn";
  btn.setAttribute("aria-label", `Help: ${entry?.label ?? label ?? glossaryKey}`);
  btn.textContent = "?";
  const title = entry
    ? `${entry.label}\n${entry.short}\n\n${entry.long}`
    : (label ?? glossaryKey);
  btn.title = title;
  anchor.appendChild(btn);
  return btn;
}

export function helpTipHtml(
  catalog: GameCatalogPayload | null | undefined,
  glossaryKey: string,
  label?: string,
): string {
  const entry = glossaryEntry(catalog, glossaryKey);
  const aria = entry?.label ?? label ?? glossaryKey;
  const title = entry
    ? `${entry.label} — ${entry.short}`
    : (label ?? glossaryKey);
  return `<button type="button" class="help-tip-btn" aria-label="Help: ${aria}" title="${title.replace(/"/g, "&quot;")}">?</button>`;
}
