import type { TrackGeometryPayload } from "../ws/protocol";

export interface SvgPoint {
  x: number;
  y: number;
}

export interface TrackLayout {
  svgPoints: SvgPoint[];
  viewBoxX: number;
  viewBoxY: number;
  viewWidth: number;
  viewHeight: number;
  centroid: SvgPoint;
  pathD: string;
}

export function pointsToPath(points: SvgPoint[], closed: boolean): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x},${points[i].y}`;
  }
  if (closed) d += " Z";
  return d;
}

/** Same fit + viewBox math as SvgTrack.setGeometry (without DOM). */
export function computeTrackLayout(geometry: TrackGeometryPayload): TrackLayout | null {
  if (geometry.polyline.length === 0) return null;

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
  const viewBoxX = viewMinX - viewPad;
  const viewBoxY = viewMinY - viewPad;

  const centroid = {
    x: svgPoints.reduce((sum, p) => sum + p.x, 0) / svgPoints.length,
    y: svgPoints.reduce((sum, p) => sum + p.y, 0) / svgPoints.length,
  };

  return {
    svgPoints,
    viewBoxX,
    viewBoxY,
    viewWidth,
    viewHeight,
    centroid,
    pathD: pointsToPath(svgPoints, geometry.closed),
  };
}
