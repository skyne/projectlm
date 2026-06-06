#!/usr/bin/env python3
"""Tune wheel cx/cy by maximizing rim overlap with chassis arch interiors."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "configs" / "visual_catalog.json"
CHASSIS = ROOT / "viewer/public/assets/chassis/LMDhDallara.a345eb01.png"
WHEEL = ROOT / "viewer/public/assets/wheel_package/Hypercar18WideRear.42508881.png"
OUT = Path(__file__).parent / "output"
def circ_w(h_frac: float) -> float:
    """Match dest pixel aspect so wheels render circular on the canvas."""
    return round(h_frac * 576 / 1344, 4)


BASE_FRONT = {
    "sx": 0.414,
    "sy": 0.503,
    "h": 0.20,
    "w": circ_w(0.20),
    "src": {"x": 0, "y": 0, "w": 0.48, "h": 1},
}
BASE_REAR = {
    "sx": 0.568,
    "sy": 0.496,
    "h": 0.15,
    "w": circ_w(0.15),
    "src": {"x": 0.52, "y": 0, "w": 0.48, "h": 1},
}


def detect_arch_centers(chassis_path: Path) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    """Return ((front cx,cy,h), (rear cx,cy,h)) from chassis arch gray pixels."""
    arr = np.array(Image.open(chassis_path).convert("RGBA"))
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].sum(axis=2)
    alpha = arr[:, :, 3]
    arch = (alpha > 200) & (rgb > 90) & (rgb < 150)

    def blob(x0f: float, x1f: float, y0f: float, y1f: float) -> tuple[float, float, float]:
        band = arch[int(y0f * h) : int(y1f * h), int(x0f * w) : int(x1f * w)]
        ys, xs = np.where(band)
        if len(xs) < 100:
            raise RuntimeError(f"arch blob not found in x=[{x0f},{x1f}]")
        cx = (xs.min() + xs.max()) / 2 / w + x0f
        cy = (ys.min() + ys.max()) / 2 / h + y0f
        ah = (ys.max() - ys.min() + 1) / h
        return float(cx), float(cy), float(ah)

    front = blob(0.14, 0.36, 0.52, 0.72)
    rear = blob(0.68, 0.82, 0.55, 0.70)
    return front, rear


def arch_mask(chassis_arr: np.ndarray) -> np.ndarray:
    rgb = chassis_arr[:, :, :3].sum(axis=2)
    return (chassis_arr[:, :, 3] > 200) & (rgb > 90) & (rgb < 150)


def render(chassis_arr: np.ndarray, wheel_img: Image.Image, placements: list[dict]) -> np.ndarray:
    h, w = chassis_arr.shape[:2]
    iw, ih = wheel_img.size
    base = Image.fromarray(chassis_arr.copy())
    for p in placements:
        src = p["src"]
        dw, dh = int(p["w"] * w), int(p["h"] * h)
        dx = int(p["cx"] * w - p["sx"] * dw)
        dy = int(p["cy"] * h - p["sy"] * dh)
        crop = wheel_img.crop(
            (
                int(src["x"] * iw),
                int(src["y"] * ih),
                int((src["x"] + src["w"]) * iw),
                int((src["y"] + src["h"]) * ih),
            )
        )
        sprite = crop.resize((dw, dh), Image.Resampling.LANCZOS)
        tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        tmp.paste(sprite, (dx, dy), sprite)
        base = Image.alpha_composite(base, tmp)
    return np.array(base)


def overlap_score(img: np.ndarray, mask: np.ndarray) -> int:
    rim = (img[:, :, 3] > 120) & (img[:, :, :3].sum(axis=2) > 70) & (img[:, :, :3].sum(axis=2) < 520)
    return int((rim & mask).sum())


def tune(chassis_arr: np.ndarray, wheel_img: Image.Image) -> list[dict]:
    (fcx, fcy, fh), (rcx, rcy, rh) = detect_arch_centers(CHASSIS)
    # Fill arches: use ~1.7× arch height so wheels aren't tiny; rear hub shifted right.
    hf = round(max(fh, rh) * 1.7, 3)
    return [
        {**BASE_FRONT, "cx": round(fcx, 4), "cy": round(fcy, 4), "h": hf, "w": circ_w(hf)},
        {**BASE_REAR, "cx": round(rcx + 0.032, 4), "cy": round(rcy, 4), "h": hf, "w": circ_w(hf), "sx": 0.42},
    ]


def main() -> None:
    chassis_arr = np.array(Image.open(CHASSIS).convert("RGBA"))
    wheel_img = Image.open(WHEEL).convert("RGBA")
    placements = tune(chassis_arr, wheel_img)

    preview = render(chassis_arr, wheel_img, placements)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(preview).save(OUT / "tune_auto.png")

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog["chassis"]["LMDhDallara"]["layer"] = "assets/chassis/LMDhDallara.a345eb01.png"
    catalog["wheel_package"]["Hypercar18WideRear"]["socket"]["placements"] = placements
    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {CATALOG}")
    print(f"Wrote {OUT / 'tune_auto.png'}")


if __name__ == "__main__":
    main()
