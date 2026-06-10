import { CarCompositor, loadCarGraphics } from "./CarCompositor";
import type { CarBuildVisual } from "./visualCatalog";
import type { LiveryPattern } from "../utils/teamLivery";

export interface LiveryRenderOptions {
  primary: string;
  secondary: string;
  pattern: LiveryPattern;
  logoDataUrl?: string | null;
  classId?: string;
  visualBuild?: CarBuildVisual;
  /** Stable hypercar chassis when no visualBuild is supplied. */
  teamName?: string;
  /** Photo backdrop; set `null` for flat gradient only. */
  backgroundImage?: string | null;
  width?: number;
  height?: number;
}

const DEFAULT_LIVERY_BACKGROUND = "/assets/track_bg/tracks/lemans_la_sarthe.png";
const LMGT3_BODY_MASK = "/assets/livery/lmgt3-body.svg";

/** Hypercar chassis art in `configs/visual_catalog.json` — picked from team name when no build is passed. */
export const HYPERCAR_CHASSIS_IDS = [
  "LMDhDallara",
  "LMDhOreca",
  "LMDhMultimatic",
  "LMDhLigier",
  "LMHMonocoque",
  "LMHInHouse",
  "LMHDallaraBuilt",
  "LMHMultimaticBuilt",
] as const;

export type HypercarChassisId = (typeof HYPERCAR_CHASSIS_IDS)[number];

function hashSeed(seed: string): number {
  let hash = 0;
  for (const ch of seed.trim()) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return hash;
}

export function pickHypercarChassis(seed = ""): HypercarChassisId {
  if (!seed.trim()) return "LMDhDallara";
  const idx = Math.abs(hashSeed(seed)) % HYPERCAR_CHASSIS_IDS.length;
  return HYPERCAR_CHASSIS_IDS[idx] ?? "LMDhDallara";
}

/** Default compositor build for livery previews when callers omit visualBuild. */
export function defaultLiveryVisual(classId?: string, teamName?: string): CarBuildVisual {
  switch (classId) {
    case "LMGT3":
      return {
        chassis_type: "GT3Spaceframe",
        front_aero_type: "LowDragNose",
        rear_aero_type: "HighDownforceWing",
        wheel_package: "GT3Forged18",
        hybrid_system: "None",
      };
    case "LMP2":
      return {
        chassis_type: "Oreca07",
        front_aero_type: "LowDragNose",
        rear_aero_type: "StandardWing",
        wheel_package: "LMP2Forged18",
        hybrid_system: "None",
      };
    default:
      return {
        chassis_type: pickHypercarChassis(teamName ?? ""),
        front_aero_type: "LowDragNose",
        rear_aero_type: "StandardWing",
        wheel_package: "Hypercar18WideRear",
        hybrid_system: "LMDh50kW",
      };
  }
}

function resolveVisualBuild(options: LiveryRenderOptions): CarBuildVisual {
  return options.visualBuild ?? defaultLiveryVisual(options.classId, options.teamName);
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let graphicsCache: ReturnType<typeof loadCarGraphics> | null = null;

function carGraphics(): ReturnType<typeof loadCarGraphics> {
  if (!graphicsCache) graphicsCache = loadCarGraphics();
  return graphicsCache;
}

export function classIdFromChassis(chassisType?: string): string {
  if (!chassisType) return "Hypercar";
  if (chassisType.startsWith("GT3") || chassisType.includes("GT3")) return "LMGT3";
  if (chassisType === "Oreca07" || chassisType.includes("Oreca")) return "LMP2";
  return "Hypercar";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(src);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
    imageCache.set(src, pending);
  }
  return pending;
}

interface ImageRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

function patternBounds(
  rect: ImageRect | null,
  canvasW: number,
  canvasH: number,
): ImageRect {
  return rect ?? { dx: 0, dy: 0, dw: canvasW, dh: canvasH };
}

