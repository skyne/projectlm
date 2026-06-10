#!/usr/bin/env python3
"""Export assembled MM race-car prefabs with transforms + textures."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import UnityPy

from skinned_bake import bake_skinned_renderer

CARS = {
    "lmp": {
        "root": "SimCarEndurance",
        "body_go": "Mesh",
        "body_mode": "skinned",
        "body_filter": lambda v: v == 1052,
        "include_wheels": False,
        "textures": {
            "body": ["LiveryBase.png", "LiveryDetail.png", "SimCarEndurance_01_MASK.png"],
        },
    },
    "gt": {
        "root": "SimCarGT",
        "body_go": "SimCarGT_LOD0",
        "body_mode": "filter",
        "include_wheels": True,
        "wheel_parent": "Wheels",
        "textures": {
            "body": ["LiveryBase.png", "LiveryDetail.png", "SimCarGT_01_MASK.png"],
            "wheel": ["Wheel_01_Endurance_01_AlbedoTransparency.png"],
        },
    },
    "formula": {
        "root": "SimCar_01",
        "root_child_hint": "Wheels",
        "body_go": "SimCar_01_LOD0",
        "body_mode": "filter",
        "include_wheels": True,
        "wheel_parent": "Wheels",
        "textures": {
            "body": ["SimCar_01_CLR.png"],
            "wheel": ["Wheel_02_c001_CLR.png"],
        },
    },
}

WHEEL_NAMES = ("FL_Wheel", "FR_Wheel", "RL_Wheel", "RR_Wheel")


def export_texture_png(tex, out: Path) -> bool:
    image = tex.image
    try:
        if hasattr(image, "save"):
            image.save(out)
            return True
        out.write_bytes(image)
        return True
    except Exception:  # noqa: BLE001
        return False


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def quat_rotate(q, v):
    x, y, z = v
    qx, qy, qz, qw = q
    ix = qw * x + qy * z - qz * y
    iy = qw * y + qz * x - qx * z
    iz = qw * z + qx * y - qy * x
    iw = -qx * x - qy * y - qz * z
    return (
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx,
    )


class TransformNode:
    def __init__(self, path_id: int, name: str, parent: "TransformNode | None", t):
        self.path_id = path_id
        self.name = name
        self.parent = parent
        p = t.m_LocalPosition
        r = t.m_LocalRotation
        s = t.m_LocalScale
        self.local_position = [float(p.x), float(p.y), float(p.z)]
        self.local_rotation = [float(r.x), float(r.y), float(r.z), float(r.w)]
        self.local_scale = [float(s.x), float(s.y), float(s.z)]
        self.children: list[TransformNode] = []

    def world_pose(self) -> tuple[list[float], list[float], list[float]]:
        if self.parent is None:
            return list(self.local_position), list(self.local_rotation), list(self.local_scale)
        pos, rot, scl = self.parent.world_pose()
        lp = self.local_position
        lr = self.local_rotation
        ls = self.local_scale
        scaled = (lp[0] * scl[0], lp[1] * scl[1], lp[2] * scl[2])
        rotated = quat_rotate(rot, scaled)
        world_pos = [pos[i] + rotated[i] for i in range(3)]
        world_rot = quat_mul(rot, lr)
        world_scl = [scl[i] * ls[i] for i in range(3)]
        return world_pos, world_rot, world_scl

    def find(self, name: str) -> "TransformNode | None":
        if self.name == name:
            return self
        for ch in self.children:
            hit = ch.find(name)
            if hit:
                return hit
        return None

    def find_child(self, name: str) -> "TransformNode | None":
        for ch in self.children:
            if ch.name == name:
                return ch
        return None


def go_name_from_transform(t) -> str:
    go = t.m_GameObject
    return go.read().m_Name if hasattr(go, "read") else go.deref().read().m_Name


def build_tree(env) -> dict[int, TransformNode]:
    by_pid: dict[int, TransformNode] = {}
    pending: list[tuple[int, object]] = []
    for o in env.objects:
        if o.type.name != "Transform":
            continue
        t = o.read()
        pending.append((o.path_id, t))

    for pid, t in pending:
        by_pid[pid] = TransformNode(pid, go_name_from_transform(t), None, t)

    for pid, t in pending:
        node = by_pid[pid]
        father = t.m_Father
        if father:
            try:
                fpid = father.path_id
                node.parent = by_pid.get(fpid)
            except Exception:  # noqa: BLE001
                pass

    for node in by_pid.values():
        if node.parent:
            node.parent.children.append(node)

    return by_pid


def find_root(by_pid: dict[int, TransformNode], root_name: str, child_hint: str | None) -> TransformNode:
    candidates = [n for n in by_pid.values() if n.name == root_name and n.parent is not None]
    if child_hint:
        hinted = [n for n in candidates if n.find_child(child_hint)]
        if hinted:
            candidates = hinted
    if not candidates:
        raise SystemExit(f"Root not found: {root_name}")
    # Prefer shallowest (closest to scene root)
    candidates.sort(key=lambda n: sum(1 for _ in walk_up(n)))
    return candidates[0]


def walk_up(node: TransformNode):
    cur = node
    while cur:
        yield cur
        cur = cur.parent


def mesh_from_go(env, go_name: str) -> tuple[object, str] | None:
    for o in env.objects:
        if o.type.name != "MeshFilter":
            continue
        mf = o.read()
        if mf.m_GameObject.read().m_Name != go_name:
            continue
        mesh = mf.m_Mesh.read()
        return mesh, mesh.m_Name
    return None


def skinned_renderer(env, go_name: str, filt=None) -> object | None:
    for o in env.objects:
        if o.type.name != "SkinnedMeshRenderer":
            continue
        r = o.read()
        if r.m_GameObject.read().m_Name != go_name:
            continue
        if not r.m_Mesh:
            continue
        mesh = r.m_Mesh.read()
        verts = mesh.m_VertexData.m_VertexCount if mesh.m_VertexData else 0
        if filt and not filt(verts):
            continue
        return r
    return None


def resolve_textures(tex_dir: Path, names: list[str]) -> list[str]:
    paths: list[str] = []
    for name in names:
        p = tex_dir / name
        if p.is_file():
            paths.append(str(p.resolve()))
        else:
            print(f"[warn] missing texture {name}", file=sys.stderr)
    return paths


def export_car(env, spec: dict, out_dir: Path, tex_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    by_pid = build_tree(env)
    root = find_root(by_pid, spec["root"], spec.get("root_child_hint"))

    body_node = root.find(spec["body_go"])
    if body_node is None:
        raise SystemExit(f"Body transform not under {spec['root']}: {spec['body_go']}")

    body_path = out_dir / "body.obj"
    if spec["body_mode"] == "skinned":
        filt = spec.get("body_filter")
        renderer = skinned_renderer(env, spec["body_go"], filt)
        if renderer is None:
            raise SystemExit(f"Skinned body not found for {spec['body_go']}")
        body_path.write_text(
            bake_skinned_renderer(env, renderer, root.path_id), newline="\n"
        )
    else:
        found = mesh_from_go(env, spec["body_go"])
        if not found:
            raise SystemExit(f"Body mesh not found for {spec['body_go']}")
        body_mesh, _ = found
        body_path.write_text(body_mesh.export(), newline="\n")
    bpos, brot, bscl = body_node.world_pose()

    parts: list[dict] = [
        {
            "name": "body",
            "mesh": str(body_path.resolve()),
            "game_object": spec["body_go"],
            "position": bpos,
            "rotation": brot,
            "scale": bscl,
            "textures": resolve_textures(tex_dir, spec["textures"]["body"]),
        }
    ]

    if spec.get("include_wheels"):
        wheels_parent = root.find_child(spec.get("wheel_parent", "Wheels"))
        if wheels_parent is None:
            raise SystemExit(f"Wheels parent missing under {spec['root']}")

        wheel_found = mesh_from_go(env, "FL_Wheel")
        if not wheel_found:
            raise SystemExit("Wheel mesh FL_Wheel not found")
        wheel_mesh, _ = wheel_found
        wheel_path = out_dir / "wheel.obj"
        wheel_path.write_text(wheel_mesh.export(), newline="\n")
        wheel_tex = resolve_textures(tex_dir, spec["textures"]["wheel"])

        for wname in WHEEL_NAMES:
            wnode = wheels_parent.find_child(wname)
            if wnode is None:
                print(f"[warn] wheel node missing: {wname}", file=sys.stderr)
                continue
            wpos, wrot, wscl = wnode.world_pose()
            parts.append(
                {
                    "name": wname,
                    "mesh": str(wheel_path.resolve()),
                    "game_object": wname,
                    "position": wpos,
                    "rotation": wrot,
                    "scale": wscl,
                    "textures": wheel_tex,
                }
            )

    assembly = {
        "root": spec["root"],
        "coordinate_system": "unity",
        "parts": parts,
    }
    (out_dir / "assembly.json").write_text(json.dumps(assembly, indent=2))
    return assembly


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", required=True)
    parser.add_argument("--car", choices=tuple(CARS), required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--textures", required=True)
    args = parser.parse_args()

    assets = Path(args.game_dir) / "MM_Data" / "resources.assets"
    if not assets.is_file():
        print(f"Missing {assets}", file=sys.stderr)
        return 1

    env = UnityPy.load(str(assets))
    export_car(env, CARS[args.car], Path(args.output), Path(args.textures))
    print(f"Exported {args.car} assembly to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
