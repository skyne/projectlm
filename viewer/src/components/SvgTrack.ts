import type { CarSnapshot, TrackGeometryPayload, TrackSectorGeometry } from "../ws/protocol";
import { formatCarNumber } from "../entryNumbers";

const CLASS_COLORS: Record<string, string> = {
  Hypercar: "#e10600",
  LMGT3: "#005aff",
  LMP2: "#00a651",
  solo: "#95a5a6",
};

const SECTOR_COLORS = ["#3d5a80", "#4a6741", "#6b4c7a", "#8b6914", "#4a6670"];

function classColor(classId: string): string {
  return CLASS_COLORS[classId] ?? "#bdc3c7";
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
  label: SVGTextElement;
  title: SVGTitleElement;
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
  cumulativeT: number[];
  totalLength: number;
}

export interface SvgTrackOptions {
  /** Enable scroll-to-zoom and drag-to-pan on the map. */
  zoomable?: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_WHEEL_FACTOR = 1.12;

export class SvgTrack {
  readonly root: SVGSVGElement;
  private defs: SVGDefsElement;
  private bgGroup: SVGGElement;
  private sectorsGroup: SVGGElement;
  private trackGroup: SVGGElement;
  private labelsGroup: SVGGElement;
  private carsGroup: SVGGElement;
  private pitGroup: SVGGElement;
  private hitLayer: SVGRectElement | null = null;
  private fit: FitTransform | null = null;
  private playerEntryId = "entry-1";
  private zoomable: boolean;
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

  constructor(container: HTMLElement, options: SvgTrackOptions = {}) {
    this.zoomable = options.zoomable ?? false;
    this.root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.root.setAttribute("class", "track-svg");
    this.root.setAttribute("preserveAspectRatio", "xMidYMid meet");

    this.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    this.bgGroup = this.createGroup("bg-layer");
    this.sectorsGroup = this.createGroup("sectors-layer");
    this.trackGroup = this.createGroup("track-layer");
    this.labelsGroup = this.createGroup("labels-layer");
    this.carsGroup = this.createGroup("cars-layer");
    this.pitGroup = this.createGroup("pit-layer");

    this.root.append(
      this.defs,
      this.bgGroup,
      this.sectorsGroup,
      this.trackGroup,
      this.pitGroup,
      this.labelsGroup,
      this.carsGroup,
    );
    container.appendChild(this.root);
    if (this.zoomable) this.installZoomPan();
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
      if (!this.fit || e.button !== 0 || this.zoom <= 1) return;
      e.preventDefault();
      this.dragging = true;
      this.lastDragClient = { x: e.clientX, y: e.clientY };
      this.root.setPointerCapture(e.pointerId);
      this.root.classList.add("track-svg-dragging");
    };