/** Stripe motifs in car-local coordinates (side profile: nose left, tail right). */
function applyStripePattern(
  ctx: CanvasRenderingContext2D,
  pattern: LiveryPattern,
  primary: string,
  secondary: string,
  bounds: ImageRect,
): void {
  const { dx, dy, dw, dh } = bounds;
  const x = (f: number) => dx + dw * f;
  const y = (f: number) => dy + dh * f;
  const w = (f: number) => dw * f;
  const h = (f: number) => dh * f;

  switch (pattern) {
    case "solid": {
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x(0), y(0.78), w(1), h(0.22));
      ctx.globalAlpha = 1;
      break;
    }
    case "dual_stripe": {
      ctx.fillStyle = secondary;
      ctx.fillRect(x(0.36), y(0), w(0.065), h(1));
      ctx.fillRect(x(0.575), y(0), w(0.065), h(1));
      break;
    }
    case "center_stripe": {
      ctx.fillStyle = secondary;
      ctx.fillRect(x(0.44), y(0), w(0.12), h(1));
      break;
    }
    case "side_bands": {
      ctx.fillStyle = secondary;
      ctx.fillRect(x(0), y(0.58), w(1), h(0.42));
      break;
    }
    case "chevron": {
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(x(0), y(0));
      ctx.lineTo(x(0.34), y(0));
      ctx.lineTo(x(0.16), y(1));
      ctx.lineTo(x(0), y(1));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "gradient_bow": {
      const grad = ctx.createLinearGradient(x(0), 0, x(1), 0);
      grad.addColorStop(0, secondary);
      grad.addColorStop(0.5, primary);
      grad.addColorStop(1, secondary);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.88;
      ctx.fillRect(x(0), y(0), w(1), h(1));
      ctx.globalAlpha = 1;
      break;
    }
    case "hood_accent": {
      ctx.fillStyle = secondary;
      ctx.fillRect(x(0), y(0), w(0.22), h(1));
      ctx.fillRect(x(0.7), y(0), w(0.3), h(0.48));
      break;
    }
    case "split_diagonal": {
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(x(0.52), y(0));
      ctx.lineTo(x(1), y(0));
      ctx.lineTo(x(1), y(1));
      ctx.lineTo(x(0.14), y(1));
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

async function loadLogo(src: string): Promise<HTMLImageElement | null> {
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

function fitImageRect(
  img: HTMLImageElement,
  width: number,
  height: number,
): ImageRect {
  return fitImageRectFromSize(img.naturalWidth, img.naturalHeight, width, height);
}

function fitImageRectFromSize(
  naturalWidth: number,
  naturalHeight: number,
  width: number,
  height: number,
): ImageRect {
  const padX = width * 0.05;
  const padY = height * 0.08;
  const maxW = width - padX * 2;
  const maxH = height - padY * 2;
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight);
  const dw = naturalWidth * scale;
  const dh = naturalHeight * scale;
  return snapImageRect({
    dx: (width - dw) / 2,
    dy: (height - dh) / 2 + height * 0.02,
    dw,
    dh,
  });
}

function snapImageRect(rect: ImageRect): ImageRect {
  return {
    dx: Math.round(rect.dx),
    dy: Math.round(rect.dy),
    dw: Math.round(rect.dw),
    dh: Math.round(rect.dh),
  };
}

function matchesBackdrop(
  r: number,
  g: number,
  b: number,
  samples: Array<[number, number, number]>,
  tolerance: number,
): boolean {
  return samples.some(
    ([cr, cg, cb]) =>
      Math.abs(r - cr) <= tolerance &&
      Math.abs(g - cg) <= tolerance &&
      Math.abs(b - cb) <= tolerance,
  );
}

function buildMaskAlphaFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const pixelCount = width * height;
  const idx = (x: number, y: number) => (y * width + x) * 4;

  let transparent = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[idx(x, y) + 3] < 30) transparent++;
    }
  }
  const transparentRatio = transparent / pixelCount;

  const maskAlpha = new Uint8Array(pixelCount);
  const setAlphaMask = (predicate: (i: number) => boolean) => {
    for (let p = 0; p < pixelCount; p++) {
      maskAlpha[p] = predicate(p * 4) ? 255 : 0;
    }
  };

  if (transparentRatio > 0.35) {
    setAlphaMask((i) => data[i + 3] >= 40);
    return maskAlpha;
  }

  const readOpaqueRgb = (x: number, y: number): [number, number, number] | null => {
    const i = idx(x, y);
    if (data[i + 3] < 30) return null;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const backdropSamples: Array<[number, number, number]> = [];
  const samplePoints: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [0, Math.floor(height / 2)],
  ];
  for (const [sx, sy] of samplePoints) {
    let sample: [number, number, number] | null = null;
    for (let step = 0; step < 48 && !sample; step++) {
      const x =
        sx === 0
          ? Math.min(step, width - 1)
          : sx === width - 1
            ? Math.max(width - 1 - step, 0)
            : sx;
      const y =
        sy === 0
          ? Math.min(step, height - 1)
          : sy === height - 1
            ? Math.max(height - 1 - step, 0)
            : sy;
      sample = readOpaqueRgb(x, y);
    }
    if (sample) backdropSamples.push(sample);
  }

  if (backdropSamples.length === 0) {
    setAlphaMask((i) => data[i + 3] >= 40);
    return maskAlpha;
  }

  const tolerance = 10;
  const isBackdrop = (x: number, y: number): boolean => {
    const i = idx(x, y);
    if (data[i + 3] < 30) return false;
    return matchesBackdrop(data[i], data[i + 1], data[i + 2], backdropSamples, tolerance);
  };

  const exterior = new Uint8Array(pixelCount);
  const queue: number[] = [];
  const enqueueBackdrop = (x: number, y: number) => {
    const pi = y * width + x;
    if (exterior[pi] || !isBackdrop(x, y)) return;
    exterior[pi] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    enqueueBackdrop(x, 0);
    enqueueBackdrop(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueueBackdrop(0, y);
    enqueueBackdrop(width - 1, y);
  }

  while (queue.length > 0) {
    const y = queue.pop()!;
    const x = queue.pop()!;
    if (x > 0) enqueueBackdrop(x - 1, y);
    if (x < width - 1) enqueueBackdrop(x + 1, y);
    if (y > 0) enqueueBackdrop(x, y - 1);
    if (y < height - 1) enqueueBackdrop(x, y + 1);
  }

  let carPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      const isCar = data[idx(x, y) + 3] >= 30 && !exterior[pi];
      if (isCar) carPixels++;
      maskAlpha[pi] = isCar ? 255 : 0;
    }
  }

  const carRatio = carPixels / pixelCount;
  if (carRatio < 0.03 || carRatio > 0.55) {
    setAlphaMask((i) => {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      return data[i + 3] >= 30 && lum > 15;
    });
  }

  return maskAlpha;
}

