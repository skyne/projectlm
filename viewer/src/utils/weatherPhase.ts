export function phaseLabel(phase: string | undefined): string {
  switch (phase) {
    case "LightRain":
      return "Light rain";
    case "HeavyRain":
      return "Heavy rain";
    case "Cloudy":
      return "Cloudy";
    case "Drying":
      return "Drying";
    default:
      return "Dry";
  }
}

export function phaseColor(phase: string | undefined): string {
  switch (phase) {
    case "LightRain":
      return "#60a5fa";
    case "HeavyRain":
      return "#2563eb";
    case "Cloudy":
      return "#94a3b8";
    case "Drying":
      return "#fbbf24";
    default:
      return "#86efac";
  }
}
