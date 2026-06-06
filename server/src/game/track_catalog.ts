const TRACK_PATHS: Record<string, string> = {
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

export function trackConfigPath(trackId: string): string {
  return TRACK_PATHS[trackId] ?? `tracks/${trackId}.json`;
}