function writeMaskAlpha(
  maskAlpha: Uint8Array,
  width: number,
  height: number,
): HTMLCanvasElement {
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const mctx = mask.getContext("2d")!;
  const maskData = mctx.createImageData(width, height);
  for (let p = 0; p < maskAlpha.length; p++) {
    const i = p * 4;
    maskData.data[i] = 255;
    maskData.data[i + 1] = 255;
    maskData.data[i + 2] = 255;
    maskData.data[i + 3] = maskAlpha[p];
  }
  mctx.putImageData(maskData, 0, 0);
  return mask;
}

function maskCanvasFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  return writeMaskAlpha(buildMaskAlphaFromImageData(data, width, height), width, height);
}

function dilateMask(mask: HTMLCanvasElement, radius = 2): HTMLCanvasElement {
  const { width, height } = mask;
  const src = mask.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height);
  const out = new Uint8Array(width * height);
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      if (src.data[pi * 4 + 3] > 128) {
        out[pi] = 255;
        continue;
      }
      let hit = false;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (src.data[(ny * width + nx) * 4 + 3] > 128) {
            hit = true;
            break;
          }
        }
      }
      out[pi] = hit ? 255 : 0;
    }
  }
  return writeMaskAlpha(out, width, height);
}

function mergeMasks(a: HTMLCanvasElement, b: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = a;
  const merged = document.createElement("canvas");
  merged.width = width;
  merged.height = height;
  const mctx = merged.getContext("2d")!;
  mctx.drawImage(a, 0, 0);
  mctx.globalCompositeOperation = "lighter";
  mctx.drawImage(b, 0, 0);
  mctx.globalCompositeOperation = "source-over";
  return merged;
}

