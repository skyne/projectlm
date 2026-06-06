#!/usr/bin/env python3
"""Composite catalog layers into an assembly preview PNG."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "configs" / "visual_catalog.json"
ASSEMBLY = ROOT / "configs" / "visual_assembly.json"
OUT = Path(__file__).parent / "output" / "assembly_preview.png"


def resolve_chassis_id(build: dict, assembly: dict) -> str:
    aliases = assembly.get("chassisAliases", {})
    raw = build.get("chassis_type", "LMDhDallara")
    return aliases.get(raw, raw)


BUILD_KEYS = {
    "chassis": "chassis_type",
    "front_aero": "front_aero_type",
    "rear_aero": "rear_aero_type",
    "wheel_package": "wheel_package",
    "hybrid_system": "hybrid_system",
}


def layer_entries(build: dict, catalog: dict, assembly: dict) -> list[tuple[int, str]]:
    chassis_id = resolve_chassis_id(build, assembly)
    order = assembly.get("layerOrder", [])
    layers: list[tuple[int, str]] = []

    for rule in order:
        slot = rule["slot"]
        z = int(rule["z"])
        if slot == "chassis":
            entry = catalog.get("chassis", {}).get(chassis_id)
            if entry:
                layers.append((z, entry["layer"]))
            continue

        key = BUILD_KEYS.get(slot, f"{slot}_type")
        part_id = build.get(key)
        if not part_id:
            continue
        if part_id in rule.get("skip", []):
            continue
        only = rule.get("only")
        if only and part_id not in only:
            continue
        except_list = rule.get("except", [])
        if except_list and part_id in except_list:
            continue

        entry = catalog.get(slot, {}).get(part_id)
        if entry:
            layers.append((int(entry.get("z", z)), entry["layer"]))

    layers.sort(key=lambda t: t[0])
    return layers


def compose(build: dict, out_path: Path) -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    assembly = json.loads(ASSEMBLY.read_text(encoding="utf-8"))
    canvas = assembly.get("canvas", {})
    w = int(canvas.get("width", 1344))
    h = int(canvas.get("height", 576))

    def find_entry(rel: str) -> dict | None:
        for bucket in catalog.values():
            if not isinstance(bucket, dict):
                continue
            for entry in bucket.values():
                if isinstance(entry, dict) and entry.get("layer") == rel:
                    return entry
        return None

    base = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for z, rel in layer_entries(build, catalog, assembly):
        path = ROOT / "viewer" / "public" / rel
        if not path.exists():
            print(f"  skip missing z={z}: {rel}")
            continue
        layer_img = Image.open(path).convert("RGBA")
        meta = find_entry(rel) or {}
        if meta.get("layerType") == "sprite" and meta.get("socket"):
            sock = meta["socket"]
            iw, ih = layer_img.size
            if sock.get("placements"):
                for p in sock["placements"]:
                    draw_w = int((p.get("w") or 0.11) * w)
                    draw_h = int((p.get("h") or 0.2) * h)
                    dest_x = int(p["cx"] * w - p["sx"] * draw_w)
                    dest_y = int(p["cy"] * h - p["sy"] * draw_h)
                    src = p.get("src") or {"x": 0, "y": 0, "w": 1, "h": 1}
                    crop = layer_img.crop(
                        (
                            int(src["x"] * iw),
                            int(src["y"] * ih),
                            int((src["x"] + src["w"]) * iw),
                            int((src["y"] + src["h"]) * ih),
                        )
                    )
                    sprite = crop.resize((draw_w, draw_h), Image.Resampling.LANCZOS)
                    tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                    tmp.paste(sprite, (dest_x, dest_y), sprite)
                    base.alpha_composite(tmp)
            elif sock.get("fit") and len(sock["fit"]) >= 2:
                a, b = sock["fit"][0], sock["fit"][1]
                span_s = b["sx"] - a["sx"]
                draw_w = int((b["cx"] - a["cx"]) * w / span_s)
                draw_h = int(draw_w * ih / iw)
                sc = float(sock.get("scale") or 1)
                draw_w = int(draw_w * sc)
                draw_h = int(draw_h * sc)
                dest_x = int(a["cx"] * w - a["sx"] * draw_w)
                dest_y = int(a["cy"] * h - a["sy"] * draw_h)
                sprite = layer_img.resize((draw_w, draw_h), Image.Resampling.LANCZOS)
                tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                tmp.paste(sprite, (dest_x, dest_y), sprite)
                base.alpha_composite(tmp)
            elif sock.get("anchor"):
                an = sock["anchor"]
                draw_w = int((sock.get("w") or 0.2) * w)
                draw_h = int((sock.get("h") or 0.25) * h)
                dest_x = int(an["cx"] * w - an["sx"] * draw_w)
                dest_y = int(an["cy"] * h - an["sy"] * draw_h)
                sprite = layer_img.resize((draw_w, draw_h), Image.Resampling.LANCZOS)
                tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                tmp.paste(sprite, (dest_x, dest_y), sprite)
                base.alpha_composite(tmp)
            else:
                draw_w = int(sock["w"] * w)
                draw_h = int(sock["h"] * h)
                dest_x = int(sock["x"] * w)
                dest_y = int(sock["y"] * h)
                sprite = layer_img.resize((draw_w, draw_h), Image.Resampling.LANCZOS)
                tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                tmp.paste(sprite, (dest_x, dest_y), sprite)
                base.alpha_composite(tmp)
        else:
            if layer_img.size != (w, h):
                fitted = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                scale = min(w / layer_img.width, h / layer_img.height)
                nw, nh = int(layer_img.width * scale), int(layer_img.height * scale)
                resized = layer_img.resize((nw, nh), Image.Resampling.LANCZOS)
                fitted.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
                layer_img = fitted
            base.alpha_composite(layer_img)
        print(f"  + z={z} {rel}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    base.save(out_path)
    print(f"Wrote {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--build", type=str, default="", help='JSON build e.g. {"chassis_type":"LMDhDallara",...}')
    args = parser.parse_args()

    default_build = {
        "chassis_type": "LMDhDallara",
        "front_aero_type": "LowDragNose",
        "rear_aero_type": "HighDownforceWing",
        "wheel_package": "Hypercar18WideRear",
        "hybrid_system": "LMDh500kW",
    }
    build = json.loads(args.build) if args.build else default_build
    compose(build, args.out)


if __name__ == "__main__":
    main()
