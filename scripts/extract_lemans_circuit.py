#!/usr/bin/env python3
"""Build track geometry from Wikimedia SVG race-line paths.

Pipeline (polyline-first — no Catmull-Rom thinning):
  SVG path ``d`` → dense polyline → world coordinates → track JSON
  Sim uses linear interpolation; viewer draws the stored polyline directly.

Geometry source: ``path2830`` in ``lemans_wikimedia.svg`` — full-detail
centerline with no shortcut chords.  The enlabels SVG (path2294) omits
corners via diagonal chords and is not used for geometry.
"""

from __future__ import annotations

import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG_GEOMETRY = ROOT / "tracks" / "lemans_wikimedia.svg"
GEOMETRY_PATH_ID = "path2830"
SVG_LABELS = ROOT / "tracks" / "lemans_rev12_enlabels.svg"
LABEL_REF_PATH_ID = "path2294"
TRACK_JSON_PATH = ROOT / "tracks" / "lemans_la_sarthe.json"
LAP_LENGTH_M = 13626.0
MAX_POLYLINE_POINTS = 1500


def tokenize_path(d: str) -> list:
    tokens = re.findall(
        r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?",
        d,
    )
    return tokens


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
    """Keep shape fidelity by arc-length spacing, not corner thinning."""
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


def load_path_d(svg_path: Path, path_id: str) -> str:
    root = ET.parse(svg_path).getroot()
    for el in root.iter():
        if el.tag.split("}")[-1] != "path":
            continue
        if el.attrib.get("id") == path_id and el.attrib.get("d"):
            return el.attrib["d"]
    raise SystemExit(f"{path_id} not found in {svg_path}")


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


def point_at_arc_length(
    pts: list[tuple[float, float]], lengths: list[float], target: float
) -> tuple[float, float]:
    if target <= 0.0:
        return pts[0]
    total = lengths[-1]
    if target >= total:
        return pts[-1]
    for i in range(1, len(pts)):
        if lengths[i] >= target:
            seg = lengths[i] - lengths[i - 1]
            if seg <= 0.0:
                return pts[i]
            t = (target - lengths[i - 1]) / seg
            a, b = pts[i - 1], pts[i]
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    return pts[-1]


def nearest_arc_length(
    pts: list[tuple[float, float]], lengths: list[float], x: float, y: float
) -> float:
    best_dist = float("inf")
    best_len = 0.0
    for i in range(len(pts) - 1):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        if seg2 <= 0.0:
            px, py = ax, ay
            seg = 0.0
        else:
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / seg2))
            px = ax + t * dx
            py = ay + t * dy
            seg = math.sqrt(seg2) * t
        dist = math.hypot(x - px, y - py)
        if dist < best_dist:
            best_dist = dist
            best_len = lengths[i] + seg
    return best_len


def parse_translate(transform: str) -> tuple[float, float]:
    match = re.search(
        r"translate\(\s*([-\d.]+)\s*(?:,\s*([-\d.]+)\s*)?\)", transform
    )
    if not match:
        return 0.0, 0.0
    tx = float(match.group(1))
    ty = float(match.group(2) or 0.0)
    return tx, ty


def text_anchor_from_style(style: str) -> str | None:
    match = re.search(r"text-anchor:\s*(\w+)", style)
    if match and match.group(1) in {"start", "middle", "end"}:
        return match.group(1)
    return None


def collect_svg_labels(svg_path: Path) -> list[dict[str, object]]:
    root = ET.parse(svg_path).getroot()
    labels: list[dict[str, object]] = []

    def visit(el: ET.Element, offset_x: float, offset_y: float) -> None:
        tag = el.tag.split("}")[-1]
        ox, oy = offset_x, offset_y
        if tag == "g":
            dx, dy = parse_translate(el.attrib.get("transform", ""))
            ox += dx
            oy += dy
        elif tag == "text":
            x = el.attrib.get("x")
            y = el.attrib.get("y")
            if x is not None and y is not None:
                text = "".join(el.itertext()).strip()
                if text:
                    anchor = text_anchor_from_style(el.attrib.get("style", ""))
                    for child in el:
                        if child.tag.split("}")[-1] == "tspan":
                            child_anchor = text_anchor_from_style(
                                child.attrib.get("style", "")
                            )
                            if child_anchor:
                                anchor = child_anchor
                    labels.append(
                        {
                            "text": text,
                            "x": float(x) + ox,
                            "y": float(y) + oy,
                            "anchor": anchor,
                        }
                    )
            return
        for child in el:
            visit(child, ox, oy)

    visit(root, 0.0, 0.0)
    return labels


# Normalized lap position on path2830 — matched to enlabels map on Wikimedia geometry
# (descent after Mulsanne: Indy left 90° → Arnage right 90° → Porsche double-S →
# Ford double chicane).
LABEL_T_ANCHORS: dict[str, float | list[float]] = {
    "Dunlop Curve": 0.052,
    "Dunlop Chicane": 0.075,
    "Esses": 0.110,
    "Tertre Rouge": 0.135,
    "Mulsanne Straight": 0.215,
    "Mulsanne": 0.568,
    "Indianapolis": 0.724,
    "Arnage": 0.747,
    "Porsche Curves": 0.835,
    "Ford Chicanes": 0.988,
}


def anchor_t_for_label(text: str, occurrence: int) -> float | None:
    anchor = LABEL_T_ANCHORS.get(text)
    if anchor is None:
        return None
    if text == "Mulsanne Straight":
        values = anchor if isinstance(anchor, list) else [anchor]
        idx = min(occurrence, len(values) - 1)
        return float(values[idx])
    return float(anchor)


