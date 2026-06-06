/** Illustrated aerial-map palettes — MM2 / GT Manager inspired painterly circuits. */

export interface TrackTheme {
  id: string;
  label: string;
  /** Outfield scrub / forest base */
  outfield: string;
  /** Infield grass (inside circuit loop) */
  infield: string;
  /** Lighter grass highlight at infield centre */
  infieldLight: string;
  /** Dirt / sand patch accent */
  dirt: string;
  /** Canvas centre tone (CSS stage) */
  surface: string;
  /** Corner vignette */
  surfaceDeep: string;
  /** Large soft terrain wash A */
  terrainPrimary: string;
  /** Large soft terrain wash B */
  terrainSecondary: string;
  /** Run-off / gravel ribbon */
  runoff: string;
  /** Asphalt surface */
  asphalt: string;
  /** Asphalt outer edge shadow */
  asphaltDark: string;
  /** Asphalt centre sheen */
  asphaltHighlight: string;
  kerb: string;
  kerbAlt: string;
  sectorColors: string[];
  accent: string;
  /** CSS radial bloom for stage wrapper */
  stageBloom: string;
}

function theme(
  partial: Omit<TrackTheme, "id" | "label"> & { id: string; label: string },
): TrackTheme {
  return partial;
}

export const BIOME_THEMES: Record<string, TrackTheme> = {
  mediterranean: theme({
    id: "mediterranean",
    label: "Mediterranean",
    outfield: "#3a5c38",
    infield: "#5a7a48",
    infieldLight: "#6e9258",
    dirt: "#9a7848",
    surface: "#2a4030",
    surfaceDeep: "#1a2818",
    terrainPrimary: "#4a6840",
    terrainSecondary: "#6a8850",
    runoff: "#c4b090",
    asphalt: "#454a52",
    asphaltDark: "#2e3238",
    asphaltHighlight: "#5c626a",
    kerb: "#e10600",
    kerbAlt: "#f4f4f4",
    sectorColors: ["#d45a52", "#52a878", "#4a88b8", "#d4a843", "#8868a8"],
    accent: "#d4a843",
    stageBloom: "rgba(90, 130, 72, 0.35)",
  }),
  forest: theme({
    id: "forest",
    label: "Ardennes Forest",
    outfield: "#284830",
    infield: "#3a6840",
    infieldLight: "#4a7848",
    dirt: "#6a5840",
    surface: "#1a3024",
    surfaceDeep: "#101c14",
    terrainPrimary: "#2a5038",
    terrainSecondary: "#3a6040",
    runoff: "#a89878",
    asphalt: "#404840",
    asphaltDark: "#2a302a",
    asphaltHighlight: "#565e56",
    kerb: "#e10600",
    kerbAlt: "#f0f0f0",
    sectorColors: ["#c85858", "#48a868", "#4888a0", "#c8a040", "#7868a0"],
    accent: "#5dd39e",
    stageBloom: "rgba(50, 110, 70, 0.32)",
  }),
  ardennes: theme({
    id: "forest",
    label: "Ardennes Forest",
    outfield: "#284830",
    infield: "#3a6840",
    infieldLight: "#4a7848",
    dirt: "#6a5840",
    surface: "#1a3024",
    surfaceDeep: "#101c14",
    terrainPrimary: "#2a5038",
    terrainSecondary: "#3a6040",
    runoff: "#a89878",
    asphalt: "#404840",
    asphaltDark: "#2a302a",
    asphaltHighlight: "#565e56",
    kerb: "#e10600",
    kerbAlt: "#f0f0f0",
    sectorColors: ["#c85858", "#48a868", "#4888a0", "#c8a040", "#7868a0"],
    accent: "#5dd39e",
    stageBloom: "rgba(50, 110, 70, 0.32)",
  }),
  desert: theme({
    id: "desert",
    label: "Desert",
    outfield: "#6a5838",
    infield: "#8a7848",
    infieldLight: "#a09058",
    dirt: "#b89868",
    surface: "#3a3020",
    surfaceDeep: "#241c10",
    terrainPrimary: "#7a6840",
    terrainSecondary: "#9a8050",
    runoff: "#d4c4a0",
    asphalt: "#504840",
    asphaltDark: "#383028",
    asphaltHighlight: "#686058",
    kerb: "#d35400",
    kerbAlt: "#f8f0e0",
    sectorColors: ["#d87848", "#a89850", "#8898a8", "#d8a848", "#b87848"],
    accent: "#e8c468",
    stageBloom: "rgba(180, 140, 70, 0.3)",
  }),
  tropical: theme({
    id: "tropical",
    label: "Tropical",
    outfield: "#1a5848",
    infield: "#2a7858",
    infieldLight: "#389868",
    dirt: "#8a7040",
    surface: "#143028",
    surfaceDeep: "#0c2018",
    terrainPrimary: "#1a6048",
    terrainSecondary: "#288060",
    runoff: "#a8a080",
    asphalt: "#3a4844",
    asphaltDark: "#283430",
    asphaltHighlight: "#505c58",
    kerb: "#e10600",
    kerbAlt: "#ffffff",
    sectorColors: ["#e85850", "#38a868", "#3898b8", "#e8c040", "#48a898"],
    accent: "#00a651",
    stageBloom: "rgba(40, 140, 100, 0.28)",
  }),
  temperate: theme({
    id: "temperate",
    label: "Temperate",
    outfield: "#3a5038",
    infield: "#507048",
    infieldLight: "#628058",
    dirt: "#887058",
    surface: "#243028",
    surfaceDeep: "#181e18",
    terrainPrimary: "#405840",
    terrainSecondary: "#587050",
    runoff: "#b0a890",
    asphalt: "#444a50",
    asphaltDark: "#2e3438",
    asphaltHighlight: "#5a6068",
    kerb: "#e10600",
    kerbAlt: "#eeeeee",
    sectorColors: ["#e10600", "#00a651", "#005aff", "#d4a843", "#8868a8"],
    accent: "#6ba3ff",
    stageBloom: "rgba(70, 110, 80, 0.28)",
  }),
  default: theme({
    id: "default",
    label: "Circuit",
    outfield: "#3a5038",
    infield: "#507048",
    infieldLight: "#628058",
    dirt: "#887058",
    surface: "#243028",
    surfaceDeep: "#181e18",
    terrainPrimary: "#405840",
    terrainSecondary: "#587050",
    runoff: "#b0a890",
    asphalt: "#444a50",
    asphaltDark: "#2e3438",
    asphaltHighlight: "#5a6068",
    kerb: "#e10600",
    kerbAlt: "#eeeeee",
    sectorColors: ["#3d5a80", "#4a6741", "#6b4c7a", "#8b6914", "#4a6670"],
    accent: "#d4a843",
    stageBloom: "rgba(80, 110, 80, 0.26)",
  }),
};

export const TRACK_BIOMES: Record<string, string> = {
  paul_ricard: "mediterranean",
  lemans_la_sarthe: "temperate",
  spa: "forest",
  imola: "mediterranean",
  monza: "mediterranean",
  fuji: "temperate",
  bahrain: "desert",
  losail: "desert",
  sao_paulo: "tropical",
  cota: "temperate",
};

export function resolveTrackTheme(trackId?: string, biome?: string): TrackTheme {
  const biomeKey = (biome ?? (trackId ? TRACK_BIOMES[trackId] : undefined) ?? "default")
    .toLowerCase()
    .replace(/\s+/g, "_");
  return BIOME_THEMES[biomeKey] ?? BIOME_THEMES.default;
}