    this.boundPointerMove = (e: PointerEvent) => {
      if (!this.dragging || !this.lastDragClient || !this.fit || this.zoom <= 1) return;
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

  private clampPan(): void {
    if (!this.fit) return;
    if (this.zoom <= 1) {
      this.panX = this.fit.viewMinX;
      this.panY = this.fit.viewMinY;
      return;
    }
    const { viewWidth, viewHeight } = this.currentViewSize();
    const maxX = this.fit.viewMinX + this.fit.viewWidth - viewWidth;
    const maxY = this.fit.viewMinY + this.fit.viewHeight - viewHeight;
    this.panX = Math.max(this.fit.viewMinX, Math.min(maxX, this.panX));
    this.panY = Math.max(this.fit.viewMinY, Math.min(maxY, this.panY));
  }

  private applyViewBox(): void {
    if (!this.fit) return;
    const { viewWidth, viewHeight } = this.currentViewSize();
    this.root.setAttribute("viewBox", `${this.panX} ${this.panY} ${viewWidth} ${viewHeight}`);
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  clearCars(): void {
    this.carsGroup.replaceChildren();
    this.carElements.clear();
  }

  setGeometry(geometry: TrackGeometryPayload): void {
    this.defs.replaceChildren();
    this.bgGroup.replaceChildren();
    this.sectorsGroup.replaceChildren();
    this.pitGroup.replaceChildren();
    this.trackGroup.replaceChildren();
    this.labelsGroup.replaceChildren();
    this.clearCars();
    this.fit = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    if (geometry.polyline.length === 0) return;

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

    const viewPad = 30;
    const viewWidth = viewMaxX - viewMinX + viewPad * 2;
    const viewHeight = viewMaxY - viewMinY + viewPad * 2;
    const viewBoxX = viewMinX - viewPad;
    const viewBoxY = viewMinY - viewPad;

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
      cumulativeT,
      totalLength,
    };

    this.root.setAttribute(
      "viewBox",
      `${viewBoxX} ${viewBoxY} ${viewWidth} ${viewHeight}`,
    );
    this.panX = viewBoxX;
    this.panY = viewBoxY;
    this.zoom = 1;

    this.installDefs(viewBoxX, viewBoxY, viewWidth, viewHeight);

    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("x", String(viewBoxX));
    bgRect.setAttribute("y", String(viewBoxY));
    bgRect.setAttribute("width", String(viewWidth));
    bgRect.setAttribute("height", String(viewHeight));
    bgRect.setAttribute("fill", "url(#track-bg-gradient)");
    bgRect.setAttribute("class", "track-bg");
    this.bgGroup.appendChild(bgRect);

    this.drawSectorBands(svgPoints, geometry.sectors, cumulativeT, totalLength);

    const pathD = this.pointsToPath(svgPoints, true);
    const kerb = document.createElementNS("http://www.w3.org/2000/svg", "path");
    kerb.setAttribute("d", pathD);
    kerb.setAttribute("fill", "none");
    kerb.setAttribute("stroke", "#1e2433");
    kerb.setAttribute("stroke-width", "14");
    kerb.setAttribute("stroke-linejoin", "round");
    kerb.setAttribute("stroke-linecap", "round");
    this.trackGroup.appendChild(kerb);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#9aa8c4");
    path.setAttribute("stroke-width", "5");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("class", "track-outline");
    this.trackGroup.appendChild(path);

    this.drawPitLane(svgPoints, cumulativeT, totalLength);

    const startLine = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const sfCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    sfCircle.setAttribute("cx", String(svgPoints[0].x));
    sfCircle.setAttribute("cy", String(svgPoints[0].y));
    sfCircle.setAttribute("r", "6");
    sfCircle.setAttribute("fill", "#6ee7a0");
    sfCircle.setAttribute("stroke", "#0f1117");
    sfCircle.setAttribute("stroke-width", "1.5");
    startLine.appendChild(sfCircle);

    const sfLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    if (svgPoints.length > 1) {
      const dx = svgPoints[1].x - svgPoints[0].x;
      const dy = svgPoints[1].y - svgPoints[0].y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const half = 10;
      sfLine.setAttribute("x1", String(svgPoints[0].x - nx * half));
      sfLine.setAttribute("y1", String(svgPoints[0].y - ny * half));
      sfLine.setAttribute("x2", String(svgPoints[0].x + nx * half));
      sfLine.setAttribute("y2", String(svgPoints[0].y + ny * half));
      sfLine.setAttribute("stroke", "#fff");
      sfLine.setAttribute("stroke-width", "3");
      sfLine.setAttribute("stroke-linecap", "round");
      sfLine.setAttribute("class", "start-finish-line");
      startLine.appendChild(sfLine);
    }
    this.trackGroup.appendChild(startLine);

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
      label.setAttribute("class", "sector-label");
      label.textContent = sector.name;
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
  }

  updateCars(snapshots: CarSnapshot[]): void {
    if (!this.fit) return;

    const seen = new Set<string>();

    for (const snap of snapshots) {
      seen.add(snap.entryId);
      const base = this.worldToSvg(snap.position.x, snap.position.z);
      const tangent = snap.tangent ?? { x: 1, y: 0, z: 0 };
      const perpX = -tangent.z;
      const perpZ = tangent.x;
      const lateral = (snap.lateralOffset ?? 0) * 8;
      const p = {
        x: base.x + perpX * lateral,
        y: base.y + perpZ * lateral,
      };
      const angle = (Math.atan2(tangent.z, tangent.x) * 180) / Math.PI;
      const numberLabel = formatCarNumber(snap) || "?";
      const lengthPx = Math.max(12, (snap.carLengthM ?? 5) * 1.8);
      const widthPx = Math.max(7, (snap.carWidthM ?? 2) * 1.8);
      const isPlayer = snap.entryId === this.playerEntryId;
      const color = classColor(snap.classId);

      let marker = this.carElements.get(snap.entryId);
      if (!marker) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "car-marker");

        const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        glow.setAttribute("class", "car-glow");
        glow.setAttribute("r", "14");
        glow.setAttribute("fill", "none");

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

        group.append(glow, body, cockpit, wheelFL, wheelFR, wheelRL, wheelRR, label, title);
        this.carsGroup.appendChild(group);

        marker = { group, body, cockpit, wheelFL, wheelFR, wheelRL, wheelRR, glow, label, title };
        this.carElements.set(snap.entryId, marker);
      }

      marker.group.setAttribute(
        "transform",
        `translate(${p.x}, ${p.y}) rotate(${angle})`,
      );
      marker.group.classList.toggle("player-car", isPlayer);

      const bodyPath = this.carBodyPath(lengthPx, widthPx);
      marker.body.setAttribute("d", bodyPath);
      marker.body.setAttribute("fill", color);
      marker.body.setAttribute(
        "opacity",
        snap.inPit ? "0.45" : snap.pitQueued ? "0.65" : "0.92",
      );
      marker.body.setAttribute(
        "stroke",
        snap.overtaking ? "#f1c40f" : snap.blocked ? "#e67e22" : "#0f1117",
      );
      marker.body.setAttribute("stroke-width", isPlayer ? "1.5" : "1");

      marker.cockpit.setAttribute("d", this.cockpitPath(lengthPx, widthPx));
      marker.cockpit.setAttribute("fill", "#1a1f2b");
      marker.cockpit.setAttribute("opacity", "0.85");

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

      marker.glow.setAttribute("stroke", color);
      marker.glow.setAttribute("stroke-width", isPlayer ? "3" : "0");
      marker.glow.setAttribute("opacity", isPlayer ? "0.7" : "0");
      if (isPlayer) {
        marker.glow.setAttribute("filter", "url(#player-glow)");
      } else {
        marker.glow.removeAttribute("filter");
      }

      if (marker.label.textContent !== numberLabel) {
        marker.label.textContent = numberLabel;
      }
      marker.title.textContent = `#${numberLabel} ${snap.teamName}${snap.inPit ? " (PIT)" : ""}${snap.overtaking ? " overtaking" : ""}`;
      marker.group.style.opacity = snap.retired ? "0.35" : "1";
    }

