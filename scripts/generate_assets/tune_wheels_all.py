#!/usr/bin/env python3
"""Auto-tune wheel socket placements per chassis family."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from tune_wheels import detect_arch_centers, render, tune

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "configs" / "visual_catalog.json"
OUT = Path(__file__).parent / "output"

# (chassis_id, primary_wheel_part_id, [all_wheel_parts_to_update])
FAMILIES: list[tuple[str, str, list[str]]] = [
    (
        "LMDhDallara",
        "Hypercar18WideRear",
        ["Hypercar18WideRear", "Hypercar18Standard", "Hypercar18LowDrag"],
    ),
    (
        "GT3Spaceframe",
        "GT3Front20Rear21",
        ["GT3Front20Rear21", "GT3WideRear21"],
    ),
    (
        "Oreca07",
        "LMP2Oreca18",
        ["LMP2Oreca18"],
    ),
]


def wheel_asset_path(catalog: dict, part_id: str) -> Path | None:
    entry = catalog.get("wheel_package", {}).get(part_id)
    if not entry:
        return None
    path = ROOT / "viewer" / "public" / entry["layer"]
    if path.exists():
        return path
    # Fall back to latest hashed png for this part id
    folder = ROOT / "viewer" / "public" / "assets" / "wheel_package"
    matches = sorted(folder.glob(f"{part_id}.*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    return matches[0] if matches else None


def chassis_asset_path(catalog: dict, chassis_id: str) -> Path | None:
    entry = catalog.get("chassis", {}).get(chassis_id)
    if not entry:
        return None
    path = ROOT / "viewer" / "public" / entry["layer"]
    return path if path.exists() else None


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    for chassis_id, primary_wheel, wheel_parts in FAMILIES:
        chassis_path = chassis_asset_path(catalog, chassis_id)
        wheel_path = wheel_asset_path(catalog, primary_wheel)
        if not chassis_path or not wheel_path:
            print(f"skip {chassis_id}: missing chassis or {primary_wheel} asset")
            continue

        chassis_arr = __import__("numpy").array(Image.open(chassis_path).convert("RGBA"))
        wheel_img = Image.open(wheel_path).convert("RGBA")
        placements = tune(chassis_arr, wheel_img)

        preview = render(chassis_arr, wheel_img, placements)
        Image.fromarray(preview).save(OUT / f"tune_{chassis_id}_{primary_wheel}.png")

        for part_id in wheel_parts:
            entry = catalog.setdefault("wheel_package", {}).get(part_id)
            if not entry:
                print(f"  skip wheel catalog entry {part_id}")
                continue
            entry["socket"] = {"placements": placements}
            catalog["wheel_package"][part_id] = entry
            print(f"  tuned wheel_package.{part_id} from {chassis_id}")

    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {CATALOG}")


if __name__ == "__main__":
    main()
