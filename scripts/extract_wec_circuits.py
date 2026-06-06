#!/usr/bin/env python3
"""Extract WEC circuit geometry from Wikimedia SVG layout maps.

Reuses the polyline-first pipeline from extract_lemans_circuit.py:
  SVG path → dense polyline → world coordinates → track JSON

Download SVGs first (or let --fetch grab them from Wikimedia).
"""

from __future__ import annotations

import argparse
import json
import math
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKS_DIR = ROOT / "tracks"
MAX_POLYLINE_POINTS = 1500

# Wikimedia file title → local SVG filename, geometry path id, lap length
WEC_CIRCUITS: list[dict] = [
    {
        "track_id": "paul_ricard",
        "name": "Circuit Paul Ricard",
        "wikimedia_file": "Circuit Paul Ricard 2020 layout map.svg",
        "local_svg": "paul_ricard_wikimedia.svg",
        "path_id": "circuit",
        "lap_m": 5842.0,
        "compound_longest": True,
    },
    {
        "track_id": "imola",
        "name": "Autodromo Enzo e Dino Ferrari",
        "wikimedia_file": "Imola 2009.svg",
        "local_svg": "imola_wikimedia.svg",
        "path_id": "path2582",
        "lap_m": 4909.0,
    },
    {
        "track_id": "spa",
        "name": "Circuit de Spa-Francorchamps",
        "wikimedia_file": "Spa-Francorchamps of Belgium.svg",
        "local_svg": "spa_wikimedia.svg",
        "path_id": "path2840",
        "lap_m": 7004.0,
    },
    # Le Mans uses scripts/extract_lemans_circuit.py (detailed labels + sectors).
    {
        "track_id": "sao_paulo",
        "name": "Autódromo José Carlos Pace",
        "wikimedia_file": "2014 Interlagos circuit map.svg",
        "local_svg": "sao_paulo_wikimedia.svg",
        "path_id": "path5074",
        "lap_m": 4309.0,
    },
    {
        "track_id": "cota",
        "name": "Circuit of the Americas",
        "wikimedia_file": "Austin Formula One circuit.svg",
        "local_svg": "cota_wikimedia.svg",
        "path_id": "path2857",
        "lap_m": 5513.0,
    },
    {
        "track_id": "fuji",
        "name": "Fuji Speedway",
        "wikimedia_file": "Circuit Fuji.svg",
        "local_svg": "fuji_wikimedia.svg",
        "path_id": "path2237",
        "lap_m": 4563.0,
    },
    {
        "track_id": "losail",
        "name": "Lusail International Circuit",
        "wikimedia_file": "Lusail International Circuit 2023.svg",
        "local_svg": "losail_wikimedia.svg",
        "path_id": "path2406",
        "lap_m": 5380.0,
    },
    {
        "track_id": "bahrain",
        "name": "Bahrain International Circuit",
        "wikimedia_file": "Bahrain International Circuit--Grand Prix Layout with DRS.svg",
        "local_svg": "bahrain_wikimedia.svg",
        "path_id": "path4003",
        "lap_m": 5412.0,
    },
]


def tokenize_path(d: str) -> list:
    return re.findall(
        r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?",
        d,
    )


def sample_cubic(p0, p1, p2, p3, steps: int = 12):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = (
            u * u * u * p0[0]
            + 3 * u * u * t * p1[0]
            + 3 * u * t * t * p2[0]
            + t * t * t * p3[0]
        )
        y = (
            u * u * u * p0[1]
            + 3 * u * u * t * p1[1]
            + 3 * u * t * t * p2[1]
            + t * t * t * p3[1]
        )
        pts.append((x, y))
    return pts


def cubic_steps(p0, p1, p2, p3, base_steps: int) -> int:
    chord = math.hypot(p3[0] - p0[0], p3[1] - p0[1])
    return max(base_steps, int(chord / 3) + 1)


