import type {
  CarSnapshot,
  RaceControlPayload,
  TrackGeometryPayload,
  WeatherContextPayload,
  WeekendSessionType,
} from "../ws/protocol";
import { sessionMapMetaPrefix } from "../utils/weekendSessions";
import { trackDisplayName, trackIconSvg } from "../utils/trackIcons";
import { trackSurfaceBackgroundUrl } from "../utils/trackBackgroundAssets";
import { formatTrackWetnessConditions } from "../utils/trackWetnessDisplay";
import { applyTrackTimePhase } from "../utils/trackWeatherVisual";
import { formatSectorFlagBanner } from "../utils/sectorFlags";
import { resolveTrackTheme, type TrackTheme } from "../utils/trackThemes";
import type { SvgTrack } from "./SvgTrack";

export interface TrackMapLayerFlags {
  sectors: boolean;
  labels: boolean;
  pit: boolean;
}

export class TrackMapPanel {
  readonly trackContainer: HTMLElement;
  private mapPanel: HTMLElement;
  private titleEl: HTMLElement;
  private metaEl: HTMLElement;
  private weatherEl: HTMLElement;
  private sectorLegendEl: HTMLElement;
  private flagStatusEl: HTMLElement;
  private classLegendEl: HTMLElement;
  private carCountEl: HTMLElement;
  private trackRef: SvgTrack | null = null;
  private theme: TrackTheme = resolveTrackTheme();
  private layers: TrackMapLayerFlags = { sectors: true, labels: true, pit: true };
  private geometry: TrackGeometryPayload | null = null;
  private weather: WeatherContextPayload | undefined;
  private trackId: string | undefined;
  private sessionType?: WeekendSessionType;
  private lastSectorFlagsKey = "";

  constructor(mapPanel: HTMLElement) {
    this.mapPanel = mapPanel;
    mapPanel.classList.add("track-map-panel");

    const bar = mapPanel.querySelector(".track-panel-bar");
    mapPanel.innerHTML = "";
    if (bar) mapPanel.appendChild(bar);

    const shell = document.createElement("div");
    shell.className = "track-map-shell";
    shell.innerHTML = `
      <header class="track-map-hud">
        <div class="track-map-hud-brand">
          <span class="track-map-icon" aria-hidden="true"></span>
          <div class="track-map-titles">
            <h2 class="track-map-title">Track Map</h2>
            <p class="track-map-meta"></p>
          </div>
        </div>
        <div class="track-map-hud-stats">
          <div class="track-map-stat">
            <span class="track-map-stat-label">Conditions</span>
            <span class="track-map-weather">—</span>
          </div>
          <div class="track-map-stat">
            <span class="track-map-stat-label">On track</span>
            <span class="track-map-car-count">0</span>
          </div>
        </div>
      </header>
      <div class="track-map-stage">
        <div class="track-map-atmosphere" aria-hidden="true"></div>
        <div id="track-container" class="track-map-canvas-host"></div>
        <div class="track-map-overlays">
          <div class="track-sector-legend"></div>
          <div class="track-flag-status hidden" role="status" aria-live="polite"></div>
          <div class="track-class-legend"></div>
          <div class="track-map-toolbar">
            <button type="button" class="track-map-btn" data-action="reset" title="Reset zoom">⌖</button>
            <button type="button" class="track-map-btn active" data-layer="sectors" title="Sector colours">S</button>
            <button type="button" class="track-map-btn active" data-layer="labels" title="Corner labels">L</button>
            <button type="button" class="track-map-btn active" data-layer="pit" title="Pit lane">P</button>
          </div>
          <p class="track-map-hint">Scroll to zoom · drag when zoomed · double-click reset</p>
        </div>
      </div>
    `;
    mapPanel.appendChild(shell);

    this.trackContainer = shell.querySelector("#track-container")!;
    this.titleEl = shell.querySelector(".track-map-title")!;
    this.metaEl = shell.querySelector(".track-map-meta")!;
    this.weatherEl = shell.querySelector(".track-map-weather")!;
    this.sectorLegendEl = shell.querySelector(".track-sector-legend")!;
    this.flagStatusEl = shell.querySelector(".track-flag-status")!;
    this.classLegendEl = shell.querySelector(".track-class-legend")!;
    this.carCountEl = shell.querySelector(".track-map-car-count")!;

    this.renderClassLegend();

    shell.querySelector('[data-action="reset"]')!.addEventListener("click", () => {
      this.trackRef?.resetView();
    });

    for (const btn of shell.querySelectorAll<HTMLButtonElement>("[data-layer]")) {
      btn.addEventListener("click", () => {
        const layer = btn.dataset.layer as keyof TrackMapLayerFlags;
        this.layers[layer] = !this.layers[layer];
        btn.classList.toggle("active", this.layers[layer]);
        this.trackRef?.setLayerVisibility(this.layers);
      });
    }
  }

  bindTrack(track: SvgTrack): void {
    this.trackRef = track;
    if (this.geometry) {
      track.setTheme(this.theme);
      track.setGeometry(this.geometry);
      track.setLayerVisibility(this.layers);
    }
  }

  setSessionType(sessionType?: WeekendSessionType): void {
    this.sessionType = sessionType;
    this.renderHeader();
  }

  setWeatherContext(ctx: WeatherContextPayload | undefined): void {
    this.weather = ctx;
    this.trackId = ctx?.trackId ?? this.trackId;
    this.theme = resolveTrackTheme(this.trackId, ctx?.biome);
    if (this.trackRef) {
      this.trackRef.setTheme(this.theme);
      this.trackRef.setTrackId(this.trackId);
    }
    this.applyThemeToStage();
    this.renderHeader();
  }

