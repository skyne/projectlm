#!/usr/bin/env python3
"""Build per-silhouette detail masks for hypercar livery art.
   Wheels from mask holes. Tighter cockpit ellipse."""

from __future__ import annotations

import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "viewer/public/assets/livery/hypercar"


def car_bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask[:, :, 3] > 128)
    if len(ys) == 0:
        return 0, 0, 0, 0
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def lum(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def get_wheels_from_mask(m_alpha: np.ndarray, x0: int, y0: int, bw: int, bh: int) -> list[tuple[float, float, float]]:
    """Find wheel wells from transparent holes in the mask.
    Returns list of (cx, cy, radius) for each wheel.
    Picks leftmost bottom hole for front wheel and rightmost bottom hole for rear wheel."""
    roi = ~m_alpha[y0:y0 + bh, x0:x0 + bw]
    visited = np.zeros_like(roi)
    holes = []
    for y in range(bh):
        for x in range(bw):
            if roi[y, x] and not visited[y, x]:
                q = deque([(x, y)])
                visited[y, x] = True
                pixels = []
                while q:
                    cx, cy = q.popleft()
                    pixels.append((cx, cy))
                    for nx, ny in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]:
                        if 0 <= nx < bw and 0 <= ny < bh:
                            if roi[ny, nx] and not visited[ny, nx]:
                                visited[ny, nx] = True
                                q.append((nx, ny))
                if len(pixels) >= 20:
                    pts = np.array(pixels)
                    cx_f = pts[:, 0].mean()
                    cy_f = pts[:, 1].mean()
                    holes.append({
                        "cx": x0 + cx_f, "cy": y0 + cy_f,
                        "x_frac": cx_f / bw, "y_frac": cy_f / bh,
                        "count": len(pixels),
                        "w": pts[:, 0].max() - pts[:, 0].min() + 1,
                        "h": pts[:, 1].max() - pts[:, 1].min() + 1,
                    })

    bottom_holes = sorted(
        [h for h in holes if h["y_frac"] > 0.70 and h["count"] > 50],
        key=lambda h: h["cx"],
    )
    if len(bottom_holes) < 2:
        return [], len(bottom_holes)

    left = bottom_holes[0]
    right = bottom_holes[-1]

    # Both on same side → fallback to circle detection
    if right["cx"] - left["cx"] < bw * 0.25:
        return [], len(bottom_holes)

    # Check the right hole is actually the rear well (right of center)
    if right["x_frac"] < 0.50:
        return [], len(bottom_holes)

    wheels = []
    for h in (left, right):
        r = bw * 0.055
        wheels.append((h["cx"], h["cy"], r))

    return wheels, len(bottom_holes)


# Per-car feature positions
# Cockpit: taller cars get smaller rh to avoid covering the roof
FEAT: dict[str, dict] = {
    "bmw-m-hybrid-v8": {"cockpit": (0.43, 0.30, 0.12, 0.08), "headlight": (0.065, 0.58, 0.055, 0.10)},
    "cadillac-v-series-r": {"cockpit": (0.43, 0.28, 0.11, 0.06), "headlight": (0.065, 0.58, 0.055, 0.10)},
    "ferrari-499p": {"cockpit": (0.43, 0.30, 0.12, 0.08), "headlight": (0.065, 0.58, 0.055, 0.10)},
    "lamborghini-sc63": {"cockpit": (0.43, 0.30, 0.12, 0.08), "headlight": (0.065, 0.58, 0.055, 0.10)},
    "lmh-generic": {"cockpit": (0.43, 0.30, 0.12, 0.08), "headlight": (0.065, 0.58, 0.055, 0.10)},
    "peugeot-9x8": {"cockpit": (0.37, 0.27, 0.12, 0.08), "headlight": (0.065, 0.58, 0.055, 0.10)},
    "porsche-963": {"cockpit": (0.43, 0.28, 0.11, 0.06), "headlight": (0.065, 0.58, 0.055, 0.10)},
    "toyota-gr010": {"cockpit": (0.43, 0.30, 0.12, 0.08), "headlight": (0.065, 0.58, 0.055, 0.10)},
}


