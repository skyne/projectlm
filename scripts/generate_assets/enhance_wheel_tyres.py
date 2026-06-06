#!/usr/bin/env python3
"""Build circular side-view wheels with tyre rubber from the rim sprite sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = ROOT / "viewer/public/assets/wheel_package/Hypercar18WideRear.42508881.png"
DEFAULT_OUT = ROOT / "viewer/public/assets/wheel_package/Hypercar18WideRear.tyres.png"

# Square source crops (normalized) used for placement anchors.
CROPS = (
    {"sheet": (0.058, 0.084, 0.28, 0.84), "out": (0.058, 0.084, 0.28, 0.84)},
    {"sheet": (0.66, 0.102, 0.263, 0.789), "out": (0.66, 0.102, 0.263, 0.789)},
)

RUBBER = np.array([14, 14, 16], dtype=np.float32)
RUBBER_EDGE = np.array([22, 22, 24], dtype=np.float32)


def _alpha_bbox(arr: np.ndarray) -> tuple[float, float, float, float] | None:
    mask = arr[:, :, 3] > 40
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())


def _squash_to_circle(crop: Image.Image) -> Image.Image:
    """Horizontally compress the wide ellipse rim into a true circle."""
    arr = np.array(crop.convert("RGBA"))
    bbox = _alpha_bbox(arr)
    if bbox is None:
        return crop

    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0
    if bw <= 1 or bh <= 1:
        return crop

    scale_x = bh / bw
    new_w = max(1, int(round(crop.width * scale_x)))
    squashed = crop.resize((new_w, crop.height), Image.Resampling.LANCZOS)

    # Re-centre the rim in the original square canvas.
    sq = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    paste_x = (crop.width - new_w) // 2
    sq.paste(squashed, (paste_x, 0), squashed)
    return sq


def _add_tyre(circle_crop: Image.Image) -> Image.Image:
    arr = np.array(circle_crop.convert("RGBA"), dtype=np.float32)
    bbox = _alpha_bbox(arr.astype(np.uint8))
    if bbox is None:
        return circle_crop

    x0, y0, x1, y1 = bbox
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    rim_r = max(x1 - x0, y1 - y0) / 2

    h, w = arr.shape[:2]
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)

    outer = rim_r * 1.12
    inner = rim_r * 1.0
    tire_mask = (dist >= inner) & (dist <= outer)
    t = np.clip((dist - inner) / max(outer - inner, 1.0), 0.0, 1.0)

    out = arr.copy()
    rubber = RUBBER[None, None, :] * (0.85 + 0.15 * t[:, :, None])
    out[:, :, :3] = np.where(tire_mask[:, :, None], rubber, out[:, :, :3])
    out[:, :, 3] = np.where(tire_mask, 255.0, out[:, :, 3])

    # Faint outer edge so the slick reads against the arch interior.
    edge = tire_mask & (dist > inner + (outer - inner) * 0.75)
    out[:, :, :3] = np.where(edge[:, :, None], RUBBER_EDGE[None, None, :], out[:, :, :3])

    rim_mask = arr[:, :, 3] > 40
    out[rim_mask] = arr[rim_mask]

    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def enhance(src_path: Path, out_path: Path) -> None:
    src = Image.open(src_path).convert("RGBA")
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    sw, sh = src.size

    for spec in CROPS:
        sx, sy, cw, ch = spec["sheet"]
        x0, y0 = int(sx * sw), int(sy * sh)
        x1, y1 = int((sx + cw) * sw), int((sy + ch) * sh)
        crop = src.crop((x0, y0, x1, y1))
        wheel = _add_tyre(_squash_to_circle(crop))
        out.paste(wheel, (x0, y0))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)
    print(f"Wrote {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    enhance(args.src, args.out)


if __name__ == "__main__":
    main()
