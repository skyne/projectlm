#!/usr/bin/env python3
"""Inject surface_defaults + surface_profile into track JSON files missing them."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKS = ROOT / "tracks"

DEFAULTS = {
    "verge_width_m": 2.0,
    "runoff_width_m": 11.0,
    "kerb_width_m": 0.5,
}

# FIA-template segments per circuit (estimated t from sector layout).
PROFILES: dict[str, list[dict]] = {
    "bahrain.json": [
        {"name": "T1 exit runoff", "start_t": 0.10, "end_t": 0.18, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "T4 gravel trap", "start_t": 0.38, "end_t": 0.44, "side": "outboard",
         "surface": "gravel", "width_m": 12.0, "grip_multiplier": 0.42},
        {"name": "T11 chicane kerb", "start_t": 0.64, "end_t": 0.70, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "T11 outer barrier", "start_t": 0.64, "end_t": 0.70, "side": "outboard",
         "surface": "barrier_tecpro", "width_m": 1.2, "grip_multiplier": 0.0},
    ],
    "cota.json": [
        {"name": "T1 uphill runoff", "start_t": 0.10, "end_t": 0.17, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "Esses kerbs", "start_t": 0.20, "end_t": 0.30, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "T12 gravel", "start_t": 0.52, "end_t": 0.58, "side": "outboard",
         "surface": "gravel", "width_m": 10.0, "grip_multiplier": 0.45},
        {"name": "Stadium outer barrier", "start_t": 0.78, "end_t": 0.86, "side": "outboard",
         "surface": "barrier_armco", "width_m": 1.0, "grip_multiplier": 0.0},
    ],
    "spa.json": [
        {"name": "Eau Rouge runoff", "start_t": 0.10, "end_t": 0.18, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.74},
        {"name": "Pouhon gravel", "start_t": 0.48, "end_t": 0.54, "side": "outboard",
         "surface": "gravel", "width_m": 12.0, "grip_multiplier": 0.45},
        {"name": "Bus Stop chicane kerb", "start_t": 0.82, "end_t": 0.88, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "Blanchimont runoff", "start_t": 0.88, "end_t": 0.94, "side": "outboard",
         "surface": "runoff_asphalt", "width_m": 10.0, "grip_multiplier": 0.78},
        {"name": "Blanchimont barrier", "start_t": 0.88, "end_t": 0.94, "side": "outboard",
         "surface": "barrier_tecpro", "width_m": 1.2, "grip_multiplier": 0.0},
    ],
    "lemans_la_sarthe.json": [
        {"name": "Dunlop runoff", "start_t": 0.055, "end_t": 0.10, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "Mulsanne chicane 1 kerb", "start_t": 0.285, "end_t": 0.305, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "Mulsanne chicane 1 gravel", "start_t": 0.285, "end_t": 0.305, "side": "outboard",
         "surface": "gravel", "width_m": 8.0, "grip_multiplier": 0.45},
        {"name": "Mulsanne chicane 2 kerb", "start_t": 0.405, "end_t": 0.425, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "Porsche curves runoff", "start_t": 0.55, "end_t": 0.62, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 10.0, "grip_multiplier": 0.72},
    ],
    "fuji.json": [
        {"name": "T1 runoff", "start_t": 0.08, "end_t": 0.14, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "100R gravel", "start_t": 0.35, "end_t": 0.42, "side": "outboard",
         "surface": "gravel", "width_m": 10.0, "grip_multiplier": 0.45},
        {"name": "Corkscrew kerb", "start_t": 0.58, "end_t": 0.64, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "Final chicane kerb", "start_t": 0.92, "end_t": 0.97, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
    ],
    "imola.json": [
        {"name": "Tamburello gravel", "start_t": 0.12, "end_t": 0.18, "side": "outboard",
         "surface": "gravel", "width_m": 12.0, "grip_multiplier": 0.42},
        {"name": "Variante Alta kerb", "start_t": 0.24, "end_t": 0.30, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "Rivazza runoff", "start_t": 0.54, "end_t": 0.62, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "Rivazza barrier", "start_t": 0.54, "end_t": 0.62, "side": "outboard",
         "surface": "barrier_armco", "width_m": 1.0, "grip_multiplier": 0.0},
    ],
    "losail.json": [
        {"name": "T1 runoff", "start_t": 0.08, "end_t": 0.14, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "T6-T7 complex kerb", "start_t": 0.34, "end_t": 0.44, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "T14 gravel", "start_t": 0.78, "end_t": 0.84, "side": "outboard",
         "surface": "gravel", "width_m": 10.0, "grip_multiplier": 0.45},
    ],
    "sao_paulo.json": [
        {"name": "Senna S kerbs", "start_t": 0.10, "end_t": 0.16, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "Descida do Lago runoff", "start_t": 0.34, "end_t": 0.42, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "Bico de Pato gravel", "start_t": 0.54, "end_t": 0.60, "side": "outboard",
         "surface": "gravel", "width_m": 10.0, "grip_multiplier": 0.45},
        {"name": "Junção barrier", "start_t": 0.88, "end_t": 0.94, "side": "outboard",
         "surface": "barrier_tecpro", "width_m": 1.2, "grip_multiplier": 0.0},
    ],
    "sample_circuit.json": [
        {"name": "T1 runoff", "start_t": 0.095, "end_t": 0.12, "side": "outboard",
         "surface": "runoff_concrete", "width_m": 11.0, "grip_multiplier": 0.72},
        {"name": "Esses kerbs", "start_t": 0.11, "end_t": 0.16, "side": "both",
         "surface": "kerb_sausage", "width_m": 0.5, "grip_multiplier": 0.72},
        {"name": "Stadium gravel", "start_t": 0.57, "end_t": 0.63, "side": "outboard",
         "surface": "gravel", "width_m": 10.0, "grip_multiplier": 0.45},
        {"name": "Arena outer barrier", "start_t": 0.63, "end_t": 0.80, "side": "outboard",
         "surface": "barrier_armco", "width_m": 1.0, "grip_multiplier": 0.0},
    ],
}


def main() -> None:
    for filename, profile in PROFILES.items():
        path = TRACKS / filename
        data = json.loads(path.read_text())
        if "surface_profile" in data:
            print(f"skip {filename} (already has surface_profile)")
            continue
        data["surface_defaults"] = DEFAULTS.copy()
        data["surface_profile"] = profile
        path.write_text(json.dumps(data, indent=2) + "\n")
        print(f"updated {filename} ({len(profile)} segments)")


if __name__ == "__main__":
    main()
