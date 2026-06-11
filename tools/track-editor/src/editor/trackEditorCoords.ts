import type { TrackGeometryPayload } from "@viewer/ws/protocol";

export interface WorldSvgTransform {
  minX: number;
  minZ: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Same fit math as viewer trackLayout / SvgTrack.setGeometry. */
export function computeWorldSvgTransform(
  geometry: TrackGeometryPayload,
): WorldSvgTransform | null {
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

  return { minX, minZ, scale, offsetX, offsetY };
}

export function worldToSvg(
  transform: WorldSvgTransform,
  x: number,
  z: number,
): { x: number; y: number } {
  return {
    x: transform.offsetX + (x - transform.minX) * transform.scale,
    y: transform.offsetY + (z - transform.minZ) * transform.scale,
  };
}

export function svgToWorld(
  transform: WorldSvgTransform,
  sx: number,
  sy: number,
): { x: number; z: number } {
  return {
    x: transform.minX + (sx - transform.offsetX) / transform.scale,
    z: transform.minZ + (sy - transform.offsetY) / transform.scale,
  };
}

export function computeOverlayViewBox(
  geometry: TrackGeometryPayload,
  transform: WorldSvgTransform,
): string {
  const svgPoints = geometry.polyline.map((pt) =>
    worldToSvg(transform, pt.x, pt.z),
  );
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
  return `${viewBoxX} ${viewBoxY} ${viewWidth} ${viewHeight}`;
}
