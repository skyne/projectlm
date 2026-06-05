import type { CarSnapshot, TrackGeometryPayload } from "../ws/protocol";
import { formatCarNumber } from "../entryNumbers";

const CLASS_COLORS: Record<string, string> = {
  Hypercar: "#e74c3c",
  LMGT3: "#3498db",
  LMP2: "#2ecc71",
  solo: "#95a5a6",
};

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
  circle: SVGCircleElement;
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
}

export class SvgTrack {
  readonly root: SVGSVGElement;
  private trackGroup: SVGGElement;
  private carsGroup: SVGGElement;
  private labelsGroup: SVGGElement;
  private fit: FitTransform | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.root.setAttribute("class", "track-svg");
    this.root.setAttribute("preserveAspectRatio", "xMidYMid meet");

    this.trackGroup = this.createGroup("track-layer");
    this.labelsGroup = this.createGroup("labels-layer");
    this.carsGroup = this.createGroup("cars-layer");

    this.root.append(this.trackGroup, this.labelsGroup, this.carsGroup);
    container.appendChild(this.root);
  }

  clearCars(): void {
    this.carsGroup.replaceChildren();
    this.carElements.clear();
  }

  setGeometry(geometry: TrackGeometryPayload): void {
    this.trackGroup.replaceChildren();
    this.labelsGroup.replaceChildren();
    this.clearCars();
    this.fit = null;

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

    this.fit = {
      minX,
      minZ,
      scale,
      offsetX,
      offsetY,
      viewMinX: viewMinX - viewPad,
      viewMinY: viewMinY - viewPad,
      viewWidth,
      viewHeight,
    };

    this.root.setAttribute(
      "viewBox",
      `${this.fit.viewMinX} ${this.fit.viewMinY} ${viewWidth} ${viewHeight}`,
    );

    const pathD =
      svgPoints.length === 0
        ? ""
        : `M ${svgPoints[0].x},${svgPoints[0].y} ` +
          svgPoints
            .slice(1)
            .map((p) => `L ${p.x},${p.y}`)
            .join(" ") +
          " Z";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#7d8cad");
    path.setAttribute("stroke-width", "4");
    path.setAttribute("stroke-linejoin", "miter");
    path.setAttribute("stroke-linecap", "butt");
    this.trackGroup.appendChild(path);

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

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = geometry.name;
    this.root.insertBefore(title, this.root.firstChild);
  }

  updateCars(snapshots: CarSnapshot[]): void {
    if (!this.fit) return;

    const seen = new Set<string>();

    for (const snap of snapshots) {
      seen.add(snap.entryId);
      const p = this.worldToSvg(snap.position.x, snap.position.z);
      const numberLabel = formatCarNumber(snap) || "?";

      let marker = this.carElements.get(snap.entryId);
      if (!marker) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "car-marker");

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", "9");
        circle.setAttribute("stroke", "#0f1117");
        circle.setAttribute("stroke-width", "1.5");

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("class", "car-number");
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "central");
        label.setAttribute("pointer-events", "none");

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");

        group.append(circle, label, title);
        this.carsGroup.appendChild(group);

        marker = { group, circle, label, title };
        this.carElements.set(snap.entryId, marker);
      }

      marker.group.setAttribute("transform", `translate(${p.x}, ${p.y})`);
      marker.circle.setAttribute("fill", classColor(snap.classId));
      if (marker.label.textContent !== numberLabel) {
        marker.label.textContent = numberLabel;
      }
      marker.title.textContent = `#${numberLabel} ${snap.teamName}`;
      marker.group.style.opacity = snap.retired ? "0.35" : "1";
    }

    for (const [id, el] of this.carElements) {
      if (!seen.has(id)) {
        el.group.remove();
        this.carElements.delete(id);
      }
    }
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