def extract_map_labels(
    geo_pts: list[tuple[float, float]],
    lap_length: float,
    sectors: list[dict] | None = None,
) -> list[dict[str, object]]:
    if not SVG_LABELS.exists():
        print(f"Skipping map labels — {SVG_LABELS.name} not found")
        return []

    ref_d = load_path_d(SVG_LABELS, LABEL_REF_PATH_ID)
    ref_pts = dedupe_points(sample_path(ref_d, curve_steps=30), min_dist=0.5)
    ref_lens, ref_total = path_cumulative_lengths(ref_pts)

    geo_open = list(geo_pts)
    if len(geo_open) > 1 and math.hypot(
        geo_open[0][0] - geo_open[-1][0], geo_open[0][1] - geo_open[-1][1]
    ) < 0.5:
        geo_open = geo_open[:-1]
    geo_lens, geo_total = path_cumulative_lengths(geo_open)

    ref_span = max(
        max(p[0] for p in ref_pts) - min(p[0] for p in ref_pts),
        max(p[1] for p in ref_pts) - min(p[1] for p in ref_pts),
    ) or 1.0
    geo_min_x = min(p[0] for p in geo_open)
    geo_max_x = max(p[0] for p in geo_open)
    geo_min_y = min(p[1] for p in geo_open)
    geo_max_y = max(p[1] for p in geo_open)
    geo_span = max(geo_max_x - geo_min_x, geo_max_y - geo_min_y) or 1.0
    offset_scale = geo_span / ref_span
    world_scale = lap_length * 0.72 / geo_span

    straight_count = 0
    out: list[dict[str, object]] = []
    for label in collect_svg_labels(SVG_LABELS):
        lx = float(label["x"])
        ly = float(label["y"])
        text = str(label["text"])
        arc = nearest_arc_length(ref_pts, ref_lens, lx, ly)
        ref_pt = point_at_arc_length(ref_pts, ref_lens, arc)
        offset_en = (lx - ref_pt[0], ly - ref_pt[1])

        if text == "Mulsanne Straight":
            if straight_count >= 1:
                continue
            straight_count += 1
        occurrence = 0
        anchor_t = anchor_t_for_label(text, occurrence)
        if anchor_t is None:
            anchor_t = arc / ref_total

        geo_pt = point_at_arc_length(geo_open, geo_lens, anchor_t * geo_total)
        eps = max(geo_total * 0.002, 2.0)
        ahead = point_at_arc_length(
            geo_open, geo_lens, min(anchor_t * geo_total + eps, geo_total)
        )
        tangent = (ahead[0] - geo_pt[0], ahead[1] - geo_pt[1])
        tangent_len = math.hypot(tangent[0], tangent[1]) or 1.0
        tx, ty = tangent[0] / tangent_len, tangent[1] / tangent_len
        normal_a = (-ty, tx)
        normal_b = (ty, -tx)
        dot_a = normal_a[0] * offset_en[0] + normal_a[1] * offset_en[1]
        dot_b = normal_b[0] * offset_en[0] + normal_b[1] * offset_en[1]
        nx, ny = normal_a if dot_a >= dot_b else normal_b
        outward_svg = 32.0
        svg_x = geo_pt[0] + nx * outward_svg
        svg_y = geo_pt[1] + ny * outward_svg
        entry: dict[str, object] = {
            "text": text,
            "x": (svg_x - geo_min_x) * world_scale,
            "z": (svg_y - geo_min_y) * world_scale,
        }
        if label.get("anchor"):
            entry["anchor"] = label["anchor"]
        out.append(entry)

    print(f"Mapped {len(out)} corner labels from {SVG_LABELS.name}")
    return out


def extract_geometry() -> tuple[str, list[tuple[float, float]]]:
    d = load_path_d(SVG_GEOMETRY, GEOMETRY_PATH_ID)
    pts = dedupe_points(sample_path(d), min_dist=1.0)
    pts = uniform_arc_downsample(pts, MAX_POLYLINE_POINTS)

    gap = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
    if gap > 0.5:
        pts.append(pts[0])

    print(
        f"Race line {GEOMETRY_PATH_ID} from {SVG_GEOMETRY.name}: {len(pts)} pts, "
        f"svg_len={path_length(pts):.0f}, closure_gap={gap:.2f}"
    )
    return GEOMETRY_PATH_ID, pts


def main() -> None:
    path_id, pts = extract_geometry()
    world = normalize_to_world(pts, LAP_LENGTH_M)

    if TRACK_JSON_PATH.exists():
        track = json.loads(TRACK_JSON_PATH.read_text())
    else:
        track = {
            "name": "Circuit de la Sarthe",
            "closed": True,
            "lap_length": LAP_LENGTH_M,
            "sectors": [],
        }

    track["interpolation"] = "linear"
    track["control_points"] = world
    track["display_polyline"] = [
        {"x": p["x"], "y": 0.0, "z": p["z"]} for p in world
    ]
    track["lap_length"] = LAP_LENGTH_M
    track["svg_source"] = {
        "file": str(SVG_GEOMETRY.relative_to(ROOT)),
        "path_id": path_id,
        "attribution": "wikimedia Circuit_de_la_Sarthe_track_map.svg (path2830)",
        "mode": "polyline-linear",
    }
    track["map_labels"] = extract_map_labels(
        pts, LAP_LENGTH_M, track.get("sectors", [])
    )
    track["label_source"] = {
        "file": str(SVG_LABELS.relative_to(ROOT)),
        "method": "path2830 geometry anchors + enlabels outward side",
    }
    TRACK_JSON_PATH.write_text(json.dumps(track, indent=2) + "\n")
    print(
        f"Updated {TRACK_JSON_PATH} with {len(world)} polyline points "
        "(linear sim + direct viewer polyline)"
    )


if __name__ == "__main__":
    main()