def sample_path(d: str, curve_steps: int = 20) -> list[tuple[float, float]]:
    tokens = tokenize_path(d)
    i = 0
    cmd = None
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    out: list[tuple[float, float]] = []

    def read_num() -> float:
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
        if cmd is None:
            break

        rel = cmd.islower()
        c = cmd.upper()

        if c == "M":
            x, y = read_num(), read_num()
            if rel:
                x += cur[0]
                y += cur[1]
            cur = (x, y)
            start = cur
            out.append(cur)
            cmd = "l" if rel else "L"
            continue

        if c == "L":
            x, y = read_num(), read_num()
            if rel:
                x += cur[0]
                y += cur[1]
            cur = (x, y)
            out.append(cur)
            continue

        if c == "H":
            x = read_num()
            if rel:
                x += cur[0]
            cur = (x, cur[1])
            out.append(cur)
            continue

        if c == "V":
            y = read_num()
            if rel:
                y += cur[1]
            cur = (cur[0], y)
            out.append(cur)
            continue

        if c == "C":
            x1, y1 = read_num(), read_num()
            x2, y2 = read_num(), read_num()
            x, y = read_num(), read_num()
            if rel:
                x1 += cur[0]
                y1 += cur[1]
                x2 += cur[0]
                y2 += cur[1]
                x += cur[0]
                y += cur[1]
            p0, p1, p2, p3 = cur, (x1, y1), (x2, y2), (x, y)
            steps = cubic_steps(p0, p1, p2, p3, curve_steps)
            out.extend(sample_cubic(p0, p1, p2, p3, steps)[1:])
            cur = (x, y)
            continue

        if c == "Z":
            cur = start
            out.append(cur)
            continue

        i += 1

    return out


def path_length(pts: list[tuple[float, float]]) -> float:
    total = 0.0
    for a, b in zip(pts, pts[1:]):
        total += math.hypot(b[0] - a[0], b[1] - a[1])
    return total


def dedupe_points(
    pts: list[tuple[float, float]], min_dist: float = 1.0
) -> list[tuple[float, float]]:
    if not pts:
        return []
    out = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) >= min_dist:
            out.append(p)
    return out


def uniform_arc_downsample(
    pts: list[tuple[float, float]], max_points: int
) -> list[tuple[float, float]]:
    if len(pts) <= max_points:
        return pts

    lengths = [0.0]
    for i in range(1, len(pts)):
        prev, cur = pts[i - 1], pts[i]
        lengths.append(
            lengths[-1] + math.hypot(cur[0] - prev[0], cur[1] - prev[1])
        )
    total = lengths[-1] or 1.0

    out = [pts[0]]
    for k in range(1, max_points - 1):
        target = total * k / (max_points - 1)
        idx = next(
            (i for i in range(len(lengths)) if lengths[i] >= target),
            len(pts) - 1,
        )
        out.append(pts[idx])
    out.append(pts[-1])
    return dedupe_points(out, min_dist=0.5)


def split_subpaths(d: str) -> list[str]:
    parts = re.split(r"(?=[Mm])", d.strip())
    return [p.strip() for p in parts if p.strip()]


def path_cumulative_lengths(
    pts: list[tuple[float, float]],
) -> tuple[list[float], float]:
    lengths = [0.0]
    for i in range(1, len(pts)):
        lengths.append(
            lengths[-1]
            + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        )
    return lengths, lengths[-1] or 1.0


def nearest_index(
    pts: list[tuple[float, float]], x: float, y: float
) -> int:
    best_i = 0
    best_d = float("inf")
    for i, (px, py) in enumerate(pts):
        d = math.hypot(px - x, py - y)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


def rotate_polyline_start(
    pts: list[tuple[float, float]], anchor: tuple[float, float] | None
) -> list[tuple[float, float]]:
    if not anchor or len(pts) < 3:
        return pts
    idx = nearest_index(pts, anchor[0], anchor[1])
    if idx == 0:
        return pts
    rotated = pts[idx:] + pts[1:idx + 1]
    return rotated


def parse_translate(transform: str) -> tuple[float, float]:
    match = re.search(
        r"translate\(\s*([-\d.]+)\s*(?:,\s*([-\d.]+)\s*)?\)", transform
    )
    if not match:
        return 0.0, 0.0
    return float(match.group(1)), float(match.group(2) or 0.0)


