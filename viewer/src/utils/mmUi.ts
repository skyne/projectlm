/** Shared Motorsport Manager 2 / WEC UI fragments */

export type PanelTheme = "glass" | "dense" | "grid";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function panelThemeClass(theme: PanelTheme = "glass"): string {
  switch (theme) {
    case "dense":
      return "panel-dense";
    case "grid":
      return "panel-grid";
    default:
      return "panel-glass";
  }
}

export function mmPanelHeader(
  title: string,
  options: {
    subtitle?: string;
    badge?: string;
    badgeClass?: string;
    theme?: PanelTheme;
  } = {},
): string {
  const { subtitle, badge, badgeClass, theme = "glass" } = options;
  const resolvedBadgeClass =
    badgeClass ??
    (badge === "LIVE" ? "mm-badge-live-gradient" : "mm-badge-gold");
  return `
    <header class="mm-panel-header mm-panel-header-${theme}">
      <div class="mm-panel-title-row">
        <span class="mm-panel-accent" aria-hidden="true"></span>
        <div class="mm-panel-titles">
          <h2 class="mm-panel-title">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="mm-panel-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </div>
      ${badge ? `<span class="mm-badge ${resolvedBadgeClass}">${escapeHtml(badge)}</span>` : ""}
    </header>
  `;
}

export const NAV_ICONS: Record<string, string> = {
  season: "◆",
  calendar: "📅",
  map: "🗺",
  timing: "⏱",
  telemetry: "📊",
  racelog: "📋",
  garage: "⚙",
  team: "🏢",
  drivers: "🏎",
};

export function wecClassBadge(classId: string): string {
  return `<span class="class-badge class-${escapeHtml(classId)}">${escapeHtml(classId)}</span>`;
}