function buildCarMask(
  img: HTMLImageElement,
  rect: ImageRect,
  canvasW: number,
  canvasH: number,
): HTMLCanvasElement {
  const sample = document.createElement("canvas");
  sample.width = canvasW;
  sample.height = canvasH;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Canvas 2D unavailable");
  sctx.drawImage(img, rect.dx, rect.dy, rect.dw, rect.dh);
  const { data } = sctx.getImageData(0, 0, canvasW, canvasH);
  return maskCanvasFromImageData(data, canvasW, canvasH);
}

function buildCarMaskFromCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Canvas 2D unavailable");
  const { data } = sctx.getImageData(0, 0, width, height);
  return maskCanvasFromImageData(data, width, height);
}

async function renderAssemblyPreview(
  visualBuild: CarBuildVisual,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const { catalog, assembly } = await carGraphics();
  const compositor = new CarCompositor({ catalog, assembly });
  const assemblyCanvas = await compositor.render(visualBuild);
  const rect = fitImageRectFromSize(
    assemblyCanvas.width,
    assemblyCanvas.height,
    width,
    height,
  );

  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(assemblyCanvas, rect.dx, rect.dy, rect.dw, rect.dh);
  return sample;
}

/** Body + aero paint mask (wheels excluded — chassis art uses empty wheel arches). */
async function buildBodyPaintMask(
  visualBuild: CarBuildVisual,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const maskBuild: CarBuildVisual = { ...visualBuild, wheel_package: undefined };
  const sample = await renderAssemblyPreview(maskBuild, width, height);
  return dilateMask(buildCarMaskFromCanvas(sample), 1);
}

