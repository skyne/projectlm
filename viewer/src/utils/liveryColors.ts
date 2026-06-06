import { closeColorPicker, openColorPicker } from "./colorPicker";

export const DEFAULT_PRIMARY = "#d4a843";
export const DEFAULT_SECONDARY = "#1a2a44";

export const COLOR_PRESETS = [
  "#d4a843",
  "#e8922a",
  "#4a7fd4",
  "#6ee7a0",
  "#f87171",
  "#a78bfa",
  "#38bdf8",
  "#f472b6",
  "#ffffff",
  "#1a2a44",
  "#0f1117",
  "#374151",
];

export function teamInitials(teamName: string): string {
  const trimmed = teamName.trim();
  if (trimmed.length < 2) return "??";
  return trimmed
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

export interface ColorSwatchOptions {
  /** Live preview while the custom picker is open (avoids re-binding swatches). */
  onLive?: (color: string) => void;
  /** Restore UI when the picker closes without applying. */
  onCancel?: () => void;
}

export function isPresetColor(color: string): boolean {
  const lower = color.toLowerCase();
  return COLOR_PRESETS.some((c) => c.toLowerCase() === lower);
}

export function bindColorSwatches(
  container: HTMLElement,
  active: string,
  onPick: (color: string) => void,
  options?: ColorSwatchOptions,
): void {
  container.replaceChildren();
  for (const color of COLOR_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.style.background = color;
    btn.title = color;
    if (color.toLowerCase() === active.toLowerCase()) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      closeColorPicker();
      onPick(color);
    });
    container.appendChild(btn);
  }

  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = "color-swatch color-swatch-custom";
  customBtn.title = "Custom color";
  const isCustomActive = !isPresetColor(active);
  if (isCustomActive) {
    customBtn.style.background = active;
    customBtn.classList.add("selected");
  }
  customBtn.innerHTML = `<span class="color-swatch-custom-icon" aria-hidden="true">+</span>`;
  customBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openColorPicker({
      anchor: customBtn,
      color: active,
      onChange: (hex) => {
        customBtn.style.background = hex;
        customBtn.classList.add("selected");
        for (const swatch of container.querySelectorAll(".color-swatch:not(.color-swatch-custom)")) {
          swatch.classList.remove("selected");
        }
        options?.onLive?.(hex);
      },
      onCommit: (hex) => onPick(hex),
      onCancel: options?.onCancel,
    });
  });
  container.appendChild(customBtn);
}
