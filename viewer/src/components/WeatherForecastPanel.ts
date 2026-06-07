import type { RaceControlPayload } from "../ws/protocol";
import { displayTrackWetnessPercent, trackWetnessBarPercent } from "../utils/trackWetnessDisplay";
import { projectWeatherForecast } from "../utils/weatherForecast";
import { phaseColor, phaseLabel } from "../utils/weatherPhase";

export class WeatherForecastPanel {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private lastRenderKey = "";

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel weather-forecast";
    this.root.innerHTML = `
      <h2>2h forecast</h2>
      <p class="forecast-climate hidden"></p>
      <div class="forecast-list"></div>
    `;
    container.appendChild(this.root);
    this.list = this.root.querySelector(".forecast-list")!;
  }

  update(rc: RaceControlPayload | undefined): void {
    const climateEl = this.root.querySelector(".forecast-climate") as HTMLElement;
    const label = rc?.weatherLabel;
    if (label) {
      climateEl.textContent = label;
      climateEl.classList.remove("hidden");
    } else {
      climateEl.classList.add("hidden");
    }

    if (!rc) {
      if (this.lastRenderKey === "empty") return;
      this.lastRenderKey = "empty";
      this.list.replaceChildren();
      this.list.textContent = "Waiting for weather data…";
      return;
    }

    const steps =
      rc.forecast && rc.forecast.length > 0 ? rc.forecast : projectWeatherForecast(rc);
    const renderKey = JSON.stringify({
      label,
      steps: steps.map((s) => [
        s.offsetMinutes,
        s.phase,
        trackWetnessBarPercent(s.trackWetness),
        Math.round(s.rainIntensity * 100),
        Math.round(s.ambientTempC),
      ]),
    });
    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;

    this.list.replaceChildren();
    for (const step of steps) {
      const row = document.createElement("div");
      row.className = "forecast-row";

      const time = document.createElement("span");
      time.className = "forecast-time";
      time.textContent = step.offsetMinutes === 0 ? "Now" : `+${step.offsetMinutes}m`;

      const badge = document.createElement("span");
      badge.className = "forecast-phase";
      badge.textContent = phaseLabel(step.phase);
      badge.style.background = phaseColor(step.phase);

      const barWrap = document.createElement("div");
      barWrap.className = "forecast-bar-wrap";
      const wetPct = trackWetnessBarPercent(step.trackWetness);
      const wetBar = document.createElement("div");
      wetBar.className = "forecast-bar forecast-bar-wet";
      wetBar.style.width = `${wetPct}%`;
      const rainBar = document.createElement("div");
      rainBar.className = "forecast-bar forecast-bar-rain";
      rainBar.style.width = `${Math.round(step.rainIntensity * 100)}%`;
      barWrap.append(wetBar, rainBar);

      const meta = document.createElement("span");
      meta.className = "forecast-meta";
      const wetMeta = displayTrackWetnessPercent(step.trackWetness);
      meta.textContent =
        wetMeta == null
          ? `${Math.round(step.ambientTempC)}°C`
          : `${Math.round(step.ambientTempC)}°C · ${wetMeta}% wet`;

      row.append(time, badge, barWrap, meta);
      this.list.appendChild(row);
    }

    const legend = document.createElement("div");
    legend.className = "forecast-legend";
    legend.innerHTML = `<span class="legend-wet">Track wetness</span><span class="legend-rain">Rain intensity</span>`;
    this.list.appendChild(legend);
  }
}
