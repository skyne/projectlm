import type {
  CarSnapshot,
  RaceControlPayload,
  TrackGeometryPayload,
  WeatherContextPayload,
  WeekendSessionType,
} from "../ws/protocol";
import { formatCarNumber } from "../entryNumbers";
import { sessionMapMetaPrefix } from "../utils/weekendSessions";
import { trackDisplayName, trackIconSvg } from "../utils/trackIcons";
import { formatTrackWetnessConditions } from "../utils/trackWetnessDisplay";
import { formatVisibilityKm, visibilityLevel } from "../utils/visibilityDisplay";
import { applyTrackTimePhase } from "../utils/trackWeatherVisual";
import { formatSectorFlagBanner } from "../utils/sectorFlags";
import { resolveTrackTheme, type TrackTheme } from "../utils/trackThemes";
import { formatLapTime } from "../utils/formatTime";
import { escapeHtml } from "../utils/mmUi";
import type { SvgTrack } from "./SvgTrack";

export interface TrackMapLayerFlags {
  sectors: boolean;
  labels: boolean;
  pit: boolean;
}

function abbrevDriver(name: string | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 12).toUpperCase();
  return `${parts[0][0]}. ${parts[parts.length - 1].toUpperCase()}`;
}

export class TrackMapPanel {
  readonly trackContainer: HTMLElement;
  private mapPanel: HTMLElement;
  private titleEl: HTMLElement;
  private metaEl: HTMLElement;
  private flagStatusEl: HTMLElement;
  private trackRef: SvgTrack | null = null;
  private theme: TrackTheme = resolveTrackTheme();
  private layers: TrackMapLayerFlags = { sectors: true, labels: true, pit: true };
  private geometry: TrackGeometryPayload | null = null;
  private weather: WeatherContextPayload | undefined;
  private trackId: string | undefined;
  private sessionType?: WeekendSessionType;
  private lastSectorFlagsKey = "";
  private leaderCardEl!: HTMLElement;
  private telFastestEl!: HTMLElement;
  private telTrackTempEl!: HTMLElement;
  private telAirTempEl!: HTMLElement;
  private telWindEl!: HTMLElement;
  private telVisibilityEl!: HTMLElement;
  private telVisibilityCellEl!: HTMLElement;
  private onResetView: (() => void) | null = null;
  private onLeaveFollow: (() => void) | null = null;
  private followChipEl!: HTMLElement;
  private followLabelEl!: HTMLElement;

