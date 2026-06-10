#!/usr/bin/env python3
"""Blender headless: merge extracted OBJ meshes into one GLB prototype."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy  # type: ignore

PRESETS: dict[str, dict] = {
    "simcar": {
        "parts": (
            "SimCar_01_LOD0",
            "FrontWing",
            "RearWing_02_c001",
            "Wheel_01_c001",
            "Wheel_02_c001",
            "SteeringWheel",
        ),
        "length": 4.6,
        "color": (0.72, 0.08, 0.08, 1.0),
    },
    "gt": {
        "parts": ("SimCarGT_LOD0",),
        "length": 4.85,
        "color": (0.12, 0.38, 0.88, 1.0),
    },
    "lmp": {
        "parts": (
            "Car_05_c001_LOD0",
            "FrontWing",
            "RearWing_02_c001",
            "Wheel_01_c001",
            "Wheel_02_c001",
        ),
        "length": 4.95,
        "color": (0.08, 0.62, 0.58, 1.0),
    },
}


def parse_args() -> argparse.Namespace:
    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1 :]
    else:
        argv = sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-parts", type=int, default=16)
    parser.add_argument("--target-length", type=float, default=None)
    parser.add_argument(
        "--preset",
        choices=(*PRESETS.keys(), "auto"),
        default="simcar",
    )
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def import_obj(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    try:
        bpy.ops.wm.obj_import(filepath=str(path))
    except AttributeError:
        bpy.ops.import_scene.obj(filepath=str(path))
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def join_meshes(objects: list[bpy.types.Object]) -> bpy.types.Object | None:
    meshes = [o for o in objects if o.type == "MESH"]
    if not meshes:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def normalize_scale(obj: bpy.types.Object, target_length: float) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    dims = obj.dimensions
    length = max(dims.x, dims.y, dims.z)
    if length <= 1e-6:
        return
    factor = target_length / length
    obj.scale = (factor, factor, factor)
    bpy.ops.object.transform_apply(scale=True)
    obj.location = (0.0, 0.0, 0.0)


def pick_preset_parts(meshes: list[dict], preset: str) -> list[Path]:
    spec = PRESETS[preset]
    by_name = {m.get("name"): m for m in meshes}
    picked: list[Path] = []
    for part in spec["parts"]:
        row = by_name.get(part)
        if not row:
            print(f"[warn] missing part for {preset}: {part}")
            continue
        path = Path(row["path"])
        if path.is_file():
            picked.append(path)
    return picked


def pick_auto_parts(meshes: list[dict], max_parts: int) -> list[Path]:
    prefer = (
        "simcar_01_lod0",
        "body",
        "frontwing",
        "rearwing",
        "chassis_geo",
        "wheel_01_c001",
    )

    def rank(row: dict) -> tuple[int, int]:
        name = row.get("name", "").lower()
        source = row.get("source", "").lower()
        bonus = 500 if "resources.assets" in source else 0
        if any(p in name for p in prefer):
            bonus += 800
        if "combined mesh" in name or "ferris" in name or "caravan" in name:
            bonus -= 5000
        return (bonus + row.get("score", 0), row.get("vertices", 0))

    meshes.sort(key=rank, reverse=True)
    picked: list[Path] = []
    seen: set[str] = set()
    for row in meshes:
        name = row.get("name", "")
        if name in seen:
            continue
        path = Path(row["path"])
        if not path.is_file():
            continue
        seen.add(name)
        picked.append(path)
        if len(picked) >= max_parts:
            break
    return picked


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text())
    meshes = [m for m in manifest if m.get("type") in {"mesh", "renderer"}]

    if args.preset in PRESETS:
        picked_paths = pick_preset_parts(meshes, args.preset)
        spec = PRESETS[args.preset]
        target_length = args.target_length or spec["length"]
        color = spec["color"]
        print(f"{args.preset} preset: {len(picked_paths)} parts")
    else:
        picked_paths = pick_auto_parts(meshes, args.max_parts)
        target_length = args.target_length or 4.6
        color = (0.72, 0.08, 0.08, 1.0)

    if not picked_paths:
        raise SystemExit("No mesh files to merge")

    clear_scene()
    imported: list[bpy.types.Object] = []
    for path in picked_paths:
        imported.extend(import_obj(path))

    merged = join_meshes(imported)
    if merged is None:
        raise SystemExit("Import produced no meshes")

    normalize_scale(merged, target_length)

    mat = bpy.data.materials.new(name="MMPrototype")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = 0.45
    merged.data.materials.append(mat)

    bpy.ops.object.select_all(action="DESELECT")
    merged.select_set(True)
    bpy.context.view_layer.objects.active = merged

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
    )
    print(f"Wrote {output_path} from {len(picked_paths)} parts")


if __name__ == "__main__":
    main()
