import type {
  CarSnapshot,
  RaceControlPayload,
  SurfaceHazardSummaryPayload,
  TrackGeometryPayload,
  TrackSurfaceDefaults,
  TrackSurfaceSegment,
  TrackSectorGeometry,
  TrackWidthSegment,
} from "../ws/protocol";
import { formatMapCarLabel, formatCarNumber } from "../entryNumbers";
import {
  hasBakedTrackSurface,
  trackBiomeBackgroundUrl,
  trackSurfaceBackgroundUrl,
} from "../utils/trackBackgroundAssets";
import { trackGeometryEqual } from "../utils/trackGeometry";
import {
  applyTrackWeatherVisual,
  resolveTrackWeatherVisual,
} from "../utils/trackWeatherVisual";
import { PIT_LANE_FRACTION } from "../utils/pitCommands";
import { resolveTrackTheme, type TrackTheme } from "../utils/trackThemes";
import type { TeamLiveryPayload } from "../ws/protocol";
import { sectorFlagTooltip } from "../utils/sectorFlags";

const PIT_BOX_FRACTION = 0.48;
const PIT_LANE_BLEND = 0.34;

export interface TrackLayerVisibility {
  sectors: boolean;
  labels: boolean;
  pit: boolean;
}

const CLASS_COLORS: Record<string, string> = {
  Hypercar: "#e10600",
  LMGT3: "#00a651",
  LMP2: "#005aff",
  solo: "#95a5a6",
  SafetyCar: "#f1c40f",
};

function classColor(classId: string): string {
  return CLASS_COLORS[classId] ?? "#bdc3c7";
}

/** Exaggerate runoff/gravel bands on the map for readability (physics uses true metres). */
const SURFACE_BAND_DISPLAY_BOOST = 1.72;
/** Narrow verge / turf strips on the accent layer. */
const TURF_BAND_DISPLAY_BOOST = 2.4;
/** Kerb sausage painted as a stroke on the track edge (SVG px). */
const KERB_ACCENT_STROKE_PX = 3.6;
/** Minimum painted width so narrow traps still show at track zoom. */
const SURFACE_MIN_BAND_SVG_PX = 4.5;
/** Merge same-side paved runoff segments when gap along lap is below this (t). */
const RUNOFF_MERGE_GAP_T = 0.032;
/** Extend paved runoff sampling slightly so adjacent segments overlap (t). */
const RUNOFF_SAMPLE_PAD_T = 0.007;
/** Barrier edge samples per lap when drawing continuous perimeter loops. */
const BARRIER_EDGE_SAMPLES = 520;

interface MergedRunoffBand {
  surface: string;
  variant?: string;
  side: "outboard" | "inboard";
  startT: number;
  endT: number;
  segments: TrackSurfaceSegment[];
}

function isMergeableRunoff(seg: TrackSurfaceSegment): boolean {
  return (
    (seg.surface === "runoff_concrete" || seg.surface === "runoff_asphalt") &&
    !seg.variant &&
    seg.side !== "both"
  );
}

function isBarrierSegment(seg: TrackSurfaceSegment): boolean {
  return seg.surface.startsWith("barrier");
}

function barrierSideMatches(
  seg: TrackSurfaceSegment,
  side: "outboard" | "inboard",
): boolean {
  if (seg.side === "both") return true;
  return seg.side === side;
}

function surfaceSegmentWidthAt(seg: TrackSurfaceSegment, u: number): number {
  const w0 = seg.widthStartM ?? seg.widthM;
  const w1 = seg.widthEndM ?? seg.widthM;
  const env = seg.envelope ?? "flat";
  if (env === "flare_exit") return w0 + (w1 - w0) * (u * u);
  if (env === "flare_entry") {
    const v = 1 - u;
    return w0 + (w1 - w0) * (1 - v * v);
  }
  if (env === "bell") return w0 + (w1 - w0) * Math.sin(u * Math.PI);
  return w0 + (w1 - w0) * u;
}

function surfaceBandDrawOrder(surface: string): number {
  if (surface.startsWith("runoff") || surface === "verge") return 0;
  if (surface === "gravel") return 1;
  if (surface.startsWith("kerb")) return 2;
  if (surface.startsWith("barrier")) return 3;
  return 1;
}

/** Map hint when car is on runoff, gravel, or against a barrier. */
function surfaceZoneCarAccent(zone?: string): string | null {
  if (!zone || zone === "asphalt") return null;
  if (zone.includes("boundary")) return "#e74c3c";
  if (zone.includes("gravel")) return "#c4a574";
  if (zone.includes("runoff")) return "#8fa8c4";
  if (zone.includes("kerb")) return "#e67e22";
  return "#95a5a6";
}

const SVG_NS = "http://www.w3.org/2000/svg";

function hazardFill(kind: string): string {
  switch (kind) {
    case "oil":
      return "#2c2c2c";
    case "coolant":
      return "#27ae60";
    case "fuel":
      return "#e74c3c";
    default:
      return "#95a5a6";
  }
}

function appendSectorFlagMarker(
  parent: SVGGElement,
  cx: number,
  cy: number,
  level: number,
  tooltip: string,
  broadcast: boolean,
): void {
  const scale = broadcast ? 1.55 : 1;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute(
    "class",
    level >= 2 ? "track-flag-marker track-flag-marker--double" : "track-flag-marker track-flag-marker--yellow",
  );
  g.setAttribute("transform", `translate(${cx}, ${cy}) scale(${scale}) translate(-16, -24)`);

  const hit = document.createElementNS(SVG_NS, "rect");
  hit.setAttribute("class", "track-flag-hit");
  hit.setAttribute("x", "-6");
  hit.setAttribute("y", "-6");
  hit.setAttribute("width", "28");
  hit.setAttribute("height", "34");
  hit.setAttribute("fill", "transparent");

  const pole = document.createElementNS(SVG_NS, "line");
  pole.setAttribute("class", "track-flag-pole");
  pole.setAttribute("x1", "0");
  pole.setAttribute("y1", "0");
  pole.setAttribute("x2", "0");
  pole.setAttribute("y2", "24");

  const flag = document.createElementNS(SVG_NS, "rect");
  flag.setAttribute("class", "track-flag-cloth");
  flag.setAttribute("x", "1");
  flag.setAttribute("y", "2");
  flag.setAttribute("width", "14");
  flag.setAttribute("height", level >= 2 ? "9" : "10");
  flag.setAttribute("rx", "1");

  g.appendChild(hit);
  g.appendChild(pole);
  g.appendChild(flag);

  if (level >= 2) {
    const lower = document.createElementNS(SVG_NS, "rect");
    lower.setAttribute("class", "track-flag-cloth track-flag-cloth-lower");
    lower.setAttribute("x", "1");
    lower.setAttribute("y", "12");
    lower.setAttribute("width", "14");
    lower.setAttribute("height", "9");
    lower.setAttribute("rx", "1");
    g.appendChild(lower);
  }

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = tooltip;
  g.appendChild(title);

  parent.appendChild(g);
}

function carGlowStroke(snap: CarSnapshot, classColorValue: string): string {
  if (snap.blackFlag) return "#111";
  if (snap.meatballFlag) return "#e67e22";
  if (snap.trackStatus === "stranded" || snap.trackStatus === "recovering") return "#f39c12";
  if (snap.unstableOnTrack) return "#e67e22";
  const surfaceAccent = surfaceZoneCarAccent(snap.surfaceZone);
  if (surfaceAccent) return surfaceAccent;
  return classColorValue;
}

function carGlowWidth(
  snap: CarSnapshot,
  isPlayer: boolean,
  isTeam: boolean,
  broadcast: boolean,
): { width: number; opacity: number } {
  if (snap.blackFlag || snap.meatballFlag) return { width: 3, opacity: 0.9 };
  if (snap.trackStatus === "stranded" || snap.trackStatus === "recovering") {
    return { width: 4, opacity: 0.85 };
  }
  if (snap.unstableOnTrack) return { width: 3.5, opacity: 0.7 };
  if (surfaceZoneCarAccent(snap.surfaceZone)) return { width: 3, opacity: 0.55 };
  if (broadcast) {
    if (isPlayer) return { width: 3, opacity: 0.8 };
    if (isTeam) return { width: 2, opacity: 0.55 };
    return { width: 1.2, opacity: 0.3 };
  }
  if (isPlayer) return { width: 4, opacity: 0.75 };
  if (isTeam) return { width: 2, opacity: 0.55 };
  return { width: 0, opacity: 0 };
}

interface SvgPoint {
  x: number;
  y: number;
}

interface LabelDraw {
  text: string;
  anchor?: "start" | "middle" | "end";
  x: number;
  y: number;
}

interface CarMarker {
  group: SVGGElement;
  body: SVGPathElement;
  cockpit: SVGPathElement;
  wheelFL: SVGCircleElement;
  wheelFR: SVGCircleElement;
  wheelRL: SVGCircleElement;
  wheelRR: SVGCircleElement;
  glow: SVGCircleElement;
  highlightHalo: SVGCircleElement | null;
  badge: SVGCircleElement | null;
  label: SVGTextElement;
  title: SVGTitleElement;
}

function broadcastBadgeRadius(carNumber: string): number {
  return Math.max(6.5, 5 + carNumber.length * 1.75);
}

function separateLabels(points: SvgPoint[], minDist: number, iterations = 10): void {
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDist || dist <= 0) continue;
        const push = (minDist - dist) * 0.5;
        const ux = dx / dist;
        const uy = dy / dist;
        points[i].x -= ux * push;
        points[i].y -= uy * push;
        points[j].x += ux * push;
        points[j].y += uy * push;
      }
    }
  }
}

interface FitTransform {
  minX: number;
  minZ: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  viewMinX: number;
  viewMinY: number;
  viewWidth: number;
  viewHeight: number;
  /** Fixed outfield “world” for satellite-style pan when zoomed out. */
  bgMinX: number;
  bgMinY: number;
  bgWidth: number;
  bgHeight: number;
  cumulativeT: number[];
  totalLength: number;
  /** Infield centroid in SVG coords — picks inboard vs outboard per corner. */
  centroidX: number;
  centroidY: number;
}

export interface SvgTrackOptions {
  /** Enable scroll-to-zoom and drag-to-pan on the map. */
  zoomable?: boolean;
  /** Broadcast map: glow on all cars, stronger team/player halos. */
  broadcast?: boolean;
}

/** 1 = fitted track bounds; values below 1 zoom out (~5 wheel steps at 0.55). */
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 8;
const ZOOM_WHEEL_FACTOR = 1.12;
const FIT_ZOOM_EPS = 1e-6;
/** Extra outfield extent beyond min-zoom frame for drag exploration. */
const OUTFIELD_PAN_SLACK = 0.38;
/** SVG stroke width of the main asphalt ribbon — pit lane art scales from this. */
const TRACK_ASPHALT_WIDTH = 11;

export class SvgTrack {
  readonly root: SVGSVGElement;
  private defs: SVGDefsElement;
  private bgGroup: SVGGElement;
  private runoffGroup: SVGGElement;
  private surfaceAccentGroup: SVGGElement;
  private sectorsGroup: SVGGElement;
  private trackGroup: SVGGElement;
  private labelsGroup: SVGGElement;
  private carsGroup: SVGGElement;
  private pitGroup: SVGGElement;
  private hitLayer: SVGRectElement | null = null;
  private fit: FitTransform | null = null;
  private playerEntryId = "entry-1";
  private teamLivery: TeamLiveryPayload | null = null;
  private highlightedEntryIds = new Set<string>();
  private carPositions = new Map<string, { x: number; y: number }>();
  private zoomable: boolean;
  private broadcast: boolean;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private lastDragClient: { x: number; y: number } | null = null;
  private boundWheel: ((e: WheelEvent) => void) | null = null;
  private boundPointerDown: ((e: PointerEvent) => void) | null = null;
  private boundPointerMove: ((e: PointerEvent) => void) | null = null;
  private boundPointerUp: ((e: PointerEvent) => void) | null = null;
  private boundDblClick: ((e: MouseEvent) => void) | null = null;
  private theme: TrackTheme = resolveTrackTheme();
  private layerVisibility: TrackLayerVisibility = {
    sectors: true,
    labels: true,
    pit: true,
  };
  private renderedGeometry: TrackGeometryPayload | null = null;
  private renderedThemeId: string | null = null;
  private trackId?: string;
  private wetSheenPath: SVGPathElement | null = null;
  private asphaltWet = false;
  private lastWetSheenOpacity = -1;
  private lapLengthM = 7000;
  private defaultHalfWidthM = 6;
  private widthProfile: TrackWidthSegment[] | undefined;
  private surfaceDefaults: TrackSurfaceDefaults | undefined;
  private hasSurfaceProfile = false;
  private pitLanePath: {
    points: SvgPoint[];
    cumulative: number[];
    totalLength: number;
    boxDistance: number;
  } | null = null;
  private hazardsGroup: SVGGElement;
  private flagsGroup: SVGGElement;
  private sectorBandPaths: SVGPathElement[] = [];
  private sectorMidpoints: SvgPoint[] = [];
  private lastRaceControlKey = "";

  constructor(container: HTMLElement, options: SvgTrackOptions = {}) {
    this.zoomable = options.zoomable ?? false;
    this.broadcast = options.broadcast ?? false;
    if (this.broadcast) {
      container.classList.add("track-map-canvas-host--broadcast");
    }
    this.root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.root.setAttribute("class", this.broadcast ? "track-svg broadcast-track" : "track-svg");
    this.root.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.root.style.overflow = "visible";

    this.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    this.bgGroup = this.createGroup("bg-layer");
    this.runoffGroup = this.createGroup("runoff-layer");
    this.surfaceAccentGroup = this.createGroup("surface-accent-layer");
    this.sectorsGroup = this.createGroup("sectors-layer");
    this.hazardsGroup = this.createGroup("hazards-layer");
    this.flagsGroup = this.createGroup("flags-layer");
    this.trackGroup = this.createGroup("track-layer");
    this.labelsGroup = this.createGroup("labels-layer");
    this.carsGroup = this.createGroup("cars-layer");
    this.pitGroup = this.createGroup("pit-layer");

    this.root.append(
      this.defs,
      this.bgGroup,
      this.sectorsGroup,
      this.runoffGroup,
      this.trackGroup,
      this.surfaceAccentGroup,
      this.hazardsGroup,
      this.flagsGroup,
      this.pitGroup,
      this.labelsGroup,
      this.carsGroup,
    );
    container.appendChild(this.root);
    if (this.zoomable) {
      container.classList.add("track-map-canvas-host--zoomable");
      this.installZoomPan();
    }
  }

  private installZoomPan(): void {
    this.root.classList.add("track-svg-zoomable");

    this.boundWheel = (e: WheelEvent) => {
      if (!this.fit) return;
      e.preventDefault();
      const pt = this.clientToSvg(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      this.zoomAtPoint(pt.x, pt.y, factor);
    };

    this.boundPointerDown = (e: PointerEvent) => {
      if (!this.fit || e.button !== 0 || this.isAtFitZoom()) return;
      e.preventDefault();
      this.dragging = true;
      this.lastDragClient = { x: e.clientX, y: e.clientY };
      this.root.setPointerCapture(e.pointerId);
      this.root.classList.add("track-svg-dragging");
    };

    this.boundPointerMove = (e: PointerEvent) => {
      if (!this.dragging || !this.lastDragClient || !this.fit || this.isAtFitZoom()) return;
      e.preventDefault();
      const prev = this.clientToSvg(this.lastDragClient.x, this.lastDragClient.y);
      const curr = this.clientToSvg(e.clientX, e.clientY);
      this.panX += prev.x - curr.x;
      this.panY += prev.y - curr.y;
      this.lastDragClient = { x: e.clientX, y: e.clientY };
      this.clampPan();
      this.applyViewBox();
    };

    this.boundPointerUp = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.lastDragClient = null;
      this.root.releasePointerCapture(e.pointerId);
      this.root.classList.remove("track-svg-dragging");
    };

    this.boundDblClick = (e: MouseEvent) => {
      e.preventDefault();
      this.resetView();
    };

    this.root.addEventListener("wheel", this.boundWheel, { passive: false });
    this.root.addEventListener("pointerdown", this.boundPointerDown);
    this.root.addEventListener("pointermove", this.boundPointerMove);
    this.root.addEventListener("pointerup", this.boundPointerUp);
    this.root.addEventListener("pointercancel", this.boundPointerUp);
    this.root.addEventListener("dblclick", this.boundDblClick);
  }

  resetView(): void {
    if (!this.fit) return;
    this.zoom = 1;
    this.panX = this.fit.viewMinX;
    this.panY = this.fit.viewMinY;
    this.applyViewBox();
  }

  private currentViewSize(): { viewWidth: number; viewHeight: number } {
    const f = this.fit!;
    return {
      viewWidth: f.viewWidth / this.zoom,
      viewHeight: f.viewHeight / this.zoom,
    };
  }

