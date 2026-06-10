#!/usr/bin/env python3
"""Apply internet-sourced corner-specific surface_profile + surface_metadata to track JSON.

Widths and t-bands are simulation estimates mapped from published safety work,
FIA circuit maps, and motorsport press — not survey CAD. Re-run after research updates.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TRACKS = ROOT / "tracks"

DEFAULTS = {
    "verge_width_m": 2.0,
    "runoff_width_m": 11.0,
    "kerb_width_m": 0.5,
}

# Keys reference citations in docs/TRACK_WIDTH_SOURCES.md (surface section).
TRACK_DATA: dict[str, dict[str, Any]] = {
    "spa.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "spa_francorchamps_workingprogress_2022",
                "autosport_spa_gravel_return_2022",
                "motorsportweek_spa_2022_overhaul",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "2022 €80m safety programme: gravel at La Source, Les Combes, Malmedy, "
                "Bruxelles, Pouhon, Double Gauche, Blanchimont, Bus Stop; enlarged tarmac "
                "runoff through Eau Rouge/Raidillon. Widths are templates — not as-built surveys."
            ),
        },
        "surface_profile": [
            {
                "name": "La Source gravel",
                "start_t": 0.02,
                "end_t": 0.08,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "width_start_m": 4,
                "width_end_m": 14,
                "envelope": "flare_entry",
                "grip_multiplier": 0.42,
            },
            {
                "name": "Eau Rouge entry runoff",
                "start_t": 0.08,
                "end_t": 0.11,
                "side": "inboard",
                "surface": "runoff_concrete",
                "width_m": 14,
                "width_start_m": 6,
                "width_end_m": 18,
                "envelope": "flare_entry",
                "grip_multiplier": 0.74,
            },
            {
                "name": "Raidillon tarmac runoff",
                "start_t": 0.1,
                "end_t": 0.16,
                "side": "both",
                "surface": "runoff_concrete",
                "width_m": 12,
                "width_start_m": 8,
                "width_end_m": 16,
                "envelope": "bell",
                "grip_multiplier": 0.74,
            },
            {
                "name": "Les Combes gravel",
                "start_t": 0.22,
                "end_t": 0.27,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 11,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Malmedy gravel",
                "start_t": 0.26,
                "end_t": 0.3,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Bruxelles gravel",
                "start_t": 0.32,
                "end_t": 0.38,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Pouhon gravel",
                "start_t": 0.48,
                "end_t": 0.54,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 12,
                "width_start_m": 8,
                "width_end_m": 14,
                "envelope": "bell",
                "grip_multiplier": 0.45,
            },
            {
                "name": "Double Gauche gravel",
                "start_t": 0.58,
                "end_t": 0.64,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 9,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Stavelot runoff",
                "start_t": 0.66,
                "end_t": 0.72,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 11,
                "grip_multiplier": 0.74,
            },
            {
                "name": "Bus Stop chicane kerb",
                "start_t": 0.82,
                "end_t": 0.88,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Bus Stop gravel",
                "start_t": 0.82,
                "end_t": 0.88,
                "side": "outboard",
                "surface": "gravel",
                "inner_offset_m": 2,
                "width_m": 8,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Blanchimont gravel",
                "start_t": 0.88,
                "end_t": 0.94,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 12,
                "width_start_m": 6,
                "width_end_m": 16,
                "envelope": "flare_exit",
                "grip_multiplier": 0.42,
            },
            {
                "name": "Blanchimont barrier",
                "start_t": 0.88,
                "end_t": 0.94,
                "side": "outboard",
                "surface": "barrier_tecpro",
                "inner_offset_m": 20,
                "width_m": 1.2,
                "grip_multiplier": 0.0,
            },
        ],
    },
    "imola.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "motorsport_imola_gravel_2024",
                "tracinginsights_imola_2025",
                "wikipedia_imola_circuit",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "Post-1994 Tamburello/Villeneuve gravel; 2024–25 expansion at Piratella exit, "
                "Acque Minerali, Variante Alta exit per Motorsport.com / Tracing Insights. "
                "Double sausage kerbs at multiple turns."
            ),
        },
        "surface_profile": [
            {
                "name": "Tamburello gravel",
                "start_t": 0.1,
                "end_t": 0.18,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 12,
                "width_start_m": 6,
                "width_end_m": 14,
                "envelope": "flare_exit",
                "grip_multiplier": 0.42,
            },
            {
                "name": "Villeneuve gravel",
                "start_t": 0.18,
                "end_t": 0.22,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "grip_multiplier": 0.42,
            },
            {
                "name": "Tosa kerb",
                "start_t": 0.24,
                "end_t": 0.28,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Piratella exit gravel",
                "start_t": 0.28,
                "end_t": 0.32,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 9,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Acque Minerali gravel",
                "start_t": 0.38,
                "end_t": 0.46,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "width_start_m": 5,
                "width_end_m": 12,
                "envelope": "bell",
                "grip_multiplier": 0.45,
            },
            {
                "name": "Variante Alta kerb",
                "start_t": 0.48,
                "end_t": 0.54,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Variante Alta exit gravel",
                "start_t": 0.52,
                "end_t": 0.56,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 8,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Rivazza runoff",
                "start_t": 0.54,
                "end_t": 0.62,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 11,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Rivazza barrier",
                "start_t": 0.54,
                "end_t": 0.62,
                "side": "outboard",
                "surface": "barrier_armco",
                "inner_offset_m": 14,
                "width_m": 1.0,
                "grip_multiplier": 0.0,
            },
        ],
    },
    "lemans_la_sarthe.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "fiawec_lemans_track_upgrades",
                "autosport_porsche_curves_safety",
                "24h_lemans_porsche_curves_phase2",
                "autosport_lemans_safety_revamp_2015",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "ACO rolling safety programme: asphalt verges Mulsanne→Porsche; widened gravel "
                "+ concrete apron at Porsche Curves/Corvette; chicane kerbs; Indianapolis runoff."
            ),
        },
        "surface_profile": [
            {
                "name": "Dunlop chicane runoff",
                "start_t": 0.055,
                "end_t": 0.095,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 12,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Mulsanne chicane 1 kerb",
                "start_t": 0.285,
                "end_t": 0.305,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Mulsanne chicane 1 gravel",
                "start_t": 0.285,
                "end_t": 0.305,
                "side": "outboard",
                "surface": "gravel",
                "inner_offset_m": 4,
                "width_m": 8,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Mulsanne chicane 2 kerb",
                "start_t": 0.405,
                "end_t": 0.425,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Mulsanne straight verge asphalt",
                "start_t": 0.505,
                "end_t": 0.615,
                "side": "both",
                "surface": "runoff_asphalt",
                "width_m": 3,
                "grip_multiplier": 0.78,
            },
            {
                "name": "Indianapolis gravel",
                "start_t": 0.545,
                "end_t": 0.575,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Porsche curves concrete apron",
                "start_t": 0.615,
                "end_t": 0.68,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 8,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Porsche curves gravel",
                "start_t": 0.62,
                "end_t": 0.7,
                "side": "outboard",
                "surface": "gravel",
                "inner_offset_m": 10,
                "width_m": 14,
                "width_start_m": 10,
                "width_end_m": 22,
                "envelope": "flare_exit",
                "grip_multiplier": 0.42,
            },
            {
                "name": "Corvette gravel",
                "start_t": 0.715,
                "end_t": 0.755,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Ford chicane kerbs",
                "start_t": 0.765,
                "end_t": 0.835,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
        ],
    },
    "bahrain.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "bahrain_international_circuit_fia_grade_1",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "FIA Grade 1 desert circuit: wide asphalt/concrete runoff on straights; "
                "gravel at T4/T10 braking zones; T11 sausage kerbs on outer loop."
            ),
        },
        "surface_profile": [
            {
                "name": "T1 exit runoff",
                "start_t": 0.1,
                "end_t": 0.18,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 12,
                "width_start_m": 5,
                "width_end_m": 16,
                "envelope": "flare_exit",
                "grip_multiplier": 0.72,
            },
            {
                "name": "T4 gravel trap",
                "start_t": 0.38,
                "end_t": 0.44,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 12,
                "width_start_m": 8,
                "width_end_m": 16,
                "envelope": "flare_exit",
                "grip_multiplier": 0.42,
            },
            {
                "name": "T10 gravel trap",
                "start_t": 0.52,
                "end_t": 0.58,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 11,
                "grip_multiplier": 0.42,
            },
            {
                "name": "T11 chicane kerb",
                "start_t": 0.64,
                "end_t": 0.7,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "T11 outer barrier",
                "start_t": 0.64,
                "end_t": 0.7,
                "side": "outboard",
                "surface": "barrier_tecpro",
                "inner_offset_m": 14,
                "width_m": 1.2,
                "grip_multiplier": 0.0,
            },
        ],
    },
    "paul_ricard.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "circuit_paul_ricard_blue_line",
                "circuit_paul_ricard_fia_grade_1",
                "elmans_paul_ricard_facts",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "Paul Ricard HTTT Blue Line™: ~18 m blue zone (asphalt+tungsten), ~6 m red "
                "abrasive zone, Tecpro beyond. T4 retains gravel; Beausset double kerbs."
            ),
        },
        "surface_profile": [
            {
                "name": "Signes blue zone",
                "start_t": 0.52,
                "end_t": 0.58,
                "side": "outboard",
                "surface": "runoff_asphalt",
                "variant": "blue",
                "width_m": 18.0,
                "width_start_m": 10,
                "width_end_m": 20,
                "envelope": "flare_exit",
                "grip_multiplier": 0.78,
            },
            {
                "name": "Signes red zone",
                "start_t": 0.53,
                "end_t": 0.57,
                "side": "outboard",
                "surface": "runoff_asphalt",
                "variant": "red",
                "inner_offset_m": 18,
                "width_m": 6.0,
                "grip_multiplier": 0.42,
            },
            {
                "name": "Signes Tecpro",
                "start_t": 0.52,
                "end_t": 0.58,
                "side": "outboard",
                "surface": "barrier_tecpro",
                "inner_offset_m": 24,
                "width_m": 1.2,
                "grip_multiplier": 0.0,
            },
            {
                "name": "T4 exit gravel",
                "start_t": 0.36,
                "end_t": 0.4,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10.0,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Beausset sausage kerb",
                "start_t": 0.7,
                "end_t": 0.74,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
        ],
    },
    "fuji.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "fuji_speedway_tilke_2005_redesign",
                "grokipedia_fuji_grade_1_safety",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "2005 Tilke redesign: extensive asphalt runoff + gravel traps at key decel zones; "
                "100R high-speed left with gravel beyond concrete apron; final chicane kerbs."
            ),
        },
        "surface_profile": [
            {
                "name": "T1 braking runoff",
                "start_t": 0.08,
                "end_t": 0.14,
                "side": "outboard",
                "surface": "runoff_asphalt",
                "width_m": 14,
                "width_start_m": 8,
                "width_end_m": 18,
                "envelope": "flare_entry",
                "grip_multiplier": 0.78,
            },
            {
                "name": "100R concrete apron",
                "start_t": 0.35,
                "end_t": 0.42,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 8,
                "grip_multiplier": 0.72,
            },
            {
                "name": "100R gravel",
                "start_t": 0.36,
                "end_t": 0.41,
                "side": "outboard",
                "surface": "gravel",
                "inner_offset_m": 10,
                "width_m": 10,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Dunlop chicane kerb",
                "start_t": 0.58,
                "end_t": 0.64,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Final chicane kerb",
                "start_t": 0.92,
                "end_t": 0.97,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
        ],
    },
    "losail.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "qatar_gp_2025_gravel_track_limits",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "2025 Qatar GP: new gravel strips at T6, T10 (right), T16; extended T14 gravel. "
                "Wide asphalt runoff elsewhere on FIA Grade 1 layout."
            ),
        },
        "surface_profile": [
            {
                "name": "T1 runoff",
                "start_t": 0.08,
                "end_t": 0.14,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 11,
                "grip_multiplier": 0.72,
            },
            {
                "name": "T6 gravel strip",
                "start_t": 0.28,
                "end_t": 0.34,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 6,
                "grip_multiplier": 0.48,
            },
            {
                "name": "T6-T7 complex kerb",
                "start_t": 0.34,
                "end_t": 0.44,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "T10 right gravel",
                "start_t": 0.48,
                "end_t": 0.54,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 6,
                "grip_multiplier": 0.48,
            },
            {
                "name": "T14 extended gravel",
                "start_t": 0.74,
                "end_t": 0.84,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "width_start_m": 5,
                "width_end_m": 12,
                "envelope": "flare_exit",
                "grip_multiplier": 0.45,
            },
            {
                "name": "T16 gravel strip",
                "start_t": 0.9,
                "end_t": 0.96,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 6,
                "grip_multiplier": 0.48,
            },
        ],
    },
    "sao_paulo.json": {
        "surface_metadata": {
            "confidence": "estimated",
            "last_reviewed": "2026-06-10",
            "sources": [
                "racingcircuits_interlagos_2014_refurb",
                "f1_interlagos_circuit_guide",
                "fia_appendix_o_2025",
            ],
            "notes": (
                "2014 $60M refurb: expanded Senna S / Curva do Sol runoff; Bico de Pato hairpin "
                "gravel; Junção barrier on downhill approach to main straight."
            ),
        },
        "surface_profile": [
            {
                "name": "Senna S kerbs",
                "start_t": 0.1,
                "end_t": 0.16,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Senna S expanded runoff",
                "start_t": 0.1,
                "end_t": 0.18,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 12,
                "width_start_m": 6,
                "width_end_m": 14,
                "envelope": "flare_exit",
                "grip_multiplier": 0.72,
            },
            {
                "name": "Descida do Lago runoff",
                "start_t": 0.34,
                "end_t": 0.42,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 11,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Bico de Pato gravel",
                "start_t": 0.54,
                "end_t": 0.6,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10,
                "width_start_m": 5,
                "width_end_m": 12,
                "envelope": "bell",
                "grip_multiplier": 0.45,
            },
            {
                "name": "Junção barrier",
                "start_t": 0.88,
                "end_t": 0.94,
                "side": "outboard",
                "surface": "barrier_tecpro",
                "width_m": 1.2,
                "grip_multiplier": 0.0,
            },
        ],
    },
    "sample_circuit.json": {
        "surface_metadata": {
            "confidence": "synthetic",
            "last_reviewed": "2026-06-10",
            "sources": ["fia_appendix_o_2025"],
            "notes": "Synthetic test circuit; FIA-template corner runoff for collision/viewer tests.",
        },
        "surface_profile": [
            {
                "name": "T1 runoff",
                "start_t": 0.095,
                "end_t": 0.12,
                "side": "outboard",
                "surface": "runoff_concrete",
                "width_m": 11.0,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Esses kerbs",
                "start_t": 0.11,
                "end_t": 0.16,
                "side": "both",
                "surface": "kerb_sausage",
                "width_m": 0.5,
                "grip_multiplier": 0.72,
            },
            {
                "name": "Stadium gravel",
                "start_t": 0.57,
                "end_t": 0.63,
                "side": "outboard",
                "surface": "gravel",
                "width_m": 10.0,
                "grip_multiplier": 0.45,
            },
            {
                "name": "Arena outer barrier",
                "start_t": 0.63,
                "end_t": 0.8,
                "side": "outboard",
                "surface": "barrier_armco",
                "inner_offset_m": 12,
                "width_m": 1.0,
                "grip_multiplier": 0.0,
            },
        ],
    },
}


def apply_track(path: Path, data: dict[str, Any]) -> None:
    with path.open(encoding="utf-8") as f:
        doc = json.load(f)
    doc["surface_defaults"] = DEFAULTS
    doc["surface_profile"] = data["surface_profile"]
    doc["surface_metadata"] = data["surface_metadata"]
    with path.open("w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    n = len(data["surface_profile"])
    print(f"  {path.name}: {n} segments")


def main() -> None:
    print("Authoring surface profiles from research templates…")
    for filename, data in sorted(TRACK_DATA.items()):
        if filename == "cota.json":
            print(f"  skip {filename} (gridlife safety map)")
            continue
        apply_track(TRACKS / filename, data)
    print("Done (cota.json uses tools/author_cota_surface_gridlife.py).")


if __name__ == "__main__":
    main()
