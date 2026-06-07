/** Track ids with JSON geometry in /tracks (mirrors server track_catalog). */
export const TRACK_SURFACE_IDS = [
  "paul_ricard",
  "imola",
  "spa",
  "lemans_la_sarthe",
  "sao_paulo",
  "cota",
  "fuji",
  "losail",
  "bahrain",
] as const;

export type TrackSurfaceId = (typeof TRACK_SURFACE_IDS)[number];

export const TRACK_JSON_PATHS: Record<TrackSurfaceId, string> = {
  paul_ricard: "tracks/paul_ricard.json",
  imola: "tracks/imola.json",
  spa: "tracks/spa.json",
  lemans_la_sarthe: "tracks/lemans_la_sarthe.json",
  sao_paulo: "tracks/sao_paulo.json",
  cota: "tracks/cota.json",
  fuji: "tracks/fuji.json",
  losail: "tracks/losail.json",
  bahrain: "tracks/bahrain.json",
};
