#!/usr/bin/env python3
"""Build per-silhouette detail masks (wheels, cockpit glass, headlights) for hypercar livery art."""

from __future__ import annotations

import json
import math
import os
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "viewer/public/assets/livery/hypercar"


def lum(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def car_bbox(mask: Image.Image) -> tuple[int, int, int, int]:
    px = mask.load()
    w, h = mask.size
    xs = [x for y in range(h) for x in range(w) if px[x, y][3] > 128]
    ys = [y for y in range(h) for x in range(w) if px[x, y][3] > 128]
    return min(xs), min(ys), max(xs), max(ys)


def find_wheels(outline: Image.Image, mask: Image.Image) -> list[tuple[float, float, float, float]]:
    w, h = outline.size
    op = outline.load()
    mp = mask.load()
    boundary = [
        [op[x, y][3] > 128 and lum(*op[x, y][:3]) < 95 for x in range(w)] for y in range(h)
    ]
    x0, y0, x1, y1 = car_bbox(mask)
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    best: list[tuple[float, float, float, float]] = []
    for cy_f in (0.70, 0.74, 0.78, 0.82):
        for cx_f in (0.15, 0.20, 0.24, 0.28, 0.32, 0.65, 0.70, 0.74, 0.78, 0.82):
            cx = x0 + cx_f * bw
            cy = y0 + cy_f * bh
            for rf in (0.075, 0.085, 0.095, 0.105, 0.115, 0.125):
                r = rf * bw
                score = 0
                total = 0
                for deg in range(0, 360, 5):
                    rad = math.radians(deg)
                    x = int(cx + r * math.cos(rad))
                    y = int(cy + r * math.sin(rad))
                    if 0 <= x < w and 0 <= y < h and mp[x, y][3] > 128:
                        total += 1
                        if boundary[y][x]:
                            score += 1
                if total > 20:
                    best.append((score / total, cx, cy, r))
    best.sort(reverse=True)
    picked: list[tuple[float, float, float, float]] = []
    for item in best:
        _, cx, cy, r = item
        if all(math.hypot(cx - p[1], cy - p[2]) > min(r, p[3]) * 1.2 for p in picked):
            picked.append(item)
        if len(picked) == 2:
            break
    return picked


def build_details(sid: str) -> dict:
    base = OUT / sid
    outline = Image.open(f"{base}-outline.png").convert("RGBA")
    mask = Image.open(f"{base}-mask.png").convert("RGBA")
    w, h = outline.size
    x0, y0, x1, y1 = car_bbox(mask)
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    wheels = find_wheels(outline, mask)

    det = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(det)
    for _, cx, cy, r in wheels:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 0, 0, 255))
    draw.ellipse(
        [x0 + 0.30 * bw, y0 + 0.22 * bh, x0 + 0.58 * bw, y0 + 0.50 * bh],
        fill=(0, 255, 0, 255),
    )
    draw.ellipse(
        [x0 + 0.01 * bw, y0 + 0.48 * bh, x0 + 0.12 * bw, y0 + 0.68 * bh],
        fill=(0, 0, 255, 255),
    )

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    dp = det.load()
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            if mp[x, y][3] > 128 and dp[x, y][3] > 0:
                op[x, y] = dp[x, y]
    out.save(f"{base}-details.png")

    return {
        "wheels": [{"cx": cx, "cy": cy, "r": r} for _, cx, cy, r in wheels],
    }


def main() -> None:
    meta: dict[str, object] = {}
    for path in sorted(OUT.glob("*-outline.png")):
        sid = path.name.replace("-outline.png", "")
        meta[sid] = build_details(sid)
        print(sid, meta[sid])
    (OUT / "details-meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
