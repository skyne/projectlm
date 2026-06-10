#!/usr/bin/env python3
"""Blender: assemble exported car parts with transforms and game textures."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy  # type: ignore
from mathutils import Vector  # type: ignore

# Unity meshes are Y-up with length mostly on +Z; Blender is Z-up with length on +Y.
UNITY_IMPORT_ROT_X = math.radians(-90.0)


def parse_args() -> argparse.Namespace:
    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1 :]
    else:
        argv = sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--assembly", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--target-length", type=float, default=4.9)
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.images:
        bpy.data.images.remove(block)


def import_obj(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    try:
        bpy.ops.wm.obj_import(filepath=str(path))
    except AttributeError:
        bpy.ops.import_scene.obj(filepath=str(path))
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def apply_texture(obj: bpy.types.Object, texture_paths: list[str]) -> None:
    paths = [p for p in texture_paths if Path(p).is_file()]
    if not paths:
        return

    mat = bpy.data.materials.new(name=f"{obj.name}_mat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(paths[0], check_existing=True)
    if base.image:
        base.image.colorspace_settings.name = "sRGB"
    base_val = base.outputs["Color"]

    if len(paths) > 1:
        detail = nodes.new("ShaderNodeTexImage")
        detail.image = bpy.data.images.load(paths[1], check_existing=True)
        if detail.image:
            detail.image.colorspace_settings.name = "sRGB"
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 0.65
        links.new(base_val, mix.inputs["A"])
        links.new(detail.outputs["Color"], mix.inputs["B"])
        base_val = mix.outputs["Result"]

    if len(paths) > 2:
        mask = nodes.new("ShaderNodeTexImage")
        mask.image = bpy.data.images.load(paths[2], check_existing=True)
        if mask.image:
            mask.image.colorspace_settings.name = "Non-Color"
        links.new(mask.outputs["Color"], bsdf.inputs["Alpha"])

    links.new(base_val, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.45

    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def normalize_scene(root: bpy.types.Object, target_length: float) -> None:
    bpy.context.view_layer.update()
    min_co = Vector((math.inf, math.inf, math.inf))
    max_co = Vector((-math.inf, -math.inf, -math.inf))
    for obj in [root, *root.children]:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            min_co.x = min(min_co.x, world.x)
            min_co.y = min(min_co.y, world.y)
            min_co.z = min(min_co.z, world.z)
            max_co.x = max(max_co.x, world.x)
            max_co.y = max(max_co.y, world.y)
            max_co.z = max(max_co.z, world.z)

    size = max_co - min_co
    length = max(size.x, size.y, size.z)
    if length <= 1e-6:
        return
    factor = target_length / length
    center = (min_co + max_co) / 2.0
    root.location = -center * factor
    root.scale = (factor, factor, factor)


def main() -> None:
    args = parse_args()
    assembly = json.loads(Path(args.assembly).read_text())
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()

    root = bpy.data.objects.new("CarRoot", None)
    bpy.context.collection.objects.link(root)
    root.rotation_euler = (UNITY_IMPORT_ROT_X, 0.0, 0.0)

    imported: list[bpy.types.Object] = []
    for part in assembly["parts"]:
        path = Path(part["mesh"])
        objs = import_obj(path)
        if not objs:
            continue
        obj = objs[0]
        obj.name = part["name"]
        obj.parent = root

        pos = part["position"]
        obj.location = (float(pos[0]), float(pos[1]), float(pos[2]))

        rot = part["rotation"]
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = (float(rot[3]), float(rot[0]), float(rot[1]), float(rot[2]))

        scl = part.get("scale", [1, 1, 1])
        obj.scale = (float(scl[0]), float(scl[1]), float(scl[2]))

        apply_texture(obj, part.get("textures", []))
        imported.append(obj)

    if not imported:
        raise SystemExit("No parts imported")

    normalize_scene(root, args.target_length)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in imported:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    print(f"Wrote {output_path} ({len(imported)} parts)")


if __name__ == "__main__":
    main()
