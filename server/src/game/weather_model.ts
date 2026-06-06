export interface WeatherPreset {
  profile: string;
  trackWetness: number;
  ambientTempC: number;
}

const TRACK_BIAS: Record<string, Partial<WeatherPreset>> = {
  spa: { profile: "changeable", ambientTempC: 17 },
  paul_ricard: { profile: "hot_dry", ambientTempC: 28 },
  bahrain: { profile: "hot_dry", ambientTempC: 32 },
  losail: { profile: "hot_dry", ambientTempC: 30 },
  fuji: { profile: "changeable", ambientTempC: 22 },
  imola: { profile: "overcast", ambientTempC: 19 },
  lemans_la_sarthe: { profile: "changeable", ambientTempC: 18 },
  sao_paulo: { profile: "changeable", trackWetness: 0.12 },
  cota: { profile: "overcast", ambientTempC: 24 },
};

export function weatherForEvent(
  trackId: string,
  format: string,
  round: number,
): WeatherPreset {
  const bias = TRACK_BIAS[trackId] ?? {};
  let profile = bias.profile ?? "dry";

  if (format === "24h" && trackId === "lemans_la_sarthe") profile = "changeable";
  if (format === "test" && trackId === "paul_ricard") profile = "hot_dry";
  if (round % 4 === 2) profile = "overcast";

  const ambientTempC =
    bias.ambientTempC ??
    (profile === "hot_dry" ? 30 : profile === "wet" ? 16 : 22);
  const trackWetness =
    bias.trackWetness ??
    (profile === "wet" ? 0.55 : profile === "overcast" ? 0.08 : 0);

  return { profile, trackWetness, ambientTempC };
}
