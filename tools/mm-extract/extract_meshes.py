#!/usr/bin/env python3
"""Extract Motorsport Manager car meshes/textures from Unity assets."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import UnityPy

APP_ID = "415200"
CAR_NAME_RE = re.compile(
    r"(car|chassis|body|formula|f1|gp|wing|nose|floor|diffuser|"
    r"wheel|tyre|tire|cockpit|sidepod|bargeboard|halo|monocoque|"
    r"rear|front|tier|single.?seater)",
    re.I,
)
SKIP_NAME_RE = re.compile(
    r"(ui|icon|logo|sprite|shadow|placeholder|debug|collider|lod1|lod2|"
    r"particle|fx|effect|garage|hq|headquarter|building|portrait|flag|"
    r"combined mesh|ferris|caravan|safetycar|mountain|trophy|terrain|track)",
    re.I,
)
ASSET_EXTS = {
    ".assets",
    ".asset",
    ".unity3d",
    ".bundle",
    ".dat",
    ".resource",
    ".resS",
}
GAME_DIR_NAMES = ("Motorsport Manager", "MotorsportManager")
DEFAULT_GAME_CANDIDATES = (
    Path("/mnt/data/Games/steamapps/common/Motorsport Manager"),
    Path("/mnt/data/Games/steamapps/common/MotorsportManager"),
)


def parse_libraryfolders(vdf_path: Path) -> list[Path]:
    if not vdf_path.is_file():
        return []
    text = vdf_path.read_text(encoding="utf-8", errors="ignore")
    return [Path(m.group(1)) for m in re.finditer(r'"path"\s+"([^"]+)"', text)]


def library_roots() -> list[Path]:
    roots: list[Path] = []
    if extra := os.environ.get("STEAM_ROOT"):
        roots.append(Path(extra))

    home = Path.home()
    vdf_candidates = [
        home / ".steam/debian-installation/steamapps/libraryfolders.vdf",
        home / ".steam/steam/steamapps/libraryfolders.vdf",
        home / ".local/share/Steam/steamapps/libraryfolders.vdf",
        Path("/mnt/data/Games/steamapps/libraryfolders.vdf"),
    ]
    for vdf in vdf_candidates:
        roots.extend(parse_libraryfolders(vdf))

    for sub in (
        ".steam/debian-installation",
        ".steam/steam",
        ".local/share/Steam",
        "snap/steam/common/.local/share/Steam",
    ):
        roots.append(home / sub)
    roots.append(Path("/mnt/data/Games"))

    deduped: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root)
        if key not in seen:
            seen.add(key)
            deduped.append(root)
    return deduped


def game_is_ready(game_dir: Path) -> bool:
    mm_data = game_dir / "MM_Data"
    markers = (
        mm_data / "resources.assets",
        mm_data / "globalgamemanagers",
        mm_data / "level0",
    )
    return any(p.is_file() and p.stat().st_size > 0 for p in markers)


def find_game_dir(explicit: str | None, *, require_ready: bool = True) -> Path | None:
    if explicit:
        p = Path(explicit).expanduser()
        if not p.is_dir():
            return None
        if require_ready and not game_is_ready(p):
            return None
        return p

    for candidate in DEFAULT_GAME_CANDIDATES:
        if candidate.is_dir() and (not require_ready or game_is_ready(candidate)):
            return candidate

    for root in library_roots():
        common = root / "steamapps/common"
        if not common.is_dir():
            continue
        for name in GAME_DIR_NAMES:
            candidate = common / name
            if candidate.is_dir() and (not require_ready or game_is_ready(candidate)):
                return candidate
    return None


def find_workshop_dirs(steam_root: Path | None) -> list[Path]:
    if steam_root is None:
        return []
    workshop = steam_root / f"steamapps/workshop/content/{APP_ID}"
    if not workshop.is_dir():
        return []
    return sorted(p for p in workshop.iterdir() if p.is_dir())


def infer_steam_root(game_dir: Path) -> Path | None:
    parts = game_dir.resolve().parts
    for i, part in enumerate(parts):
        if part == "steamapps":
            return Path(*parts[:i])
    return None


def collect_asset_files(game_dir: Path, workshop_dirs: list[Path]) -> list[Path]:
    files: list[Path] = []
    mm_data = game_dir / "MM_Data"
    scan_roots = [mm_data, *workshop_dirs]
    for root in scan_roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            suffix = path.suffix.lower()
            if suffix in ASSET_EXTS or path.name in {
                "resources.assets",
                "sharedassets0.assets",
            }:
                files.append(path)
            elif suffix == "" and re.fullmatch(r"level\d+", path.name):
                files.append(path)
    return sorted(set(files))


def vertex_count(mesh) -> int:
    vd = getattr(mesh, "m_VertexData", None)
    if vd is not None:
        count = getattr(vd, "m_VertexCount", 0) or 0
        if count > 0:
            return int(count)
    verts = getattr(mesh, "m_Vertices", None)
    if verts:
        return len(verts)
    collision = getattr(mesh, "m_CollisionVertexCount", 0) or 0
    return int(collision)


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


def mesh_score(name: str, verts: int) -> int:
    if SKIP_NAME_RE.search(name):
        return -1
    if re.search(r"LOD[123]\b", name, re.I) and not re.search(r"LOD0\b", name, re.I):
        return -1
    if re.search(r"(HQ|Facility|RoadCar|Construction|Group|Trophy|Track)", name, re.I):
        return -1
    score = min(verts // 10, 500)
    if CAR_NAME_RE.search(name):
        score += 400
    if re.search(r"SimCar|Car_\d+_c\d+_LOD0", name, re.I):
        score += 300
    if re.search(r"LOD0\b", name, re.I):
        score += 150
    if verts < 24:
        return -1
    return score


def export_mesh(mesh, out_dir: Path) -> Path | None:
    safe = re.sub(r"[^\w.\-]+", "_", mesh.m_Name or "mesh")[:120]
    out_path = out_dir / f"{safe}.obj"
    if out_path.exists():
        return out_path
    try:
        data = mesh.export()
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] mesh export failed {mesh.m_Name}: {exc}", file=sys.stderr)
        return None
    if not isinstance(data, str) or not data.strip():
        return None
    out_path.write_text(data, newline="\n")
    return out_path


def process_file(asset_file: Path, mesh_dir: Path, tex_dir: Path) -> list[dict]:
    entries: list[dict] = []
    try:
        env = UnityPy.load(str(asset_file))
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] skip {asset_file}: {exc}", file=sys.stderr)
        return entries

    for obj in env.objects:
        try:
            if obj.type.name == "Mesh":
                mesh = obj.read()
                name = mesh.m_Name or obj.path_id
                verts = vertex_count(mesh)
                score = mesh_score(str(name), verts)
                if score < 0:
                    continue
                out = export_mesh(mesh, mesh_dir)
                if out:
                    entries.append(
                        {
                            "name": str(name),
                            "path": str(out.resolve()),
                            "vertices": verts,
                            "score": score,
                            "source": str(asset_file.resolve()),
                            "type": "mesh",
                        }
                    )
            elif obj.type.name in {"MeshRenderer", "SkinnedMeshRenderer"}:
                renderer = obj.read()
                go_name = ""
                if renderer.m_GameObject:
                    try:
                        go_name = renderer.m_GameObject.deref().peek_name()
                    except Exception:  # noqa: BLE001
                        go_name = ""
                label = go_name or obj.type.name
                score = mesh_score(label, 200)
                if score < 0:
                    continue
                target = mesh_dir / re.sub(r"[^\w.\-]+", "_", label)[:80]
                target.mkdir(parents=True, exist_ok=True)
                try:
                    renderer.export(str(target))
                except Exception as exc:  # noqa: BLE001
                    print(f"[warn] renderer export failed {label}: {exc}", file=sys.stderr)
                    continue
                for obj_path in target.rglob("*.obj"):
                    entries.append(
                        {
                            "name": obj_path.stem,
                            "path": str(obj_path.resolve()),
                            "vertices": 0,
                            "score": score,
                            "source": str(asset_file.resolve()),
                            "type": "renderer",
                        }
                    )
            elif obj.type.name == "Texture2D":
                tex = obj.read()
                name = tex.m_Name or f"tex_{obj.path_id}"
                if SKIP_NAME_RE.search(name) and not CAR_NAME_RE.search(name):
                    continue
                safe = re.sub(r"[^\w.\-]+", "_", name)[:120]
                out = tex_dir / f"{safe}.png"
                if out.exists():
                    continue
                try:
                    if not export_texture_png(tex, out):
                        continue
                    entries.append(
                        {
                            "name": str(name),
                            "path": str(out.resolve()),
                            "vertices": 0,
                            "score": 1,
                            "source": str(asset_file.resolve()),
                            "type": "texture",
                        }
                    )
                except Exception as exc:  # noqa: BLE001
                    print(f"[warn] texture export failed {name}: {exc}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] object {obj.path_id} in {asset_file.name}: {exc}", file=sys.stderr)
    return entries


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", help="MotorsportManager install folder")
    parser.add_argument(
        "--output",
        default="tmp/mm-assets",
        help="Output root (default: tmp/mm-assets)",
    )
    parser.add_argument(
        "--workshop-id",
        action="append",
        default=[],
        help="Limit to specific Steam Workshop item folder id(s)",
    )
    parser.add_argument(
        "--all-meshes",
        action="store_true",
        help="Export every mesh, not only car-like names",
    )
    parser.add_argument(
        "--allow-incomplete",
        action="store_true",
        help="Run even if Steam download is not finished (likely fails)",
    )
    args = parser.parse_args()

    global CAR_NAME_RE  # noqa: PLW0603
    if args.all_meshes:
        CAR_NAME_RE = re.compile(r".", re.I)

    game_dir = find_game_dir(args.game_dir, require_ready=not args.allow_incomplete)
    if game_dir is None:
        pending = find_game_dir(args.game_dir, require_ready=False)
        if pending and not game_is_ready(pending):
            print(
                f"Found install folder but download not ready: {pending}\n"
                "Wait for Steam to finish, or run tools/mm-extract/run.sh --wait",
                file=sys.stderr,
            )
        else:
            print(
                "Motorsport Manager not found. Install via Steam or pass --game-dir.",
                file=sys.stderr,
            )
        return 1

    steam_root = infer_steam_root(game_dir)
    workshop_dirs = find_workshop_dirs(steam_root) if steam_root else []
    if args.workshop_id:
        wanted = set(args.workshop_id)
        workshop_dirs = [p for p in workshop_dirs if p.name in wanted]

    asset_files = collect_asset_files(game_dir, workshop_dirs)
    if not asset_files:
        print("No Unity asset files found under MM_Data / workshop.", file=sys.stderr)
        return 1

    out_root = Path(args.output)
    mesh_dir = out_root / "raw" / "meshes"
    tex_dir = out_root / "raw" / "textures"
    mesh_dir.mkdir(parents=True, exist_ok=True)
    tex_dir.mkdir(parents=True, exist_ok=True)

    print(f"Game: {game_dir}")
    print(f"Workshop mods: {len(workshop_dirs)}")
    print(f"Asset files: {len(asset_files)}")
    print(f"Output: {out_root.resolve()}")

    manifest: list[dict] = []
    for i, asset_file in enumerate(asset_files, 1):
        if i % 25 == 0 or i == len(asset_files):
            print(f"  scanning {i}/{len(asset_files)} …")
        manifest.extend(process_file(asset_file, mesh_dir, tex_dir))

    meshes = [m for m in manifest if m["type"] in {"mesh", "renderer"}]
    meshes.sort(key=lambda m: m["score"], reverse=True)
    manifest_path = out_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(f"Exported {len(meshes)} meshes, {len(manifest) - len(meshes)} textures")
    if meshes:
        print("Top meshes:")
        for row in meshes[:12]:
            print(f"  {row['score']:4d}  {row['name']}")
    else:
        print("No car-like meshes found. Try --all-meshes or subscribe to a Workshop car mod.")
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
