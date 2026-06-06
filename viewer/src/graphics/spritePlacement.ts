export interface FitPoint {
  /** Normalized point on sprite (0–1). */
  sx: number;
  sy: number;
  /** Normalized point on chassis canvas (0–1). */
  cx: number;
  cy: number;
}

export interface SpriteSocket {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Two corresponding points → scale + translate (wheelbase fit). */
  fit?: [FitPoint, FitPoint];
  /** Uniform scale applied after fit (e.g. wheels: match wheelbase, then shrink to arch size). */
  scale?: number;
  /** Single anchor + optional w/h fractions of canvas. */
  anchor?: FitPoint;
  /** Independent anchor placements (e.g. front + rear wheel from one sprite sheet). */
  placements?: Array<
    FitPoint & {
      w?: number;
      h?: number;
      /** Normalized source crop (defaults to full image). */
      src?: { x: number; y: number; w: number; h: number };
    }
  >;
}

export interface SpriteDrawOp {
  x: number;
  y: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function resolveSpritePlacements(
  socket: SpriteSocket,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
): SpriteDrawOp[] {
  if (socket.placements?.length) {
    return socket.placements.map((p) => {
      const destW = (p.w ?? 0.11) * canvasW;
      const destH = (p.h ?? 0.2) * canvasH;
      const src = p.src ?? { x: 0, y: 0, w: 1, h: 1 };
      return {
        x: p.cx * canvasW - p.sx * destW,
        y: p.cy * canvasH - p.sy * destH,
        w: destW,
        h: destH,
        sx: src.x * img.width,
        sy: src.y * img.height,
        sw: src.w * img.width,
        sh: src.h * img.height,
      };
    });
  }
  const rect = resolveSpriteRect(socket, img, canvasW, canvasH);
  return [
    {
      ...rect,
      sx: 0,
      sy: 0,
      sw: img.width,
      sh: img.height,
    },
  ];
}

export function resolveSpriteRect(
  socket: SpriteSocket,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  if (socket.fit && socket.fit.length >= 2) {
    const [a, b] = socket.fit;
    const spanS = b.sx - a.sx;
    if (Math.abs(spanS) < 1e-6) {
      return fallbackRect(socket, canvasW, canvasH);
    }
    let drawW = ((b.cx - a.cx) * canvasW) / spanS;
    let drawH = drawW * (img.height / img.width);
    const scale = socket.scale ?? 1;
    drawW *= scale;
    drawH *= scale;
    return {
      x: a.cx * canvasW - a.sx * drawW,
      y: a.cy * canvasH - a.sy * drawH,
      w: drawW,
      h: drawH,
    };
  }

  if (socket.anchor) {
    const { sx, sy, cx, cy } = socket.anchor;
    const w = (socket.w ?? 0.2) * canvasW;
    const h = (socket.h ?? 0.25) * canvasH;
    return {
      x: cx * canvasW - sx * w,
      y: cy * canvasH - sy * h,
      w,
      h,
    };
  }

  return fallbackRect(socket, canvasW, canvasH);
}

function fallbackRect(
  socket: SpriteSocket,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: (socket.x ?? 0) * canvasW,
    y: (socket.y ?? 0) * canvasH,
    w: (socket.w ?? 1) * canvasW,
    h: (socket.h ?? 1) * canvasH,
  };
}