    for (const [id, el] of this.carElements) {
      if (!seen.has(id)) {
        el.group.remove();
        this.carElements.delete(id);
      }
    }
  }

  private installDefs(x: number, y: number, w: number, h: number): void {
    const bgGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    bgGrad.setAttribute("id", "track-bg-gradient");
    bgGrad.setAttribute("x1", "0%");
    bgGrad.setAttribute("y1", "0%");
    bgGrad.setAttribute("x2", "100%");
    bgGrad.setAttribute("y2", "100%");
    for (const [offset, color] of [
      ["0%", "#141824"],
      ["45%", "#1a2235"],
      ["100%", "#0e1219"],
    ] as const) {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      bgGrad.appendChild(stop);
    }
    this.defs.appendChild(bgGrad);

    const glowFilter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    glowFilter.setAttribute("id", "player-glow");
    glowFilter.setAttribute("x", "-50%");
    glowFilter.setAttribute("y", "-50%");
    glowFilter.setAttribute("width", "200%");
    glowFilter.setAttribute("height", "200%");

    const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blur.setAttribute("stdDeviation", "3");
    blur.setAttribute("result", "blur");
    glowFilter.appendChild(blur);

    const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    for (const node of ["blur", "SourceGraphic"]) {
      const mergeNode = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
      if (node !== "SourceGraphic") mergeNode.setAttribute("in", node);
      merge.appendChild(mergeNode);
    }
    glowFilter.appendChild(merge);
    this.defs.appendChild(glowFilter);

    void x;
    void y;
    void w;
    void h;
  }

  private drawPitLane(
    svgPoints: SvgPoint[],
    cumulativeT: number[],
    totalLength: number,
  ): void {
    const pitLen = totalLength * 0.06;
    const pitPoints = this.slicePolylineByLength(svgPoints, cumulativeT, 0, pitLen);
    if (pitPoints.length < 2) return;

    const offset = 18;
    const offsetPoints: SvgPoint[] = [];
    for (let i = 0; i < pitPoints.length; i++) {
      const prev = pitPoints[Math.max(0, i - 1)];
      const next = pitPoints[Math.min(pitPoints.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      offsetPoints.push({
        x: pitPoints[i].x + nx * offset,
        y: pitPoints[i].y + ny * offset,
      });
    }

    const pitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pitPath.setAttribute("d", this.pointsToPath(offsetPoints, false));
    pitPath.setAttribute("fill", "none");
    pitPath.setAttribute("stroke", "#f39c12");
    pitPath.setAttribute("stroke-width", "4");
    pitPath.setAttribute("stroke-dasharray", "6 4");
    pitPath.setAttribute("stroke-linecap", "round");
    pitPath.setAttribute("opacity", "0.65");
    pitPath.setAttribute("class", "pit-lane");
    this.pitGroup.appendChild(pitPath);

    const mid = offsetPoints[Math.floor(offsetPoints.length / 2)];
    const pitLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    pitLabel.setAttribute("x", String(mid.x));
    pitLabel.setAttribute("y", String(mid.y - 10));
    pitLabel.setAttribute("class", "pit-label");
    pitLabel.textContent = "PIT";
    this.pitGroup.appendChild(pitLabel);

    const pitBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const boxW = 14;
    const boxH = 8;
    pitBox.setAttribute("x", String(mid.x - boxW / 2));
    pitBox.setAttribute("y", String(mid.y + 2));
    pitBox.setAttribute("width", String(boxW));
    pitBox.setAttribute("height", String(boxH));
    pitBox.setAttribute("fill", "rgba(243,156,18,0.25)");
    pitBox.setAttribute("stroke", "#f39c12");
    pitBox.setAttribute("stroke-width", "1");
    pitBox.setAttribute("rx", "2");
    pitBox.setAttribute("class", "pit-box");
    this.pitGroup.appendChild(pitBox);
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

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", this.pointsToPath(segmentPoints, false));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", SECTOR_COLORS[idx % SECTOR_COLORS.length]);
      path.setAttribute("stroke-width", "14");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("opacity", "0.45");
      path.setAttribute("class", "sector-band");
      this.sectorsGroup.appendChild(path);
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
