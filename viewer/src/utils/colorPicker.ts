function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeHex(hex: string): string | null {
  const trimmed = hex.trim();
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed)) return null;
  let h = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const h = normalized.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return [h * 360, s, v];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hue < 60) [rp, gp, bp] = [c, x, 0];
  else if (hue < 120) [rp, gp, bp] = [x, c, 0];
  else if (hue < 180) [rp, gp, bp] = [0, c, x];
  else if (hue < 240) [rp, gp, bp] = [0, x, c];
  else if (hue < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

export interface ColorPickerOptions {
  anchor: HTMLElement;
  color: string;
  onChange?: (hex: string) => void;
  onCommit: (hex: string) => void;
  onCancel?: () => void;
}

let activeClose: (() => void) | null = null;

export function closeColorPicker(): void {
  activeClose?.();
  activeClose = null;
}

export function openColorPicker(options: ColorPickerOptions): void {
  closeColorPicker();

  const startHex = normalizeHex(options.color) ?? "#d4a843";
  const [sr, sg, sb] = hexToRgb(startHex)!;
  let [hue, sat, val] = rgbToHsv(sr, sg, sb);
  if (sat === 0) hue = 0;

  const popover = document.createElement("div");
  popover.className = "color-picker-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Custom color");
  popover.innerHTML = `
    <div class="color-picker-canvas-wrap">
      <canvas class="color-picker-canvas" width="220" height="220" aria-hidden="true"></canvas>
    </div>
    <div class="color-picker-hex-row">
      <span class="color-picker-preview" aria-hidden="true"></span>
      <label class="color-picker-hex-label">
        <span class="sr-only">Hex color</span>
        <input type="text" class="color-picker-hex" maxlength="7" spellcheck="false" autocomplete="off" />
      </label>
    </div>
  `;

  const canvas = popover.querySelector<HTMLCanvasElement>(".color-picker-canvas")!;
  const ctx = canvas.getContext("2d")!;
  const previewEl = popover.querySelector<HTMLElement>(".color-picker-preview")!;
  const hexInput = popover.querySelector<HTMLInputElement>(".color-picker-hex")!;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 108;
  const innerR = 78;
  const svSize = 128;
  const svX = cx - svSize / 2;
  const svY = cy - svSize / 2;

  let dragging: "hue" | "sv" | null = null;
  let committed = false;

  function currentHex(): string {
    const [r, g, b] = hsvToRgb(hue, sat, val);
    return rgbToHex(r, g, b);
  }

  function emitChange(): void {
    const hex = currentHex();
    previewEl.style.background = hex;
    hexInput.value = hex;
    options.onChange?.(hex);
  }

  function commitAndClose(): void {
    committed = true;
    options.onCommit(currentHex());
    close();
  }

  function drawWheel(): void {
    ctx.clearRect(0, 0, size, size);

    for (let angle = 0; angle < 360; angle++) {
      const start = ((angle - 0.6) * Math.PI) / 180;
      const end = ((angle + 0.6) * Math.PI) / 180;
      const [r, g, b] = hsvToRgb(angle, 1, 1);
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, start, end);
      ctx.arc(cx, cy, innerR, end, start, true);
      ctx.closePath();
      ctx.fillStyle = rgbToHex(r, g, b);
      ctx.fill();
    }

    const [hr, hg, hb] = hsvToRgb(hue, 1, 1);
    const gradH = ctx.createLinearGradient(svX, 0, svX + svSize, 0);
    gradH.addColorStop(0, "#ffffff");
    gradH.addColorStop(1, `rgb(${hr}, ${hg}, ${hb})`);
    ctx.fillStyle = gradH;
    ctx.fillRect(svX, svY, svSize, svSize);

    const gradV = ctx.createLinearGradient(0, svY, 0, svY + svSize);
    gradV.addColorStop(0, "rgba(0,0,0,0)");
    gradV.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = gradV;
    ctx.fillRect(svX, svY, svSize, svSize);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(svX + 0.5, svY + 0.5, svSize - 1, svSize - 1);

    const hueRad = (hue * Math.PI) / 180;
    const hueMidR = (outerR + innerR) / 2;
    const hx = cx + Math.cos(hueRad) * hueMidR;
    const hy = cy + Math.sin(hueRad) * hueMidR;
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const sx = svX + sat * svSize;
    const sy = svY + (1 - val) * svSize;
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function setFromHex(hex: string, apply = false): void {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    const rgb = hexToRgb(normalized);
    if (!rgb) return;
    const [h, s, v] = rgbToHsv(...rgb);
    hue = s === 0 ? hue : h;
    sat = s;
    val = v;
    drawWheel();
    emitChange();
    if (apply) commitAndClose();
  }

  function hitHue(x: number, y: number): boolean {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist >= innerR - 4 && dist <= outerR + 4;
  }

  function hitSv(x: number, y: number): boolean {
    return x >= svX && x <= svX + svSize && y >= svY && y <= svY + svSize;
  }

  function pointerPos(ev: PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [(ev.clientX - rect.left) * scaleX, (ev.clientY - rect.top) * scaleY];
  }

  function updateHue(x: number, y: number): void {
    const dx = x - cx;
    const dy = y - cy;
    hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    drawWheel();
    emitChange();
  }

  function updateSv(x: number, y: number): void {
    sat = clamp((x - svX) / svSize, 0, 1);
    val = clamp(1 - (y - svY) / svSize, 0, 1);
    drawWheel();
    emitChange();
  }

  function onPointerDown(ev: PointerEvent): void {
    const [x, y] = pointerPos(ev);
    if (hitSv(x, y)) dragging = "sv";
    else if (hitHue(x, y)) dragging = "hue";
    else return;
    canvas.setPointerCapture(ev.pointerId);
    if (dragging === "sv") updateSv(x, y);
    else updateHue(x, y);
    ev.preventDefault();
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!dragging) return;
    const [x, y] = pointerPos(ev);
    if (dragging === "sv") updateSv(x, y);
    else updateHue(x, y);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!dragging) return;
    dragging = null;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    commitAndClose();
  }

  function positionPopover(): void {
    const rect = options.anchor.getBoundingClientRect();
    const pad = 8;
    popover.style.visibility = "hidden";
    popover.style.display = "block";
    document.body.appendChild(popover);

    let top = rect.bottom + pad;
    let left = rect.left;
    const popRect = popover.getBoundingClientRect();

    if (left + popRect.width > window.innerWidth - pad) {
      left = window.innerWidth - popRect.width - pad;
    }
    if (top + popRect.height > window.innerHeight - pad) {
      top = rect.top - popRect.height - pad;
    }
    popover.style.top = `${Math.max(pad, top)}px`;
    popover.style.left = `${Math.max(pad, left)}px`;
    popover.style.visibility = "";
  }

  function close(): void {
    document.removeEventListener("pointerdown", onOutsidePointer);
    document.removeEventListener("keydown", onKeyDown);
    popover.remove();
    if (!committed) options.onCancel?.();
    if (activeClose === close) activeClose = null;
  }

  function onOutsidePointer(ev: PointerEvent): void {
    const target = ev.target as Node;
    if (popover.contains(target) || options.anchor.contains(target)) return;
    commitAndClose();
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  hexInput.addEventListener("input", () => {
    const normalized = normalizeHex(hexInput.value);
    if (!normalized) return;
    setFromHex(normalized, false);
  });

  hexInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      const normalized = normalizeHex(hexInput.value);
      if (normalized) setFromHex(normalized, true);
    }
  });

  hexInput.addEventListener("blur", () => {
    const normalized = normalizeHex(hexInput.value);
    if (normalized) {
      hexInput.value = normalized;
      previewEl.style.background = normalized;
    } else {
      hexInput.value = currentHex();
    }
  });

  positionPopover();
  drawWheel();
  previewEl.style.background = currentHex();
  hexInput.value = currentHex();

  requestAnimationFrame(() => {
    document.addEventListener("pointerdown", onOutsidePointer);
    document.addEventListener("keydown", onKeyDown);
    hexInput.focus();
    hexInput.select();
  });

  activeClose = close;
}
