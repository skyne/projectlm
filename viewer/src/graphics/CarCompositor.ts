import { resolveSpritePlacements } from "./spritePlacement";
import {
  resolveLayers,
  type CarBuildVisual,
  type VisualAssembly,
  type VisualCatalog,
} from "./visualCatalog";

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function clearImageCache(): void {
  imageCache.clear();
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

export interface CarCompositorOptions {
  catalog: VisualCatalog;
  assembly: VisualAssembly;
}

export class CarCompositor {
  private catalog: VisualCatalog;
  private assembly: VisualAssembly;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(options: CarCompositorOptions) {
    this.catalog = options.catalog;
    this.assembly = options.assembly;
    const { width, height } = options.assembly.canvas;
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  async render(build: CarBuildVisual): Promise<HTMLCanvasElement> {
    const { width, height } = this.assembly.canvas;
    this.ctx.clearRect(0, 0, width, height);

    const layers = resolveLayers(build, this.catalog, this.assembly);
    for (const { src, layer } of layers) {
      try {
        const img = await loadImage(src);
        if (layer?.layerType === "sprite" && layer.socket) {
          for (const op of resolveSpritePlacements(layer.socket, img, width, height)) {
            this.ctx.drawImage(img, op.sx, op.sy, op.sw, op.sh, op.x, op.y, op.w, op.h);
          }
        } else {
          this.ctx.drawImage(img, 0, 0, width, height);
        }
      } catch (err) {
        console.warn("[CarCompositor] missing layer", src, err);
      }
    }

    return this.canvas;
  }
}

export async function loadCarGraphics(): Promise<{
  catalog: VisualCatalog;
  assembly: VisualAssembly;
}> {
  const bust = Date.now();
  const [catalogRes, assemblyRes] = await Promise.all([
    fetch(`/configs/visual_catalog.json?t=${bust}`),
    fetch(`/configs/visual_assembly.json?t=${bust}`),
  ]);
  if (!catalogRes.ok || !assemblyRes.ok) {
    throw new Error("Failed to load visual catalog/assembly");
  }
  return {
    catalog: (await catalogRes.json()) as VisualCatalog,
    assembly: (await assemblyRes.json()) as VisualAssembly,
  };
}