def build_details(sid: str) -> dict:
    base = OUT / sid
    outline = Image.open(f"{base}-outline.png").convert("RGBA")
    mask_img = Image.open(f"{base}-mask.png").convert("RGBA")

    o_arr = np.array(outline)
    m_arr = np.array(mask_img)
    o_alpha = o_arr[:, :, 3] > 128
    m_alpha = m_arr[:, :, 3] > 128

    w, h = outline.size
    x0, y0, x1, y1 = car_bbox(m_arr)
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    # Wheels from mask holes
    wheels, n_holes = get_wheels_from_mask(m_alpha, x0, y0, bw, bh)

    # Fallback: circle detection on outline with lower search window
    if len(wheels) < 2:
        wheels = []
        cy_f = (0.78, 0.82, 0.86, 0.90)
        cx_f = (0.15, 0.20, 0.24, 0.28, 0.32, 0.65, 0.70, 0.74, 0.78, 0.82)
        detected = []
        for rf in (0.04, 0.05, 0.06, 0.07, 0.08):
            rp = int(bw * rf)
            for cfy in cy_f:
                cc = y0 + int(bh * cfy)
                for cfx in cx_f:
                    c = x0 + int(bw * cfx)
                    score = int(np.sum(o_alpha[max(cc - rp, 0):min(cc + rp + 1, h),
                                               max(c - rp, 0):min(c + rp + 1, w)]))
                    rim = max(o_alpha[cc, c - rp] if c - rp >= 0 else 0,
                              o_alpha[cc, c + rp] if c + rp < w else 0,
                              o_alpha[cc - rp, c] if cc - rp >= 0 else 0,
                              o_alpha[cc + rp, c] if cc + rp < h else 0)
                    if rim > 0 and score >= 0.50 * math.pi * rp ** 2:
                        detected.append((score, c, cc, rp))
        detected.sort(reverse=True)
        used = set()
        for sc, cx, cy, r in detected:
            if any(abs(cx - ux) < bw * 0.15 and abs(cy - uy) < bh * 0.15 for ux, uy, _ in used):
                continue
            wheels.append((cx, cy, r * 0.65))
            used.add((cx, cy, r))
            if len(wheels) == 2:
                break
        if len(wheels) < 2:
            wheels = [(x0 + bw * 0.22, y0 + bh * 0.88, bw * 0.050),
                      (x0 + bw * 0.78, y0 + bh * 0.88, bw * 0.050)]

    feat = FEAT.get(sid, FEAT["bmw-m-hybrid-v8"])

    # Outline for carving
    dark = (lum(o_arr[:, :, 0], o_arr[:, :, 1], o_arr[:, :, 2]) < 95) & o_alpha
    thin_img = Image.fromarray((dark * 255).astype(np.uint8))
    thin_img = thin_img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    thick_fill = np.array(thin_img) > 128
    outline_strokes = dark & ~thick_fill

    det_arr = np.zeros((h, w, 4), dtype=np.uint8)
    yy, xx = np.ogrid[:h, :w]

    # Wheels (red) — from mask hole wells
    for cx, cy, r in wheels:
        mc = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r ** 2
        det_arr[mc] = [255, 0, 0, 255]

    # Cockpit (green) — tight ellipse, clipped to outline barrier
    c_cx, c_cy, c_rw, c_rh = feat["cockpit"]
    cex = x0 + c_cx * bw
    cey = y0 + c_cy * bh
    crw = c_rw * bw
    crh = c_rh * bh
    ck_ellipse = ((xx - cex) ** 2 / crw ** 2 + (yy - cey) ** 2 / crh ** 2) <= 1.0
    det_arr[ck_ellipse & ~outline_strokes] = [0, 255, 0, 255]

    # Headlights (blue) — clipped to mask
    h_cx, h_cy, h_rw, h_rh = feat["headlight"]
    hex = x0 + h_cx * bw
    hey = y0 + h_cy * bh
    hrw = h_rw * bw
    hrh = h_rh * bh
    hl_ellipse = ((xx - hex) ** 2 / hrw ** 2 + (yy - hey) ** 2 / hrh ** 2) <= 1.0
    det_arr[hl_ellipse & m_alpha & ~outline_strokes] = [0, 0, 255, 255]

    # Priority: red > green > blue
    red = (det_arr[:, :, 0] == 255) & (det_arr[:, :, 3] == 255)
    green = (det_arr[:, :, 1] == 255) & (det_arr[:, :, 3] == 255)
    blue = (det_arr[:, :, 2] == 255) & (det_arr[:, :, 3] == 255)
    det_arr[green & red] = [0, 0, 0, 0]
    det_arr[blue & (red | green)] = [0, 0, 0, 0]

    out = Image.fromarray(det_arr, "RGBA")
    out.save(f"{base}-details.png")

    r_count = np.sum(red)
    g_count = np.sum(green & ~red)
    b_count = np.sum(blue & ~red & ~green)
    print(f"  wheels_holes={n_holes} wheels={[(round(cx),round(cy),round(r)) for cx,cy,r in wheels]} R={r_count:5d} G={g_count:5d} B={b_count:5d}")

    return {"wheels": [{"cx": cx, "cy": cy, "r": r} for cx, cy, r in wheels]}


def main() -> None:
    meta: dict[str, object] = {}
    for path in sorted(OUT.glob("*-outline.png")):
        sid = path.name.replace("-outline.png", "")
        print(f"Processing {sid}...")
        meta[sid] = build_details(sid)
    (OUT / "details-meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print("\nDone!")


if __name__ == "__main__":
    main()
