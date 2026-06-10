#!/usr/bin/env python3
"""Bake Unity skinned meshes to static OBJ at default bone pose."""

from __future__ import annotations

import math
from typing import Sequence

from UnityPy.export.MeshExporter import export_mesh_obj
from UnityPy.helpers.MeshHelper import MeshHandler


def _mat_identity() -> list[list[float]]:
    return [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _mat_from_trs(pos, quat, scale) -> list[list[float]]:
    x, y, z = pos
    qx, qy, qz, qw = quat
    sx, sy, sz = scale

    xx, yy, zz = qx * qx, qy * qy, qz * qz
    xy, xz, yz = qx * qy, qx * qz, qy * qz
    wx, wy, wz = qw * qx, qw * qy, qw * qz

    m00 = (1 - 2 * (yy + zz)) * sx
    m01 = (2 * (xy - wz)) * sx
    m02 = (2 * (xz + wy)) * sx
    m10 = (2 * (xy + wz)) * sy
    m11 = (1 - 2 * (xx + zz)) * sy
    m12 = (2 * (yz - wx)) * sy
    m20 = (2 * (xz - wy)) * sz
    m21 = (2 * (yz + wx)) * sz
    m22 = (1 - 2 * (xx + yy)) * sz

    return [
        [m00, m01, m02, x],
        [m10, m11, m12, y],
        [m20, m21, m22, z],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _mat_from_unity(m) -> list[list[float]]:
    return [
        [m.e00, m.e01, m.e02, m.e03],
        [m.e10, m.e11, m.e12, m.e13],
        [m.e20, m.e21, m.e22, m.e23],
        [m.e30, m.e31, m.e32, m.e33],
    ]


def _mat_mul(a, b) -> list[list[float]]:
    out = [[0.0] * 4 for _ in range(4)]
    for i in range(4):
        for j in range(4):
            out[i][j] = sum(a[i][k] * b[k][j] for k in range(4))
    return out


def _mat_vec(m, v: Sequence[float]) -> tuple[float, float, float]:
    x, y, z = v
    ox = m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3]
    oy = m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3]
    oz = m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3]
    return ox, oy, oz


def _world_matrix(by_pid: dict, pid: int, stop_pid: int | None) -> list[list[float]]:
    m = _mat_identity()
    cur = pid
    chain: list[int] = []
    while cur and cur in by_pid:
        chain.append(cur)
        t = by_pid[cur].read()
        father = t.m_Father
        if not father:
            break
        cur = father.path_id
        if stop_pid is not None and cur == stop_pid:
            break
    chain.reverse()
    for cpid in chain:
        t = by_pid[cpid].read()
        p = t.m_LocalPosition
        r = t.m_LocalRotation
        s = t.m_LocalScale
        local = _mat_from_trs(
            (float(p.x), float(p.y), float(p.z)),
            (float(r.x), float(r.y), float(r.z), float(r.w)),
            (float(s.x), float(s.y), float(s.z)),
        )
        m = _mat_mul(m, local)
    return m


def bake_skinned_renderer(env, renderer, root_pid: int | None = None) -> str:
    mesh = renderer.m_Mesh.read()
    handler = MeshHandler(mesh)
    handler.process()

    bindposes = [_mat_from_unity(m) for m in (mesh.m_BindPose or [])]
    bones = renderer.m_Bones or []
    if not bindposes or not bones:
        return mesh.export()

    by_pid = {o.path_id: o for o in env.objects}
    bone_world = []
    for b in bones:
        bone_world.append(_world_matrix(by_pid, b.path_id, root_pid))

    if not handler.m_Vertices or not handler.m_BoneIndices or not handler.m_BoneWeights:
        return mesh.export()

    baked_verts: list[tuple[float, float, float]] = []
    for i, v in enumerate(handler.m_Vertices):
        bx = by = bz = 0.0
        indices = handler.m_BoneIndices[i]
        weights = handler.m_BoneWeights[i]
        for bi, w in zip(indices, weights):
            if w <= 1e-6 or bi >= len(bone_world):
                continue
            skin = _mat_mul(bone_world[bi], bindposes[bi])
            tx, ty, tz = _mat_vec(skin, v)
            bx += w * tx
            by += w * ty
            bz += w * tz
        baked_verts.append((bx, by, bz))

    handler.m_Vertices = baked_verts
    return export_mesh_obj(mesh)
