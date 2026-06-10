#!/usr/bin/env python3
"""Author COTA surface_profile from GRIDLIFE / official safety map (runoff → gravel → barrier).

Corner t-bands were mapped to this repo's centreline parameterization (start/finish ≈ t=0)
by aligning the 20 numbered corners on the GRIDLIFE safety map to curvature / straight
segments on tracks/cota.json. Widths are template estimates from map scale — not CAD.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
COTA = ROOT / "tracks" / "cota.json"

# (name, start_t, end_t, side, surface, extra fields)
# Source: tracks/reference/cota_gridlife_safety_map.png (GRIDLIFE COTA driver resources)
SEGMENTS: list[dict[str, Any]] = [
    # --- Turn 1: wide paved runoff fan + gravel behind ---
    {
        "name": "T1 paved runoff",
        "start_t": 0.068,
        "end_t": 0.118,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 14,
        "width_start_m": 4,
        "width_end_m": 20,
        "envelope": "flare_exit",
        "grip_multiplier": 0.72,
    },
    {
        "name": "T1 gravel trap",
        "start_t": 0.082,
        "end_t": 0.108,
        "side": "outboard",
        "surface": "gravel",
        "inner_offset_m": 12,
        "width_m": 12,
        "width_start_m": 8,
        "width_end_m": 16,
        "envelope": "flare_exit",
        "grip_multiplier": 0.42,
    },
    {
        "name": "T1 outer barrier",
        "start_t": 0.068,
        "end_t": 0.118,
        "side": "outboard",
        "surface": "barrier_tecpro",
        "inner_offset_m": 26,
        "width_m": 1.2,
        "grip_multiplier": 0.0,
    },
    # --- Esses T2–T6 (alternating runoff per safety map) ---
    {
        "name": "T2 esses runoff",
        "start_t": 0.118,
        "end_t": 0.142,
        "side": "inboard",
        "surface": "runoff_concrete",
        "width_m": 8,
        "width_start_m": 4,
        "width_end_m": 10,
        "envelope": "bell",
        "grip_multiplier": 0.72,
    },
    {
        "name": "T3 esses kerb",
        "start_t": 0.142,
        "end_t": 0.162,
        "side": "outboard",
        "surface": "kerb_sausage",
        "width_m": 0.5,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T3 esses runoff",
        "start_t": 0.142,
        "end_t": 0.168,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 9,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T4 esses kerb",
        "start_t": 0.168,
        "end_t": 0.188,
        "side": "inboard",
        "surface": "kerb_sausage",
        "width_m": 0.5,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T4 esses runoff",
        "start_t": 0.168,
        "end_t": 0.198,
        "side": "inboard",
        "surface": "runoff_concrete",
        "width_m": 8,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T5 esses kerb",
        "start_t": 0.198,
        "end_t": 0.218,
        "side": "outboard",
        "surface": "kerb_sausage",
        "width_m": 0.5,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T5 esses runoff",
        "start_t": 0.198,
        "end_t": 0.228,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 9,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T6 esses runoff",
        "start_t": 0.228,
        "end_t": 0.258,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 10,
        "width_start_m": 5,
        "width_end_m": 12,
        "envelope": "flare_exit",
        "grip_multiplier": 0.72,
    },
    {
        "name": "T6 synthetic turf verge",
        "start_t": 0.235,
        "end_t": 0.255,
        "side": "outboard",
        "surface": "runoff_concrete",
        "variant": "turf",
        "width_m": 1.5,
        "grip_multiplier": 0.65,
    },
    # --- T7–T8 back section ---
    {
        "name": "T7 runoff",
        "start_t": 0.268,
        "end_t": 0.298,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 10,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T8 runoff",
        "start_t": 0.298,
        "end_t": 0.332,
        "side": "inboard",
        "surface": "runoff_concrete",
        "width_m": 9,
        "grip_multiplier": 0.72,
    },
    # --- T9–T10 stadium entry ---
    {
        "name": "T9 stadium entry runoff",
        "start_t": 0.378,
        "end_t": 0.412,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 11,
        "width_start_m": 5,
        "width_end_m": 14,
        "envelope": "flare_entry",
        "grip_multiplier": 0.72,
    },
    {
        "name": "T10 stadium runoff",
        "start_t": 0.412,
        "end_t": 0.448,
        "side": "inboard",
        "surface": "runoff_concrete",
        "width_m": 10,
        "grip_multiplier": 0.72,
    },
    # --- T11–T12 hairpin complex (map: large runoff + gravel) ---
    {
        "name": "T11 approach runoff",
        "start_t": 0.498,
        "end_t": 0.532,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 12,
        "width_start_m": 6,
        "width_end_m": 16,
        "envelope": "flare_entry",
        "grip_multiplier": 0.72,
    },
    {
        "name": "T11 fake gravel exit",
        "start_t": 0.518,
        "end_t": 0.548,
        "side": "outboard",
        "surface": "gravel",
        "variant": "fake_gravel",
        "width_m": 6,
        "width_start_m": 3,
        "width_end_m": 9,
        "envelope": "flare_exit",
        "grip_multiplier": 0.48,
    },
    {
        "name": "T12 braking paved runoff",
        "start_t": 0.528,
        "end_t": 0.572,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 16,
        "width_start_m": 6,
        "width_end_m": 24,
        "envelope": "flare_exit",
        "grip_multiplier": 0.72,
    },
    {
        "name": "T12 gravel trap",
        "start_t": 0.542,
        "end_t": 0.562,
        "side": "outboard",
        "surface": "gravel",
        "inner_offset_m": 14,
        "width_m": 12,
        "width_start_m": 8,
        "width_end_m": 18,
        "envelope": "flare_exit",
        "grip_multiplier": 0.42,
    },
    {
        "name": "T12 outer barrier",
        "start_t": 0.528,
        "end_t": 0.572,
        "side": "outboard",
        "surface": "barrier_tecpro",
        "inner_offset_m": 30,
        "width_m": 1.2,
        "grip_multiplier": 0.0,
    },
    # --- T13–T15 stadium esses ---
    {
        "name": "T13 stadium runoff",
        "start_t": 0.588,
        "end_t": 0.618,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 9,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T13 synthetic turf",
        "start_t": 0.595,
        "end_t": 0.615,
        "side": "outboard",
        "surface": "runoff_concrete",
        "variant": "turf",
        "width_m": 1.5,
        "grip_multiplier": 0.65,
    },
    {
        "name": "T14 stadium runoff",
        "start_t": 0.618,
        "end_t": 0.648,
        "side": "inboard",
        "surface": "runoff_concrete",
        "width_m": 9,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T14 synthetic turf",
        "start_t": 0.625,
        "end_t": 0.645,
        "side": "inboard",
        "surface": "runoff_concrete",
        "variant": "turf",
        "width_m": 1.5,
        "grip_multiplier": 0.65,
    },
    {
        "name": "T15 stadium runoff",
        "start_t": 0.648,
        "end_t": 0.678,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 10,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T15 synthetic turf",
        "start_t": 0.652,
        "end_t": 0.675,
        "side": "outboard",
        "surface": "runoff_concrete",
        "variant": "turf",
        "width_m": 1.5,
        "grip_multiplier": 0.65,
    },
    # --- T16–T18 ---
    {
        "name": "T16 runoff",
        "start_t": 0.698,
        "end_t": 0.728,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 10,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T17 runoff",
        "start_t": 0.778,
        "end_t": 0.808,
        "side": "inboard",
        "surface": "runoff_concrete",
        "width_m": 9,
        "grip_multiplier": 0.72,
    },
    {
        "name": "T18 runoff",
        "start_t": 0.808,
        "end_t": 0.838,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 10,
        "grip_multiplier": 0.72,
    },
    # --- T19–T20 ---
    {
        "name": "T19 paved runoff",
        "start_t": 0.842,
        "end_t": 0.878,
        "side": "outboard",
        "surface": "runoff_concrete",
        "width_m": 11,
        "width_start_m": 5,
        "width_end_m": 14,
        "envelope": "bell",
        "grip_multiplier": 0.72,
    },
    {
        "name": "T20 exit gravel",
        "start_t": 0.898,
        "end_t": 0.938,
        "side": "outboard",
        "surface": "gravel",
        "inner_offset_m": 8,
        "width_m": 10,
        "width_start_m": 5,
        "width_end_m": 14,
        "envelope": "flare_exit",
        "grip_multiplier": 0.45,
    },
    {
        "name": "T20 outer barrier",
        "start_t": 0.898,
        "end_t": 0.938,
        "side": "outboard",
        "surface": "barrier_tecpro",
        "inner_offset_m": 22,
        "width_m": 1.2,
        "grip_multiplier": 0.0,
    },
]

METADATA = {
    "confidence": "mapped",
    "last_reviewed": "2026-06-10",
    "reference_image": "tracks/reference/cota_gridlife_safety_map.png",
    "sources": [
        "gridlife_cota_driver_resources_safety_map",
        "cota_track_limits_2024_motorsport",
        "cota_turf_gravel_2024_the_drive",
        "fia_appendix_o_2025",
    ],
    "notes": (
        "Corner t-bands digitized from GRIDLIFE official safety map (runoff grey, gravel brown, "
        "barrier outline). Synthetic turf at T6/T13–T15 from 2024 F1 track-limit updates (not on "
        "older map). T11 fake gravel from same. Widths are scaled templates from map — not survey CAD."
    ),
}


def main() -> None:
    doc = json.loads(COTA.read_text(encoding="utf-8"))
    doc["surface_profile"] = SEGMENTS
    doc["surface_metadata"] = METADATA
    COTA.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(SEGMENTS)} segments to {COTA.name}")


if __name__ == "__main__":
    main()