def find_start_anchor(svg_path: Path) -> tuple[float, float] | None:
    root = ET.parse(svg_path).getroot()
    for el in root.iter():
        tag = el.tag.split("}")[-1]
        eid = el.attrib.get("id", "").lower()
        if tag == "g" and eid in {"flag", "start", "startfinish"}:
            tx, ty = parse_translate(el.attrib.get("transform", ""))
            return (tx, ty)
        if tag == "polygon" and eid == "arrow":
            tx, ty = parse_translate(el.attrib.get("transform", ""))
            return (tx, ty)
    return None


def score_path_element(el: ET.Element) -> float:
    d = el.attrib.get("d", "")
    if len(d) < 200:
        return -1.0
    style = (el.attrib.get("style", "") + " " + el.attrib.get("class", "")).lower()
    if "stroke:#ff" in style or "stroke:red" in style or "stroke:yellow" in style:
        return -1.0
    if "font-size" in style:
        return -1.0
    score = float(len(d))
    sw = re.search(r"stroke-width:([\d.]+)", style)
    if sw:
        score += float(sw.group(1)) * 200.0
    if "fill:none" in style and "stroke" in style:
        score += 8000.0
    pid = el.attrib.get("id", "")
    if pid in {"circuit", "track", "Circuit"}:
        score += 20000.0
    return score


def load_path_d(svg_path: Path, path_id: str | None = None) -> tuple[str, str]:
    root = ET.parse(svg_path).getroot()
    candidates: list[tuple[float, str, str]] = []

    for el in root.iter():
        if el.tag.split("}")[-1] != "path":
            continue
        d = el.attrib.get("d")
        if not d:
            continue
        pid = el.attrib.get("id", "")
        if path_id and pid == path_id:
            return pid, d
        candidates.append((score_path_element(el), pid, d))

    if path_id:
        raise SystemExit(f"{path_id} not found in {svg_path}")

    candidates.sort(reverse=True)
    if not candidates or candidates[0][0] < 0:
        raise SystemExit(f"No suitable path in {svg_path}")
    return candidates[0][1], candidates[0][2]


def normalize_to_world(
    pts: list[tuple[float, float]], lap_length: float
) -> list[dict[str, float]]:
    if not pts:
        return []

    min_x = min(p[0] for p in pts)
    max_x = max(p[0] for p in pts)
    min_y = min(p[1] for p in pts)
    max_y = max(p[1] for p in pts)
    span = max(max_x - min_x, max_y - min_y) or 1.0
    scale = lap_length * 0.72 / span

    return [
        {"x": (p[0] - min_x) * scale, "z": (p[1] - min_y) * scale, "y": 0.0}
        for p in pts
    ]


def curvature_at(pts: list[tuple[float, float]], i: int) -> float:
    n = len(pts)
    if n < 3:
        return 0.0
    a = pts[(i - 1) % n]
    b = pts[i]
    c = pts[(i + 1) % n]
    ab = math.hypot(b[0] - a[0], b[1] - a[1])
    bc = math.hypot(c[0] - b[0], c[1] - b[1])
    ca = math.hypot(a[0] - c[0], a[1] - c[1])
    if ab < 1e-6 or bc < 1e-6:
        return 0.0
    cross = abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    return cross / (ab * bc)


def build_sectors(pts: list[tuple[float, float]], count: int = 12) -> list[dict]:
    n = len(pts)
    if n < 4:
        return []

    curv = [curvature_at(pts, i) for i in range(n)]
    sectors = []
    step = n / count
    for s in range(count):
        start_i = int(s * step)
        end_i = n if s == count - 1 else int((s + 1) * step)
        seg_curv = curv[start_i:end_i] or [0.0]
        avg = sum(seg_curv) / len(seg_curv)
        straight = avg < 0.02
        max_ms = 88.0 if straight else max(22.0, 55.0 - avg * 400.0)
        sectors.append(
            {
                "name": f"Sector {s + 1}",
                "start_t": round(s / count, 4),
                "end_t": round(1.0 if s == count - 1 else (s + 1) / count, 4),
                "max_speed_ms": round(max_ms, 1),
                "straight": straight,
            }
        )
    return sectors