async function lmgt3BodySilhouetteMask(
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> {
  try {
    const img = await loadImage(LMGT3_BODY_MASK);
    const rect = fitImageRect(img, width, height);
    return buildCarMask(img, rect, width, height);
  } catch {
    return null;
  }
}

async function resolveLiveryPaintMask(
  options: LiveryRenderOptions,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const visualBuild = resolveVisualBuild(options);
  let mask = await buildBodyPaintMask(visualBuild, width, height);
  const classId = options.classId ?? classIdFromChassis(visualBuild.chassis_type);
  if (classId === "LMGT3") {
    const bodyMask = await lmgt3BodySilhouetteMask(width, height);
    if (bodyMask) mask = mergeMasks(mask, bodyMask);
  }
  return mask;
}

function clipToMask(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement): void {
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

function drawSourceLayer(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  rect: ImageRect | null,
  canvasW: number,
  canvasH: number,
): void {
  if (rect) {
    ctx.drawImage(source, rect.dx, rect.dy, rect.dw, rect.dh);
  } else {
    ctx.drawImage(source, 0, 0, canvasW, canvasH);
  }
}

function paintTintedSilhouette(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  rect: ImageRect | null,
  mask: HTMLCanvasElement,
  options: LiveryRenderOptions,
  canvasW: number,
  canvasH: number,
): void {
  const car = document.createElement("canvas");
  car.width = canvasW;
  car.height = canvasH;
  const cctx = car.getContext("2d");
  if (!cctx) return;

  cctx.fillStyle = options.primary;
  cctx.fillRect(0, 0, canvasW, canvasH);
  clipToMask(cctx, mask);

  const stripes = document.createElement("canvas");
  stripes.width = canvasW;
  stripes.height = canvasH;
  const stctx = stripes.getContext("2d");
  if (stctx) {
    applyStripePattern(
      stctx,
      options.pattern,
      options.primary,
      options.secondary,
      patternBounds(rect, canvasW, canvasH),
    );
    clipToMask(stctx, mask);
    cctx.drawImage(stripes, 0, 0);
  }

  const shade = document.createElement("canvas");
  shade.width = canvasW;
  shade.height = canvasH;
  const shctx = shade.getContext("2d");
  if (shctx) {
    drawSourceLayer(shctx, source, rect, canvasW, canvasH);
    cctx.save();
    clipToMask(cctx, mask);
    cctx.globalCompositeOperation = "overlay";
    cctx.globalAlpha = 0.5;
    cctx.drawImage(shade, 0, 0);
    cctx.globalAlpha = 0.18;
    cctx.globalCompositeOperation = "soft-light";
    cctx.drawImage(shade, 0, 0);
    cctx.restore();
  }

  ctx.drawImage(car, 0, 0);
}

function drawFlatLiveryBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#141820");
  bg.addColorStop(1, "#080a0f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

async function drawLiveryBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundImage?: string | null,
): Promise<void> {
  if (backgroundImage === null) {
    drawFlatLiveryBackground(ctx, width, height);
    return;
  }

  const src = backgroundImage ?? DEFAULT_LIVERY_BACKGROUND;
  try {
    const img = await loadImage(src);
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    const shade = ctx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, "rgba(8, 10, 15, 0.35)");
    shade.addColorStop(1, "rgba(8, 10, 15, 0.62)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  } catch {
    drawFlatLiveryBackground(ctx, width, height);
  }
}

async function resolvePaintSource(
  options: LiveryRenderOptions,
  width: number,
  height: number,
): Promise<{
  source: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  bounds: ImageRect;
}> {
  const visualBuild = resolveVisualBuild(options);
  const [source, mask] = await Promise.all([
    renderAssemblyPreview(visualBuild, width, height),
    resolveLiveryPaintMask(options, width, height),
  ]);
  return {
    source,
    mask,
    bounds: { dx: width * 0.05, dy: height * 0.1, dw: width * 0.9, dh: height * 0.8 },
  };
}

/**
 * Render a class-specific side profile with team livery colors and stripes.
 * Uses the compositor assembly (chassis + aero + wheels) for all classes.
 */
export async function renderClassLiveryCanvas(
  options: LiveryRenderOptions,
): Promise<HTMLCanvasElement> {
  const width = options.width ?? 560;
  const height = options.height ?? 140;
  const { source, mask, bounds } = await resolvePaintSource(options, width, height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  await drawLiveryBackground(ctx, width, height, options.backgroundImage);

  paintTintedSilhouette(ctx, source, null, mask, options, width, height);
  ctx.drawImage(source, 0, 0);

  if (options.logoDataUrl) {
    const logo = await loadLogo(options.logoDataUrl);
    if (logo) {
      const logoSize = Math.min(bounds.dw * 0.2, height * 0.38);
      const lx = bounds.dx + bounds.dw * 0.06;
      const ly = bounds.dy + bounds.dh * 0.12;
      const logoLayer = document.createElement("canvas");
      logoLayer.width = width;
      logoLayer.height = height;
      const lctx = logoLayer.getContext("2d");
      if (lctx) {
        lctx.fillStyle = "rgba(255,255,255,0.12)";
        lctx.beginPath();
        lctx.roundRect(lx - 4, ly - 4, logoSize + 8, logoSize + 8, 6);
        lctx.fill();
        lctx.drawImage(logo, lx, ly, logoSize, logoSize);
        clipToMask(lctx, mask);
        ctx.drawImage(logoLayer, 0, 0);
      }
    }
  }

  return canvas;
}

/** Tint a compositor assembly canvas with team livery colors. */
export async function tintAssemblyCanvas(
  assembly: HTMLCanvasElement,
  options: Omit<LiveryRenderOptions, "width" | "height">,
): Promise<HTMLCanvasElement> {
  const width = assembly.width;
  const height = assembly.height;
  const classId =
    options.classId ??
    (options.visualBuild ? classIdFromChassis(options.visualBuild.chassis_type) : undefined);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const mask = await resolveLiveryPaintMask(
    { ...options, classId, width, height },
    width,
    height,
  );

  await drawLiveryBackground(ctx, width, height, options.backgroundImage);

  paintTintedSilhouette(ctx, assembly, null, mask, options, width, height);
  ctx.drawImage(assembly, 0, 0);

  return out;
}

export function mountLiveryCanvas(
  host: HTMLElement,
  options: LiveryRenderOptions,
): { update(next: LiveryRenderOptions): void; destroy(): void } {
  let token = 0;

  const paint = (opts: LiveryRenderOptions) => {
    const current = ++token;
    void renderClassLiveryCanvas(opts).then((result) => {
      if (current !== token) return;
      result.className = "livery-car-canvas";
      host.replaceChildren(result);
    });
  };

  paint(options);
  return {
    update: paint,
    destroy: () => {
      token++;
      host.replaceChildren();
    },
  };
}
