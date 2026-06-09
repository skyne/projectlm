/** Shared Motorsport Manager 2 / WEC UI fragments */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mmPanelHeader(
  title: string,
  options: { subtitle?: string; badge?: string; badgeClass?: string } = {},
): string {
  const { subtitle, badge, badgeClass = "mm-badge-gold" } = options;
  return `
    <header class="mm-panel-header">
      <div class="mm-panel-title-row">
        <span class="mm-panel-accent" aria-hidden="true"></span>
        <div class="mm-panel-titles">
          <h2 class="mm-panel-title">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="mm-panel-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </div>
      ${badge ? `<span class="mm-badge ${badgeClass}">${escapeHtml(badge)}</span>` : ""}
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
