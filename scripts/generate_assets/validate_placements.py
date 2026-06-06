#!/usr/bin/env python3
"""Validate sprite socket placements — fails if crops are empty or off-canvas."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "configs" / "visual_catalog.json"
ASSEMBLY = ROOT / "configs" / "visual_assembly.json"
ASSETS = ROOT / "viewer" / "public"
MIN_CROP_PIXELS = 500


def resolve_draw_op(
    placement: dict,
    img_w: int,
    img_h: int,
    canvas_w: int,
    canvas_h: int,
) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int], int]:
    src = placement.get("src") or {"x": 0, "y": 0, "w": 1, "h": 1}
    draw_w = int((placement.get("w") or 0.11) * canvas_w)
    draw_h = int((placement.get("h") or 0.2) * canvas_h)
    dest_x = int(placement["cx"] * canvas_w - placement["sx"] * draw_w)
    dest_y = int(placement["cy"] * canvas_h - placement["sy"] * draw_h)
    crop_box = (
        int(src["x"] * img_w),
        int(src["y"] * img_h),
        int((src["x"] + src["w"]) * img_w),
        int((src["y"] + src["h"]) * img_h),
    )
    return (dest_x, dest_y, draw_w, draw_h), crop_box, draw_w * draw_h


def alpha_pixels(path: Path, crop_box: tuple[int, int, int, int]) -> int:
    img = Image.open(path).convert("RGBA")
    crop = img.crop(crop_box)
    return sum(1 for _, _, _, a in crop.getdata() if a > 10)


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    assembly = json.loads(ASSEMBLY.read_text(encoding="utf-8"))
    canvas = assembly["canvas"]
    cw, ch = int(canvas["width"]), int(canvas["height"])

    errors: list[str] = []
    checked = 0

    for bucket_name, bucket in catalog.items():
        if not isinstance(bucket, dict):
            continue
        for part_id, entry in bucket.items():
            if not isinstance(entry, dict):
                continue
            if entry.get("layerType") != "sprite":
                continue
            socket = entry.get("socket")
            if not socket:
                continue

            layer_path = ASSETS / entry["layer"]
            if not layer_path.exists():
                errors.append(f"{bucket_name}.{part_id}: missing asset {layer_path}")
                continue

            img = Image.open(layer_path)
            iw, ih = img.size

            placements = socket.get("placements")
            if placements:
                for i, p in enumerate(placements):
                    checked += 1
                    dest, crop_box, _ = resolve_draw_op(p, iw, ih, cw, ch)
                    dx, dy, dw, dh = dest
                    if dx + dw < 0 or dy + dh < 0 or dx > cw or dy > ch:
                        errors.append(
                            f"{bucket_name}.{part_id}[{i}]: placement off canvas {dest}"
                        )
                    pixels = alpha_pixels(layer_path, crop_box)
                    if pixels < MIN_CROP_PIXELS:
                        errors.append(
                            f"{bucket_name}.{part_id}[{i}]: crop {crop_box} has only "
                            f"{pixels} visible pixels (need >={MIN_CROP_PIXELS})"
                        )
                    dx, dy, dw, dh = dest
                    if abs(dw - dh) > 2:
                        errors.append(
                            f"{bucket_name}.{part_id}[{i}]: wheel dest {dw}x{dh}px "
                            f"is not square — use w = h * {canvas['height']}/{canvas['width']}"
                        )
            elif socket.get("anchor") or socket.get("fit"):
                checked += 1
                # Single-anchor sprites use full image
                pixels = sum(
                    1 for _, _, _, a in Image.open(layer_path).convert("RGBA").getdata() if a > 10
                )
                if pixels < MIN_CROP_PIXELS:
                    errors.append(
                        f"{bucket_name}.{part_id}: sprite has only {pixels} visible pixels"
                    )

    if errors:
        print("PLACEMENT VALIDATION FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(f"OK: validated {checked} sprite placement(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
