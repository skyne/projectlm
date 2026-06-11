import { canonicalPolyline, type TrackJson, type TrackReferenceOverlayJson } from "@server/game/track_json";
import type { SvgTrack } from "@viewer/components/SvgTrack";

export function overlayHeightM(overlay: TrackReferenceOverlayJson): number {
  return overlay.width_m / Math.max(overlay.aspect, 1e-6);
}

export function defaultReferenceOverlayPlacement(
  track: TrackJson,
  aspect: number,
): Omit<TrackReferenceOverlayJson, "href"> {
  const poly = canonicalPolyline(track);
  let center_x = 0;
  let center_z = 0;
  let width_m = 800;
  if (poly.length >= 2) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    center_x = (minX + maxX) / 2;
    center_z = (minZ + maxZ) / 2;
    width_m = Math.max(maxX - minX, maxZ - minZ) * 0.55;
  } else if (track.lap_length != null && track.lap_length > 0) {
    width_m = track.lap_length * 0.35;
  }
  return {
    center_x,
    center_z,
    width_m: Math.max(50, width_m),
    aspect,
    opacity: 0.55,
    frozen: false,
  };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function loadImageAspect(href: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const h = img.naturalHeight || 1;
      resolve((img.naturalWidth || 1) / h);
    };
    img.onerror = () => reject(new Error("could not load image"));
    img.src = href;
  });
}

export function moveReferenceOverlay(
  overlay: TrackReferenceOverlayJson,
  center_x: number,
  center_z: number,
): TrackReferenceOverlayJson {
  return { ...overlay, center_x, center_z };
}

export function scaleReferenceOverlay(
  overlay: TrackReferenceOverlayJson,
  width_m: number,
): TrackReferenceOverlayJson {
  return { ...overlay, width_m: Math.max(10, width_m) };
}

export function referenceOverlayWorldBounds(
  overlay: TrackReferenceOverlayJson,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const halfW = overlay.width_m / 2;
  const halfH = overlayHeightM(overlay) / 2;
  return {
    minX: overlay.center_x - halfW,
    maxX: overlay.center_x + halfW,
    minZ: overlay.center_z - halfH,
    maxZ: overlay.center_z + halfH,
  };
}

function overlayBoundsSvg(
  overlay: TrackReferenceOverlayJson,
  svgTrack: SvgTrack,
): { x: number; y: number; widthSvg: number; heightSvg: number } | null {
  const scale = svgTrack.getWorldScale();
  const center = svgTrack.worldToSvgCoords(overlay.center_x, overlay.center_z);
  if (scale == null || scale <= 0 || !center) return null;
  const widthSvg = overlay.width_m * scale;
  const heightSvg = widthSvg / Math.max(overlay.aspect, 1e-6);
  return {
    x: center.x - widthSvg / 2,
    y: center.y - heightSvg / 2,
    widthSvg,
    heightSvg,
  };
}

function buildReferenceImageElement(
  overlay: TrackReferenceOverlayJson,
  x: number,
  y: number,
  width: number,
  height: number,
  interactive: boolean,
): SVGImageElement {
  const opacity = overlay.opacity ?? 0.55;
  const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
  img.setAttribute("href", overlay.href);
  img.setAttributeNS("http://www.w3.org/1999/xlink", "href", overlay.href);
  img.setAttribute("x", String(x));
  img.setAttribute("y", String(y));
  img.setAttribute("width", String(width));
  img.setAttribute("height", String(height));
  img.setAttribute("opacity", String(opacity));
  img.setAttribute("preserveAspectRatio", "none");
  img.classList.add("te-ref-image");
  if (interactive) {
    img.classList.add("te-ref-interactive");
    img.setAttribute("pointer-events", "all");
  } else {
    img.setAttribute("pointer-events", "none");
  }
  return img;
}

function buildReferenceOverlayGraphic(
  overlay: TrackReferenceOverlayJson,
  svgTrack: SvgTrack,
  interactive: boolean,
): SVGGElement | null {
  const bounds = overlayBoundsSvg(overlay, svgTrack);
  if (!bounds) return null;
  const { x, y, widthSvg, heightSvg } = bounds;

  const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
  root.setAttribute("class", "te-ref-overlay");

  root.appendChild(
    buildReferenceImageElement(overlay, x, y, widthSvg, heightSvg, interactive),
  );

  if (interactive) {
    const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    frame.setAttribute("x", String(x));
    frame.setAttribute("y", String(y));
    frame.setAttribute("width", String(widthSvg));
    frame.setAttribute("height", String(heightSvg));
    frame.setAttribute("fill", "none");
    frame.setAttribute("stroke", "rgba(111, 168, 255, 0.85)");
    frame.setAttribute("stroke-width", "1.5");
    frame.setAttribute("stroke-dasharray", "6 4");
    frame.setAttribute("pointer-events", "none");
    root.appendChild(frame);

    const handle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    handle.setAttribute("x", String(x + widthSvg - 7));
    handle.setAttribute("y", String(y + heightSvg - 7));
    handle.setAttribute("width", "14");
    handle.setAttribute("height", "14");
    handle.setAttribute("rx", "2");
    handle.setAttribute("fill", "rgba(111, 168, 255, 0.9)");
    handle.setAttribute("stroke", "#fff");
    handle.setAttribute("stroke-width", "1");
    handle.setAttribute("pointer-events", "all");
    handle.classList.add("te-ref-scale-handle", "te-ref-interactive");
    root.appendChild(handle);
  }

  return root;
}

/** Frozen image in world metres under track; unfrozen interactive copy in editor overlay. */
function buildFrozenReferenceOverlayGraphic(
  overlay: TrackReferenceOverlayJson,
  svgTrack: SvgTrack,
): SVGGElement | null {
  const wt = svgTrack.getWorldTransform();
  if (!wt) return null;

  const heightM = overlayHeightM(overlay);
  const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
  root.setAttribute("class", "te-ref-overlay te-ref-overlay--frozen");
  root.setAttribute(
    "transform",
    `translate(${wt.offsetX},${wt.offsetY}) scale(${wt.scale}) translate(${-wt.minX},${-wt.minZ})`,
  );

  root.appendChild(
    buildReferenceImageElement(
      overlay,
      overlay.center_x - overlay.width_m / 2,
      overlay.center_z - heightM / 2,
      overlay.width_m,
      heightM,
      false,
    ),
  );
  return root;
}

/** Frozen image under track; unfrozen interactive copy in editor overlay (above track). */
export function renderReferenceOverlay(
  mapGroup: SVGGElement,
  editGroup: SVGGElement,
  overlay: TrackReferenceOverlayJson | undefined,
  svgTrack: SvgTrack,
): void {
  mapGroup.replaceChildren();
  editGroup.replaceChildren();
  if (!overlay?.href) {
    mapGroup.setAttribute("pointer-events", "none");
    editGroup.setAttribute("pointer-events", "none");
    return;
  }

  const frozen = overlay.frozen ?? false;

  if (frozen) {
    const graphic = buildFrozenReferenceOverlayGraphic(overlay, svgTrack);
    if (!graphic) return;
    mapGroup.appendChild(graphic);
    mapGroup.setAttribute("pointer-events", "none");
    editGroup.setAttribute("pointer-events", "none");
  } else {
    const graphic = buildReferenceOverlayGraphic(overlay, svgTrack, true);
    if (!graphic) return;
    editGroup.appendChild(graphic);
    editGroup.setAttribute("pointer-events", "all");
    mapGroup.setAttribute("pointer-events", "none");
  }
}