  constructor(mapPanel: HTMLElement) {
    this.mapPanel = mapPanel;
    mapPanel.classList.add("track-map-panel", "track-map-wec");

    const bar = mapPanel.querySelector(".track-panel-bar");
    mapPanel.innerHTML = "";
    if (bar) mapPanel.appendChild(bar);

    const shell = document.createElement("div");
    shell.className = "track-map-shell";
    shell.innerHTML = `
      <div class="track-map-stage track-map-stage--wec">
        <div class="track-map-atmosphere" aria-hidden="true"></div>
        <div class="track-map-vignette" aria-hidden="true"></div>
        <div id="track-container" class="track-map-canvas-host"></div>

        <div class="track-follow-chip hidden" id="track-follow-chip" aria-live="polite">
          <span class="track-follow-dot" aria-hidden="true"></span>
          <span class="track-follow-text">Following <strong class="track-follow-label">—</strong></span>
          <button
            type="button"
            class="track-follow-exit"
            data-action="leave-follow"
            title="Exit follow mode"
            aria-label="Exit follow mode"
          >
            ×
          </button>
        </div>

        <header class="track-wec-header">
          <div class="track-wec-header-brand">
            <span class="track-wec-series">FIA WEC</span>
            <span class="track-map-icon" aria-hidden="true"></span>
          </div>
          <div class="track-wec-header-center">
            <h2 class="track-map-title">Circuit</h2>
            <p class="track-map-meta"></p>
          </div>
          <div class="track-flag-status hidden" role="status" aria-live="polite"></div>
        </header>

        <div class="track-wec-leader-card" id="track-leader-card" aria-live="polite">
          <span class="track-wec-leader-pos">—</span>
          <div class="track-wec-leader-info">
            <strong class="track-wec-leader-team">—</strong>
            <span class="track-wec-leader-driver">—</span>
          </div>
          <span class="track-wec-leader-badge">LEADER</span>
        </div>

        <footer class="track-wec-telemetry">
          <div class="track-wec-tel-cell">
            <span class="track-wec-tel-label">Fastest Lap</span>
            <strong class="track-wec-tel-value track-wec-tel-fastest" id="tel-fastest">—</strong>
          </div>
          <div class="track-wec-tel-cell">
            <span class="track-wec-tel-label">Track Temp</span>
            <strong class="track-wec-tel-value" id="tel-track-temp">—</strong>
          </div>
          <div class="track-wec-tel-cell">
            <span class="track-wec-tel-label">Air Temp</span>
            <strong class="track-wec-tel-value" id="tel-air-temp">—</strong>
          </div>
          <div class="track-wec-tel-cell">
            <span class="track-wec-tel-label">Wind</span>
            <strong class="track-wec-tel-value" id="tel-wind">—</strong>
          </div>
          <div class="track-wec-tel-cell track-wec-tel-cell--visibility hidden" id="tel-visibility-cell">
            <span class="track-wec-tel-label">Visibility</span>
            <strong class="track-wec-tel-value" id="tel-visibility">—</strong>
          </div>
          <div class="track-wec-tel-spacer"></div>
          <div class="track-map-toolbar track-wec-toolbar">
            <button type="button" class="track-map-btn" data-action="reset" title="Reset zoom">⌖</button>
            <button type="button" class="track-map-btn active" data-layer="sectors" title="Sector colours">S</button>
            <button type="button" class="track-map-btn active" data-layer="labels" title="Sector labels">Lbl</button>
            <button type="button" class="track-map-btn active" data-layer="pit" title="Pit lane">P</button>
          </div>
          <span class="track-wec-live-pill">LIVE</span>
        </footer>
      </div>
    `;
    mapPanel.appendChild(shell);

    this.trackContainer = shell.querySelector("#track-container")!;
    this.titleEl = shell.querySelector(".track-map-title")!;
    this.metaEl = shell.querySelector(".track-map-meta")!;
    this.flagStatusEl = shell.querySelector(".track-flag-status")!;
    this.leaderCardEl = shell.querySelector("#track-leader-card")!;
    this.telFastestEl = shell.querySelector("#tel-fastest")!;
    this.telTrackTempEl = shell.querySelector("#tel-track-temp")!;
    this.telAirTempEl = shell.querySelector("#tel-air-temp")!;
    this.telWindEl = shell.querySelector("#tel-wind")!;
    this.telVisibilityEl = shell.querySelector("#tel-visibility")!;
    this.telVisibilityCellEl = shell.querySelector("#tel-visibility-cell")!;
    this.followChipEl = shell.querySelector("#track-follow-chip")!;
    this.followLabelEl = shell.querySelector(".track-follow-label")!;

    shell.querySelector('[data-action="reset"]')!.addEventListener("click", () => {
      this.trackRef?.resetView();
      this.onResetView?.();
    });

    shell.querySelector('[data-action="leave-follow"]')!.addEventListener("click", () => {
      this.onLeaveFollow?.();
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

  setOnResetView(handler: (() => void) | null): void {
    this.onResetView = handler;
  }

  setOnLeaveFollow(handler: (() => void) | null): void {
    this.onLeaveFollow = handler;
  }

  /** Show or hide the map follow chip (`label` e.g. "#8"). */
  setMapFollow(label: string | null): void {
    const active = Boolean(label);
    this.followChipEl.classList.toggle("hidden", !active);
    if (label) this.followLabelEl.textContent = label;
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
    this.lastSectorFlagsKey = "";
  }

  updateLiveStats(snapshots: CarSnapshot[], raceControl?: RaceControlPayload): void {
    this.renderLeader(snapshots);
    this.renderTelemetryStrip(snapshots, raceControl);
    this.updateSectorFlags(raceControl?.sectorFlags ?? []);
  }

  private renderLeader(snapshots: CarSnapshot[]): void {
    const active = snapshots.filter((s) => !s.retired);
    const leader = [...active].sort((a, b) => a.racePosition - b.racePosition)[0];
    if (!leader) {
      this.leaderCardEl.classList.add("hidden");
      return;
    }
    this.leaderCardEl.classList.remove("hidden");
    const posEl = this.leaderCardEl.querySelector(".track-wec-leader-pos")!;
    const teamEl = this.leaderCardEl.querySelector(".track-wec-leader-team")!;
    const driverEl = this.leaderCardEl.querySelector(".track-wec-leader-driver")!;
    posEl.textContent = String(leader.racePosition);
    teamEl.textContent = `#${formatCarNumber(leader)} ${leader.teamName}`;
    driverEl.textContent = abbrevDriver(leader.driverName);
    this.leaderCardEl.dataset.classId = leader.classId ?? "";
  }

  private renderTelemetryStrip(
    snapshots: CarSnapshot[],
    raceControl?: RaceControlPayload,
  ): void {
    let fastest: CarSnapshot | null = null;
    let fastestTime = Infinity;
    for (const snap of snapshots) {
      const t = snap.bestLapTime ?? 0;
      if (t > 0 && t < fastestTime) {
        fastestTime = t;
        fastest = snap;
      }
    }

    if (fastest && fastestTime < Infinity) {
      this.telFastestEl.innerHTML = `#${escapeHtml(formatCarNumber(fastest))} · ${formatLapTime(fastestTime)}`;
    } else {
      this.telFastestEl.textContent = "—";
    }

    if (raceControl) {
      const trackT = raceControl.trackTempC ?? raceControl.ambientTempC;
      this.telTrackTempEl.textContent = `${trackT.toFixed(1)}°C`;
      this.telAirTempEl.textContent = `${raceControl.ambientTempC.toFixed(1)}°C`;
      const windKmh = (raceControl.windSpeedMs ?? 0) * 3.6;
      this.telWindEl.textContent = windKmh > 0.3 ? `${windKmh.toFixed(1)} km/h` : "Calm";
      const visKm = raceControl.visibilityKm ?? 10;
      const showVis =
        visKm < 8 ||
        raceControl.redFlagActive === true ||
        (raceControl.rainIntensity ?? 0) > 0.35;
      this.telVisibilityCellEl.classList.toggle("hidden", !showVis);
      this.telVisibilityEl.textContent = formatVisibilityKm(visKm);
      this.telVisibilityCellEl.classList.remove(
        "track-wec-tel-cell--visibility-moderate",
        "track-wec-tel-cell--visibility-poor",
        "track-wec-tel-cell--visibility-critical",
      );
      const visLevel = visibilityLevel(visKm);
      if (visLevel !== "good") {
        this.telVisibilityCellEl.classList.add(`track-wec-tel-cell--visibility-${visLevel}`);
      }
    } else {
      this.telTrackTempEl.textContent = "—";
      this.telAirTempEl.textContent = "—";
      this.telWindEl.textContent = "—";
      this.telVisibilityCellEl.classList.add("hidden");
    }
  }

  private updateSectorFlags(flags: number[]): void {
    const key = flags.join(",");
    if (key === this.lastSectorFlagsKey) return;
    this.lastSectorFlagsKey = key;

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
    applyTrackTimePhase(stage, this.weather);
  }

  private renderHeader(): void {
    const geo = this.geometry;
    const name = geo?.name ?? (this.trackId ? trackDisplayName(this.trackId) : "Circuit");
    this.titleEl.textContent = name.toUpperCase();

    const iconHost = this.mapPanel.querySelector(".track-map-icon");
    if (iconHost && this.trackId) {
      iconHost.innerHTML = trackIconSvg(this.trackId);
    }

    const lapKm = geo ? (geo.lapLength / 1000).toFixed(3) : "—";
    const sessionPrefix = sessionMapMetaPrefix(this.sessionType);
    this.metaEl.textContent = `${sessionPrefix} · ${lapKm} km`;
  }
}