def extract_polyline(
    d: str, *, compound_longest: bool = False
) -> list[tuple[float, float]]:
    if compound_longest:
        subpaths = split_subpaths(d)
        best: list[tuple[float, float]] = []
        for sp in subpaths:
            pts = dedupe_points(sample_path(sp), min_dist=0.8)
            if path_length(pts) > path_length(best):
                best = pts
        pts = best
    else:
        pts = dedupe_points(sample_path(d), min_dist=0.8)

    pts = uniform_arc_downsample(pts, MAX_POLYLINE_POINTS)
    if len(pts) > 1:
        gap = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
        if gap > 0.5:
            pts.append(pts[0])
    return pts


def wikimedia_url(file_title: str) -> str:
    enc = urllib.parse.quote(file_title.replace(" ", "_"))
    api = (
        "https://commons.wikimedia.org/w/api.php?action=query"
        f"&titles=File:{enc}&prop=imageinfo&iiprop=url&format=json"
    )
    with urllib.request.urlopen(
        urllib.request.Request(api, headers={"User-Agent": "ProjectLM/1.0"})
    ) as resp:
        data = json.loads(resp.read().decode())
    pages = data["query"]["pages"]
    page = next(iter(pages.values()))
    return page["imageinfo"][0]["url"]


def fetch_svg(file_title: str, dest: Path) -> None:
    url = wikimedia_url(file_title)
    with urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": "ProjectLM/1.0"})
    ) as resp:
        dest.write_bytes(resp.read())
    print(f"Fetched {dest.name} from Wikimedia")


def extract_circuit(cfg: dict, *, fetch: bool = False) -> None:
    svg_path = TRACKS_DIR / cfg["local_svg"]
    if fetch or not svg_path.exists():
        fetch_svg(cfg["wikimedia_file"], svg_path)

    path_id, d = load_path_d(svg_path, cfg.get("path_id"))
    pts = extract_polyline(d, compound_longest=cfg.get("compound_longest", False))
    anchor = find_start_anchor(svg_path)
    pts = rotate_polyline_start(pts, anchor)

    print(
        f"{cfg['track_id']}: path={path_id}, {len(pts)} pts, "
        f"svg_len={path_length(pts):.0f}, anchor={anchor}"
    )

    world = normalize_to_world(pts, cfg["lap_m"])
    out_path = TRACKS_DIR / f"{cfg['track_id']}.json"

    if out_path.exists():
        track = json.loads(out_path.read_text())
    else:
        track = {"name": cfg["name"], "closed": True, "lap_length": cfg["lap_m"]}

    track["name"] = cfg["name"]
    track["closed"] = True
    track["lap_length"] = cfg["lap_m"]
    track["interpolation"] = "linear"
    track["control_points"] = world
    track["display_polyline"] = [{"x": p["x"], "y": 0.0, "z": p["z"]} for p in world]
    if not track.get("sectors"):
        track["sectors"] = build_sectors(pts, 12 if cfg["lap_m"] > 8000 else 10)
    track.pop("source", None)
    track["svg_source"] = {
        "file": str(svg_path.relative_to(ROOT)),
        "path_id": path_id,
        "wikimedia_file": cfg["wikimedia_file"],
        "attribution": f"Wikimedia Commons — {cfg['wikimedia_file']}",
        "mode": "polyline-linear",
    }

    out_path.write_text(json.dumps(track, indent=2) + "\n")
    print(f"Updated {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract WEC circuits from Wikimedia SVGs")
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="Download missing SVGs from Wikimedia before extraction",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        help="Track ids to extract (default: all WEC circuits)",
    )
    args = parser.parse_args()

    selected = set(args.only) if args.only else None
    for cfg in WEC_CIRCUITS:
        if selected and cfg["track_id"] not in selected:
            continue
        extract_circuit(cfg, fetch=args.fetch)


if __name__ == "__main__":
    main()
