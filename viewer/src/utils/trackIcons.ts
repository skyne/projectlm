/** Minimal SVG track silhouettes for season calendar cards */

const TRACK_ICONS: Record<string, string> = {
  paul_ricard: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 28 L52 28 C64 28 70 22 68 14 C66 8 58 6 50 10 L18 10 C10 8 8 16 12 28 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M30 28 L34 20 L38 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  imola: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 30 C14 12 28 6 42 10 L58 14 C70 18 72 30 64 38 C54 44 36 42 24 36 C16 32 12 38 14 30 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M42 10 L46 18 L42 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  lemans_la_sarthe: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M8 24 C8 12 18 6 28 8 L52 8 C62 6 72 14 72 24 C72 34 62 42 50 40 L28 40 C16 42 8 36 8 24 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M52 8 L58 18 L52 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="58" cy="18" r="2" fill="currentColor"/>
  </svg>`,
  spa: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10 30 C10 14 22 6 36 8 L58 10 C70 12 74 22 70 32 C66 42 52 44 40 38 L22 34 C14 32 10 38 10 30 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M36 8 L42 16 L38 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  sao_paulo: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16 32 C10 24 12 12 24 8 L48 10 C62 12 68 22 62 32 C56 40 40 42 28 38 C20 34 18 38 16 32 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M36 18 L42 24 L36 30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  cota: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10 26 L34 26 C42 26 46 20 44 14 L40 8 L58 8 C68 10 72 20 68 30 C64 40 48 42 36 36 L14 36 C8 34 8 30 10 26 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M20 26 L24 18 L28 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  fuji: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 28 C12 16 22 8 36 8 L56 10 C68 14 70 26 62 36 C52 44 32 42 20 36 C14 32 14 34 14 28 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M48 10 L52 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  losail: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 26 C12 14 24 8 38 8 L58 10 C70 14 72 26 66 36 C58 44 36 42 22 36 C14 32 10 34 12 26 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <line x1="38" y1="8" x2="38" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  bahrain: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10 30 L46 30 C56 30 62 24 60 16 L56 8 L68 8 C74 12 74 24 68 34 C60 42 40 40 28 34 L10 34 C6 32 6 32 10 30 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M56 16 L62 22 L56 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  monza: `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="40" cy="24" rx="30" ry="16" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <path d="M10 24 L18 24 M62 24 L70 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M40 8 L44 16 L40 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
};

const DEFAULT_ICON = `<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M12 28 C12 16 20 8 32 8 L52 8 C64 8 68 18 68 28 C68 38 58 42 46 40 L26 40 C16 40 12 36 12 28 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <line x1="40" y1="8" x2="40" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const TRACK_NAMES: Record<string, string> = {
  paul_ricard: "Circuit Paul Ricard",
  imola: "Autodromo Enzo e Dino Ferrari",
  spa: "Circuit de Spa-Francorchamps",
  lemans_la_sarthe: "Circuit de la Sarthe",
  sao_paulo: "Autódromo José Carlos Pace",
  cota: "Circuit of the Americas",
  fuji: "Fuji Speedway",
  losail: "Lusail International Circuit",
  bahrain: "Bahrain International Circuit",
  monza: "Autodromo Nazionale Monza",
};

export function trackIconSvg(trackId: string): string {
  return TRACK_ICONS[trackId] ?? DEFAULT_ICON;
}

export function trackDisplayName(trackId: string): string {
  return TRACK_NAMES[trackId] ?? trackId.replace(/_/g, " ");
}

export function formatDurationLabel(
  format: string,
  eventType?: "test" | "race",
): string {
  const lower = format.toLowerCase();
  if (eventType === "test" || lower === "test") return "Official Test";
  if (lower === "1812km") return "1812 km";
  if (lower.endsWith("h")) return `${lower.replace("h", "")} Hour`;
  return format;
}

export function calendarRoundLabel(
  round: number,
  eventType?: "test" | "race",
): string {
  if (eventType === "test" || round === 0) return "Test";
  return `R${round}`;
}