  setGeometry(geometry: TrackGeometryPayload, trackId?: string): void {
    this.geometry = geometry;
    if (trackId) this.trackId = trackId;
    this.theme = resolveTrackTheme(this.trackId, this.weather?.biome);
    this.applyThemeToStage();
    this.trackRef?.setTheme(this.theme);
    this.trackRef?.setTrackId(this.trackId);
    this.trackRef?.setGeometry(geometry);
    this.trackRef?.setLayerVisibility(this.layers);
    this.renderHeader();
    this.renderSectorLegend(geometry);
  }

  updateLiveStats(snapshots: CarSnapshot[], raceControl?: RaceControlPayload): void {
    const active = snapshots.filter((s) => !s.retired).length;
    this.carCountEl.textContent = String(active);

    if (raceControl) {
      const rain = Math.round((raceControl.rainIntensity ?? 0) * 100);
      const parts = [this.weather?.label ?? this.theme.label];
      if (rain > 0) parts.push(`Rain ${rain}%`);
      const wetLabel = formatTrackWetnessConditions(raceControl.trackWetness);
      if (wetLabel) parts.push(wetLabel);
      parts.push(
        `Air ${Math.round(raceControl.ambientTempC)}°C · Track ${Math.round(raceControl.trackTempC ?? raceControl.ambientTempC)}°C`,
      );
      if ((raceControl.windSpeedMs ?? 0) > 0.5) {
        parts.push(`Wind ${Math.round(raceControl.windSpeedMs)} m/s`);
      }
      if ((raceControl.visibilityKm ?? 10) < 8) {
        parts.push(`Vis ${raceControl.visibilityKm!.toFixed(1)} km`);
      }
      this.weatherEl.textContent = parts.join(" · ");
    }

    this.updateSectorFlags(raceControl?.sectorFlags ?? []);
  }

  private updateSectorFlags(flags: number[]): void {
    const key = flags.join(",");
    if (key === this.lastSectorFlagsKey) return;
    this.lastSectorFlagsKey = key;

    const chips = this.sectorLegendEl.querySelectorAll<HTMLElement>(".track-sector-chip");
    chips.forEach((chip, idx) => {
      const level = flags[idx] ?? 0;
      chip.classList.remove("track-sector-chip--yellow", "track-sector-chip--double-yellow");
      if (level >= 2) chip.classList.add("track-sector-chip--double-yellow");
      else if (level >= 1) chip.classList.add("track-sector-chip--yellow");
    });

    const sectorNames = this.geometry?.sectors.map((sector) => sector.name);
    const banner = formatSectorFlagBanner(flags, sectorNames);
    if (!banner) {
      this.flagStatusEl.className = "track-flag-status hidden";
      this.flagStatusEl.textContent = "";
      return;
    }

    this.flagStatusEl.className = `track-flag-status track-flag-status--${banner.severity}`;
    this.flagStatusEl.textContent = banner.label;
  }

  private applyThemeToStage(): void {
    const stage = this.mapPanel.querySelector(".track-map-stage") as HTMLElement | null;
    if (!stage) return;
    stage.style.setProperty("--track-accent", this.theme.accent);
    stage.style.setProperty("--track-surface", this.theme.surface);
    stage.style.setProperty("--track-surface-deep", this.theme.surfaceDeep);
    stage.style.setProperty("--track-bloom", this.theme.stageBloom);
    stage.style.setProperty("--track-outfield", this.theme.outfield);
    stage.style.setProperty("--track-infield", this.theme.infield);
    stage.style.setProperty(
      "--track-bg-image",
      `url("${trackSurfaceBackgroundUrl(this.trackId, this.theme)}")`,
    );
    applyTrackTimePhase(stage, this.weather);
  }

  private renderHeader(): void {
    const geo = this.geometry;
    const name = geo?.name ?? (this.trackId ? trackDisplayName(this.trackId) : "Circuit");
    this.titleEl.textContent = name;

    const iconHost = this.mapPanel.querySelector(".track-map-icon");
    if (iconHost && this.trackId) {
      iconHost.innerHTML = trackIconSvg(this.trackId);
    }

    const lapKm = geo ? (geo.lapLength / 1000).toFixed(3) : "—";
    const sectorCount = geo?.sectors.length ?? 0;
    const sessionPrefix = sessionMapMetaPrefix(this.sessionType);
    this.metaEl.textContent = `${sessionPrefix} · ${lapKm} km · ${sectorCount} sector${sectorCount === 1 ? "" : "s"} · ${this.theme.label}`;

    if (!this.weather) {
      this.weatherEl.textContent = this.theme.label;
    }
  }

  private renderSectorLegend(geometry: TrackGeometryPayload): void {
    this.sectorLegendEl.replaceChildren();
    geometry.sectors.forEach((sector, idx) => {
      const chip = document.createElement("span");
      chip.className = "track-sector-chip";
      const color = this.theme.sectorColors[idx % this.theme.sectorColors.length];
      chip.style.setProperty("--sector-color", color);
      chip.dataset.sectorIndex = String(idx);
      chip.textContent = sector.name;
      this.sectorLegendEl.appendChild(chip);
    });
    this.lastSectorFlagsKey = "";
    this.updateSectorFlags([]);
  }

  private renderClassLegend(): void {
    const classes = [
      { id: "Hypercar", color: "#e10600", label: "Hypercar" },
      { id: "LMGT3", color: "#00a651", label: "LMGT3" },
      { id: "LMP2", color: "#005aff", label: "LMP2" },
    ];
    this.classLegendEl.replaceChildren();
    for (const cls of classes) {
      const item = document.createElement("span");
      item.className = "track-class-chip";
      item.innerHTML = `<span class="track-class-dot" style="background:${cls.color}"></span>${cls.label}`;
      this.classLegendEl.appendChild(item);
    }
  }
}