  private clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
    const pt = this.root.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = this.root.getScreenCTM();
    if (!ctm) return { x: this.panX, y: this.panY };
    const mapped = pt.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  }

  private zoomAtPoint(svgX: number, svgY: number, factor: number): void {
    if (!this.fit) return;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    if (nextZoom === this.zoom) return;

    const { viewWidth: oldW, viewHeight: oldH } = this.currentViewSize();
    const newW = this.fit.viewWidth / nextZoom;
    const newH = this.fit.viewHeight / nextZoom;
    const rx = oldW > 0 ? (svgX - this.panX) / oldW : 0.5;
    const ry = oldH > 0 ? (svgY - this.panY) / oldH : 0.5;

    this.zoom = nextZoom;
    this.panX = svgX - rx * newW;
    this.panY = svgY - ry * newH;
    this.clampPan();
    this.applyViewBox();
  }

  private isAtFitZoom(): boolean {
    return Math.abs(this.zoom - 1) < FIT_ZOOM_EPS;
  }

  private clampPan(): void {
    if (!this.fit) return;
    const { viewWidth, viewHeight } = this.currentViewSize();

    if (this.isAtFitZoom()) {
      this.panX = this.fit.viewMinX;
      this.panY = this.fit.viewMinY;
      return;
    }

    if (this.zoom < 1) {
      const bx = this.zoomable ? this.fit.bgMinX : this.fit.viewMinX;
      const by = this.zoomable ? this.fit.bgMinY : this.fit.viewMinY;
      const bw = this.zoomable ? this.fit.bgWidth : this.fit.viewWidth;
      const bh = this.zoomable ? this.fit.bgHeight : this.fit.viewHeight;
      let minPanX = bx;
      let maxPanX = bx + bw - viewWidth;
      let minPanY = by;
      let maxPanY = by + bh - viewHeight;
      if (maxPanX < minPanX) {
        const cx = bx + (bw - viewWidth) / 2;
        minPanX = maxPanX = cx;
      }
      if (maxPanY < minPanY) {
        const cy = by + (bh - viewHeight) / 2;
        minPanY = maxPanY = cy;
      }
      this.panX = Math.max(minPanX, Math.min(maxPanX, this.panX));
      this.panY = Math.max(minPanY, Math.min(maxPanY, this.panY));
      return;
    }

    const maxX = this.fit.viewMinX + this.fit.viewWidth - viewWidth;
    const maxY = this.fit.viewMinY + this.fit.viewHeight - viewHeight;
    this.panX = Math.max(this.fit.viewMinX, Math.min(maxX, this.panX));
    this.panY = Math.max(this.fit.viewMinY, Math.min(maxY, this.panY));
  }

  private applyViewBox(): void {
    if (!this.fit) return;
    const { viewWidth, viewHeight } = this.currentViewSize();
    this.root.setAttribute("viewBox", `${this.panX} ${this.panY} ${viewWidth} ${viewHeight}`);
    this.syncBackdropFill();
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setTeamLivery(livery: TeamLiveryPayload | null): void {
    this.teamLivery = livery;
  }

  setHighlightedEntries(entryIds: string[]): void {
    this.highlightedEntryIds = new Set(entryIds);
  }

  focusOnEntries(entryIds: string[]): void {
    if (!this.fit) return;
    const points = entryIds
      .map((id) => this.carPositions.get(id))
      .filter((p): p is { x: number; y: number } => p != null);
    if (points.length === 0) {
      this.resetView();
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const pad = 70;
    const spanX = Math.max(maxX - minX + pad * 2, this.fit.viewWidth * 0.24);
    const spanY = Math.max(maxY - minY + pad * 2, this.fit.viewHeight * 0.24);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const zoomX = this.fit.viewWidth / spanX;
    const zoomY = this.fit.viewHeight / spanY;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)));

    const { viewWidth, viewHeight } = this.currentViewSize();
    this.panX = cx - viewWidth / 2;
    this.panY = cy - viewHeight / 2;
    this.clampPan();
    this.applyViewBox();
  }

  setTheme(theme: TrackTheme): void {
    this.theme = theme;
    this.applyBackgroundSurface();
  }

  setTrackId(trackId?: string): void {
    this.trackId = trackId;
    this.applyBackgroundSurface();
  }

  setTrackConditions(raceControl?: RaceControlPayload): void {
    const host = this.backgroundHost();
    if (host) applyTrackWeatherVisual(host, raceControl);
    const v = resolveTrackWeatherVisual(raceControl);
    const wetClass = v.wet > 0.5;
    if (wetClass !== this.asphaltWet) {
      this.asphaltWet = wetClass;
      this.root.classList.toggle("track-asphalt-wet", wetClass);
    }
    if (this.wetSheenPath) {
      const opacity = v.wet > 0.5 ? Math.min(1, (v.wet - 0.5) * 1.4) : 0;
      if (opacity !== this.lastWetSheenOpacity) {
        this.lastWetSheenOpacity = opacity;
        this.wetSheenPath.setAttribute("opacity", String(opacity));
      }
    }
    this.updateRaceControlOverlay(raceControl);
  }

  /** Tint sector bands and draw slippery-surface hazard markers. */
  updateRaceControlOverlay(raceControl?: RaceControlPayload): void {
    const flags = raceControl?.sectorFlags ?? [];
    const hazards = raceControl?.surfaceHazards ?? [];
    const key = `${flags.join(",")}|${raceControl?.activeIncidentEntryId ?? ""}|${hazards.map((h) => `${h.sectorIndex}:${h.kind}:${h.centerDistance ?? ""}:${h.centerLateralM ?? ""}:${h.spanMeters ?? ""}:${h.lateralSpanM ?? ""}`).join(",")}`;
    if (key === this.lastRaceControlKey) return;
    this.lastRaceControlKey = key;

    const bandCount = Math.max(this.sectorBandPaths.length, flags.length);
    for (let i = 0; i < bandCount; i++) {
      const path = this.sectorBandPaths[i];
      if (!path) continue;
      const level = flags[i] ?? 0;
      const bandW = this.broadcast ? "5" : "18";
      const flagW2 = this.broadcast ? "8" : "22";
      const flagW1 = this.broadcast ? "7" : "20";
      if (level >= 2) {
        path.setAttribute("stroke", "#e67e22");
        path.setAttribute("opacity", "0.85");
        path.setAttribute("stroke-width", flagW2);
      } else if (level >= 1) {
        path.setAttribute("stroke", "#f1c40f");
        path.setAttribute("opacity", "0.78");
        path.setAttribute("stroke-width", flagW1);
      } else {
        path.setAttribute("stroke", this.theme.sectorColors[i % this.theme.sectorColors.length]);
        path.setAttribute("opacity", this.broadcast ? "0.42" : "0.28");
        path.setAttribute("stroke-width", bandW);
      }
    }

    this.flagsGroup.replaceChildren();
    for (let i = 0; i < flags.length; i++) {
      const level = flags[i] ?? 0;
      if (level < 1) continue;
      const mid = this.sectorMidpoints[i];
      if (!mid) continue;
      const displayName = this.renderedGeometry?.sectors[i]?.name ?? `Sector ${i + 1}`;
      appendSectorFlagMarker(
        this.flagsGroup,
        mid.x,
        mid.y,
        level,
        sectorFlagTooltip({
          sectorIndex: i,
          level,
          displayName,
          hazards: raceControl?.surfaceHazards,
          activeIncidentEntryId: raceControl?.activeIncidentEntryId,
        }),
        this.broadcast,
      );
    }

    this.hazardsGroup.replaceChildren();
    for (const hz of hazards) {
      if (hz.centerDistance != null) {
        this.appendHazardPatch(hz);
        continue;
      }
      const mid = this.sectorMidpoints[hz.sectorIndex];
      if (!mid) continue;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.setAttribute("class", "track-hazard-marker");
      marker.setAttribute("cx", String(mid.x));
      marker.setAttribute("cy", String(mid.y));
      marker.setAttribute("r", "10");
      marker.setAttribute("fill", hazardFill(hz.kind));
      marker.setAttribute("opacity", "0.85");
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${hz.kind} — grip ×${hz.gripMultiplier.toFixed(2)}`;
      marker.appendChild(title);
      this.hazardsGroup.appendChild(marker);
    }
  }

  private backgroundHost(): HTMLElement | null {
    const host =
      this.root.closest(".track-map-stage") ??
      this.root.closest(".telemetry-map-inner") ??
      this.root.closest(".season-calendar-map");
    return host instanceof HTMLElement ? host : null;
  }

  private applyBackgroundSurface(): void {
    const host = this.backgroundHost();
    if (!host) return;
    host.style.setProperty("--track-surface-deep", this.theme.surfaceDeep);
    if (this.zoomable) {
      // Outfield PNG lives in the SVG; stage keeps solid/gradient fill only (no double paint).
      host.style.setProperty("--track-bg-image", "none");
      if (this.fit) this.drawRasterBackground();
      return;
    }
    host.style.setProperty(
      "--track-bg-image",
      `url("${trackSurfaceBackgroundUrl(this.trackId, this.theme)}")`,
    );
  }

  private computeBackgroundBounds(
    x: number,
    y: number,
    w: number,
    h: number,
  ): { bgMinX: number; bgMinY: number; bgWidth: number; bgHeight: number } {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const cover = (1 / MIN_ZOOM) * (1 + OUTFIELD_PAN_SLACK);
    const bgW = w * cover;
    const bgH = h * cover;
    return {
      bgMinX: cx - bgW / 2,
      bgMinY: cy - bgH / 2,
      bgWidth: bgW,
      bgHeight: bgH,
    };
  }

  private installTerrainBlurFilter(): void {
    if (this.defs.querySelector("#track-terrain-blur")) return;
    const blur = document.createElementNS(SVG_NS, "filter");
    blur.setAttribute("id", "track-terrain-blur");
    blur.setAttribute("x", "-40%");
    blur.setAttribute("y", "-40%");
    blur.setAttribute("width", "180%");
    blur.setAttribute("height", "180%");
    const fe = document.createElementNS(SVG_NS, "feGaussianBlur");
    fe.setAttribute("stdDeviation", "22");
    blur.appendChild(fe);
    this.defs.appendChild(blur);
  }

  /** Painterly terrain beyond the bake — centred on the circuit, pannable when zoomed out. */
  private drawOutfieldWorld(
    bgX: number,
    bgY: number,
    bgW: number,
    bgH: number,
    fitCx: number,
    fitCy: number,
  ): SVGGElement {
    this.installTerrainBlurFilter();
    const t = this.theme;
    const span = Math.max(bgW, bgH);

    const world = document.createElementNS(SVG_NS, "g");
    world.setAttribute("class", "track-outfield-world");

    const gradId = "track-outfield-base-grad";
    const grad = document.createElementNS(SVG_NS, "radialGradient");
    grad.setAttribute("id", gradId);
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    grad.setAttribute("cx", String(fitCx));
    grad.setAttribute("cy", String(fitCy));
    grad.setAttribute("r", String(span * 0.62));
    for (const [offset, color] of [
      ["0%", t.outfield],
      ["55%", t.terrainPrimary],
      ["100%", t.surfaceDeep],
    ] as const) {
      const stop = document.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      grad.appendChild(stop);
    }
    this.defs.querySelector(`#${gradId}`)?.remove();
    this.defs.appendChild(grad);

    const wash = document.createElementNS(SVG_NS, "rect");
    wash.setAttribute("x", String(bgX));
    wash.setAttribute("y", String(bgY));
    wash.setAttribute("width", String(bgW));
    wash.setAttribute("height", String(bgH));
    wash.setAttribute("fill", `url(#${gradId})`);
    world.appendChild(wash);

    const patches = [
      { dx: -0.28, dy: -0.2, rx: 0.34, ry: 0.28, fill: t.terrainPrimary, op: 0.45 },
      { dx: 0.3, dy: 0.18, rx: 0.3, ry: 0.24, fill: t.terrainSecondary, op: 0.4 },
      { dx: 0.22, dy: -0.26, rx: 0.26, ry: 0.2, fill: t.terrainPrimary, op: 0.32 },
      { dx: -0.34, dy: 0.08, rx: 0.24, ry: 0.2, fill: t.terrainSecondary, op: 0.28 },
    ];
    for (const p of patches) {
      const el = document.createElementNS(SVG_NS, "ellipse");
      el.setAttribute("cx", String(fitCx + p.dx * span));
      el.setAttribute("cy", String(fitCy + p.dy * span));
      el.setAttribute("rx", String(p.rx * span));
      el.setAttribute("ry", String(p.ry * span));
      el.setAttribute("fill", p.fill);
      el.setAttribute("opacity", String(p.op));
      el.setAttribute("filter", "url(#track-terrain-blur)");
      world.appendChild(el);
    }

    return world;
  }

  /** Procedural outfield margins + pixel-locked track bake. */
  private drawRasterBackground(): void {
    if (!this.fit || !this.zoomable) return;

    const { viewMinX: x, viewMinY: y, viewWidth: w, viewHeight: h } = this.fit;
    const { bgMinX, bgMinY, bgWidth, bgHeight } = this.fit;
    // Baked per-track PNG is aligned to the tight centreline crop — skip when drawing
    // authored surface bands so the vector track and background stay registered.
    const useBakedTrack =
      hasBakedTrackSurface(this.trackId) && !this.hasSurfaceProfile;
    const url = useBakedTrack
      ? trackSurfaceBackgroundUrl(this.trackId, this.theme)
      : trackBiomeBackgroundUrl(this.theme);
    const baked = useBakedTrack;
    const fitCx = x + w / 2;
    const fitCy = y + h / 2;

    const backdrop = document.createElementNS(SVG_NS, "rect");
    backdrop.setAttribute("fill", this.theme.surfaceDeep);
    backdrop.setAttribute("class", "track-raster-bg-fill");

    const world = this.drawOutfieldWorld(bgMinX, bgMinY, bgWidth, bgHeight, fitCx, fitCy);

    const img = document.createElementNS(SVG_NS, "image");
    img.setAttribute("href", url);
    img.setAttribute("x", String(x));
    img.setAttribute("y", String(y));
    img.setAttribute("width", String(w));
    img.setAttribute("height", String(h));
    img.setAttribute(
      "preserveAspectRatio",
      baked ? "xMidYMid meet" : "xMidYMid slice",
    );
    img.setAttribute("class", "track-raster-bg");

    const existingInfield = this.bgGroup.querySelector(".track-infield");
    this.bgGroup.replaceChildren(backdrop, world, img);
    if (existingInfield) this.bgGroup.appendChild(existingInfield);
    this.syncBackdropFill();
  }

  private syncBackdropFill(): void {
    if (!this.fit || !this.zoomable) return;
    const backdrop = this.bgGroup.querySelector(".track-raster-bg-fill") as SVGRectElement | null;
    if (!backdrop) return;
    const { viewWidth, viewHeight } = this.currentViewSize();
    backdrop.setAttribute("x", String(this.panX));
    backdrop.setAttribute("y", String(this.panY));
    backdrop.setAttribute("width", String(viewWidth));
    backdrop.setAttribute("height", String(viewHeight));
  }

  setLayerVisibility(visibility: Partial<TrackLayerVisibility>): void {
    this.layerVisibility = { ...this.layerVisibility, ...visibility };
    this.sectorsGroup.style.display = this.layerVisibility.sectors ? "" : "none";
    this.labelsGroup.style.display = this.layerVisibility.labels ? "" : "none";
    this.pitGroup.style.display = this.layerVisibility.pit ? "" : "none";
  }

  clearCars(): void {
    this.carsGroup.replaceChildren();
    this.carElements.clear();
    this.carPositions.clear();
  }

  private wipeGeometry(): void {
    this.defs.replaceChildren();
    this.bgGroup.replaceChildren();
    this.sectorsGroup.replaceChildren();
    this.hazardsGroup.replaceChildren();
    this.flagsGroup.replaceChildren();
    this.pitGroup.replaceChildren();
    this.runoffGroup.replaceChildren();
    this.surfaceAccentGroup.replaceChildren();
    this.trackGroup.replaceChildren();
    this.labelsGroup.replaceChildren();
    this.clearCars();
    this.sectorBandPaths = [];
    this.sectorMidpoints = [];
    this.lastRaceControlKey = "";
    this.wetSheenPath = null;
    this.pitLanePath = null;
    this.defaultHalfWidthM = 6;
    this.widthProfile = undefined;
    this.surfaceDefaults = undefined;
    this.hasSurfaceProfile = false;
    this.fit = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  setGeometry(geometry: TrackGeometryPayload): void {
    if (geometry.polyline.length === 0) {
      this.wipeGeometry();
      this.renderedGeometry = null;
      this.renderedThemeId = null;
      return;
    }

    if (
      this.fit &&
      this.renderedGeometry &&
      this.renderedThemeId === this.theme.id &&
      trackGeometryEqual(this.renderedGeometry, geometry)
    ) {
      return;
    }

    this.wipeGeometry();

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const pt of geometry.polyline) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minZ = Math.min(minZ, pt.z);
      maxZ = Math.max(maxZ, pt.z);
    }

    const worldW = maxX - minX || 1;
    const worldH = maxZ - minZ || 1;
    const target = 1000;
    const pad = 40;
    const scale = (target - pad * 2) / Math.max(worldW, worldH);
    const drawW = worldW * scale;
    const drawH = worldH * scale;
    const offsetX = pad + (target - pad * 2 - drawW) / 2;
    const offsetY = pad + (target - pad * 2 - drawH) / 2;

    const toSvg = (x: number, z: number) => ({
      x: offsetX + (x - minX) * scale,
      y: offsetY + (z - minZ) * scale,
    });

    const svgPoints = geometry.polyline.map((pt) => toSvg(pt.x, pt.z));
    const cumulativeT = this.buildCumulativeT(svgPoints);
    const totalLength = cumulativeT[cumulativeT.length - 1] ?? 1;

    let viewMinX = Infinity;
    let viewMaxX = -Infinity;
    let viewMinY = Infinity;
    let viewMaxY = -Infinity;
    for (const p of svgPoints) {
      viewMinX = Math.min(viewMinX, p.x);
      viewMaxX = Math.max(viewMaxX, p.x);
      viewMinY = Math.min(viewMinY, p.y);
      viewMaxY = Math.max(viewMaxY, p.y);
    }

    this.hasSurfaceProfile = (geometry.surfaceProfile?.length ?? 0) > 0;
    const viewPad = 30;
    const viewWidth = viewMaxX - viewMinX + viewPad * 2;
    const viewHeight = viewMaxY - viewMinY + viewPad * 2;
    const viewBoxX = viewMinX - viewPad;
    const viewBoxY = viewMinY - viewPad;
    const bgBounds = this.computeBackgroundBounds(viewBoxX, viewBoxY, viewWidth, viewHeight);
    const centroidSvg = toSvg((minX + maxX) / 2, (minZ + maxZ) / 2);

    this.fit = {
      minX,
      minZ,
      scale,
      offsetX,
      offsetY,
      viewMinX: viewBoxX,
      viewMinY: viewBoxY,
      viewWidth,
      viewHeight,
      ...bgBounds,
      cumulativeT,
      totalLength,
      centroidX: centroidSvg.x,
      centroidY: centroidSvg.y,
    };

    this.root.setAttribute(
      "viewBox",
      `${viewBoxX} ${viewBoxY} ${viewWidth} ${viewHeight}`,
    );
    this.panX = viewBoxX;
    this.panY = viewBoxY;
    this.zoom = 1;

    if (this.zoomable) this.drawRasterBackground();

    this.installDefs(viewBoxX, viewBoxY, viewWidth, viewHeight);
    if (this.broadcast) {
      this.installBroadcastDefs();
    }

    const pathD = this.pointsToPath(svgPoints, true);
    if (!this.broadcast && !hasBakedTrackSurface(this.trackId)) {
      this.drawInfield(pathD);
    }
    this.drawSectorBands(svgPoints, geometry.sectors, cumulativeT, totalLength);
    if (this.hasSurfaceProfile) {
      this.drawSurfaceBands(svgPoints, cumulativeT, geometry, this.runoffGroup, "subgrade");
    }
    if (this.broadcast) {
      this.drawTrackSurfaceBroadcast(pathD);
      if (
        !this.hasSurfaceProfile &&
        (geometry.defaultWidthM != null || geometry.widthProfile?.length)
      ) {
        this.drawCorridorEdges(svgPoints, cumulativeT, geometry);
      }
    } else {
      this.drawTrackSurface(pathD, svgPoints, geometry, cumulativeT);
    }
    if (this.hasSurfaceProfile) {
      this.drawSurfaceBands(svgPoints, cumulativeT, geometry, this.surfaceAccentGroup, "accent");
    }

    this.drawPitLane(svgPoints, cumulativeT, totalLength);

    this.drawPitStartFinishLine(svgPoints, cumulativeT, totalLength);

    const labels = geometry.mapLabels ?? [];
    const drawLabels: LabelDraw[] = labels.map((lbl) => {
      const p = toSvg(lbl.x, lbl.z);
      return { text: lbl.text, anchor: lbl.anchor, x: p.x, y: p.y };
    });
    separateLabels(drawLabels, 34);
    for (const lbl of drawLabels) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(lbl.x));
      label.setAttribute("y", String(lbl.y));
      label.setAttribute("class", "map-label");
      if (lbl.anchor) label.setAttribute("text-anchor", lbl.anchor);
      label.textContent = lbl.text;
      this.labelsGroup.appendChild(label);
    }

    for (const sector of geometry.sectors) {
      const p = toSvg(sector.labelX, sector.labelZ);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(p.x));
      label.setAttribute("y", String(p.y));
      label.setAttribute("class", this.broadcast ? "sector-label sector-label-wec" : "sector-label");
      label.textContent = sector.name.toUpperCase();
      this.labelsGroup.appendChild(label);
    }

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = geometry.name;
    this.root.insertBefore(title, this.root.firstChild);

    if (this.zoomable) {
      this.hitLayer?.remove();
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.setAttribute("x", String(viewBoxX));
      hit.setAttribute("y", String(viewBoxY));
      hit.setAttribute("width", String(viewWidth));
      hit.setAttribute("height", String(viewHeight));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("class", "track-hit-layer");
      this.root.appendChild(hit);
      this.hitLayer = hit;
    }

    this.setLayerVisibility(this.layerVisibility);
    this.lapLengthM = geometry.lapLength > 0 ? geometry.lapLength : this.lapLengthM;
    this.defaultHalfWidthM = (geometry.defaultWidthM ?? 12) / 2;
    this.widthProfile = geometry.widthProfile;
    this.surfaceDefaults = geometry.surfaceDefaults;
    this.cachePitLanePath(svgPoints, cumulativeT, totalLength);
    this.renderedGeometry = geometry;
    this.renderedThemeId = this.theme.id;
  }

  updateCars(snapshots: CarSnapshot[]): void {
    if (!this.fit) return;

    const seen = new Set<string>();

    for (const snap of snapshots) {
      seen.add(snap.entryId);
      const { x, y, angle, onPitLane } = this.resolveCarMapPose(snap);
      const p = { x, y };
      const isSafetyCar = snap.entryId === "safety-car";
      const numberLabel = isSafetyCar ? "SC" : formatMapCarLabel(snap);
      const carNumber = isSafetyCar ? "SC" : formatCarNumber(snap);
      const lengthPx = Math.max(12, (snap.carLengthM ?? 5) * 1.8);
      const widthPx = Math.max(7, (snap.carWidthM ?? 2) * 1.8);
      const isPlayer = !isSafetyCar && snap.entryId === this.playerEntryId;
      const isTeam = !isSafetyCar && this.highlightedEntryIds.has(snap.entryId);
      const teamLiveryCar = isPlayer || isTeam;
      const color = isSafetyCar
        ? "#f1c40f"
        : teamLiveryCar && this.teamLivery
          ? this.teamLivery.primary
          : classColor(snap.classId);
      const accentColor =
        teamLiveryCar && this.teamLivery ? this.teamLivery.secondary : "#1a1f2b";

      this.carPositions.set(snap.entryId, { x: p.x, y: p.y });

      let marker = this.carElements.get(snap.entryId);
      if (!marker) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "car-marker");

        const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        glow.setAttribute("class", "car-glow");
        glow.setAttribute("r", this.broadcast ? "11" : "14");
        glow.setAttribute("fill", "none");

        let highlightHalo: SVGCircleElement | null = null;
        let badge: SVGCircleElement | null = null;
        if (this.broadcast) {
          highlightHalo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          highlightHalo.setAttribute("class", "car-highlight-halo");
          badge = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          badge.setAttribute("class", "car-number-badge");
        }

        const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
        body.setAttribute("class", "car-body");

        const cockpit = document.createElementNS("http://www.w3.org/2000/svg", "path");
        cockpit.setAttribute("class", "car-cockpit");

        const wheelFL = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        wheelFL.setAttribute("class", "car-wheel");
        const wheelFR = wheelFL.cloneNode() as SVGCircleElement;
        const wheelRL = wheelFL.cloneNode() as SVGCircleElement;
        const wheelRR = wheelFL.cloneNode() as SVGCircleElement;

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("class", "car-number");
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "central");
        label.setAttribute("pointer-events", "none");

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");

        if (this.broadcast) {
          group.classList.add("broadcast-car-marker");
          group.append(highlightHalo!, badge!, label, title);
        } else {
          group.append(glow, body, cockpit, wheelFL, wheelFR, wheelRL, wheelRR, label, title);
        }
        this.carsGroup.appendChild(group);

        marker = {
          group,
          body,
          cockpit,
          wheelFL,
          wheelFR,
          wheelRL,
          wheelRR,
          glow,
          highlightHalo,
          badge,
          label,
          title,
        };
        this.carElements.set(snap.entryId, marker);
      }

      if (this.broadcast) {
        marker.group.setAttribute("transform", `translate(${p.x}, ${p.y})`);
      } else {
        marker.group.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${angle})`);
      }

      if (isPlayer !== marker.group.classList.contains("player-car")) {
        marker.group.classList.toggle("player-car", isPlayer);
      }
      const teamCar = isTeam && !isPlayer;
      if (teamCar !== marker.group.classList.contains("team-car")) {
        marker.group.classList.toggle("team-car", teamCar);
      }
      if (!marker.group.classList.contains("car-number-visible")) {
        marker.group.classList.add("car-number-visible");
      }
      const emphasis = isPlayer || isTeam || isSafetyCar;
      if (emphasis !== marker.group.classList.contains("car-number-emphasis")) {
        marker.group.classList.toggle("car-number-emphasis", emphasis);
      }
      marker.group.classList.toggle("pit-lane-car", onPitLane);
      marker.group.classList.toggle("safety-car-marker", isSafetyCar);
      if (marker.group.dataset.classId !== snap.classId) {
        marker.group.dataset.classId = snap.classId;
      }

      if (this.broadcast && marker.badge) {
        marker.group.querySelector(".car-class-ring")?.remove();
        if (!marker.highlightHalo) {
          const highlightHalo = document.createElementNS(SVG_NS, "circle");
          highlightHalo.setAttribute("class", "car-highlight-halo");
          marker.group.insertBefore(highlightHalo, marker.badge);
          marker.highlightHalo = highlightHalo;
        }
        const radius = broadcastBadgeRadius(carNumber);
        const classFill = isSafetyCar ? color : classColor(snap.classId);
        const showHighlight = teamLiveryCar && !isSafetyCar;
        const highlightStroke =
          showHighlight && this.teamLivery ? this.teamLivery.primary : "#22d3ee";

        if (showHighlight && marker.highlightHalo) {
          marker.highlightHalo.setAttribute("cx", "0");
          marker.highlightHalo.setAttribute("cy", "0");
          marker.highlightHalo.setAttribute("r", String(radius + 2.4));
          marker.highlightHalo.setAttribute("fill", "none");
          marker.highlightHalo.setAttribute("stroke", highlightStroke);
          marker.highlightHalo.setAttribute("stroke-width", "2");
          marker.highlightHalo.style.display = "";
        } else if (marker.highlightHalo) {
          marker.highlightHalo.style.display = "none";
        }

        marker.badge.setAttribute("cx", "0");
        marker.badge.setAttribute("cy", "0");
        marker.badge.setAttribute("r", String(radius));
        marker.badge.setAttribute("fill", classFill);
        marker.badge.setAttribute("stroke", isSafetyCar ? "#c27d0e" : "#0b0d14");
        marker.badge.setAttribute("stroke-width", "1.25");
        marker.label.setAttribute("font-size", carNumber.length > 2 ? "5.5" : "6.5");
        marker.label.setAttribute("font-weight", "700");
        marker.label.setAttribute("fill", "#fff");
      }

      if (!this.broadcast) {
        const bodyPath = this.carBodyPath(lengthPx, widthPx);
        marker.body.setAttribute("d", bodyPath);
        marker.body.setAttribute("fill", color);
        marker.body.setAttribute(
          "opacity",
          isSafetyCar ? "0.98" : snap.inPit ? "0.45" : snap.pitQueued ? "0.65" : "0.92",
        );
        const surfaceAccent = surfaceZoneCarAccent(snap.surfaceZone);
        marker.body.setAttribute(
          "stroke",
          isSafetyCar
            ? "#f39c12"
            : snap.unstableOnTrack
              ? "#e67e22"
              : surfaceAccent ?? (snap.overtaking
                  ? "#f1c40f"
                  : snap.blocked
                    ? "#e67e22"
                    : "#0f1117"),
        );
        marker.body.setAttribute("stroke-width", isPlayer ? "1.5" : surfaceAccent ? "1.25" : "1");

        marker.cockpit.setAttribute("d", this.cockpitPath(lengthPx, widthPx));
        marker.cockpit.setAttribute("fill", accentColor);
        marker.cockpit.setAttribute("opacity", teamLiveryCar ? "0.92" : "0.85");

        const wheelR = Math.max(1.8, widthPx * 0.22);
        const wheelPositions: Array<[SVGCircleElement, number, number]> = [
          [marker.wheelFL, lengthPx * 0.28, -widthPx * 0.42],
          [marker.wheelFR, lengthPx * 0.28, widthPx * 0.42],
          [marker.wheelRL, -lengthPx * 0.32, -widthPx * 0.42],
          [marker.wheelRR, -lengthPx * 0.32, widthPx * 0.42],
        ];
        for (const [wheel, cx, cy] of wheelPositions) {
          wheel.setAttribute("cx", String(cx));
          wheel.setAttribute("cy", String(cy));
          wheel.setAttribute("r", String(wheelR));
          wheel.setAttribute("fill", "#0f1117");
          wheel.setAttribute("stroke", color);
          wheel.setAttribute("stroke-width", "0.8");
        }
      }

      if (!this.broadcast) {
        marker.glow.setAttribute("stroke", carGlowStroke(snap, color));
        const glowWidth = carGlowWidth(snap, isPlayer, isTeam, this.broadcast);
        marker.glow.setAttribute("stroke-width", String(glowWidth.width));
        marker.glow.setAttribute("opacity", String(glowWidth.opacity));
      }

      marker.group.classList.toggle(
        "stranded-car",
        snap.trackStatus === "stranded" || snap.trackStatus === "recovering",
      );
      marker.group.classList.toggle("meatball-car", snap.meatballFlag === true);
      marker.group.classList.toggle("black-flag-car", snap.blackFlag === true);

      marker.label.textContent = this.broadcast ? carNumber : numberLabel;
      if (!this.broadcast) {
        marker.label.setAttribute(
          "fill",
          isPlayer ? "#fff" : isTeam ? color : "rgba(240, 242, 245, 0.92)",
        );
      }
      marker.title.textContent = `#${carNumber || "?"} ${snap.classId} · ${snap.teamName}${snap.inPit ? " (PIT)" : ""}${snap.overtaking ? " overtaking" : ""}${snap.trackStatus === "stranded" ? " (STOPPED)" : snap.trackStatus === "recovering" ? " (RECOVERY)" : ""}${snap.meatballFlag ? " (MEATBALL)" : ""}${snap.blackFlag ? " (BLACK)" : ""}`;
      const retiredOpacity = snap.retired ? "0.35" : "1";
      if (marker.group.style.opacity !== retiredOpacity) {
        marker.group.style.opacity = retiredOpacity;
      }
    }

    for (const [id, el] of this.carElements) {
      if (!seen.has(id)) {
        el.group.remove();
        this.carElements.delete(id);
        this.carPositions.delete(id);
      }
    }
  }

  private installDefs(x: number, y: number, w: number, h: number): void {
    const t = this.theme;

    const infieldGrad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
    infieldGrad.setAttribute("id", "track-infield-gradient");
    infieldGrad.setAttribute("gradientUnits", "userSpaceOnUse");
    infieldGrad.setAttribute("cx", String(x + w * 0.5));
    infieldGrad.setAttribute("cy", String(y + h * 0.48));
    infieldGrad.setAttribute("r", String(Math.max(w, h) * 0.38));
    for (const [offset, color] of [
      ["0%", t.infieldLight],
      ["55%", t.infield],
      ["100%", t.infield],
    ] as const) {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      infieldGrad.appendChild(stop);
    }
    this.defs.appendChild(infieldGrad);

    const asphaltGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    asphaltGrad.setAttribute("id", "track-asphalt-gradient");
    asphaltGrad.setAttribute("x1", "0%");
    asphaltGrad.setAttribute("y1", "0%");
    asphaltGrad.setAttribute("x2", "100%");
    asphaltGrad.setAttribute("y2", "100%");
    for (const [offset, color] of [
      ["0%", t.asphaltHighlight],
      ["40%", t.asphalt],
      ["100%", t.asphaltDark],
    ] as const) {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      asphaltGrad.appendChild(stop);
    }
    this.defs.appendChild(asphaltGrad);

    const kerbPattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    kerbPattern.setAttribute("id", "track-kerb-pattern");
    kerbPattern.setAttribute("patternUnits", "userSpaceOnUse");
    kerbPattern.setAttribute("width", "10");
    kerbPattern.setAttribute("height", "10");
    kerbPattern.setAttribute("patternTransform", "rotate(45)");
    const kerbA = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    kerbA.setAttribute("width", "5");
    kerbA.setAttribute("height", "10");
    kerbA.setAttribute("fill", t.kerb);
    const kerbB = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    kerbB.setAttribute("x", "5");
    kerbB.setAttribute("width", "5");
    kerbB.setAttribute("height", "10");
    kerbB.setAttribute("fill", t.kerbAlt);
    kerbPattern.append(kerbA, kerbB);
    this.defs.appendChild(kerbPattern);

    this.appendGravelPatternDef("track-gravel-pattern", t.dirt, false);

    const runoffGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    runoffGrad.setAttribute("id", "track-runoff-fill");
    runoffGrad.setAttribute("x1", "0%");
    runoffGrad.setAttribute("y1", "0%");
    runoffGrad.setAttribute("x2", "0%");
    runoffGrad.setAttribute("y2", "100%");
    for (const [offset, color, opacity] of [
      ["0%", t.asphaltHighlight, "0.55"],
      ["45%", t.runoff, "0.82"],
      ["100%", t.asphaltDark, "0.65"],
    ] as const) {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      stop.setAttribute("stop-opacity", opacity);
      runoffGrad.appendChild(stop);
    }
    this.defs.appendChild(runoffGrad);

    const runoffSoften = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    runoffSoften.setAttribute("id", "runoff-soften");
    runoffSoften.setAttribute("x", "-8%");
    runoffSoften.setAttribute("y", "-8%");
    runoffSoften.setAttribute("width", "116%");
    runoffSoften.setAttribute("height", "116%");
    const runoffBlur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    runoffBlur.setAttribute("stdDeviation", "0.55");
    runoffBlur.setAttribute("result", "blur");
    const runoffSoftenMerge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    const runoffSoftenBlur = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    runoffSoftenBlur.setAttribute("in", "blur");
    const runoffSoftenGraphic = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    runoffSoftenGraphic.setAttribute("in", "SourceGraphic");
    runoffSoftenMerge.append(runoffSoftenBlur, runoffSoftenGraphic);
    runoffSoften.append(runoffBlur, runoffSoftenMerge);
    this.defs.appendChild(runoffSoften);

    const pitTarmacGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    pitTarmacGrad.setAttribute("id", "pit-tarmac-fill");
    pitTarmacGrad.setAttribute("x1", "0%");
    pitTarmacGrad.setAttribute("y1", "0%");
    pitTarmacGrad.setAttribute("x2", "100%");
    pitTarmacGrad.setAttribute("y2", "0%");
    for (const [offset, color] of [
      ["0%", t.asphaltHighlight],
      ["50%", t.asphalt],
      ["100%", t.asphaltDark],
    ] as const) {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      pitTarmacGrad.appendChild(stop);
    }
    this.defs.appendChild(pitTarmacGrad);

    const pitBuildingGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    pitBuildingGrad.setAttribute("id", "pit-building-fill");
    pitBuildingGrad.setAttribute("x1", "0%");
    pitBuildingGrad.setAttribute("y1", "0%");
    pitBuildingGrad.setAttribute("x2", "0%");
    pitBuildingGrad.setAttribute("y2", "100%");
    for (const [offset, color] of [
      ["0%", "#4a525a"],
      ["100%", "#323840"],
    ] as const) {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      pitBuildingGrad.appendChild(stop);
    }
    this.defs.appendChild(pitBuildingGrad);

    const sfChecker = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    sfChecker.setAttribute("id", "sf-checker");
    sfChecker.setAttribute("width", "5");
    sfChecker.setAttribute("height", "5");
    sfChecker.setAttribute("patternUnits", "userSpaceOnUse");
    for (const [x, y, fill] of [
      [0, 0, "#f4f4f4"],
      [2.5, 0, "#1a1d24"],
      [0, 2.5, "#1a1d24"],
      [2.5, 2.5, "#f4f4f4"],
    ] as const) {
      const cell = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      cell.setAttribute("x", String(x));
      cell.setAttribute("y", String(y));
      cell.setAttribute("width", "2.5");
      cell.setAttribute("height", "2.5");
      cell.setAttribute("fill", fill);
      sfChecker.appendChild(cell);
    }
    this.defs.appendChild(sfChecker);

    void x;
    void y;
    void w;
    void h;
  }

  private drawInfield(pathD: string): void {
    const infield = document.createElementNS("http://www.w3.org/2000/svg", "path");
    infield.setAttribute("d", pathD);
    infield.setAttribute("fill", "url(#track-infield-gradient)");
    infield.setAttribute("stroke", "none");
    infield.setAttribute("class", "track-infield");
    this.bgGroup.appendChild(infield);
  }

  private installBroadcastDefs(): void {
    const glow = document.createElementNS(SVG_NS, "filter");
    glow.setAttribute("id", "broadcast-glow");
    glow.setAttribute("x", "-40%");
    glow.setAttribute("y", "-40%");
    glow.setAttribute("width", "180%");
    glow.setAttribute("height", "180%");
    const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "1.8");
    blur.setAttribute("result", "blur");
    const merge = document.createElementNS(SVG_NS, "feMerge");
    const mergeNode1 = document.createElementNS(SVG_NS, "feMergeNode");
    mergeNode1.setAttribute("in", "blur");
    const mergeNode2 = document.createElementNS(SVG_NS, "feMergeNode");
    mergeNode2.setAttribute("in", "SourceGraphic");
    merge.append(mergeNode1, mergeNode2);
    glow.append(blur, merge);
    this.defs.appendChild(glow);

    const trackGrad = document.createElementNS(SVG_NS, "linearGradient");
    trackGrad.setAttribute("id", "broadcast-track-gradient");
    trackGrad.setAttribute("x1", "0%");
    trackGrad.setAttribute("y1", "0%");
    trackGrad.setAttribute("x2", "100%");
    trackGrad.setAttribute("y2", "100%");
    for (const [offset, color] of [
      ["0%", "#8b5cf6"],
      ["50%", "#6366f1"],
      ["100%", "#22d3ee"],
    ] as const) {
      const stop = document.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      trackGrad.appendChild(stop);
    }
    this.defs.appendChild(trackGrad);

    const addSurfaceFilter = (
      id: string,
      blur: number,
      floodColor: string,
      floodOpacity: string,
    ) => {
      const filter = document.createElementNS(SVG_NS, "filter");
      filter.setAttribute("id", id);
      filter.setAttribute("x", "-40%");
      filter.setAttribute("y", "-40%");
      filter.setAttribute("width", "180%");
      filter.setAttribute("height", "180%");
      const blurNode = document.createElementNS(SVG_NS, "feGaussianBlur");
      blurNode.setAttribute("stdDeviation", String(blur));
      blurNode.setAttribute("result", "blur");
      const flood = document.createElementNS(SVG_NS, "feFlood");
      flood.setAttribute("flood-color", floodColor);
      flood.setAttribute("flood-opacity", floodOpacity);
      flood.setAttribute("result", "tint");
      const comp = document.createElementNS(SVG_NS, "feComposite");
      comp.setAttribute("in", "tint");
      comp.setAttribute("in2", "blur");
      comp.setAttribute("operator", "in");
      comp.setAttribute("result", "glow");
      const merge = document.createElementNS(SVG_NS, "feMerge");
      const glowNode = document.createElementNS(SVG_NS, "feMergeNode");
      glowNode.setAttribute("in", "glow");
      const graphicNode = document.createElementNS(SVG_NS, "feMergeNode");
      graphicNode.setAttribute("in", "SourceGraphic");
      merge.append(glowNode, graphicNode);
      filter.append(blurNode, flood, comp, merge);
      this.defs.appendChild(filter);
    };

    addSurfaceFilter("broadcast-runoff-glow", 2.2, "#22d3ee", "0.35");
    addSurfaceFilter("broadcast-gravel-glow", 2.4, "#c4a574", "0.28");
    addSurfaceFilter("broadcast-turf-glow", 1.8, "#4ade80", "0.22");

    const featherFilter = document.createElementNS(SVG_NS, "filter");
    featherFilter.setAttribute("id", "broadcast-surface-feather");
    featherFilter.setAttribute("x", "-50%");
    featherFilter.setAttribute("y", "-50%");
    featherFilter.setAttribute("width", "200%");
    featherFilter.setAttribute("height", "200%");
    const featherBlur = document.createElementNS(SVG_NS, "feGaussianBlur");
    featherBlur.setAttribute("stdDeviation", "3.5");
    featherFilter.appendChild(featherBlur);
    this.defs.appendChild(featherFilter);

    const addGrad = (
      id: string,
      stops: ReadonlyArray<readonly [string, string, string]>,
      axis: "y" | "x" | "depth" = "y",
    ) => {
      const grad = document.createElementNS(SVG_NS, "linearGradient");
      grad.setAttribute("id", id);
      if (axis === "depth") {
        grad.setAttribute("gradientUnits", "objectBoundingBox");
        grad.setAttribute("x1", "0");
        grad.setAttribute("y1", "0");
        grad.setAttribute("x2", "1");
        grad.setAttribute("y2", "0");
      } else {
        grad.setAttribute("x1", "0%");
        grad.setAttribute("y1", "0%");
        grad.setAttribute("x2", axis === "y" ? "0%" : "100%");
        grad.setAttribute("y2", axis === "y" ? "100%" : "0%");
      }
      for (const [offset, color, opacity] of stops) {
        const stop = document.createElementNS(SVG_NS, "stop");
        stop.setAttribute("offset", offset);
        stop.setAttribute("stop-color", color);
        stop.setAttribute("stop-opacity", opacity);
        grad.appendChild(stop);
      }
      this.defs.appendChild(grad);
    };

    addGrad("broadcast-runoff-concrete", [
      ["0%", "#67e8f9", "0.62"],
      ["18%", "#64748b", "0.92"],
      ["55%", "#334155", "0.88"],
      ["100%", "#0f172a", "0.18"],
    ], "depth");
    addGrad("broadcast-runoff-asphalt", [
      ["0%", "#a78bfa", "0.55"],
      ["22%", "#4b5563", "0.9"],
      ["100%", "#0f172a", "0.15"],
    ], "depth");
    addGrad("broadcast-signes-blue", [
      ["0%", "#38bdf8", "0.45"],
      ["40%", "#2563eb", "0.82"],
      ["100%", "#1e3a5f", "0.55"],
    ]);
    addGrad("broadcast-signes-red", [
      ["0%", "#f87171", "0.5"],
      ["50%", "#dc2626", "0.85"],
      ["100%", "#450a0a", "0.6"],
    ]);
    addGrad("broadcast-turf-fill", [
      ["0%", "#4ade80", "0.35"],
      ["100%", "#14532d", "0.72"],
    ]);
    addGrad("broadcast-fake-gravel", [
      ["0%", "#d4a574", "0.5"],
      ["40%", "#5c4a38", "0.82"],
      ["100%", "#1a1510", "0.2"],
    ], "depth");
    addGrad("broadcast-gravel-depth", [
      ["0%", "#a89068", "0.45"],
      ["30%", "#4a4034", "0.88"],
      ["100%", "#14100c", "0.12"],
    ], "depth");
    addGrad("broadcast-barrier-fill", [
      ["0%", "#64748b", "0.9"],
      ["100%", "#1e293b", "0.75"],
    ], "x");

    this.appendGravelPatternDef("broadcast-gravel-pattern", "#2a2520", true);
    this.appendGravelGritOverlayDef("broadcast-gravel-grit");
  }

  /** Transparent pebble speckle layered over gravel depth fill. */
  private appendGravelGritOverlayDef(id: string): void {
    const tile = 14;
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.setAttribute("id", id);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(tile));
    pattern.setAttribute("height", String(tile));
    for (const [cx, cy, rx, ry, fill, opacity] of [
      [2.5, 3, 1.6, 1.0, "#8a7860", "0.5"],
      [9, 2, 1.2, 0.8, "#6a5848", "0.45"],
      [5, 8, 1.4, 0.9, "#9a8868", "0.42"],
      [11, 10, 1.0, 0.7, "#5a4838", "0.38"],
      [7, 5.5, 0.8, 0.6, "#b0a080", "0.35"],
    ] as const) {
      const pebble = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      pebble.setAttribute("cx", String(cx));
      pebble.setAttribute("cy", String(cy));
      pebble.setAttribute("rx", String(rx));
      pebble.setAttribute("ry", String(ry));
      pebble.setAttribute("fill", fill);
      pebble.setAttribute("opacity", opacity);
      pattern.appendChild(pebble);
    }
    this.defs.appendChild(pattern);
  }

  private appendGravelPatternDef(id: string, baseColor: string, broadcast: boolean): void {
    const tile = broadcast ? 14 : 10;
    const gravelPattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    gravelPattern.setAttribute("id", id);
    gravelPattern.setAttribute("patternUnits", "userSpaceOnUse");
    gravelPattern.setAttribute("width", String(tile));
    gravelPattern.setAttribute("height", String(tile));
    const gravelBase = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    gravelBase.setAttribute("width", String(tile));
    gravelBase.setAttribute("height", String(tile));
    gravelBase.setAttribute("fill", broadcast ? "url(#broadcast-gravel-depth)" : baseColor);
    gravelPattern.appendChild(gravelBase);
    const pebbles = broadcast
      ? ([
          [2.5, 3, 1.6, 1.0, "#6a5840", "0.55"],
          [9, 2, 1.2, 0.8, "#524630", "0.5"],
          [5, 8, 1.4, 0.9, "#7a6848", "0.48"],
          [11, 10, 1.0, 0.7, "#403828", "0.45"],
          [7, 5.5, 0.8, 0.6, "#8a7860", "0.4"],
        ] as const)
      : ([
          [2, 2, 1.1, 1.1, "#a88048", "1"],
          [7, 3, 0.9, 0.9, "#8c6838", "1"],
          [4, 7, 1.0, 1.0, "#b09050", "1"],
          [8, 8, 0.8, 0.8, "#947040", "1"],
        ] as const);
    for (const [cx, cy, rx, ry, fill, opacity] of pebbles) {
      const pebble = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      pebble.setAttribute("cx", String(cx));
      pebble.setAttribute("cy", String(cy));
      pebble.setAttribute("rx", String(rx));
      pebble.setAttribute("ry", String(ry));
      pebble.setAttribute("fill", fill);
      pebble.setAttribute("opacity", opacity);
      gravelPattern.appendChild(pebble);
    }
    this.defs.appendChild(gravelPattern);
  }

  private bandOutlinePoints(inner: SvgPoint[], outer: SvgPoint[]): string {
    return [...inner, ...outer.slice().reverse()]
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
  }

  /** Neon broadcast ribbon — same footprint as classic track (28/18/11), neon colors. */
  private drawTrackSurfaceBroadcast(pathD: string): void {
    this.appendBroadcastRibbon(pathD, this.trackGroup);
  }

  private appendBroadcastRibbon(
    pathD: string,
    parent: SVGGElement,
    widthScale = 1,
    options: { layers?: "full" | "core"; lineCap?: "round" | "butt" } = {},
  ): void {
    const sw = (n: number) => String(n * widthScale);
    const layers = options.layers ?? "full";
    const cap = options.lineCap ?? "round";

    if (layers === "full") {
      const outerGlow = document.createElementNS(SVG_NS, "path");
      outerGlow.setAttribute("d", pathD);
      outerGlow.setAttribute("fill", "none");
      outerGlow.setAttribute("stroke", "#22d3ee");
      outerGlow.setAttribute("stroke-width", sw(28));
      outerGlow.setAttribute("stroke-linejoin", "round");
      outerGlow.setAttribute("stroke-linecap", cap);
      outerGlow.setAttribute("opacity", "0.18");
      outerGlow.setAttribute("filter", "url(#broadcast-glow)");
      outerGlow.setAttribute("class", "track-broadcast-outer");
      parent.appendChild(outerGlow);

      const midGlow = document.createElementNS(SVG_NS, "path");
      midGlow.setAttribute("d", pathD);
      midGlow.setAttribute("fill", "none");
      midGlow.setAttribute("stroke", "#8b5cf6");
      midGlow.setAttribute("stroke-width", sw(20));
      midGlow.setAttribute("stroke-linejoin", "round");
      midGlow.setAttribute("stroke-linecap", cap);
      midGlow.setAttribute("opacity", "0.28");
      midGlow.setAttribute("class", "track-broadcast-mid");
      parent.appendChild(midGlow);

      const edge = document.createElementNS(SVG_NS, "path");
      edge.setAttribute("d", pathD);
      edge.setAttribute("fill", "none");
      edge.setAttribute("stroke", "#1a2438");
      edge.setAttribute("stroke-width", sw(18));
      edge.setAttribute("stroke-linejoin", "round");
      edge.setAttribute("stroke-linecap", cap);
      edge.setAttribute("class", "track-broadcast-edge");
      parent.appendChild(edge);
    }

    const core = document.createElementNS(SVG_NS, "path");
    core.setAttribute("d", pathD);
    core.setAttribute("fill", "none");
    core.setAttribute("stroke", "url(#broadcast-track-gradient)");
    core.setAttribute("stroke-width", sw(TRACK_ASPHALT_WIDTH));
    core.setAttribute("stroke-linejoin", "round");
    core.setAttribute("stroke-linecap", cap);
    core.setAttribute("class", "track-broadcast-core");
    parent.appendChild(core);

    const centerLine = document.createElementNS(SVG_NS, "path");
    centerLine.setAttribute("d", pathD);
    centerLine.setAttribute("fill", "none");
    centerLine.setAttribute("stroke", "rgba(255,255,255,0.35)");
    centerLine.setAttribute("stroke-width", sw(0.6));
    centerLine.setAttribute("stroke-linejoin", "round");
    centerLine.setAttribute("stroke-linecap", cap);
    centerLine.setAttribute("stroke-dasharray", "4 10");
    centerLine.setAttribute("class", "track-broadcast-center");
    parent.appendChild(centerLine);
  }

  private appendClassicRibbon(
    pathD: string,
    parent: SVGGElement,
    widthScale = 1,
    options: { layers?: "full" | "core"; lineCap?: "round" | "butt" } = {},
  ): void {
    const t = this.theme;
    const sw = (n: number) => String(n * widthScale);
    const layers = options.layers ?? "full";
    const cap = options.lineCap ?? "round";

    if (layers === "full") {
      const runoff = document.createElementNS(SVG_NS, "path");
      runoff.setAttribute("d", pathD);
      runoff.setAttribute("fill", "none");
      runoff.setAttribute("stroke", t.runoff);
      runoff.setAttribute("stroke-width", sw(28));
      runoff.setAttribute("stroke-linejoin", "round");
      runoff.setAttribute("stroke-linecap", cap);
      runoff.setAttribute("opacity", "0.72");
      runoff.setAttribute("class", "track-runoff");
      parent.appendChild(runoff);

      const edge = document.createElementNS(SVG_NS, "path");
      edge.setAttribute("d", pathD);
      edge.setAttribute("fill", "none");
      edge.setAttribute("stroke", t.asphaltDark);
      edge.setAttribute("stroke-width", sw(18));
      edge.setAttribute("stroke-linejoin", "round");
      edge.setAttribute("stroke-linecap", cap);
      parent.appendChild(edge);
    }

    const asphalt = document.createElementNS(SVG_NS, "path");
    asphalt.setAttribute("d", pathD);
    asphalt.setAttribute("fill", "none");
    asphalt.setAttribute("stroke", "url(#track-asphalt-gradient)");
    asphalt.setAttribute("stroke-width", sw(TRACK_ASPHALT_WIDTH));
    asphalt.setAttribute("stroke-linejoin", "round");
    asphalt.setAttribute("stroke-linecap", cap);
    asphalt.setAttribute("class", "track-outline");
    parent.appendChild(asphalt);

    const centerLine = document.createElementNS(SVG_NS, "path");
    centerLine.setAttribute("d", pathD);
    centerLine.setAttribute("fill", "none");
    centerLine.setAttribute("stroke", "rgba(255,255,255,0.22)");
    centerLine.setAttribute("stroke-width", sw(0.6));
    centerLine.setAttribute("stroke-linejoin", "round");
    centerLine.setAttribute("stroke-linecap", cap);
    centerLine.setAttribute("stroke-dasharray", "5 9");
    parent.appendChild(centerLine);
  }

  private pointAlongPolyline(
    points: SvgPoint[],
    cumulative: number[],
    distance: number,
  ): SvgPoint | null {
    if (points.length === 0) return null;
    if (distance <= 0) return { ...points[0] };
    const total = cumulative[cumulative.length - 1] ?? 0;
    if (distance >= total) return { ...points[points.length - 1] };
    for (let i = 1; i < points.length; i++) {
      const c0 = cumulative[i - 1];
      const c1 = cumulative[i];
      if (distance > c1) continue;
      const t = (distance - c0) / (c1 - c0 || 1);
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    return { ...points[points.length - 1] };
  }

  private pathSegmentByDistance(
    points: SvgPoint[],
    cumulative: number[],
    startD: number,
    endD: number,
  ): string {
    if (endD <= startD + 1e-6) return "";
    const segment: SvgPoint[] = [];
    const startPt = this.pointAlongPolyline(points, cumulative, startD);
    if (startPt) segment.push(startPt);
    for (let i = 0; i < points.length; i++) {
      const d = cumulative[i];
      if (d > startD + 1e-6 && d < endD - 1e-6) segment.push(points[i]);
    }
    const endPt = this.pointAlongPolyline(points, cumulative, endD);
    if (endPt) {
      const last = segment[segment.length - 1];
      if (!last || Math.hypot(endPt.x - last.x, endPt.y - last.y) > 0.05) {
        segment.push(endPt);
      }
    }
    if (segment.length < 2) return "";
    return this.pointsToSmoothPath(segment, false);
  }

  private offsetPathAlongPolyline(
    points: SvgPoint[],
    cumulative: number[],
    startD: number,
    endD: number,
    lateralOffset: number,
    sampleStep = 4,
  ): string {
    if (endD <= startD + 1e-6) return "";
    const samples: SvgPoint[] = [];
    for (let d = startD; d <= endD + 1e-6; d += sampleStep) {
      const frame = this.samplePathFrame(points, cumulative, Math.min(d, endD));
      if (!frame) continue;
      samples.push({
        x: frame.x + frame.nx * lateralOffset,
        y: frame.y + frame.ny * lateralOffset,
      });
    }
    const endFrame = this.samplePathFrame(points, cumulative, endD);
    if (endFrame) {
      const pt = {
        x: endFrame.x + endFrame.nx * lateralOffset,
        y: endFrame.y + endFrame.ny * lateralOffset,
      };
      const last = samples[samples.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 0.05) samples.push(pt);
    }
    return samples.length >= 2 ? this.pointsToSmoothPath(samples, false) : "";
  }

  /** Parallel pit ribbon: glow + core on centerline, dark edge only on the outer shoulder. */
  private appendPitParallelRibbon(
    parallelD: string,
    outerEdgeD: string,
    parent: SVGGElement,
    widthScale: number,
  ): void {
    const sw = (n: number) => String(n * widthScale);
    const cap = "round";

    if (this.broadcast) {
      const outerGlow = document.createElementNS(SVG_NS, "path");
      outerGlow.setAttribute("d", parallelD);
      outerGlow.setAttribute("fill", "none");
      outerGlow.setAttribute("stroke", "#22d3ee");
      outerGlow.setAttribute("stroke-width", sw(28));
      outerGlow.setAttribute("stroke-linejoin", "round");
      outerGlow.setAttribute("stroke-linecap", cap);
      outerGlow.setAttribute("opacity", "0.18");
      outerGlow.setAttribute("filter", "url(#broadcast-glow)");
      outerGlow.setAttribute("class", "track-broadcast-outer");
      parent.appendChild(outerGlow);

      const midGlow = document.createElementNS(SVG_NS, "path");
      midGlow.setAttribute("d", parallelD);
      midGlow.setAttribute("fill", "none");
      midGlow.setAttribute("stroke", "#8b5cf6");
      midGlow.setAttribute("stroke-width", sw(20));
      midGlow.setAttribute("stroke-linejoin", "round");
      midGlow.setAttribute("stroke-linecap", cap);
      midGlow.setAttribute("opacity", "0.28");
      midGlow.setAttribute("class", "track-broadcast-mid");
      parent.appendChild(midGlow);

      if (outerEdgeD) {
        const edge = document.createElementNS(SVG_NS, "path");
        edge.setAttribute("d", outerEdgeD);
        edge.setAttribute("fill", "none");
        edge.setAttribute("stroke", "#1a2438");
        edge.setAttribute("stroke-width", sw(18));
        edge.setAttribute("stroke-linejoin", "round");
        edge.setAttribute("stroke-linecap", cap);
        edge.setAttribute("class", "track-broadcast-edge");
        parent.appendChild(edge);
      }
    } else {
      const t = this.theme;
      const runoff = document.createElementNS(SVG_NS, "path");
      runoff.setAttribute("d", parallelD);
      runoff.setAttribute("fill", "none");
      runoff.setAttribute("stroke", t.runoff);
      runoff.setAttribute("stroke-width", sw(28));
      runoff.setAttribute("stroke-linejoin", "round");
      runoff.setAttribute("stroke-linecap", cap);
      runoff.setAttribute("opacity", "0.72");
      runoff.setAttribute("class", "track-runoff");
      parent.appendChild(runoff);

      if (outerEdgeD) {
        const edge = document.createElementNS(SVG_NS, "path");
        edge.setAttribute("d", outerEdgeD);
        edge.setAttribute("fill", "none");
        edge.setAttribute("stroke", t.asphaltDark);
        edge.setAttribute("stroke-width", sw(18));
        edge.setAttribute("stroke-linejoin", "round");
        edge.setAttribute("stroke-linecap", cap);
        parent.appendChild(edge);
      }
    }

    const core = document.createElementNS(SVG_NS, "path");
    core.setAttribute("d", parallelD);
    core.setAttribute("fill", "none");
    core.setAttribute(
      "stroke",
      this.broadcast ? "url(#broadcast-track-gradient)" : "url(#track-asphalt-gradient)",
    );
    core.setAttribute("stroke-width", sw(TRACK_ASPHALT_WIDTH));
    core.setAttribute("stroke-linejoin", "round");
    core.setAttribute("stroke-linecap", cap);
    core.setAttribute("class", this.broadcast ? "track-broadcast-core" : "track-outline");
    parent.appendChild(core);

    const centerLine = document.createElementNS(SVG_NS, "path");
    centerLine.setAttribute("d", parallelD);
    centerLine.setAttribute("fill", "none");
    centerLine.setAttribute(
      "stroke",
      this.broadcast ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.22)",
    );
    centerLine.setAttribute("stroke-width", sw(0.6));
    centerLine.setAttribute("stroke-linejoin", "round");
    centerLine.setAttribute("stroke-linecap", cap);
    centerLine.setAttribute(
      "stroke-dasharray",
      this.broadcast ? "4 10" : "5 9",
    );
    centerLine.setAttribute(
      "class",
      this.broadcast ? "track-broadcast-center" : "track-center",
    );
    parent.appendChild(centerLine);
  }

  private appendPitLaneRibbon(
    tarmacPath: { points: SvgPoint[]; cumulative: number[] },
    pitLen: number,
    blendFraction: number,
    widthScale: number,
    layout: ReturnType<SvgTrack["pitLayoutMetrics"]>,
  ): void {
    const blendD = pitLen * blendFraction;
    const sampleStep = Math.max(2.5, pitLen / 90);
    const blendInD = this.pathSegmentByDistance(tarmacPath.points, tarmacPath.cumulative, 0, blendD);
    const parallelD = this.pathSegmentByDistance(
      tarmacPath.points,
      tarmacPath.cumulative,
      blendD,
      pitLen - blendD,
    );
    const blendOutD = this.pathSegmentByDistance(
      tarmacPath.points,
      tarmacPath.cumulative,
      pitLen - blendD,
      pitLen,
    );
    const outerEdgeD = this.offsetPathAlongPolyline(
      tarmacPath.points,
      tarmacPath.cumulative,
      blendD,
      pitLen - blendD,
      layout.tarmacWidth * 0.48,
      sampleStep,
    );
    const round = { lineCap: "round" as const };

    const drawCore = (pathD: string) => {
      if (!pathD) return;
      if (this.broadcast) {
        this.appendBroadcastRibbon(pathD, this.pitGroup, widthScale, { layers: "core", ...round });
      } else {
        this.appendClassicRibbon(pathD, this.pitGroup, widthScale, { layers: "core", ...round });
      }
    };

    drawCore(blendInD);
    this.appendPitParallelRibbon(parallelD, outerEdgeD, this.pitGroup, widthScale);
    drawCore(blendOutD);
  }

  private drawTrackSurface(
    pathD: string,
    svgPoints: SvgPoint[],
    geometry: TrackGeometryPayload,
    cumulative: number[],
  ): void {
    const t = this.theme;
    const useCorridor =
      geometry.defaultWidthM != null || (geometry.widthProfile?.length ?? 0) > 0;
    const useSurfaceProfile = (geometry.surfaceProfile?.length ?? 0) > 0;

    if (useCorridor) {
      this.drawCorridorRibbon(svgPoints, cumulative, geometry);
    }

    if (!useSurfaceProfile) {
      const runoff = document.createElementNS("http://www.w3.org/2000/svg", "path");
      runoff.setAttribute("d", pathD);
      runoff.setAttribute("fill", "none");
      runoff.setAttribute("stroke", t.runoff);
      runoff.setAttribute("stroke-width", "28");
      runoff.setAttribute("stroke-linejoin", "round");
      runoff.setAttribute("stroke-linecap", "round");
      runoff.setAttribute("opacity", "0.72");
      runoff.setAttribute("class", "track-runoff");
      this.trackGroup.appendChild(runoff);
    }

    if (!useSurfaceProfile) {
      const edge = document.createElementNS("http://www.w3.org/2000/svg", "path");
      edge.setAttribute("d", pathD);
      edge.setAttribute("fill", "none");
      edge.setAttribute("stroke", t.asphaltDark);
      edge.setAttribute("stroke-width", "18");
      edge.setAttribute("stroke-linejoin", "round");
      edge.setAttribute("stroke-linecap", "round");
      this.trackGroup.appendChild(edge);
    }

    if (!useCorridor) {
      const asphalt = document.createElementNS("http://www.w3.org/2000/svg", "path");
      asphalt.setAttribute("d", pathD);
      asphalt.setAttribute("fill", "none");
      asphalt.setAttribute("stroke", "url(#track-asphalt-gradient)");
      asphalt.setAttribute("stroke-width", String(TRACK_ASPHALT_WIDTH));
      asphalt.setAttribute("stroke-linejoin", "round");
      asphalt.setAttribute("stroke-linecap", "round");
      asphalt.setAttribute("class", "track-outline");
      this.trackGroup.appendChild(asphalt);
    } else {
      const center = document.createElementNS("http://www.w3.org/2000/svg", "path");
      center.setAttribute("d", pathD);
      center.setAttribute("fill", "none");
      center.setAttribute("stroke", "rgba(255,255,255,0.14)");
      center.setAttribute("stroke-width", "1.2");
      center.setAttribute("stroke-linejoin", "round");
      center.setAttribute("stroke-linecap", "round");
      center.setAttribute("class", "track-centerline");
      center.setAttribute("stroke-dasharray", "6 10");
      this.trackGroup.appendChild(center);
    }

    const wetSheen = document.createElementNS("http://www.w3.org/2000/svg", "path");
    wetSheen.setAttribute("d", pathD);
    wetSheen.setAttribute("fill", "none");
    wetSheen.setAttribute("stroke", "rgba(130, 165, 195, 0.65)");
    wetSheen.setAttribute(
      "stroke-width",
      String(useCorridor ? 2 : TRACK_ASPHALT_WIDTH - 0.5),
    );
    wetSheen.setAttribute("stroke-linejoin", "round");
    wetSheen.setAttribute("stroke-linecap", "round");
    wetSheen.setAttribute("class", "track-wet-sheen");
    wetSheen.setAttribute("opacity", "0");
    this.trackGroup.appendChild(wetSheen);
    this.wetSheenPath = wetSheen;

    if (!useSurfaceProfile) {
      this.drawCornerKerbs(svgPoints);
    }

    const centerLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    centerLine.setAttribute("d", pathD);
    centerLine.setAttribute("fill", "none");
    centerLine.setAttribute("stroke", "rgba(255,255,255,0.22)");
    centerLine.setAttribute("stroke-width", "0.6");
    centerLine.setAttribute("stroke-linejoin", "round");
    centerLine.setAttribute("stroke-linecap", "round");
    centerLine.setAttribute("stroke-dasharray", "5 9");
    this.trackGroup.appendChild(centerLine);
  }

  private drawCornerKerbs(svgPoints: SvgPoint[]): void {
    const minTurn = 0.28;
    const kerbReach = 14;

    for (let i = 1; i < svgPoints.length - 1; i++) {
      const prev = svgPoints[i - 1];
      const curr = svgPoints[i];
      const next = svgPoints[i + 1];
      const v1x = curr.x - prev.x;
      const v1y = curr.y - prev.y;
      const v2x = next.x - curr.x;
      const v2y = next.y - curr.y;
      const len1 = Math.hypot(v1x, v1y) || 1;
      const len2 = Math.hypot(v2x, v2y) || 1;
      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle < minTurn) continue;

      const tBack = Math.min(kerbReach / len1, 0.45);
      const tFwd = Math.min(kerbReach / len2, 0.45);
      const p0 = this.lerpPoint(curr, prev, tBack);
      const p1 = this.lerpPoint(curr, next, tFwd);
      const segD = `M ${p0.x},${p0.y} L ${curr.x},${curr.y} L ${p1.x},${p1.y}`;

      const kerb = document.createElementNS("http://www.w3.org/2000/svg", "path");
      kerb.setAttribute("d", segD);
      kerb.setAttribute("fill", "none");
      kerb.setAttribute("stroke", "url(#track-kerb-pattern)");
      kerb.setAttribute("stroke-width", "13");
      kerb.setAttribute("stroke-linejoin", "round");
      kerb.setAttribute("stroke-linecap", "round");
      kerb.setAttribute("class", "track-kerb");
      this.trackGroup.appendChild(kerb);
    }

    if (svgPoints.length > 2) {
      const first = svgPoints[0];
      const second = svgPoints[1];
      const last = svgPoints[svgPoints.length - 1];
      const prev = svgPoints[svgPoints.length - 2];
      const v1x = first.x - last.x;
      const v1y = first.y - last.y;
      const v2x = second.x - first.x;
      const v2y = second.y - first.y;
      const len1 = Math.hypot(v1x, v1y) || 1;
      const len2 = Math.hypot(v2x, v2y) || 1;
      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle >= minTurn) {
        const tBack = Math.min(kerbReach / len1, 0.45);
        const tFwd = Math.min(kerbReach / len2, 0.45);
        const p0 = this.lerpPoint(first, prev, tBack);
        const p1 = this.lerpPoint(first, second, tFwd);
        const segD = `M ${p0.x},${p0.y} L ${first.x},${first.y} L ${p1.x},${p1.y}`;
        const kerb = document.createElementNS("http://www.w3.org/2000/svg", "path");
        kerb.setAttribute("d", segD);
        kerb.setAttribute("fill", "none");
        kerb.setAttribute("stroke", "url(#track-kerb-pattern)");
        kerb.setAttribute("stroke-width", "13");
        kerb.setAttribute("stroke-linejoin", "round");
        kerb.setAttribute("stroke-linecap", "round");
        this.trackGroup.appendChild(kerb);
      }
    }
  }

  private drawPitLane(
    svgPoints: SvgPoint[],
    cumulativeT: number[],
    totalLength: number,
  ): void {
    const pitLen = totalLength * PIT_LANE_FRACTION;
    if (pitLen <= 0) return;

    const layout = this.pitLayoutMetrics();
    const tw = TRACK_ASPHALT_WIDTH;
    const blendFraction = PIT_LANE_BLEND;
    const sampleStep = Math.max(2, pitLen / 72);

    const tarmacPath = this.buildBlendedPitPath(
      svgPoints,
      cumulativeT,
      pitLen,
      layout.tarmacCenterOffset,
      blendFraction,
      sampleStep,
    );
    if (tarmacPath.points.length < 2) return;

    const tarmacD = this.pointsToSmoothPath(tarmacPath.points, false);

    const parallelStart = pitLen * blendFraction;
    const parallelEnd = pitLen * (1 - blendFraction);
    const buildingMid = (parallelStart + parallelEnd) * 0.5;
    const buildingSpan = Math.min(pitLen * 0.54, tw * 6.8);

    const buildingFrame = this.sampleBlendedFrame(
      svgPoints,
      cumulativeT,
      buildingMid,
      layout.buildingCenterOffset,
      pitLen,
      blendFraction,
    );
    if (buildingFrame) {
      this.appendOrientedRect(this.pitGroup, buildingFrame, {
        width: buildingSpan,
        height: layout.buildingDepth,
        normalOffset: 0,
        fill: "url(#pit-building-fill)",
        stroke: "#5a626a",
        strokeWidth: 0.55,
        className: "pit-building",
        rx: 1.5,
        opacity: 0.96,
      });

      const roofFrame = this.sampleBlendedFrame(
        svgPoints,
        cumulativeT,
        buildingMid,
        layout.buildingCenterOffset - layout.buildingDepth * 0.38,
        pitLen,
        blendFraction,
      );
      if (roofFrame) {
        this.appendOrientedRect(this.pitGroup, roofFrame, {
          width: buildingSpan * 0.96,
          height: tw * 0.14,
          normalOffset: 0,
          fill: "rgba(90, 98, 106, 0.55)",
          stroke: "none",
          strokeWidth: 0,
          className: "pit-building-roof",
          rx: 0.5,
          opacity: 0.8,
        });
      }
    }

    const ribbonScale = layout.tarmacWidth / TRACK_ASPHALT_WIDTH;
    this.appendPitLaneRibbon(tarmacPath, pitLen, blendFraction, ribbonScale, layout);

    const parallelMarkingD = this.pathSegmentByDistance(
      tarmacPath.points,
      tarmacPath.cumulative,
      pitLen * blendFraction,
      pitLen * (1 - blendFraction),
    );

    const wallStep = Math.max(2.5, pitLen / 90);
    const innerOffset = -layout.tarmacWidth * 0.48;
    const outerOffset = layout.tarmacWidth * 0.52;

    const innerWallD = this.offsetPathAlongPolyline(
      tarmacPath.points,
      tarmacPath.cumulative,
      0,
      pitLen,
      innerOffset,
      wallStep,
    );
    this.appendPitBoundaryWall(this.pitGroup, innerWallD, layout.innerWallThickness, "pit-wall-inner");

    const buildingHalf = buildingSpan / 2;
    const buildingStart = buildingMid - buildingHalf;
    const buildingEnd = buildingMid + buildingHalf;
    const outerWallSpans: [number, number][] = [
      [0, parallelStart],
      [parallelStart, Math.max(parallelStart, buildingStart)],
      [Math.min(parallelEnd, buildingEnd), parallelEnd],
      [parallelEnd, pitLen],
    ];
    for (const [wallStart, wallEnd] of outerWallSpans) {
      const outerWallD = this.offsetPathAlongPolyline(
        tarmacPath.points,
        tarmacPath.cumulative,
        wallStart,
        wallEnd,
        outerOffset,
        wallStep,
      );
      this.appendPitBoundaryWall(this.pitGroup, outerWallD, layout.outerWallThickness, "pit-wall-outer");
    }

    const pitMarking = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pitMarking.setAttribute("d", parallelMarkingD || tarmacD);
    pitMarking.setAttribute("fill", "none");
    pitMarking.setAttribute("stroke", "rgba(255, 248, 230, 0.42)");
    pitMarking.setAttribute("stroke-width", String(tw * 0.12));
    pitMarking.setAttribute("stroke-dasharray", `${tw * 0.36} ${tw * 0.42}`);
    pitMarking.setAttribute("stroke-linecap", "round");
    pitMarking.setAttribute("class", "pit-lane");
    this.pitGroup.appendChild(pitMarking);

    const boxFrame = this.sampleBlendedFrame(
      svgPoints,
      cumulativeT,
      pitLen * 0.48,
      layout.markingOffset,
      pitLen,
      blendFraction,
    );
    if (boxFrame) {
      this.appendOrientedRect(this.pitGroup, boxFrame, {
        width: tw * 0.72,
        height: tw * 0.3,
        normalOffset: 0,
        fill: "rgba(255, 255, 255, 0.12)",
        stroke: "rgba(255, 255, 255, 0.45)",
        strokeWidth: 0.55,
        className: "pit-box",
        rx: 1,
      });
    }

  }

  /** Start/finish on the pit straight — spans track width through to pit lane. */
  private drawPitStartFinishLine(
    svgPoints: SvgPoint[],
    cumulative: number[],
    totalLength: number,
  ): void {
    const pitLen = totalLength * PIT_LANE_FRACTION;
    const sfDist = pitLen * 0.44;
    const frame = this.sampleTrackFrame(svgPoints, cumulative, sfDist, 0);
    if (!frame) return;

    const layout = this.pitLayoutMetrics();
    const tw = TRACK_ASPHALT_WIDTH;
    const innerEdge = -tw / 2;
    const outerEdge = layout.tarmacCenterOffset + layout.tarmacWidth / 2 + tw * 0.04;
    const x1 = frame.x + frame.nx * innerEdge;
    const y1 = frame.y + frame.ny * innerEdge;
    const x2 = frame.x + frame.nx * outerEdge;
    const y2 = frame.y + frame.ny * outerEdge;

    const startLine = document.createElementNS("http://www.w3.org/2000/svg", "g");
    startLine.setAttribute("class", "start-finish-group");

    const sfShadow = document.createElementNS("http://www.w3.org/2000/svg", "line");
    sfShadow.setAttribute("x1", String(x1));
    sfShadow.setAttribute("y1", String(y1));
    sfShadow.setAttribute("x2", String(x2));
    sfShadow.setAttribute("y2", String(y2));
    sfShadow.setAttribute("stroke", "rgba(0,0,0,0.4)");
    sfShadow.setAttribute("stroke-width", "3.8");
    sfShadow.setAttribute("stroke-linecap", "round");
    sfShadow.setAttribute("class", "start-finish-line-shadow");
    startLine.appendChild(sfShadow);

    const sfLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    sfLine.setAttribute("x1", String(x1));
    sfLine.setAttribute("y1", String(y1));
    sfLine.setAttribute("x2", String(x2));
    sfLine.setAttribute("y2", String(y2));
    sfLine.setAttribute("stroke", "url(#sf-checker)");
    sfLine.setAttribute("stroke-width", "2.8");
    sfLine.setAttribute("stroke-linecap", "butt");
    sfLine.setAttribute("class", "start-finish-line");
    startLine.appendChild(sfLine);

    for (const t of [0.08, 0.92]) {
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const post = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      post.setAttribute("x", String(px - 1.1));
      post.setAttribute("y", String(py - 1.1));
      post.setAttribute("width", "2.2");
      post.setAttribute("height", "2.2");
      post.setAttribute("fill", "url(#sf-checker)");
      post.setAttribute("class", "start-finish-post");
      startLine.appendChild(post);
    }

    this.trackGroup.appendChild(startLine);
  }

  private cachePitLanePath(
    svgPoints: SvgPoint[],
    cumulativeT: number[],
    totalLength: number,
  ): void {
    const pitLen = totalLength * PIT_LANE_FRACTION;
    if (pitLen <= 0 || svgPoints.length < 2) {
      this.pitLanePath = null;
      return;
    }

    const layout = this.pitLayoutMetrics();
    const sampleStep = Math.max(2, pitLen / 72);
    const tarmacPath = this.buildBlendedPitPath(
      svgPoints,
      cumulativeT,
      pitLen,
      layout.tarmacCenterOffset,
      PIT_LANE_BLEND,
      sampleStep,
    );
    if (tarmacPath.points.length < 2) {
      this.pitLanePath = null;
      return;
    }

    this.pitLanePath = {
      points: tarmacPath.points,
      cumulative: tarmacPath.cumulative,
      totalLength: pitLen,
      boxDistance: pitLen * PIT_BOX_FRACTION,
    };
  }

  private shouldRenderOnPitLane(snap: CarSnapshot): boolean {
    if (snap.inPit) return true;
    if (snap.pitQueued && snap.normalizedT < 0.02) return true;
    return false;
  }

  private resolveCarMapPose(snap: CarSnapshot): {
    x: number;
    y: number;
    angle: number;
    onPitLane: boolean;
  } {
    if (this.shouldRenderOnPitLane(snap) && this.pitLanePath) {
      const along = this.pitDistanceAlongSvg(snap);
      const frame = this.samplePathFrame(
        this.pitLanePath.points,
        this.pitLanePath.cumulative,
        along,
      );
      if (frame) {
        return {
          x: frame.x,
          y: frame.y,
          angle: this.frameAngleDeg(frame),
          onPitLane: true,
        };
      }
    }

    if (snap.poseIncludesLateral) {
      const base = this.worldToSvg(snap.position.x, snap.position.z);
      const tangent = snap.tangent ?? { x: 1, y: 0, z: 0 };
      return {
        x: base.x,
        y: base.y,
        angle: (Math.atan2(tangent.z, tangent.x) * 180) / Math.PI,
        onPitLane: false,
      };
    }

    if (this.fit && this.renderedGeometry) {
      const svgPoints = this.renderedGeometry.polyline.map((pt) =>
        this.worldToSvg(pt.x, pt.z),
      );
      const distanceM =
        snap.distance ?? snap.normalizedT * Math.max(this.lapLengthM, 1);
      const distAlong = this.distanceMToSvgAlong(distanceM);
      const lateralM =
        snap.lateralOffsetM ??
        (snap.lateralOffset ?? 0) * this.halfWidthAtDistanceM(distanceM);
      const frame = this.sampleTrackFrame(
        svgPoints,
        this.fit.cumulativeT,
        distAlong,
        this.metersToLateralSvg(lateralM, distanceM),
      );
      if (frame) {
        let angle = this.frameAngleDeg(frame);
        if (snap.headingError != null) {
          angle += (snap.headingError * 180) / Math.PI;
        }
        return { x: frame.x, y: frame.y, angle, onPitLane: false };
      }
    }

    const base = this.worldToSvg(snap.position.x, snap.position.z);
    const tangent = snap.tangent ?? { x: 1, y: 0, z: 0 };
    let angle = (Math.atan2(tangent.z, tangent.x) * 180) / Math.PI;
    if (snap.headingError != null) {
      angle += (snap.headingError * 180) / Math.PI;
    }
    return {
      x: base.x,
      y: base.y,
      angle,
      onPitLane: false,
    };
  }

  private pitDistanceAlongSvg(snap: CarSnapshot): number {
    const path = this.pitLanePath;
    if (!path) return 0;

    if (snap.pitQueued && !snap.inPit) {
      return 0;
    }

    const pitLenM = this.lapLengthM * PIT_LANE_FRACTION;
    if (
      snap.pitLaneDistance != null &&
      snap.pitLaneDistance >= 0 &&
      pitLenM > 0
    ) {
      const frac = Math.max(0, Math.min(1, snap.pitLaneDistance / pitLenM));
      return frac * path.totalLength;
    }

    const base = this.worldToSvg(snap.position.x, snap.position.z);
    return this.closestDistanceAlongPath(path, base);
  }

  private closestDistanceAlongPath(
    path: { points: SvgPoint[]; cumulative: number[] },
    point: SvgPoint,
  ): number {
    let bestDistSq = Infinity;
    let bestAlong = 0;

    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby || 1;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq),
      );
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      const d2 = (point.x - px) ** 2 + (point.y - py) ** 2;
      if (d2 >= bestDistSq) continue;
      bestDistSq = d2;
      const segStart = path.cumulative[i];
      const segLen = (path.cumulative[i + 1] ?? segStart) - segStart;
      bestAlong = segStart + segLen * t;
    }

    return bestAlong;
  }

  private pitLateralBlend(distance: number, pitLength: number, blendFraction: number): number {
    const blendLen = Math.max(pitLength * blendFraction, 0.001);
    if (distance <= 0 || distance >= pitLength) return 0;
    if (distance < blendLen) {
      const t = distance / blendLen;
      return t * t * (3 - 2 * t);
    }
    if (distance > pitLength - blendLen) {
      const t = (pitLength - distance) / blendLen;
      return t * t * (3 - 2 * t);
    }
    return 1;
  }

  private buildBlendedPitPath(
    svgPoints: SvgPoint[],
    cumulative: number[],
    pitLength: number,
    maxLateralOffset: number,
    blendFraction: number,
    sampleStep: number,
  ): { points: SvgPoint[]; cumulative: number[] } {
    const points: SvgPoint[] = [];
    for (let d = 0; d <= pitLength + 1e-6; d += sampleStep) {
      const dist = Math.min(d, pitLength);
      const blended = this.sampleBlendedFrame(
        svgPoints,
        cumulative,
        dist,
        maxLateralOffset,
        pitLength,
        blendFraction,
      );
      if (!blended) continue;
      points.push({ x: blended.x, y: blended.y });
      if (dist >= pitLength - 1e-6) break;
    }
    return { points, cumulative: this.buildCumulativeT(points) };
  }

  private sampleBlendedFrame(
    svgPoints: SvgPoint[],
    cumulative: number[],
    trackDistance: number,
    maxLateralOffset: number,
    pitLength: number,
    blendFraction: number,
  ): ({ x: number; y: number; tx: number; ty: number; nx: number; ny: number } | null) {
    const frame = this.sampleTrackFrame(svgPoints, cumulative, trackDistance, 0);
    if (!frame) return null;
    const blend = this.pitLateralBlend(trackDistance, pitLength, blendFraction);
    return {
      ...frame,
      x: frame.x + frame.nx * maxLateralOffset * blend,
      y: frame.y + frame.ny * maxLateralOffset * blend,
    };
  }

  private pointsToSmoothPath(points: SvgPoint[], closed: boolean): string {
    if (points.length === 0) return "";
    if (points.length < 3) return this.pointsToPath(points, closed);

    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    if (closed) d += " Z";
    return d;
  }

  private appendPitBoundaryWall(
    parent: SVGGElement,
    pathD: string,
    strokeWidth: number,
    className: string,
  ): void {
    if (!pathD) return;
    const wall = document.createElementNS(SVG_NS, "path");
    wall.setAttribute("d", pathD);
    wall.setAttribute("fill", "none");
    wall.setAttribute("stroke", className === "pit-wall-outer" ? "#5c6670" : "#9aa3ad");
    wall.setAttribute("stroke-width", String(strokeWidth));
    wall.setAttribute("stroke-linecap", "round");
    wall.setAttribute("stroke-linejoin", "round");
    wall.setAttribute("opacity", className === "pit-wall-outer" ? "0.92" : "0.78");
    wall.setAttribute("class", className);
    parent.appendChild(wall);
  }

  /** Layer offsets from the race track centerline (SVG units, tied to asphalt width). */
  private pitLayoutMetrics(): {
    wallCenterOffset: number;
    wallThickness: number;
    innerWallThickness: number;
    outerWallThickness: number;
    tarmacCenterOffset: number;
    tarmacWidth: number;
    markingOffset: number;
    buildingCenterOffset: number;
    buildingDepth: number;
  } {
    const tw = TRACK_ASPHALT_WIDTH;
    const halfTrack = tw / 2;
    const pitOffsetM = this.renderedGeometry?.pitLane?.offsetM;
    // Track JSON offset_m scales pit separation; default 10 m matches the legacy layout.
    const offsetScale =
      pitOffsetM != null && pitOffsetM > 0 ? pitOffsetM / 10 : 1;
    const edgeGap = tw * 0.52 * offsetScale;
    const wallThickness = tw * 0.2 * offsetScale;
    const innerWallThickness = tw * 0.13 * offsetScale;
    const outerWallThickness = tw * 0.42 * offsetScale;
    const tarmacWidth = tw * 0.92;
    const buildingDepth = tw * 0.95 * offsetScale;
    const buildingGap = tw * 0.22 * offsetScale;

    const wallCenterOffset = halfTrack + edgeGap + wallThickness / 2;
    const tarmacInnerEdge = halfTrack + edgeGap + wallThickness;
    const tarmacCenterOffset = tarmacInnerEdge + tarmacWidth / 2;
    const markingOffset = tarmacCenterOffset;
    const buildingCenterOffset = tarmacInnerEdge + tarmacWidth + buildingGap + buildingDepth / 2;

    return {
      wallCenterOffset,
      wallThickness,
      innerWallThickness,
      outerWallThickness,
      tarmacCenterOffset,
      tarmacWidth,
      markingOffset,
      buildingCenterOffset,
      buildingDepth,
    };
  }

  private sampleTrackFrame(
    trackPoints: SvgPoint[],
    cumulative: number[],
    distance: number,
    lateralOffset: number,
  ): ({ x: number; y: number; tx: number; ty: number; nx: number; ny: number } | null) {
    if (trackPoints.length < 2) return null;
    const total = cumulative[cumulative.length - 1] ?? 0;
    const d = Math.max(0, Math.min(distance, total));

    for (let i = 0; i < trackPoints.length - 1; i++) {
      const segStart = cumulative[i];
      const segEnd = cumulative[i + 1];
      if (d < segStart - 1e-6) continue;
      if (d > segEnd + 1e-6 && i < trackPoints.length - 2) continue;

      const segLen = segEnd - segStart || 1;
      const t = Math.max(0, Math.min(1, (d - segStart) / segLen));
      const frame = this.frameAtPoint(trackPoints, i);
      const bx = trackPoints[i].x + (trackPoints[i + 1].x - trackPoints[i].x) * t;
      const by = trackPoints[i].y + (trackPoints[i + 1].y - trackPoints[i].y) * t;
      return {
        x: bx + frame.nx * lateralOffset,
        y: by + frame.ny * lateralOffset,
        ...frame,
      };
    }

    const last = trackPoints.length - 1;
    const frame = this.frameAtPoint(trackPoints, last);
    return {
      x: trackPoints[last].x + frame.nx * lateralOffset,
      y: trackPoints[last].y + frame.ny * lateralOffset,
      ...frame,
    };
  }

  private frameAtPoint(points: SvgPoint[], index: number): {
    tx: number;
    ty: number;
    nx: number;
    ny: number;
  } {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    return { tx, ty, nx: -ty, ny: tx };
  }

  private samplePathFrame(
    points: SvgPoint[],
    cumulative: number[],
    distance: number,
  ): ({ x: number; y: number; tx: number; ty: number; nx: number; ny: number } | null) {
    if (points.length < 2) return null;
    const total = cumulative[cumulative.length - 1] ?? 0;
    const d = Math.max(0, Math.min(distance, total));

    for (let i = 0; i < points.length - 1; i++) {
      const segStart = cumulative[i];
      const segEnd = cumulative[i + 1];
      if (d < segStart - 1e-6) continue;
      if (d > segEnd + 1e-6 && i < points.length - 2) continue;

      const segLen = segEnd - segStart || 1;
      const t = Math.max(0, Math.min(1, (d - segStart) / segLen));
      const frame = this.frameAtPoint(points, i);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
        ...frame,
      };
    }

    const last = points.length - 1;
    const frame = this.frameAtPoint(points, last);
    return { x: points[last].x, y: points[last].y, ...frame };
  }

  private frameAngleDeg(frame: { tx: number; ty: number }): number {
    return (Math.atan2(frame.ty, frame.tx) * 180) / Math.PI;
  }

  private appendOrientedRect(
    parent: SVGGElement,
    frame: { x: number; y: number; tx: number; ty: number; nx: number; ny: number },
    opts: {
      width: number;
      height: number;
      normalOffset: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      className: string;
      rx?: number;
      opacity?: number;
    },
  ): void {
    const cx = frame.x + frame.nx * opts.normalOffset;
    const cy = frame.y + frame.ny * opts.normalOffset;
    const angle = this.frameAngleDeg(frame);

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "transform",
      `translate(${cx}, ${cy}) rotate(${angle})`,
    );
    group.setAttribute("class", opts.className);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(-opts.width / 2));
    rect.setAttribute("y", String(-opts.height / 2));
    rect.setAttribute("width", String(opts.width));
    rect.setAttribute("height", String(opts.height));
    rect.setAttribute("fill", opts.fill);
    rect.setAttribute("stroke", opts.stroke);
    rect.setAttribute("stroke-width", String(opts.strokeWidth));
    if (opts.rx != null) rect.setAttribute("rx", String(opts.rx));
    if (opts.opacity != null) rect.setAttribute("opacity", String(opts.opacity));

    group.appendChild(rect);
    parent.appendChild(group);
  }

  private drawSectorBands(
    svgPoints: SvgPoint[],
    sectors: TrackSectorGeometry[],
    cumulativeT: number[],
    totalLength: number,
  ): void {
    sectors.forEach((sector, idx) => {
      const startLen = sector.startT * totalLength;
      const endLen = sector.endT * totalLength;
      const segmentPoints = this.slicePolylineByLength(
        svgPoints,
        cumulativeT,
        startLen,
        endLen,
      );
      if (segmentPoints.length < 2) return;

      const midIdx = Math.floor(segmentPoints.length / 2);
      this.sectorMidpoints[idx] = segmentPoints[midIdx] ?? segmentPoints[0];

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", this.pointsToPath(segmentPoints, false));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", this.theme.sectorColors[idx % this.theme.sectorColors.length]);
      path.setAttribute("stroke-width", this.broadcast ? "5" : "18");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("opacity", this.broadcast ? "0.38" : "0.28");
      path.setAttribute("class", "sector-band");
      path.setAttribute("data-sector-index", String(idx));
      this.sectorsGroup.appendChild(path);
      this.sectorBandPaths[idx] = path;
    });
  }

  private buildCumulativeT(points: SvgPoint[]): number[] {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(
        cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y),
      );
    }
    return cumulative;
  }

  private slicePolylineByLength(
    points: SvgPoint[],
    cumulative: number[],
    startLen: number,
    endLen: number,
  ): SvgPoint[] {
    const result: SvgPoint[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const segStart = cumulative[i];
      const segEnd = cumulative[i + 1];
      if (segEnd < startLen || segStart > endLen) continue;

      const t0 = Math.max(0, (startLen - segStart) / (segEnd - segStart || 1));
      const t1 = Math.min(1, (endLen - segStart) / (segEnd - segStart || 1));

      if (result.length === 0 && t0 > 0) {
        result.push(this.lerpPoint(points[i], points[i + 1], t0));
      } else if (result.length === 0) {
        result.push(points[i]);
      }

      if (t1 < 1) {
        result.push(this.lerpPoint(points[i], points[i + 1], t1));
        break;
      }
      result.push(points[i + 1]);
    }
    return result;
  }

  private lerpPoint(a: SvgPoint, b: SvgPoint, t: number): SvgPoint {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private pointsToPath(points: SvgPoint[], closed: boolean): string {
    if (points.length === 0) return "";
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x},${points[i].y}`;
    }
    if (closed) d += " Z";
    return d;
  }

  private carBodyPath(length: number, width: number): string {
    const hw = width / 2;
    const hl = length / 2;
    const nose = hl * 0.85;
    return [
      `M ${-hl},0`,
      `L ${-hl * 0.3},${-hw}`,
      `L ${hl * 0.5},${-hw * 0.85}`,
      `L ${nose},0`,
      `L ${hl * 0.5},${hw * 0.85}`,
      `L ${-hl * 0.3},${hw}`,
      "Z",
    ].join(" ");
  }

  private cockpitPath(length: number, width: number): string {
    const hw = width * 0.35;
    const hl = length * 0.2;
    return [
      `M ${-hl},${-hw}`,
      `L ${hl},${-hw}`,
      `L ${hl * 0.6},${hw}`,
      `L ${-hl},${hw}`,
      "Z",
    ].join(" ");
  }

  private sampleCorridorEdges(
    svgPoints: SvgPoint[],
    cumulative: number[],
    geometry: TrackGeometryPayload,
  ): { left: SvgPoint[]; right: SvgPoint[] } {
    if (!this.fit) return { left: [], right: [] };
    const left: SvgPoint[] = [];
    const right: SvgPoint[] = [];
    const sampleStep = Math.max(4, this.fit.totalLength / 200);
    const lap = Math.max(geometry.lapLength, this.lapLengthM, 1);

    for (let d = 0; d <= this.fit.totalLength + 1e-6; d += sampleStep) {
      const distanceM = d * (lap / this.fit.totalLength);
      const halfW = this.halfWidthAtDistanceM(distanceM);
      const lateralSvg = this.metersToLateralSvg(halfW, distanceM);
      const frame = this.sampleTrackFrame(svgPoints, cumulative, d, 0);
      if (!frame) continue;
      left.push({
        x: frame.x - frame.nx * lateralSvg,
        y: frame.y - frame.ny * lateralSvg,
      });
      right.push({
        x: frame.x + frame.nx * lateralSvg,
        y: frame.y + frame.ny * lateralSvg,
      });
    }
    return { left, right };
  }

  private surfaceFillFor(seg: TrackSurfaceSegment, layer: "subgrade" | "accent"): string {
    if (layer === "accent" && seg.variant === "turf") {
      return this.broadcast ? "rgba(34, 52, 38, 0.58)" : this.theme.infield;
    }
    if (this.broadcast) {
      if (seg.surface === "verge" && seg.variant === "grass") {
        return "rgba(34, 62, 40, 0.62)";
      }
      if (seg.surface === "verge") return "rgba(36, 52, 40, 0.5)";
      if (seg.surface === "runoff_asphalt" && seg.variant === "blue") {
        return "rgba(48, 88, 140, 0.82)";
      }
      if (seg.surface === "runoff_asphalt" && seg.variant === "red") {
        return "rgba(140, 48, 48, 0.82)";
      }
      if (seg.surface === "gravel") return "rgba(92, 76, 54, 0.84)";
      if (seg.surface === "runoff_concrete" && seg.variant === "fake_gravel") {
        return "rgba(118, 98, 72, 0.82)";
      }
      if (seg.surface.startsWith("barrier")) return "rgba(38, 44, 50, 0.9)";
      if (seg.surface === "runoff_asphalt") return "rgba(128, 138, 146, 0.7)";
      if (seg.surface === "runoff_concrete") return "rgba(128, 138, 146, 0.7)";
      return "rgba(128, 138, 146, 0.7)";
    }

    const t = this.theme;
    if (seg.surface === "verge") return t.infield;
    if (seg.surface === "runoff_asphalt" && seg.variant === "blue") return "#4a6fa5";
    if (seg.surface === "runoff_asphalt" && seg.variant === "red") return "#c84848";
    if (seg.surface === "gravel") return "url(#track-gravel-pattern)";
    if (seg.surface === "runoff_concrete" && seg.variant === "fake_gravel") return t.dirt;
    if (seg.surface.startsWith("barrier")) return t.asphaltHighlight;
    if (seg.surface.startsWith("runoff")) return "url(#track-runoff-fill)";
    return "url(#track-runoff-fill)";
  }

  private surfaceStrokeFor(seg: TrackSurfaceSegment): { stroke: string; width: string } {
    if (seg.surface.startsWith("barrier")) {
      return this.broadcast
        ? { stroke: "none", width: "0" }
        : { stroke: "#1a4a28", width: "1.0" };
    }
    if (seg.surface === "gravel") {
      return { stroke: "rgba(40, 30, 18, 0.45)", width: "0.8" };
    }
    if (seg.variant === "turf") {
      return { stroke: "rgba(30, 50, 32, 0.5)", width: "0.7" };
    }
    if (seg.surface.startsWith("runoff")) {
      return { stroke: "none", width: "0" };
    }
    return { stroke: "rgba(12, 18, 28, 0.28)", width: "0.6" };
  }

  private buildMergedRunoffBands(segments: TrackSurfaceSegment[]): MergedRunoffBand[] {
    const groups = new Map<string, TrackSurfaceSegment[]>();
    for (const seg of segments) {
      if (!isMergeableRunoff(seg)) continue;
      const side = seg.side === "inboard" ? "inboard" : "outboard";
      const key = `${seg.surface}|${side}`;
      const list = groups.get(key) ?? [];
      list.push(seg);
      groups.set(key, list);
    }

    const merged: MergedRunoffBand[] = [];
    for (const segs of groups.values()) {
      segs.sort((a, b) => a.startT - b.startT);
      let cur: MergedRunoffBand | null = null;
      for (const seg of segs) {
        const side = seg.side === "inboard" ? "inboard" : "outboard";
        if (!cur || seg.startT - cur.endT > RUNOFF_MERGE_GAP_T) {
          if (cur) merged.push(cur);
          cur = {
            surface: seg.surface,
            variant: seg.variant,
            side,
            startT: seg.startT,
            endT: seg.endT,
            segments: [seg],
          };
        } else {
          cur.endT = Math.max(cur.endT, seg.endT);
          cur.segments.push(seg);
        }
      }
      if (cur) merged.push(cur);
    }
    return merged.sort((a, b) => a.startT - b.startT);
  }

  private mergedRunoffWidthAt(segments: TrackSurfaceSegment[], t: number): number {
    const sorted = [...segments].sort((a, b) => a.startT - b.startT);
    for (const seg of sorted) {
      if (t >= seg.startT && t <= seg.endT) {
        const span = Math.max(seg.endT - seg.startT, 1e-6);
        const u = (t - seg.startT) / span;
        return surfaceSegmentWidthAt(seg, Math.min(1, Math.max(0, u)));
      }
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const left = sorted[i];
      const right = sorted[i + 1];
      if (t > left.endT && t < right.startT) {
        const span = Math.max(right.startT - left.endT, 1e-6);
        const f = (t - left.endT) / span;
        const w0 = surfaceSegmentWidthAt(left, 1);
        const w1 = surfaceSegmentWidthAt(right, 0);
        return w0 + (w1 - w0) * f;
      }
    }
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first && t < first.startT) return surfaceSegmentWidthAt(first, 0);
    if (last) return surfaceSegmentWidthAt(last, 1);
    return 10;
  }

  private surfaceBandClasses(seg: TrackSurfaceSegment): string {
    const variant = seg.variant ? ` track-surface-variant-${seg.variant}` : "";
    const broadcast = this.broadcast ? " track-surface-band--broadcast" : "";
    return `track-surface-${seg.surface}${variant}${broadcast}`;
  }

  /** Stable inboard/outboard sign for a segment (fixed at arc midpoint). */
  private bandLateralSign(
    _seg: TrackSurfaceSegment,
    frame: { x: number; y: number; nx: number; ny: number },
    which: "outboard" | "inboard",
  ): number {
    return this.lateralSignAt(frame, which);
  }

  private lateralSignAt(
    frame: { x: number; y: number; nx: number; ny: number },
    which: "outboard" | "inboard",
  ): number {
    const { centroidX, centroidY } = this.fit!;
    const inboardSign =
      frame.nx * (centroidX - frame.x) + frame.ny * (centroidY - frame.y) > 0
        ? 1
        : -1;
    return which === "inboard" ? inboardSign : -inboardSign;
  }

  private barrierInnerMetersAt(
    seg: TrackSurfaceSegment,
    t: number,
    halfW: number,
  ): number {
    void t;
    if (this.broadcast) {
      return halfW - 0.45 + (seg.innerOffsetM ?? 0);
    }
    return halfW + (seg.innerOffsetM ?? 0) + 0.12;
  }

  private subgradeBandInnerMeters(halfW: number, innerOffsetM = 0): number {
    if (this.broadcast) return halfW - 0.45 + innerOffsetM;
    return halfW + innerOffsetM + 0.12;
  }

  private subgradeBandOuterMeters(
    seg: TrackSurfaceSegment,
    t: number,
    halfW: number,
  ): number {
    const span = Math.max(seg.endT - seg.startT, 1e-9);
    const u = Math.min(1, Math.max(0, (t - seg.startT) / span));
    const bandW = surfaceSegmentWidthAt(seg, u);
    const boost =
      seg.variant === "turf" ? TURF_BAND_DISPLAY_BOOST : SURFACE_BAND_DISPLAY_BOOST;
    const innerM = this.subgradeBandInnerMeters(halfW, seg.innerOffsetM ?? 0);
    return innerM + bandW * boost;
  }

  /** Painted outer edge of runoff / gravel / grass — matches drawn subgrade bands. */
  private visualSafetyZoneOuterMetersAt(
    segments: TrackSurfaceSegment[],
    t: number,
    halfW: number,
    side: "outboard" | "inboard",
  ): number {
    let best = this.subgradeBandInnerMeters(halfW);
    const mergedDrawn = new Set<string>();

    for (const merged of this.buildMergedRunoffBands(segments)) {
      if (merged.side !== side) continue;
      if (t < merged.startT - 1e-6 || t > merged.endT + 1e-6) continue;
      for (const seg of merged.segments) {
        mergedDrawn.add(`${seg.name}|${seg.startT}|${seg.endT}`);
      }
      const bandW = this.mergedRunoffWidthAt(merged.segments, t);
      const innerM = this.subgradeBandInnerMeters(halfW);
      best = Math.max(best, innerM + bandW * SURFACE_BAND_DISPLAY_BOOST);
    }

    for (const seg of segments) {
      if (isBarrierSegment(seg)) continue;
      if (seg.variant === "turf") continue;
      if (!barrierSideMatches(seg, side)) continue;
      if (mergedDrawn.has(`${seg.name}|${seg.startT}|${seg.endT}`)) continue;
      if (t < seg.startT - 1e-6 || t > seg.endT + 1e-6) continue;
      best = Math.max(best, this.subgradeBandOuterMeters(seg, t, halfW));
    }
    return best;
  }

  private barrierSegmentOuterMetersAt(
    segments: TrackSurfaceSegment[],
    t: number,
    halfW: number,
    side: "outboard" | "inboard",
  ): number | null {
    let best: number | null = null;
    for (const seg of segments) {
      if (!isBarrierSegment(seg)) continue;
      if (!barrierSideMatches(seg, side)) continue;
      if (t < seg.startT - 1e-6 || t > seg.endT + 1e-6) continue;
      const outerM = this.subgradeBandOuterMeters(seg, t, halfW);
      best = best == null ? outerM : Math.max(best, outerM);
    }
    return best;
  }

  private barrierOuterMetersAt(
    segments: TrackSurfaceSegment[],
    t: number,
    halfW: number,
    side: "outboard" | "inboard",
  ): number | null {
    const safetyOuter = this.visualSafetyZoneOuterMetersAt(segments, t, halfW, side);
    const authoredOuter = this.barrierSegmentOuterMetersAt(segments, t, halfW, side);
    if (authoredOuter != null && authoredOuter > safetyOuter + 0.35) {
      return authoredOuter;
    }
    return safetyOuter;
  }

  private splitPolylineRuns(points: SvgPoint[], maxGapPx: number): SvgPoint[][] {
    if (points.length < 2) return [];
    const runs: SvgPoint[][] = [];
    let cur: SvgPoint[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = cur[cur.length - 1];
      const pt = points[i];
      if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > maxGapPx) {
        if (cur.length >= 2) runs.push(cur);
        cur = [pt];
      } else {
        cur.push(pt);
      }
    }
    if (cur.length >= 2) runs.push(cur);
    return runs;
  }

  private prunePolylineSpikes(points: SvgPoint[], maxSpikePx = 4.5): SvgPoint[] {
    if (points.length < 3) return points;
    const out: SvgPoint[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const a = out[out.length - 1];
      const b = points[i];
      const c = points[i + 1];
      const acLen = Math.hypot(c.x - a.x, c.y - a.y);
      if (acLen < 1e-3) continue;
      const dist =
        Math.abs((c.y - a.y) * b.x - (c.x - a.x) * b.y + c.x * a.y - c.y * a.x) /
        acLen;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const bcx = c.x - b.x;
      const bcy = c.y - b.y;
      const abLen = Math.hypot(abx, aby);
      const bcLen = Math.hypot(bcx, bcy);
      const cos =
        abLen > 1e-6 && bcLen > 1e-6
          ? (abx * bcx + aby * bcy) / (abLen * bcLen)
          : 1;
      if (dist > maxSpikePx && cos < 0.15) continue;
      out.push(b);
    }
    out.push(points[points.length - 1]);
    return out;
  }

  private smoothPolylineLight(points: SvgPoint[], radius = 1): SvgPoint[] {
    if (points.length < 3 || radius <= 0) return points;
    return points.map((p, i) => {
      if (i === 0 || i === points.length - 1) return p;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let j = -radius; j <= radius; j++) {
        const idx = i + j;
        if (idx < 0 || idx >= points.length) continue;
        sx += points[idx].x;
        sy += points[idx].y;
        n++;
      }
      return n > 0 ? { x: sx / n, y: sy / n } : p;
    });
  }

  private sampleBarrierEdgeLoop(
    side: "outboard" | "inboard",
    segments: TrackSurfaceSegment[],
    svgPoints: SvgPoint[],
    cumulative: number[],
    lap: number,
  ): SvgPoint[] {
    if (!this.fit) return [];
    const steps = Math.max(
      180,
      Math.min(BARRIER_EDGE_SAMPLES, Math.round(this.fit.totalLength / 2.5)),
    );
    const points: SvgPoint[] = [];
    let lastOuterM: number | null = null;
    let lastGoodT = -1;
    const metersPerStep = lap / steps;
    const maxOuterStepM = Math.max(0.85, metersPerStep * 2.8);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const distanceM = t * lap;
      const d = this.distanceMToSvgAlong(distanceM);
      const halfW = this.halfWidthAtDistanceM(distanceM);
      let outerM = this.barrierOuterMetersAt(segments, t, halfW, side);
      if (outerM == null && lastOuterM != null && lastGoodT >= 0 && t - lastGoodT < 0.06) {
        outerM = lastOuterM;
      }
      if (outerM == null) continue;
      if (lastOuterM != null) {
        const delta = outerM - lastOuterM;
        if (Math.abs(delta) > maxOuterStepM) {
          outerM = lastOuterM + Math.sign(delta) * maxOuterStepM;
        }
      }
      lastOuterM = outerM;
      lastGoodT = t;
      const frame = this.sampleTrackFrame(svgPoints, cumulative, d, 0);
      if (!frame) continue;
      const sign = this.lateralSignAt(frame, side);
      const outerSvg = this.metersToLateralSvg(outerM, distanceM);
      points.push({
        x: frame.x + sign * frame.nx * outerSvg,
        y: frame.y + sign * frame.ny * outerSvg,
      });
    }
    if (points.length < 2) return [];
    const pruned = this.prunePolylineSpikes(this.smoothPolylineLight(points), 6);
    if (pruned.length < 2) return pruned;
    const first = pruned[0];
    const last = pruned[pruned.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 10) {
      return pruned.slice(0, -1);
    }
    return pruned;
  }

  private drawBarrierEdgePath(parent: SVGGElement, points: SvgPoint[]): void {
    const runs = this.splitPolylineRuns(points, 42);
    for (const run of runs) {
      if (run.length < 2) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", this.pointsToPath(run, false));
      path.setAttribute("fill", "none");
      path.setAttribute(
        "stroke",
        this.broadcast ? "rgba(200, 90, 90, 0.72)" : "#1f5c34",
      );
      path.setAttribute("stroke-width", this.broadcast ? "1.35" : "1.4");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("class", "track-barrier-edge track-barrier-edge--loop");
      parent.appendChild(path);
    }
  }

  private drawSurfaceBands(
    svgPoints: SvgPoint[],
    cumulative: number[],
    geometry: TrackGeometryPayload,
    parent: SVGGElement,
    layer: "subgrade" | "accent",
  ): void {
    if (!geometry.surfaceProfile?.length || !this.fit) return;
    const lap = Math.max(geometry.lapLength, this.lapLengthM, 1);
    const segments = [...geometry.surfaceProfile].sort(
      (a, b) => surfaceBandDrawOrder(a.surface) - surfaceBandDrawOrder(b.surface),
    );
    const mergedRunoffDrawn = new Set<string>();
    const useContinuousBarriers = this.broadcast;

    if (layer === "subgrade") {
      for (const merged of this.buildMergedRunoffBands(segments)) {
        for (const seg of merged.segments) {
          mergedRunoffDrawn.add(`${seg.name}|${seg.startT}|${seg.endT}`);
        }
        const startD = this.distanceMToSvgAlong(
          Math.max(0, merged.startT - RUNOFF_SAMPLE_PAD_T) * lap,
        );
        const endD = this.distanceMToSvgAlong(
          Math.min(1, merged.endT + RUNOFF_SAMPLE_PAD_T) * lap,
        );
        const midFrame = this.sampleTrackFrame(
          svgPoints,
          cumulative,
          (startD + endD) * 0.5,
          0,
        );
        if (!midFrame) continue;
        const sign = this.bandLateralSign(
          merged.segments[0],
          midFrame,
          merged.side,
        );
        const inner: SvgPoint[] = [];
        const outer: SvgPoint[] = [];
        const spanD = Math.max(1, endD - startD);
        const sampleStep = Math.max(1.0, Math.min(2.8, spanD / 90));
        for (let d = startD; d <= endD + 1e-6; d += sampleStep) {
          const distanceM = d * (lap / this.fit!.totalLength);
          const t = distanceM / lap;
          const bandW = this.mergedRunoffWidthAt(merged.segments, t);
          const halfW = this.halfWidthAtDistanceM(distanceM);
          const innerTotalM = this.broadcast
            ? halfW - 0.45
            : halfW + 0.12;
          const outerTotalM = innerTotalM + bandW * SURFACE_BAND_DISPLAY_BOOST;
          let innerSvg = this.metersToLateralSvg(innerTotalM, distanceM);
          let outerSvg = this.metersToLateralSvg(outerTotalM, distanceM);
          if (outerSvg - innerSvg < SURFACE_MIN_BAND_SVG_PX) {
            outerSvg = innerSvg + SURFACE_MIN_BAND_SVG_PX;
          }
          const frame = this.sampleTrackFrame(svgPoints, cumulative, d, 0);
          if (!frame) continue;
          inner.push({
            x: frame.x + sign * frame.nx * innerSvg,
            y: frame.y + sign * frame.ny * innerSvg,
          });
          outer.push({
            x: frame.x + sign * frame.nx * outerSvg,
            y: frame.y + sign * frame.ny * outerSvg,
          });
        }
        if (inner.length < 2 || outer.length < 2) continue;
        const rep = merged.segments[0];
        const band = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        band.setAttribute("points", this.bandOutlinePoints(inner, outer));
        band.setAttribute("fill", this.surfaceFillFor(rep, layer));
        band.setAttribute("stroke", "none");
        band.setAttribute("class", `${this.surfaceBandClasses(rep)} track-surface-merged-runoff`);
        if (this.broadcast) band.setAttribute("filter", "url(#runoff-soften)");
        parent.appendChild(band);
      }
    }

    const sampleBand = (
      seg: TrackSurfaceSegment,
      sign: number,
      layerMode: "subgrade" | "accent",
      displayBoost: number,
    ): { inner: SvgPoint[]; outer: SvgPoint[] } => {
      const inner: SvgPoint[] = [];
      const outer: SvgPoint[] = [];
      const isTurf = seg.variant === "turf";
      const startD = this.distanceMToSvgAlong(seg.startT * lap);
      const endD = this.distanceMToSvgAlong(seg.endT * lap);
      const spanD = Math.max(1, endD - startD);
      const sampleStep = Math.max(1.0, Math.min(2.8, spanD / 80));
      for (let d = startD; d <= endD + 1e-6; d += sampleStep) {
        const distanceM = d * (lap / this.fit!.totalLength);
        const normT = seg.endT > seg.startT
          ? (distanceM / lap - seg.startT) / (seg.endT - seg.startT)
          : 0;
        const bandW = surfaceSegmentWidthAt(seg, Math.min(1, Math.max(0, normT)));
        const halfW = this.halfWidthAtDistanceM(distanceM);
        let innerTotalM: number;
        if (layerMode === "accent" && isTurf) {
          innerTotalM = halfW - 0.05;
        } else if (layerMode === "subgrade" && this.broadcast) {
          innerTotalM = halfW - 0.45 + (seg.innerOffsetM ?? 0);
        } else {
          innerTotalM = halfW + (seg.innerOffsetM ?? 0) + 0.12;
        }
        let outerTotalM = innerTotalM + bandW * displayBoost;
        let innerSvg = this.metersToLateralSvg(innerTotalM, distanceM);
        let outerSvg = this.metersToLateralSvg(outerTotalM, distanceM);
        if (outerSvg - innerSvg < SURFACE_MIN_BAND_SVG_PX) {
          outerSvg = innerSvg + SURFACE_MIN_BAND_SVG_PX;
        }
        const frame = this.sampleTrackFrame(svgPoints, cumulative, d, 0);
        if (!frame) continue;
        inner.push({
          x: frame.x + sign * frame.nx * innerSvg,
          y: frame.y + sign * frame.ny * innerSvg,
        });
        outer.push({
          x: frame.x + sign * frame.nx * outerSvg,
          y: frame.y + sign * frame.ny * outerSvg,
        });
      }
      return { inner, outer };
    };

    for (const seg of segments) {
      const isKerb = seg.surface.startsWith("kerb");
      const isTurf = seg.variant === "turf";
      const isBarrier = seg.surface.startsWith("barrier");
      const isAccent = isKerb || isTurf;
      if (layer === "subgrade" && isAccent) continue;
      if (layer === "accent" && !isAccent) continue;
      if (
        layer === "subgrade" &&
        mergedRunoffDrawn.has(`${seg.name}|${seg.startT}|${seg.endT}`)
      ) {
        continue;
      }
      if (layer === "subgrade" && useContinuousBarriers && isBarrier) {
        continue;
      }

      const startD = this.distanceMToSvgAlong(seg.startT * lap);
      const endD = this.distanceMToSvgAlong(seg.endT * lap);
      const midFrame = this.sampleTrackFrame(
        svgPoints,
        cumulative,
        (startD + endD) * 0.5,
        0,
      );
      if (!midFrame) continue;

      const sides: Array<"outboard" | "inboard"> =
        seg.side === "both"
          ? ["outboard", "inboard"]
          : seg.side === "inboard"
            ? ["inboard"]
            : ["outboard"];

      if (layer === "accent" && isKerb) {
        for (const which of sides) {
          const sign = this.bandLateralSign(seg, midFrame, which);
          const edge: SvgPoint[] = [];
          const spanD = Math.max(1, endD - startD);
          const kerbStep = Math.max(1.4, Math.min(4, spanD / 56));
          for (let d = startD; d <= endD + 1e-6; d += kerbStep) {
            const distanceM = d * (lap / this.fit!.totalLength);
            const halfW = this.halfWidthAtDistanceM(distanceM);
            const lateralSvg = this.metersToLateralSvg(halfW - 0.06, distanceM);
            const frame = this.sampleTrackFrame(svgPoints, cumulative, d, 0);
            if (!frame) continue;
            edge.push({
              x: frame.x + sign * frame.nx * lateralSvg,
              y: frame.y + sign * frame.ny * lateralSvg,
            });
          }
          if (edge.length < 2) continue;
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", this.pointsToPath(edge, false));
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", "url(#track-kerb-pattern)");
          path.setAttribute("stroke-width", String(KERB_ACCENT_STROKE_PX));
          path.setAttribute("stroke-linejoin", "round");
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("class", `${this.surfaceBandClasses(seg)} track-surface-kerb-stroke`);
          parent.appendChild(path);
        }
        continue;
      }

      const displayBoost =
        layer === "accent" && isTurf ? TURF_BAND_DISPLAY_BOOST : SURFACE_BAND_DISPLAY_BOOST;

      const appendBand = (innerPts: SvgPoint[], outerPts: SvgPoint[]) => {
        if (innerPts.length < 2 || outerPts.length < 2) return;
        const pointsAttr = this.bandOutlinePoints(innerPts, outerPts);
        const classes = this.surfaceBandClasses(seg);

        const band = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        band.setAttribute("points", pointsAttr);
        band.setAttribute("fill", this.surfaceFillFor(seg, layer));
        band.setAttribute("stroke", "none");
        band.setAttribute("class", classes);
        if (
          this.broadcast &&
          layer === "subgrade" &&
          (seg.surface === "runoff_concrete" || seg.surface === "runoff_asphalt") &&
          !seg.variant
        ) {
          band.setAttribute("filter", "url(#runoff-soften)");
        }
        parent.appendChild(band);

        if (layer === "subgrade" && seg.surface === "gravel") {
          const grit = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          grit.setAttribute("points", pointsAttr);
          grit.setAttribute(
            "fill",
            this.broadcast ? "url(#broadcast-gravel-grit)" : "url(#track-gravel-pattern)",
          );
          grit.setAttribute("stroke", "none");
          grit.setAttribute("opacity", this.broadcast ? "0.28" : "0.45");
          grit.setAttribute("class", `${classes} track-surface-grit`);
          parent.appendChild(grit);
        }

        const { stroke, width } = this.surfaceStrokeFor(seg);
        if (stroke !== "none" && width !== "0") {
          const rim = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
          rim.setAttribute("points", outerPts.map((p) => `${p.x},${p.y}`).join(" "));
          rim.setAttribute("fill", "none");
          rim.setAttribute("stroke", stroke);
          rim.setAttribute("stroke-width", width);
          rim.setAttribute("stroke-linejoin", "round");
          rim.setAttribute("stroke-linecap", "round");
          rim.setAttribute("class", `${classes} track-surface-rim`);
          parent.appendChild(rim);
        }
      };

      for (const which of sides) {
        const sign = this.bandLateralSign(seg, midFrame, which);
        const { inner, outer } = sampleBand(seg, sign, layer, displayBoost);
        appendBand(inner, outer);
      }
    }

    if (layer === "subgrade" && useContinuousBarriers) {
      for (const side of ["outboard", "inboard"] as const) {
        const loop = this.sampleBarrierEdgeLoop(
          side,
          segments,
          svgPoints,
          cumulative,
          lap,
        );
        this.drawBarrierEdgePath(parent, loop);
      }
    }
  }

  private drawCorridorRibbon(
    svgPoints: SvgPoint[],
    cumulative: number[],
    geometry: TrackGeometryPayload,
  ): void {
    const { left, right } = this.sampleCorridorEdges(svgPoints, cumulative, geometry);
    if (left.length < 2 || right.length < 2) return;

    const ribbon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    const outline = [...left, ...right.slice().reverse()];
    ribbon.setAttribute("points", outline.map((p) => `${p.x},${p.y}`).join(" "));
    ribbon.setAttribute("fill", "url(#track-asphalt-gradient)");
    ribbon.setAttribute("stroke", "rgba(20,28,36,0.55)");
    ribbon.setAttribute("stroke-width", "0.8");
    ribbon.setAttribute("stroke-linejoin", "round");
    ribbon.setAttribute("class", "track-corridor-ribbon");
    ribbon.setAttribute("opacity", "0.96");
    this.trackGroup.appendChild(ribbon);
  }

  private drawCorridorEdges(
    svgPoints: SvgPoint[],
    cumulative: number[],
    geometry: TrackGeometryPayload,
  ): void {
    const { left, right } = this.sampleCorridorEdges(svgPoints, cumulative, geometry);
    if (left.length < 2) return;
    const t = this.theme;

    for (const [edge, className] of [
      [left, "track-corridor-edge-inner"],
      [right, "track-corridor-edge-outer"],
    ] as const) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", this.pointsToPath(edge, false));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", t.asphaltDark);
      path.setAttribute("stroke-width", "1.4");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("class", className);
      path.setAttribute("opacity", "0.55");
      this.trackGroup.appendChild(path);
    }
  }

  private metersToLateralSvg(lateralM: number, distanceM?: number): number {
    const halfWidthM =
      distanceM != null ? this.halfWidthAtDistanceM(distanceM) : this.defaultHalfWidthM;
    if (halfWidthM <= 0) return 0;
    return (lateralM / halfWidthM) * (TRACK_ASPHALT_WIDTH * 0.5);
  }

  private distanceMToSvgAlong(distanceM: number): number {
    if (!this.fit) return 0;
    return distanceM * (this.fit.totalLength / Math.max(this.lapLengthM, 1));
  }

  private halfWidthAtDistanceM(distanceM: number): number {
    const defaultWidthM = this.defaultHalfWidthM * 2;
    const profile = this.widthProfile;
    if (!profile?.length || this.lapLengthM <= 0) return defaultWidthM / 2;

    const lap = this.lapLengthM;
    const normT = ((((distanceM % lap) + lap) % lap) / lap);
    for (const seg of profile) {
      if (normT >= seg.startT && normT <= seg.endT) {
        return seg.widthM / 2;
      }
    }
    return defaultWidthM / 2;
  }

  private hazardMarkerPosition(hz: SurfaceHazardSummaryPayload): SvgPoint | null {
    if (!this.fit || !this.renderedGeometry || hz.centerDistance == null) return null;
    const svgPoints = this.renderedGeometry.polyline.map((pt) =>
      this.worldToSvg(pt.x, pt.z),
    );
    const distAlong = this.distanceMToSvgAlong(hz.centerDistance);
    const lateralSvg = this.metersToLateralSvg(
      hz.centerLateralM ?? 0,
      hz.centerDistance,
    );
    const frame = this.sampleTrackFrame(
      svgPoints,
      this.fit.cumulativeT,
      distAlong,
      lateralSvg,
    );
    return frame ? { x: frame.x, y: frame.y } : null;
  }

  private appendHazardPatch(hz: SurfaceHazardSummaryPayload): void {
    if (!this.fit || !this.renderedGeometry || hz.centerDistance == null) return;

    const svgPoints = this.renderedGeometry.polyline.map((pt) =>
      this.worldToSvg(pt.x, pt.z),
    );
    const distAlong = this.distanceMToSvgAlong(hz.centerDistance);
    const lateralSvg = this.metersToLateralSvg(
      hz.centerLateralM ?? 0,
      hz.centerDistance,
    );
    const frame = this.sampleTrackFrame(
      svgPoints,
      this.fit.cumulativeT,
      distAlong,
      lateralSvg,
    );
    if (!frame) return;

    const alongM = hz.spanMeters ?? 12;
    const acrossM =
      hz.lateralSpanM && hz.lateralSpanM > 0
        ? hz.lateralSpanM
        : this.halfWidthAtDistanceM(hz.centerDistance) * 2;
    const alongSvg = this.distanceMToSvgAlong(alongM);
    const acrossSvg = this.metersToLateralSvg(acrossM / 2, hz.centerDistance) * 2;
    const angle = this.frameAngleDeg(frame);
    const fill = hazardFill(hz.kind);

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "track-hazard-marker");
    group.setAttribute(
      "transform",
      `translate(${frame.x}, ${frame.y}) rotate(${angle})`,
    );

    const useEllipse = alongSvg >= acrossSvg * 0.65;
    const shape = useEllipse
      ? document.createElementNS(SVG_NS, "ellipse")
      : document.createElementNS(SVG_NS, "rect");
    if (useEllipse) {
      shape.setAttribute("cx", "0");
      shape.setAttribute("cy", "0");
      shape.setAttribute("rx", String(alongSvg / 2));
      shape.setAttribute("ry", String(acrossSvg / 2));
    } else {
      shape.setAttribute("x", String(-acrossSvg / 2));
      shape.setAttribute("y", String(-alongSvg / 2));
      shape.setAttribute("width", String(acrossSvg));
      shape.setAttribute("height", String(alongSvg));
      shape.setAttribute("rx", "2");
    }
    shape.setAttribute("fill", fill);
    shape.setAttribute("opacity", "0.85");

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `${hz.kind} — grip ×${hz.gripMultiplier.toFixed(2)}`;
    group.appendChild(shape);
    group.appendChild(title);
    this.hazardsGroup.appendChild(group);
  }

  private worldToSvg(x: number, z: number): { x: number; y: number } {
    const f = this.fit!;
    return {
      x: f.offsetX + (x - f.minX) * f.scale,
      y: f.offsetY + (z - f.minZ) * f.scale,
    };
  }

  private carElements = new Map<string, CarMarker>();

  private createGroup(className: string): SVGGElement {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", className);
    return g;
  }
}
