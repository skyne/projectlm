#!/usr/bin/env python3
"""Generate stylized WEC circuit track JSON files for the sim.

Each circuit gets a distinctive closed polyline scaled to its real lap length.
Geometry is procedural (not GPS-accurate) but unique per venue so the viewer
and sim can distinguish tracks while we source proper SVG layouts later.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKS_DIR = ROOT / "tracks"

# id, display name, lap length (m), shape key
WEC_TRACKS = [
    ("paul_ricard", "Circuit Paul Ricard", 5842.0, "paul_ricard"),
    ("imola", "Autodromo Enzo e Dino Ferrari", 4909.0, "imola"),
    ("spa", "Circuit de Spa-Francorchamps", 7004.0, "spa"),
    ("lemans_la_sarthe", "Circuit de la Sarthe", 13626.0, "lemans"),
    ("sao_paulo", "Autódromo José Carlos Pace", 4309.0, "sao_paulo"),
    ("cota", "Circuit of the Americas", 5513.0, "cota"),
    ("fuji", "Fuji Speedway", 4563.0, "fuji"),
    ("losail", "Lusail International Circuit", 5380.0, "losail"),
    ("bahrain", "Bahrain International Circuit", 5412.0, "bahrain"),
]


def shape_points(key: str, samples: int = 240) -> list[tuple[float, float]]:
    """Return normalized (x, z) polyline in roughly [-1, 1] range."""
    pts: list[tuple[float, float]] = []

    for i in range(samples):
        t = i / samples
        a = t * 2 * math.pi

        if key == "paul_ricard":
            # Long back straight + Mistral chicane feel
            x = 1.15 * math.cos(a) + 0.22 * math.cos(3 * a)
            z = 0.55 * math.sin(a) + 0.12 * math.sin(5 * a)
        elif key == "imola":
            # Tight flowing Esses
            x = 0.95 * math.cos(a) + 0.18 * math.cos(2 * a + 0.4)
            z = 0.72 * math.sin(a) + 0.15 * math.sin(3 * a)
        elif key == "spa":
            # Long sweeping Ardennes layout
            x = 1.25 * math.cos(a) + 0.08 * math.cos(2 * a)
            z = 0.82 * math.sin(a) + 0.2 * math.sin(4 * a + 0.3)
        elif key == "lemans":
            # Very long — Mulsanne straight emphasis
            x = 1.4 * math.cos(a) + 0.1 * math.cos(2 * a)
            z = 0.45 * math.sin(a) + 0.05 * math.sin(6 * a)
        elif key == "sao_paulo":
            # Compact S-flow (Interlagos)
            x = 0.82 * math.cos(a) + 0.28 * math.cos(3 * a + 0.5)
            z = 0.78 * math.sin(a) + 0.22 * math.sin(2 * a)
        elif key == "cota":
            # Esses + stadium section
            x = 0.9 * math.cos(a) + 0.25 * math.cos(4 * a)
            z = 0.85 * math.sin(a) + 0.18 * math.sin(5 * a + 0.2)
        elif key == "fuji":
            # Short fast sweeps
            x = 1.0 * math.cos(a) + 0.12 * math.cos(3 * a)
            z = 0.62 * math.sin(a)
        elif key == "losail":
            # Flat, medium-fast
            x = 1.05 * math.cos(a) + 0.14 * math.cos(2 * a)
            z = 0.68 * math.sin(a) + 0.1 * math.sin(4 * a)
        elif key == "bahrain":
            # Drag strip + tight infield
            x = 1.1 * math.cos(a) + 0.2 * math.cos(5 * a + 0.8)
            z = 0.58 * math.sin(a) + 0.16 * math.sin(3 * a)
        else:
            x = math.cos(a)
            z = math.sin(a)

        pts.append((x, z))

    return pts


def polyline_length(pts: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(pts)):
        x0, z0 = pts[i]
        x1, z1 = pts[(i + 1) % len(pts)]
        total += math.hypot(x1 - x0, z1 - z0)
    return total


def scale_to_length(
    pts: list[tuple[float, float]], target_m: float
) -> list[dict[str, float]]:
    raw_len = polyline_length(pts)
    scale = target_m / raw_len if raw_len > 0 else 1.0
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    out: list[dict[str, float]] = []
    for x, z in pts:
        out.append(
            {
                "x": (x - cx) * scale,
                "y": 0.0,
                "z": (z - cz) * scale,
            }
        )
    return out


def auto_sectors(count: int = 10) -> list[dict]:
    sectors = []
    step = 1.0 / count
    for i in range(count):
        start = i * step
        end = 1.0 if i == count - 1 else (i + 1) * step
        straight = i % 3 == 0
        max_ms = 88.0 if straight else 35.0 + (i % 4) * 8.0
        sectors.append(
            {
                "name": f"Sector {i + 1}",
                "start_t": round(start, 4),
                "end_t": round(end, 4),
                "max_speed_ms": round(max_ms, 1),
                "straight": straight,
            }
        )
    return sectors


def build_track(track_id: str, name: str, lap_length: float, shape: str) -> dict:
    raw = shape_points(shape)
    world = scale_to_length(raw, lap_length)
    return {
        "name": name,
        "closed": True,
        "lap_length": lap_length,
        "interpolation": "linear",
        "control_points": world,
        "display_polyline": world,
        "sectors": auto_sectors(12 if lap_length > 8000 else 10),
        "source": {
            "generator": "scripts/generate_wec_tracks.py",
            "track_id": track_id,
            "note": "Procedural placeholder geometry — replace with SVG extraction when available",
        },
    }


def main() -> None:
    TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    for track_id, name, lap_length, shape in WEC_TRACKS:
        out_path = TRACKS_DIR / f"{track_id}.json"
        if out_path.exists():
            try:
                existing = json.loads(out_path.read_text())
                if existing.get("svg_source"):
                    print(f"Skip {track_id} — Wikimedia SVG geometry present")
                    continue
            except json.JSONDecodeError:
                pass
        if track_id == "lemans_la_sarthe":
            print(f"Skip {track_id} — use scripts/extract_lemans_circuit.py")
            continue
        track = build_track(track_id, name, lap_length, shape)
        out_path.write_text(json.dumps(track, indent=2) + "\n")
        print(f"Wrote {out_path} ({lap_length:.0f} m, {len(track['control_points'])} pts)")


if __name__ == "__main__":
    main()
