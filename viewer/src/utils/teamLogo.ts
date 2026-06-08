/** Max stored logo payload after client-side resize (base64 data URL length). */
export const LOGO_DATA_URL_MAX_CHARS = 96_000;

const LOGO_CANVAS_MAX_PX = 192;
const LOGO_OUTPUT_MIME = "image/webp";
const LOGO_OUTPUT_QUALITY = 0.82;

export interface ProcessedLogo {
  dataUrl: string;
  width: number;
  height: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unsupported or corrupt image"));
    img.src = src;
  });
}

function fitDimensions(
  width: number,
  height: number,
  maxPx: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maxPx, height: maxPx };
  }
  const scale = Math.min(1, maxPx / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Accept common raster formats (and SVG via browser decode), resize, and return a compact WebP data URL.
 */
export async function processLogoUpload(file: File): Promise<ProcessedLogo> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, WebP, GIF, SVG, etc.)");
  }

  const raw = await readFileAsDataUrl(file);
  const img = await loadImage(raw);
  const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, LOGO_CANVAS_MAX_PX);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let dataUrl = canvas.toDataURL(LOGO_OUTPUT_MIME, LOGO_OUTPUT_QUALITY);
  if (!dataUrl.startsWith("data:image/")) {
    dataUrl = canvas.toDataURL("image/png");
  }
  if (dataUrl.length > LOGO_DATA_URL_MAX_CHARS) {
    throw new Error("Logo is still too large after resize — try a simpler image");
  }

  return { dataUrl, width, height };
}
