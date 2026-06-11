import type { RaceControlPayload, WeatherForecastStepPayload } from "../ws/protocol";
import { displayTrackWetnessPercent, trackWetnessBarPercent } from "../utils/trackWetnessDisplay";
import { formatVisibilityKm, visibilityLevel } from "../utils/visibilityDisplay";
import { projectWeatherForecast } from "../utils/weatherForecast";
import { phaseColor, phaseLabel, phaseShortLabel } from "../utils/weatherPhase";

/** Coarse buckets so tick-level wind jitter does not rebuild the list. */
function coarseWindMs(windMs: number | undefined): number {
  const w = windMs ?? 0;
  if (w < 0.5) return 0;
  return Math.round(w / 3) * 3;
}

function coarseVisibilityKm(km: number | undefined): number {
  return Math.round((km ?? 10) * 2) / 2;
}

function formatWindStat(windMs: number | undefined): string {
  const w = windMs ?? 0;
  if (w < 0.5) return "—";
  return `${Math.round(w)}m`;
}

function formatVisStat(km: number | undefined): { text: string; level: "ok" | "moderate" | "poor" | "critical" } {
  const v = km ?? 10;
  if (v >= 8) return { text: "—", level: "ok" };
  const text = v < 10 ? `${v.toFixed(1)}k` : `${Math.round(v)}k`;
  return { text, level: visibilityLevel(v) };
}

export class WeatherForecastPanel {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private nowStrip: HTMLElement;
  private lastListKey = "";
  private lastNowKey = "";

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel weather-forecast";
    this.root.innerHTML = `
      <div class="weather-now-strip hidden" aria-live="polite"></div>
      <h2>2h forecast</h2>
      <p class="forecast-climate hidden"></p>
      <div class="forecast-list"></div>
    `;
    container.appendChild(this.root);
    this.list = this.root.querySelector(".forecast-list")!;
    this.nowStrip = this.root.querySelector(".weather-now-strip")!;
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
      if (this.lastListKey === "empty") return;
      this.lastListKey = "empty";
      this.lastNowKey = "";
      this.nowStrip.classList.add("hidden");
      this.list.replaceChildren();
      this.list.textContent = "Waiting for weather data…";
      return;
    }

    this.updateNowStrip(rc);
    this.updateForecastList(rc, label);
  }

  private updateNowStrip(rc: RaceControlPayload): void {
    const visKm = rc.visibilityKm ?? 10;
    const rainPct = Math.round((rc.rainIntensity ?? 0) * 100);
    const level = visibilityLevel(visKm);
    const nowKey = `${phaseLabel(rc.weatherPhase)}|${visKm.toFixed(1)}|${rainPct}|${level}`;
    if (nowKey === this.lastNowKey) return;
    this.lastNowKey = nowKey;

    const severe = level !== "good" || rainPct >= 50 || rc.redFlagActive === true;
    this.root.classList.toggle("weather-forecast--severe", severe);
    this.nowStrip.className = `weather-now-strip weather-now-strip--${level}`;
    this.nowStrip.replaceChildren();

    const phase = document.createElement("span");
    phase.className = "weather-now-phase";
    phase.textContent = phaseLabel(rc.weatherPhase ?? "Dry");
    this.nowStrip.appendChild(phase);

    const vis = document.createElement("span");
    vis.className = "weather-now-vis";
    vis.textContent = formatVisibilityKm(visKm);
    this.nowStrip.appendChild(vis);

    const rain = document.createElement("span");
    rain.className = "weather-now-rain";
    rain.textContent = `${rainPct}% rain`;
    this.nowStrip.appendChild(rain);

    this.nowStrip.classList.remove("hidden");
  }

  private updateForecastList(rc: RaceControlPayload, label: string | undefined): void {
    const steps =
      rc.forecast && rc.forecast.length > 0 ? rc.forecast : projectWeatherForecast(rc);
    const listKey = JSON.stringify({
      label,
      steps: steps.map((s) => [
        s.offsetMinutes,
        s.phase,
        trackWetnessBarPercent(s.trackWetness),
        Math.round(s.rainIntensity * 100),
        Math.round(s.ambientTempC),
        Math.round(s.trackTempC ?? s.ambientTempC),
        coarseWindMs(s.windSpeedMs),
        coarseVisibilityKm(s.visibilityKm),
      ]),
    });
    if (listKey === this.lastListKey) return;
    this.lastListKey = listKey;

    this.list.replaceChildren();
    for (const step of steps) {
      this.list.appendChild(this.buildRow(step));
    }

    const legend = document.createElement("div");
    legend.className = "forecast-legend";
    legend.innerHTML =
      `<span class="legend-wet">Wet</span><span class="legend-rain">Rain</span>` +
      `<span class="legend-stat-hint">°C · % · m/s · vis</span>`;
    this.list.appendChild(legend);
  }

  private buildRow(step: WeatherForecastStepPayload): HTMLElement {
    const row = document.createElement("div");
    row.className = "forecast-row";

    const time = document.createElement("span");
    time.className = "forecast-time";
    time.textContent = step.offsetMinutes === 0 ? "Now" : `+${step.offsetMinutes}m`;

    const badge = document.createElement("span");
    badge.className = "forecast-phase";
    badge.textContent = phaseShortLabel(step.phase);
    badge.title = phaseLabel(step.phase);
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

    const stats = document.createElement("div");
    stats.className = "forecast-stats";

    const airT = Math.round(step.ambientTempC);
    const trackT = Math.round(step.trackTempC ?? step.ambientTempC);
    const temp = document.createElement("span");
    temp.className = "forecast-stat";
    temp.title = `Air ${airT}°C · track ${trackT}°C`;
    temp.textContent = `${airT}°`;

    const wetMeta = displayTrackWetnessPercent(step.trackWetness);
    const wet = document.createElement("span");
    wet.className = "forecast-stat";
    wet.title = wetMeta == null ? "Track dry" : `Track ${wetMeta}% wet`;
    wet.textContent = wetMeta == null ? "—" : `${wetMeta}%`;

    const wind = document.createElement("span");
    wind.className = "forecast-stat";
    wind.title = "Wind m/s";
    wind.textContent = formatWindStat(step.windSpeedMs);

    const visInfo = formatVisStat(step.visibilityKm);
    const vis = document.createElement("span");
    vis.className = `forecast-stat forecast-stat--vis forecast-stat--vis-${visInfo.level}`;
    vis.title = "Visibility";
    vis.textContent = visInfo.text;

    stats.append(temp, wet, wind, vis);
    row.append(time, badge, barWrap, stats);
    return row;
  }
}
